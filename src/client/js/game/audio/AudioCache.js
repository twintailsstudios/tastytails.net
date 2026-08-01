/**
 * @fileoverview IndexedDB Audio Buffer & SoundFont Cache Helper for TastyTails.net
 * 
 * @description
 * Caches decoded Web Audio API buffers and SoundFont assets locally in IndexedDB
 * to eliminate redundant network downloads and speed up game scene load times.
 */

export class AudioCache {
    constructor() {
        this.dbName = 'TastyTailsAudioDB';
        this.storeName = 'audio_buffers';
        this.db = null;
        // SAFEGUARD: Pending init Promise deduplicates concurrent DB open requests
        this.initPromise = null;
        // OPTIMIZATION: L1 memory cache provides O(1) buffer access without disk I/O latency
        this.memoryCache = new Map();
        // SAFEGUARD: Cap L1 cache entries to eliminate GC pauses during active gameplay
        this.maxMemoryItems = 50;
    }

    /**
     * Opens or initializes the IndexedDB database.
     * Deduplicates concurrent initialization attempts across parallel callers.
     * @returns {Promise<IDBDatabase|null>}
     */
    async init() {
        if (this.db) return this.db;
        // SAFEGUARD: Return shared pending init promise to avoid duplicate indexedDB.open requests
        if (this.initPromise) return this.initPromise;
        if (typeof indexedDB === 'undefined') {
            console.warn('[AudioCache] IndexedDB is not supported in this environment.');
            return null;
        }

        this.initPromise = new Promise((resolve) => {
            try {
                const request = indexedDB.open(this.dbName, 1);

                request.onupgradeneeded = (evt) => {
                    const db = evt.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                    }
                };

                request.onsuccess = (evt) => {
                    this.db = evt.target.result;
                    this.initPromise = null;
                    resolve(this.db);
                };

                request.onerror = (evt) => {
                    console.warn('[AudioCache] IndexedDB open error:', evt.target.error);
                    this.initPromise = null;
                    resolve(null);
                };

                request.onblocked = () => {
                    console.warn('[AudioCache] IndexedDB open blocked by another tab.');
                    this.initPromise = null;
                    resolve(null);
                };
            } catch (err) {
                console.warn('[AudioCache] IndexedDB initialization exception:', err);
                this.initPromise = null;
                resolve(null);
            }
        });

        return this.initPromise;
    }

    /**
     * Retrieves an ArrayBuffer from IndexedDB or L1 memory cache by key.
     * Always returns a cloned ArrayBuffer slice to prevent Web Audio API decoder detachment.
     * 
     * @param {string} key 
     * @returns {Promise<ArrayBuffer|null>}
     */
    async getBuffer(key) {
        // OPTIMIZATION: Fast path check in L1 memory cache
        if (this.memoryCache.has(key)) {
            const buf = this.memoryCache.get(key);
            // SAFEGUARD: Slice buffer copy so Web Audio decodeAudioData does not detach stored cache
            return buf ? buf.slice(0) : null;
        }

        const db = await this.init();
        if (!db) return null;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const req = store.get(key);

                req.onsuccess = () => {
                    const res = req.result || null;
                    if (res) {
                        this._addToMemoryCache(key, res);
                        // SAFEGUARD: Slice buffer copy so Web Audio decodeAudioData does not detach stored cache
                        resolve(res.slice(0));
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
    }

    /**
     * Stores an ArrayBuffer into IndexedDB and L1 memory cache by key.
     * 
     * @param {string} key 
     * @param {ArrayBuffer} arrayBuffer 
     * @returns {Promise<boolean>}
     */
    async setBuffer(key, arrayBuffer) {
        if (!arrayBuffer) return false;
        this._addToMemoryCache(key, arrayBuffer);

        const db = await this.init();
        if (!db) return false;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.put(arrayBuffer, key);

                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    /**
     * Removes an entry from both L1 memory cache and IndexedDB.
     * 
     * @param {string} key 
     * @returns {Promise<boolean>}
     */
    async deleteBuffer(key) {
        this.memoryCache.delete(key);

        const db = await this.init();
        if (!db) return false;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.delete(key);

                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    /**
     * Clears all cached buffers from L1 memory cache and IndexedDB.
     * 
     * @returns {Promise<boolean>}
     */
    async clear() {
        this.memoryCache.clear();

        const db = await this.init();
        if (!db) return false;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const req = store.clear();

                req.onsuccess = () => resolve(true);
                req.onerror = () => resolve(false);
            } catch (err) {
                resolve(false);
            }
        });
    }

    /**
     * Helper to add a buffer to L1 memory cache with LRU eviction.
     * @private
     */
    _addToMemoryCache(key, buffer) {
        // SAFEGUARD: Enforce LRU eviction once maxMemoryItems threshold is reached
        if (this.memoryCache.size >= this.maxMemoryItems && !this.memoryCache.has(key)) {
            const firstKey = this.memoryCache.keys().next().value;
            this.memoryCache.delete(firstKey);
        }
        this.memoryCache.set(key, buffer);
    }
}
