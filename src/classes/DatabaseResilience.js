/**
 * @fileoverview DatabaseResilience.js - Database Resilience Engine & Write-Behind Cache
 * 
 * @description
 * High-performance fault-tolerance manager and write-behind cache for TastyTails.net.
 * Coalesces frequent tick-rate updates into memory and issues bulk MongoDB writes,
 * while transparently queueing updates and backing up un-flushed state during database outages.
 * 
 * Triggered by: Game loop ticks, mechanic update calls, socket handlers, auth routes,
 * Mongoose connection state hooks, and background flush intervals (30s).
 */

const log = require('../logger');
const fs = require('fs');
const path = require('path');
const monitoring = require('../server/monitoring');
const { performance } = require('perf_hooks');

/**
 * Generates a normalized, key-order invariant cache key for query filters.
 * OPTIMIZATION: Uses a fast-path for simple _id queries to avoid Object.keys() GC allocations on hot ticks.
 * 
 * @param {Object|string} filter - Query filter object
 * @returns {string} Normalized string key
 */
function getStableFilterKey(filter) {
    if (!filter || typeof filter !== 'object') return String(filter);
    // Fast-path: single key or direct primitive _id
    if (filter._id && Object.keys(filter).length === 1 && typeof filter._id !== 'object') {
        return `_id:${filter._id}`;
    }
    const sortedKeys = Object.keys(filter).sort();
    let keyStr = '';
    for (let i = 0; i < sortedKeys.length; i++) {
        const k = sortedKeys[i];
        keyStr += `${k}:${filter[k]};`;
    }
    return keyStr;
}

class DatabaseResilience {
    constructor() {
        this.isOnline = false;
        this.isFlushing = false; // Flag preventing concurrent re-entrant bulk writes
        this.offlineQueue = [];
        this.writeBuffer = new Map(); // Write-Behind Buffer (Key -> { model, filter, update, options, timestamps })
        this.disconnectTime = null;
        this.shutdownCallback = null;
        this.io = null;

        // Configuration
        this.config = {
            maxTimeMS: 60000, // 60 seconds max disconnect tolerance
            maxQueueSize: 10000, // Max memory queue size before emergency flush/shutdown
            backupDir: path.join(__dirname, '../../backups'),
            flushIntervalMS: 30000 // 30 Seconds background flush interval
        };

        this.checkInterval = null;
        this.flushInterval = null;
    }

    /**
     * Initialize listeners on the Mongoose instance and load emergency backups.
     * @param {Object} mongoose - The Mongoose instance
     * @param {Function} shutdownCallback - Callback invoked for graceful shutdown on critical outages
     * @param {Object} [io] - Socket.io instance for broadcasting server stability events
     */
    async init(mongoose, shutdownCallback, io = null) {
        this.mongoose = mongoose;
        this.shutdownCallback = shutdownCallback;
        this.io = io;

        // Ensure backup directory exists
        if (!fs.existsSync(this.config.backupDir)) {
            try {
                fs.mkdirSync(this.config.backupDir, { recursive: true });
            } catch (e) {
                log.error('Failed to create backup directory:', e);
            }
        }

        // Try to load any existing backups from disk
        await this._loadQueueFromDisk();

        // Current state check
        if (mongoose.connection.readyState === 1) {
            this.handleConnect();
        }

        mongoose.connection.on('connected', () => {
            this.handleConnect();
        });

        mongoose.connection.on('reconnected', () => {
            this.handleConnect();
        });

        mongoose.connection.on('disconnected', () => {
            this.handleDisconnect();
        });

        // Start the Write-Behind Flush Loop
        this._startFlushLoop();
    }

    /**
     * Starts the periodic 30-second write-behind buffer flush timer.
     * @private
     */
    _startFlushLoop() {
        if (this.flushInterval) clearInterval(this.flushInterval);
        this.flushInterval = setInterval(() => {
            if (this.isOnline && this.writeBuffer.size > 0) {
                this._flushBuffer();
            }
        }, this.config.flushIntervalMS);
        log.info(`[ResilienceEngine] Write-Behind Cache initialized. Flushing every ${this.config.flushIntervalMS / 1000}s.`);
    }

    /**
     * Event handler fired when MongoDB connection becomes healthy.
     */
    handleConnect() {
        if (this.isOnline) return; // Already online

        this.isOnline = true;
        this.disconnectTime = null;
        log.success('MongoDB Connected! Resuming normal operations.');

        // Stop the guard interval if running
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        // Emit Stable Event to connected clients
        if (this.io) {
            this.io.emit('serverStable');
        }

        // Flush Legacy Offline Queue
        this._flushQueue();

        // Retrigger Buffer Flush if items exist
        if (this.writeBuffer.size > 0) {
            this._flushBuffer();
        }
    }

    /**
     * Event handler fired when MongoDB connection drops.
     */
    handleDisconnect() {
        if (!this.isOnline) return; // Already offline

        this.isOnline = false;
        this.disconnectTime = Date.now();
        log.warn('MongoDB Disconnected! Entering resilient mode...');

        // Emit Unstable Event to connected clients
        if (this.io) {
            this.io.emit('serverUnstable');
        }

        // Start checking disconnect time and queue size thresholds
        if (!this.checkInterval) {
            this.checkInterval = setInterval(() => this._checkThresholds(), 1000);
        }
    }

    /**
     * Queues a database update for write-behind batching.
     * Merges $set fields and $inc deltas if an update for the same document is already pending.
     * OPTIMIZATION: Non-blocking fire-and-forget O(1) memory update for high-frequency game ticks.
     * 
     * @param {Object} Model - The Mongoose Model
     * @param {Object} filter - Query filter (unique per document)
     * @param {Object} update - Update instructions ($set, $inc)
     * @param {Object} [options] - Mongoose update options (upsert, etc.)
     * @returns {Promise<boolean>} Always returns true immediately
     */
    async queueUpdate(Model, filter, update, options = {}) {
        // Generate a stable normalized key for this document
        const filterKey = getStableFilterKey(filter);
        const bufferKey = `${Model.modelName}:${filterKey}`;

        // Enforce maxQueueSize guard
        if (!this.writeBuffer.has(bufferKey) && this.writeBuffer.size >= this.config.maxQueueSize) {
            log.warn('[ResilienceEngine] Write Buffer size limit reached. Scheduling emergency flush...');
            setImmediate(() => this._flushBuffer());
        }

        // Get existing or create new
        let entry = this.writeBuffer.get(bufferKey);

        if (!entry) {
            entry = {
                Model,
                filter,
                update: { ...update }, // Shallow copy to start
                options,
                firstQueuedAt: Date.now(),
                retryCount: 0
            };
            this.writeBuffer.set(bufferKey, entry);
        } else {
            // MERGE LOGIC
            // 1. Merge $set
            if (update.$set) {
                if (!entry.update.$set) entry.update.$set = {};
                Object.assign(entry.update.$set, update.$set);
            }

            // 2. Merge $inc deltas
            if (update.$inc) {
                if (!entry.update.$inc) entry.update.$inc = {};
                for (const [field, val] of Object.entries(update.$inc)) {
                    const current = entry.update.$inc[field] || 0;
                    entry.update.$inc[field] = current + val;
                }
            }

            // 3. Merge other operators ($push, $pull, etc.)
            const otherOps = Object.keys(update).filter(k => k !== '$set' && k !== '$inc');
            for (const op of otherOps) {
                if (!entry.update[op]) entry.update[op] = update[op];
                else {
                    if (typeof update[op] === 'object' && update[op] !== null) {
                        Object.assign(entry.update[op], update[op]);
                    } else {
                        entry.update[op] = update[op];
                    }
                }
            }
        }

        return true; // Fire-and-Forget success
    }

    /**
     * Flushes the write-behind buffer to MongoDB using Model.bulkWrite().
     * OPTIMIZATION: Uses a staging buffer map so new incoming updates can accumulate during async I/O.
     * SAFEGUARD: Non-destructively re-merges failed operations on bulkWrite errors, dumping entries exceeding 3 retries to dead-letter backup.
     * @private
     */
    async _flushBuffer() {
        if (this.writeBuffer.size === 0 || !this.isOnline || this.isFlushing) return;

        this.isFlushing = true;
        log.important(`[ResilienceEngine] Flushing ${this.writeBuffer.size} batched documents...`);

        // Stage buffer entries to allow new incoming writes to accumulate safely
        const stagingBuffer = new Map(this.writeBuffer);
        this.writeBuffer.clear();

        const opsByModel = {};

        // Group operations by Model (since bulkWrite is per-model)
        for (const [key, entry] of stagingBuffer) {
            const modelName = entry.Model.modelName;
            if (!opsByModel[modelName]) opsByModel[modelName] = { Model: entry.Model, ops: [], entries: [] };

            opsByModel[modelName].ops.push({
                updateOne: {
                    filter: entry.filter,
                    update: entry.update,
                    ...entry.options
                }
            });
            opsByModel[modelName].entries.push({ key, entry });
        }

        try {
            // Execute Bulk Writes per model
            for (const modelName of Object.keys(opsByModel)) {
                const { Model, ops, entries } = opsByModel[modelName];
                try {
                    const dbStart = performance.now();
                    const res = await Model.bulkWrite(ops, { ordered: false });
                    const dbEnd = performance.now();
                    monitoring.recordDbLatency(dbEnd - dbStart);
                    log.success(`[ResilienceEngine] ${modelName} Sync: Matched ${res.matchedCount}, Modified ${res.modifiedCount}`);
                } catch (err) {
                    log.error(`[ResilienceEngine] BulkWrite failed for ${modelName}:`, err);
                    
                    // Non-destructive re-merge of failed operations
                    for (const { key, entry } of entries) {
                        entry.retryCount = (entry.retryCount || 0) + 1;
                        if (entry.retryCount > 3) {
                            log.error(`[ResilienceEngine] Exceeded max retries for ${key}. Moving to dead-letter backup.`);
                            this._dumpDeadLetterEntry(key, entry);
                            continue;
                        }

                        if (!this.writeBuffer.has(key)) {
                            this.writeBuffer.set(key, entry);
                        } else {
                            // Merge failed $inc into new entry if present, letting newer $set take precedence
                            const newEntry = this.writeBuffer.get(key);
                            if (entry.update.$inc) {
                                if (!newEntry.update.$inc) newEntry.update.$inc = {};
                                for (const [field, val] of Object.entries(entry.update.$inc)) {
                                    newEntry.update.$inc[field] = (newEntry.update.$inc[field] || 0) + val;
                                }
                            }
                        }
                    }
                }
            }
        } finally {
            this.isFlushing = false;
        }
    }

    /**
     * Saves a Mongoose document. If offline, queues it in offlineQueue.
     * @param {Object} doc - The Mongoose document to save
     * @returns {Promise<Object>} - The saved document (or queued doc reference)
     */
    async save(doc) {
        if (this.isOnline) {
            try {
                return await doc.save();
            } catch (err) {
                log.error('Error saving document directly:', err);
                throw err;
            }
        } else {
            // Offline: Queue it
            this.offlineQueue.push({ type: 'save', doc });
            return doc;
        }
    }

    /**
     * Wrapper for Model.updateOne. If offline, queues it.
     * @param {Object} Model - Mongoose Model
     * @param {Object} filter - Filter query
     * @param {Object} update - Update payload
     * @param {Object} [options] - Options
     * @returns {Promise<Object>} Mongoose result object or mock acknowledgement
     */
    async updateOne(Model, filter, update, options = {}) {
        if (this.isOnline) {
            try {
                return await Model.updateOne(filter, update, options);
            } catch (err) {
                log.error(`Error in updateOne for ${Model.modelName}:`, err);
                throw err;
            }
        } else {
            this.offlineQueue.push({
                type: 'update',
                op: 'updateOne',
                modelName: Model.modelName,
                filter,
                update,
                options
            });
            return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
        }
    }

    /**
     * Wrapper for Model.findOneAndUpdate. If offline, queues it.
     * @param {Object} Model - Mongoose Model
     * @param {Object} filter - Filter query
     * @param {Object} update - Update payload
     * @param {Object} [options] - Options
     * @returns {Promise<Object|null>} Target document or null if offline
     */
    async findOneAndUpdate(Model, filter, update, options = {}) {
        if (this.isOnline) {
            try {
                return await Model.findOneAndUpdate(filter, update, options);
            } catch (err) {
                log.error(`Error in findOneAndUpdate for ${Model.modelName}:`, err);
                throw err;
            }
        } else {
            this.offlineQueue.push({
                type: 'update',
                op: 'findOneAndUpdate',
                modelName: Model.modelName,
                filter,
                update,
                options
            });
            return null;
        }
    }

    /**
     * Flushes offlineQueue upon database reconnection.
     * @private
     */
    async _flushQueue() {
        if (this.offlineQueue.length === 0) return;

        log.important(`MongoDB Reconnected! Flushing ${this.offlineQueue.length} queued operations...`);

        const queue = [...this.offlineQueue];
        this.offlineQueue = [];

        let successCount = 0;
        let failCount = 0;

        for (const item of queue) {
            try {
                if (item.type === 'save') {
                    await item.doc.save();
                } else if (item.type === 'update') {
                    if (this.mongoose && item.modelName) {
                        const Model = this.mongoose.model(item.modelName);
                        if (item.op === 'updateOne') {
                            await Model.updateOne(item.filter, item.update, item.options);
                        } else if (item.op === 'findOneAndUpdate') {
                            await Model.findOneAndUpdate(item.filter, item.update, item.options);
                        }
                    }
                } else if (item.type === 'restore_snapshot') {
                    if (this.mongoose && item.modelName && item.data) {
                        try {
                            const Model = this.mongoose.model(item.modelName);
                            if (item.data._id) {
                                await Model.findByIdAndUpdate(item.data._id, item.data, {
                                    upsert: true,
                                    new: true,
                                    runValidators: false
                                });
                            } else {
                                await Model.create(item.data);
                            }
                        } catch (modelErr) {
                            if (modelErr.name === 'MissingSchemaError') {
                                log.error(`[DatabaseResilience] Model ${item.modelName} not found.`);
                            } else {
                                throw modelErr;
                            }
                        }
                    }
                }
                successCount++;
            } catch (err) {
                // For 'save' type (runtime objects), retry logic for VersionError using upsert
                if (item.type === 'save' && err.name === 'VersionError' && item.doc && item.doc._id) {
                    log.warn(`VersionError flushing item ${item.doc._id}. Retrying via findByIdAndUpdate upsert...`);
                    try {
                        const Model = item.doc.constructor;
                        const docData = typeof item.doc.toObject === 'function' ? item.doc.toObject() : item.doc;
                        await Model.findByIdAndUpdate(item.doc._id, docData, {
                            upsert: true,
                            new: true,
                            runValidators: false
                        });
                        successCount++;
                        continue;
                    } catch (retryErr) {
                        log.error('Failed to flush queued item (retry):', retryErr);
                        failCount++;
                    }
                } else {
                    log.error('Failed to flush queued item:', err);
                    failCount++;
                }
            }
        }

        log.success(`Flush complete. Success: ${successCount}, Failed: ${failCount}`);
    }

    /**
     * Periodically checks offline duration and queue size limits while disconnected.
     * @private
     */
    _checkThresholds() {
        if (this.isOnline) return;

        const now = Date.now();
        const timeOffline = now - this.disconnectTime;
        const timeLeft = this.config.maxTimeMS - timeOffline;

        if (timeLeft <= 15000 && timeLeft > 0) {
            if (this.io) {
                this.io.emit('serverCriticalWarning', { seconds: Math.ceil(timeLeft / 1000) });
            }
        }

        if (timeOffline > this.config.maxTimeMS) {
            this._triggerShutdown(`Database disconnected for too long (> ${this.config.maxTimeMS / 1000}s)`);
            return;
        }

        if (this.offlineQueue.length > this.config.maxQueueSize) {
            this._triggerShutdown(`Database offline queue exceeded limit (${this.offlineQueue.length})`);
            return;
        }
    }

    /**
     * Triggers emergency server shutdown when database outage limits are exceeded.
     * @param {string} reason - Reason for emergency shutdown
     * @private
     */
    _triggerShutdown(reason) {
        if (this.checkInterval) clearInterval(this.checkInterval);
        log.error(`[DatabaseResilience] ${reason}`);

        this._dumpQueueToDisk();
        this._dumpWriteBufferToDisk();

        if (this.shutdownCallback) {
            this.shutdownCallback(reason, new Error(reason));
        } else {
            process.exit(1);
        }
    }

    /**
     * Helper to synchronously write emergency backup files to disk.
     * @param {string} prefix - File prefix (dump, wb_dump, dead_letter)
     * @param {Array|Object} data - Data to serialize
     * @private
     */
    _writeDumpFile(prefix, data) {
        try {
            if (!fs.existsSync(this.config.backupDir)) {
                fs.mkdirSync(this.config.backupDir, { recursive: true });
            }
            const timestamp = Date.now();
            const filename = `${prefix}_${timestamp}.json`;
            const filepath = path.join(this.config.backupDir, filename);
            fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
            log.important(`[DatabaseResilience] Backup written to ${filename}`);
        } catch (e) {
            log.error(`[DatabaseResilience] Failed to write ${prefix} backup file:`, e);
        }
    }

    /**
     * Dumps an entry exceeding maximum retry attempts to dead-letter storage.
     * @param {string} key - Buffer key
     * @param {Object} entry - Entry data
     * @private
     */
    _dumpDeadLetterEntry(key, entry) {
        const deadLetterData = [{
            type: 'dead_letter_entry',
            key,
            modelName: entry.Model ? entry.Model.modelName : null,
            filter: entry.filter,
            update: entry.update,
            options: entry.options,
            firstQueuedAt: entry.firstQueuedAt,
            failedAt: Date.now()
        }];
        this._writeDumpFile('dead_letter', deadLetterData);
    }

    /**
     * Dumps the writeBuffer map to disk.
     * @private
     */
    _dumpWriteBufferToDisk() {
        if (this.writeBuffer.size === 0) return;
        const data = Array.from(this.writeBuffer.values()).map(entry => ({
            type: 'write_buffer_entry',
            modelName: entry.Model ? entry.Model.modelName : null,
            filter: entry.filter,
            update: entry.update,
            options: entry.options
        }));
        this._writeDumpFile('wb_dump', data);
    }

    /**
     * Dumps the offlineQueue array to disk.
     * @private
     */
    _dumpQueueToDisk() {
        if (this.offlineQueue.length === 0) return;
        const serializableQueue = this.offlineQueue.map(item => {
            if (item.type === 'save') {
                const docData = typeof item.doc.toObject === 'function' ? item.doc.toObject() : item.doc;
                return {
                    type: 'restore_snapshot',
                    modelName: item.doc.constructor ? item.doc.constructor.modelName : null,
                    data: docData,
                    isNew: item.doc.isNew
                };
            } else if (item.type === 'update' || item.type === 'restore_snapshot') {
                return item;
            }
            return null;
        }).filter(Boolean);
        this._writeDumpFile('dump', serializableQueue);
    }

    /**
     * Reads emergency backup files from disk and restores operations into memory queues upon server boot.
     * @private
     */
    async _loadQueueFromDisk() {
        try {
            if (!fs.existsSync(this.config.backupDir)) return;

            const files = fs.readdirSync(this.config.backupDir)
                .filter(f => (f.startsWith('dump_') || f.startsWith('wb_dump_')) && f.endsWith('.json'))
                .sort();

            if (files.length === 0) return;

            log.important(`[DatabaseResilience] Found ${files.length} backup files. Attempting restoration...`);

            for (const file of files) {
                const filepath = path.join(this.config.backupDir, file);
                const content = fs.readFileSync(filepath, 'utf8');
                const queueData = JSON.parse(content);

                for (const item of queueData) {
                    if (item.type === 'write_buffer_entry') {
                        if (this.mongoose) {
                            const Model = this.mongoose.model(item.modelName);
                            this.queueUpdate(Model, item.filter, item.update, item.options);
                        }
                    } else if (item.type === 'save') {
                        this.offlineQueue.push({
                            type: 'restore_snapshot',
                            modelName: item.modelName,
                            data: item.data
                        });
                    } else if (item.type === 'restore_snapshot' || item.type === 'update') {
                        this.offlineQueue.push(item);
                    }
                }

                log.success(`[DatabaseResilience] Restored operations from ${file}`);
                fs.unlinkSync(filepath);
            }
        } catch (e) {
            log.error('[DatabaseResilience] Failed to load backups:', e);
        }
    }
}

module.exports = new DatabaseResilience();
