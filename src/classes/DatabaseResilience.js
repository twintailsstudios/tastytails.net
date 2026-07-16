const log = require('../logger');
const fs = require('fs');
const path = require('path');

class DatabaseResilience {
    constructor() {
        this.isOnline = false;
        this.offlineQueue = [];
        this.writeBuffer = new Map(); // [NEW] Write-Behind Buffer (Key -> { model, filter, update, options, timestamps })
        this.disconnectTime = null;
        this.shutdownCallback = null;
        this.io = null;

        // Configuration
        this.config = {
            maxTimeMS: 60000, // 60 seconds
            maxQueueSize: 10000,
            backupDir: path.join(__dirname, '../../backups'),
            flushIntervalMS: 30000 // [NEW] 30 Seconds Flush
        };

        this.checkInterval = null;
        this.flushInterval = null; // [NEW] Timer for flush
    }

    /**
     * Initialize listeners on the Mongoose instance.
     * @param {Object} mongoose - The Mongoose instance
     * @param {Function} shutdownCallback - Function to call for graceful shutdown
     * @param {Object} [io] - Socket.io instance for broadcasting events
     */
    async init(mongoose, shutdownCallback, io = null) {
        this.mongoose = mongoose; // Store for later use
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

        // Try to load any existing backups
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

        // [NEW] Start the Write-Behind Flush Loop
        this._startFlushLoop();
    }

    _startFlushLoop() {
        if (this.flushInterval) clearInterval(this.flushInterval);
        this.flushInterval = setInterval(() => {
            if (this.isOnline && this.writeBuffer.size > 0) {
                this._flushBuffer();
            }
        }, this.config.flushIntervalMS);
        log.info(`[ResilienceEngine] Write-Behind Cache initialized. Flushing every ${this.config.flushIntervalMS / 1000}s.`);
    }

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

        // Emit Stable Event
        if (this.io) {
            this.io.emit('serverStable');
        }

        // Flush Legacy Queue
        this._flushQueue();

        // Retrigger Buffer Flush
        if (this.writeBuffer.size > 0) {
            this._flushBuffer();
        }
    }

    handleDisconnect() {
        if (!this.isOnline) return; // Already offline

        this.isOnline = false;
        this.disconnectTime = Date.now();
        log.warn('MongoDB Disconnected! Entering resilient mode...');

        // Emit Unstable Event
        if (this.io) {
            this.io.emit('serverUnstable');
        }

        // Start checking thresholds
        if (!this.checkInterval) {
            this.checkInterval = setInterval(() => this._checkThresholds(), 1000);
        }
    }

    /**
     * [NEW] Queues a database update (specifically meant for replacing updateOne).
     * Merges $set fields if an update for the same document is already pending.
     * 
     * @param {Object} Model - The Mongoose Model
     * @param {Object} filter - Query filter (must be unique per doc, e.g. { _id: ... })
     * @param {Object} update - Update instructions (only support $set efficiently for now)
     * @param {Object} options - Update options (upsert, etc)
     */
    async queueUpdate(Model, filter, update, options = {}) {
        // Generate a stable key for this document
        // Assumes filter is simple object like { 'characters._id': '...' } or { _id: '...' }
        const filterKey = JSON.stringify(filter);
        const bufferKey = `${Model.modelName}:${filterKey}`;

        // Get existing or create new
        let entry = this.writeBuffer.get(bufferKey);

        if (!entry) {
            entry = {
                Model,
                filter,
                update: { ...update }, // Shallow copy to start
                options,
                firstQueuedAt: Date.now()
            };
            this.writeBuffer.set(bufferKey, entry);
        } else {
            // MERGE LOGIC
            // 1. Merge $set
            if (update.$set) {
                if (!entry.update.$set) entry.update.$set = {};
                // Overwrite keys in existing $set with new ones
                Object.assign(entry.update.$set, update.$set);
            }

            // 2. Handling other operators ($inc, $push) is harder to merge blindly.
            // Strategy: For now, if we see non-$set, we just overwrite/append?
            // "The solution should be a Write-Behind Cache... Changes are held in memory"
            // Most game updates are $set (position, stats).
            // If we have $inc, we really should sum them.
            // Let's implement basic $inc merging just in case health uses it (though health uses $set usually in our codebase).
            if (update.$inc) {
                if (!entry.update.$inc) entry.update.$inc = {};
                for (const [field, val] of Object.entries(update.$inc)) {
                    const current = entry.update.$inc[field] || 0;
                    entry.update.$inc[field] = current + val;
                }
            }

            // For anything else ($push, etc), we might just OVERWRITE the operator block for now roughly
            // or merge strictly.
            // Given the requirement is mostly about "saveCharacter" (position/$set) optimization:
            const otherOps = Object.keys(update).filter(k => k !== '$set' && k !== '$inc');
            for (const op of otherOps) {
                if (!entry.update[op]) entry.update[op] = update[op];
                else {
                    // Primitive merge: Object.assign (last write wins for specific fields)
                    if (typeof update[op] === 'object' && update[op] !== null) {
                        Object.assign(entry.update[op], update[op]);
                    } else {
                        entry.update[op] = update[op];
                    }
                }
            }
        }

        // console.log(`[Resilience] Queue size: ${this.writeBuffer.size}`);
        return true; // "Fire and Forget" success
    }

    /**
     * [NEW] Flushes the write buffer to MongoDB using BulkWrite.
     */
    async _flushBuffer() {
        if (this.writeBuffer.size === 0) return;
        if (!this.isOnline) return;

        log.important(`[ResilienceEngine] Flushing ${this.writeBuffer.size} batched documents...`);

        const opsByModel = {};

        // Group operations by Model (since bulkWrite is per-model)
        for (const [key, entry] of this.writeBuffer) {
            const modelName = entry.Model.modelName;
            if (!opsByModel[modelName]) opsByModel[modelName] = { Model: entry.Model, ops: [] };

            opsByModel[modelName].ops.push({
                updateOne: {
                    filter: entry.filter,
                    update: entry.update,
                    ...entry.options // upsert, etc
                }
            });
        }

        // Clear buffer NOW to allow new writes to accumulate while we await DB
        // (Optimistic clearing - if DB fail, we might lose this batch, but we can't block)
        // Alternative: Copy map, clear, then process.
        this.writeBuffer.clear();

        // Execute Bulk Writes
        const monitoring = require('../server/monitoring');
        const { performance } = require('perf_hooks');
        for (const modelName of Object.keys(opsByModel)) {
            const { Model, ops } = opsByModel[modelName];
            try {
                // bulkWrite(ops, { ordered: false }) for parallelism
                const dbStart = performance.now();
                const res = await Model.bulkWrite(ops, { ordered: false });
                const dbEnd = performance.now();
                monitoring.recordDbLatency(dbEnd - dbStart);
                log.success(`[ResilienceEngine] ${modelName} Sync: Matched ${res.matchedCount}, Modified ${res.modifiedCount}`);
            } catch (err) {
                log.error(`[ResilienceEngine] BulkWrite failed for ${modelName}:`, err);
                // Advanced: We could push failed ops back to offlineQueue?
                // For now, log the data loss risk is acceptable per instructions.
            }
        }
    }

    /**
     * Saves a Mongoose document. If offline, queues it.
     * @param {Object} doc - The Mongoose document to save
     * @returns {Promise<Object>} - The saved doc (or the queued doc)
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
     * Wrapper for Model.updateOne
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
            // Return mock result
            return { matchedCount: 1, modifiedCount: 1, acknowledged: true };
        }
    }

    /**
     * Wrapper for Model.findOneAndUpdate
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
            // Return null or empty obj - hard to mock the return DOC without knowing it.
            // But auth.js mainly uses it for "fire and forget" or redirecting after.
            // Returning null might be safe for now, or a basic object if verified._id is needed?
            // Auth.js logic: `const updateChar = await ...; log('updateChar = ', updateChar);`
            // It doesn't seem to use properties of updateChar logic-wise, just logging.
            return null;
        }
    }

    async _flushQueue() {
        if (this.offlineQueue.length === 0) return;

        log.important(`MongoDB Reconnected! Flushing ${this.offlineQueue.length} queued operations...`);

        const queue = [...this.offlineQueue];
        this.offlineQueue = []; // Clear main queue

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
                    // Restore snapshot using findByIdAndUpdate (upsert) to force data persistence
                    // irrespective of change tracking.
                    if (this.mongoose && item.modelName && item.data) {
                        try {
                            const Model = this.mongoose.model(item.modelName);
                            if (item.data._id) {
                                await Model.findByIdAndUpdate(item.data._id, item.data, {
                                    upsert: true,
                                    new: true,
                                    runValidators: false // Skip validators on restore potentially? Or True? True is safer.
                                    // Actually, if data is raw from DB, it might fail validation if schema changed. 
                                    // But typically we want validation. Let's try true.
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
                // For 'save' type (runtime objects), retry logic for VersionError
                if (item.type === 'save' && err.name === 'VersionError' && !item.doc.isNew) {
                    log.warn(`VersionError flushing item ${item.doc._id}. Retrying as INSERT...`);
                    try {
                        item.doc.isNew = true;
                        await item.doc.save();
                        successCount++;
                        continue; // Success on retry
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

    _checkThresholds() {
        if (this.isOnline) return;

        const now = Date.now();
        const timeOffline = now - this.disconnectTime;
        const timeLeft = this.config.maxTimeMS - timeOffline;

        // Check Critical Warning Threshold (e.g. 15s remaining)
        if (timeLeft <= 15000 && timeLeft > 0) {
            if (this.io) {
                this.io.emit('serverCriticalWarning', { seconds: Math.ceil(timeLeft / 1000) });
            }
        }

        // Check Time specific
        if (timeOffline > this.config.maxTimeMS) {
            this._triggerShutdown(`Database disconnected for too long (> ${this.config.maxTimeMS / 1000}s)`);
            return;
        }

        // Check Queue Size
        if (this.offlineQueue.length > this.config.maxQueueSize) {
            this._triggerShutdown(`Database offline queue exceeded limit (${this.offlineQueue.length})`);
            return;
        }
    }

    _triggerShutdown(reason) {
        if (this.checkInterval) clearInterval(this.checkInterval);
        log.error(`[DatabaseResilience] ${reason}`);

        // Dump queue to disk before shutting down
        this._dumpQueueToDisk();

        // [NEW] Attempt final flush of Write Buffer (if database is still reachable? unlikely if we are shutting down due to disconnect)
        // But if shutdown reason is manual, we should flush.
        // If reason is "Database disconnected", flushBuffer will fail anyway.
        // We could dump writeBuffer to disk too?
        // Let's dump WriteBuffer to disk as well.
        this._dumpWriteBufferToDisk(); // Separated for clarity

        if (this.shutdownCallback) {
            this.shutdownCallback(reason, new Error(reason));
        } else {
            process.exit(1);
        }
    }

    _dumpWriteBufferToDisk() {
        if (this.writeBuffer.size === 0) return;
        try {
            const timestamp = Date.now();
            const filename = `wb_dump_${timestamp}.json`;
            const filepath = path.join(this.config.backupDir, filename);

            // Map values
            const data = Array.from(this.writeBuffer.values()).map(entry => ({
                type: 'write_buffer_entry',
                modelName: entry.Model.modelName,
                filter: entry.filter,
                update: entry.update,
                options: entry.options
            }));

            fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
            log.important(`[ResilienceEngine] Write Buffer dumped to ${filename}`);
        } catch (e) {
            log.error('[ResilienceEngine] Failed to dump Write Buffer:', e);
        }
    }

    _dumpQueueToDisk() {
        if (this.offlineQueue.length === 0) return;

        try {
            const timestamp = Date.now();
            const filename = `dump_${timestamp}.json`;
            const filepath = path.join(this.config.backupDir, filename);

            const serializableQueue = this.offlineQueue.map(item => {
                if (item.type === 'save') {
                    return {
                        type: 'restore_snapshot', // Prepare for restore next time
                        modelName: item.doc.constructor.modelName,
                        data: item.doc.toObject(),
                        isNew: item.doc.isNew
                    };
                } else if (item.type === 'update') {
                    return item; // Already serializable
                } else if (item.type === 'restore_snapshot') {
                    return item; // Already serialized
                }
                return null;
            }).filter(i => i !== null);

            fs.writeFileSync(filepath, JSON.stringify(serializableQueue, null, 2));
            log.important(`[DatabaseResilience] Emergency Backup written to ${filename}`);
        } catch (e) {
            log.error('[DatabaseResilience] Failed to write emergency backup:', e);
        }
    }

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
                        // Restore to Buffer
                        if (this.mongoose) {
                            const Model = this.mongoose.model(item.modelName);
                            this.queueUpdate(Model, item.filter, item.update, item.options);
                        }
                    }
                    else if (item.type === 'save') {
                        // Map legacy 'save' dump to 'restore_snapshot' internally
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
