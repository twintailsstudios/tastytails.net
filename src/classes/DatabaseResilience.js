const log = require('../logger');
const fs = require('fs');
const path = require('path');

class DatabaseResilience {
    constructor() {
        this.isOnline = false;
        this.offlineQueue = [];
        this.disconnectTime = null;
        this.shutdownCallback = null;
        this.io = null;

        // Configuration
        this.config = {
            maxTimeMS: 60000, // 60 seconds
            maxQueueSize: 10000,
            backupDir: path.join(__dirname, '../../backups')
        };

        this.checkInterval = null;
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

        // Flush Queue
        this._flushQueue();
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

        if (this.shutdownCallback) {
            this.shutdownCallback(reason, new Error(reason));
        } else {
            process.exit(1);
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
                .filter(f => f.startsWith('dump_') && f.endsWith('.json'))
                .sort();

            if (files.length === 0) return;

            log.important(`[DatabaseResilience] Found ${files.length} backup files. Attempting restoration...`);

            for (const file of files) {
                const filepath = path.join(this.config.backupDir, file);
                const content = fs.readFileSync(filepath, 'utf8');
                const queueData = JSON.parse(content);

                for (const item of queueData) {
                    // Modern format: type 'restore_snapshot'
                    // Legacy format support? (Previous implementation used 'save' type in json?)
                    // My previous code mapped 'save' -> 'save' JSON.

                    if (item.type === 'save') {
                        // Map legacy 'save' dump to 'restore_snapshot' internally
                        this.offlineQueue.push({
                            type: 'restore_snapshot',
                            modelName: item.modelName,
                            data: item.data
                            // isNew ignored, we use upsert
                        });
                    } else if (item.type === 'restore_snapshot' || item.type === 'update') {
                        this.offlineQueue.push(item);
                    }
                }

                log.success(`[DatabaseResilience] Restored ${queueData.length} operations from ${file}`);
                fs.unlinkSync(filepath);
            }
        } catch (e) {
            log.error('[DatabaseResilience] Failed to load backups:', e);
        }
    }
}

module.exports = new DatabaseResilience();
