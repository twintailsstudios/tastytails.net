/**
 * @fileoverview Monitoring & Server Performance Telemetry Engine - TastyTails Game Server
 * 
 * @description
 * In-memory flight recorder and performance telemetry module for the TastyTails game server.
 * Collects 60Hz tick durations, CPU/memory utilization, V8 garbage collection pause times,
 * event loop lag, database query latency, network packet throughput, and client error logs.
 * 
 * Triggered by:
 * - Server Game Loop: src/server-loop.js (recordTick)
 * - Database Resilience: src/classes/DatabaseResilience.js (recordDbLatency)
 * - Action Telemetry: MessageSystem.js, interactionHandlers.js, inventoryHandlers.js (recordAction)
 * - HTTP Endpoint: GET /stats in src/index.js (getStats)
 */

const { performance, PerformanceObserver } = require('perf_hooks');
const os = require('os');
const logger = require('../logger');

// OPTIMIZATION: Maximum unique client error entries to prevent memory leaks during error bursts
const MAX_CLIENT_ERRORS = 100;
const NUM_CPUS = os.cpus().length || 1;

const monitoring = {
    /**
     * Primary system metrics state store exposed via GET /stats
     */
    metrics: {
        tickDuration: 0, // ms
        avgTickDuration: 0, // ms
        maxTickDuration: 0, // ms
        tickRate: 0, // ticks per second
        lastTickTime: performance.now(),
        tickCount: 0,
        memoryUsage: {},
        activeConnections: 0,
        eventLoopLag: 0,
        cpuUsage: 0, // %
        dbLatency: 0, // ms
        dbStatus: 'online', // 'online' | 'buffering' | 'dump_mode'
        sparseSpatialHash: [], // [[x, y, count], ...]
        gcStats: {
            count: 0,
            totalDuration: 0,
            maxDuration: 0
        },
        // Detailed Profiling
        tickBreakdown: { logic: 0, physics: 0, shadowcasting: 0, animalAI: 0, serialize: 0 },
        // Target Anatomy & Combat Telemetry
        anatomyStats: {
            damageLatency: 0, // ms
            remediesUsed: 0,
            limbHits: { head: 0, torso: 0, arms: 0, legs: 0 }
        },
        // Client Performance Aggregation
        clientStats: {
            avgFps: 60,
            avgPing: 0
        },
        // Entity Counts
        entities: { clients: 0, items: 0, corpses: 0 },
        // Network
        network: { packetsSent: 0, bytesSent: 0 },
        // Queue
        resilienceQueue: 0,
        // Live Test Progress Report
        actionStats: {
            chat: { success: 0, fail: 0 },
            equip: { success: 0, fail: 0 },
            vore: { success: 0, fail: 0 },
            grapple: { success: 0, fail: 0 }
        },
        // Deduplicated Client Errors
        clientErrors: {}
    },

    // Config & Transient Window Accumulators
    sampleInterval: 1000, // ms
    lastSampleTime: performance.now(),

    ticksInCurrentSample: 0,
    accumulatedDuration: 0,
    accumulatedBreakdown: { logic: 0, physics: 0, shadowcasting: 0, animalAI: 0, serialize: 0 },
    accumulatedPackets: 0,
    accumulatedBytes: 0,

    peakTickInSample: 0,
    // OPTIMIZATION: Use scalar running sums and counts to eliminate GC churn
    dbLatencySum: 0,
    dbLatencyCount: 0,
    anatomyLatencySum: 0,
    anatomyLatencyCount: 0,
    clientPingSum: 0,
    clientPingCount: 0,
    clientFpsSum: 0,
    clientFpsCount: 0,

    /**
     * Initializes background timers for Event Loop Lag, CPU usage polling, and V8 GC observation.
     * @param {Object} io - Socket.IO server instance
     */
    init(io) {
        this.io = io;

        // Start Event Loop Lag Prober (checks delay vs expected 100ms interval)
        let lastLoop = performance.now();
        setInterval(() => {
            const now = performance.now();
            const lag = now - lastLoop - 100; // Expected 100ms
            this.metrics.eventLoopLag = Math.max(0, lag);
            lastLoop = now;
        }, 100);

        // CPU Tracking Setup (measures process CPU time delta normalized by CPU cores over 1000ms intervals)
        let startCpu = process.cpuUsage();
        let startTime = performance.now();
        this.cpuInterval = setInterval(() => {
            const endCpu = process.cpuUsage(startCpu);
            const endTime = performance.now();
            const timeDiff = endTime - startTime; // ms
            if (timeDiff > 0) {
                const cpuTime = (endCpu.user + endCpu.system) / 1000; // convert to ms
                // OPTIMIZATION: Normalize CPU load across all available CPU cores (cap at 100%)
                this.metrics.cpuUsage = Math.min(100, Math.max(0, (cpuTime / (timeDiff * NUM_CPUS)) * 100));
            }
            startCpu = process.cpuUsage();
            startTime = endTime;
        }, 1000);

        // V8 GC Performance Observer Setup (safe try/catch fallback for restricted sandboxes)
        try {
            this.gcObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    this.metrics.gcStats.count++;
                    this.metrics.gcStats.totalDuration += entry.duration;
                    this.metrics.gcStats.maxDuration = Math.max(this.metrics.gcStats.maxDuration, entry.duration);
                });
            });
            this.gcObserver.observe({ entryTypes: ['gc'] });
        } catch (e) {
            console.warn('[Monitoring] Failed to initialize GC observer:', e);
        }
    },

    /**
     * Updates Mongoose resilience state ('online' | 'buffering' | 'dump_mode')
     * @param {string} status - Database resilience state
     */
    setDbStatus(status) {
        if (['online', 'buffering', 'dump_mode'].includes(status)) {
            this.metrics.dbStatus = status;
        }
    },

    /**
     * Records damage calculation execution time and limb target distribution.
     * @param {number} ms - Calculation duration in ms
     * @param {string} [limbName] - Targeted limb ('head', 'torso', 'arms', 'legs')
     */
    recordAnatomyDamage(ms, limbName) {
        if (typeof ms === 'number' && !isNaN(ms)) {
            this.anatomyLatencySum += ms;
            this.anatomyLatencyCount++;
        }
        if (limbName && this.metrics.anatomyStats.limbHits[limbName] !== undefined) {
            this.metrics.anatomyStats.limbHits[limbName]++;
        }
    },

    /**
     * Increments total medical remedy application counter.
     */
    recordRemedyUse() {
        this.metrics.anatomyStats.remediesUsed++;
    },

    /**
     * Accumulates client-reported round-trip ping and Phaser render FPS telemetry.
     * @param {number} [ping] - RTT latency in ms
     * @param {number} [fps] - Client render frame rate
     */
    recordClientPingFps(ping, fps) {
        if (typeof ping === 'number' && !isNaN(ping)) {
            this.clientPingSum += ping;
            this.clientPingCount++;
        }
        if (typeof fps === 'number' && !isNaN(fps)) {
            this.clientFpsSum += fps;
            this.clientFpsCount++;
        }
    },

    /**
     * Extracts sparse non-zero spatial hash grid buckets for telemetry visualizer.
     * OPTIMIZATION: Transmits sparse tuple arrays [[x, y, count], ...] to compress payload size by >95%.
     * @param {Object} spatialHash - Grid hash object from server loop
     */
    updateSparseSpatialHash(spatialHash) {
        if (!spatialHash || typeof spatialHash !== 'object') {
            this.metrics.sparseSpatialHash = [];
            return;
        }
        const sparse = [];
        for (const cellKey in spatialHash) {
            const bucket = spatialHash[cellKey];
            const count = Array.isArray(bucket) ? bucket.length : (typeof bucket === 'number' ? bucket : 0);
            if (count > 0) {
                const parts = cellKey.includes('_') ? cellKey.split('_') : cellKey.split(',');
                if (parts.length === 2) {
                    const gx = parseInt(parts[0], 10);
                    const gy = parseInt(parts[1], 10);
                    if (!isNaN(gx) && !isNaN(gy)) {
                        sparse.push([gx, gy, count]);
                    }
                }
            }
        }
        this.metrics.sparseSpatialHash = sparse;
    },

    /**
     * Records a single MongoDB operation duration for average latency aggregation.
     * @param {number} ms - Query execution time in milliseconds
     */
    recordDbLatency(ms) {
        if (typeof ms === 'number' && !isNaN(ms)) {
            this.dbLatencySum += ms;
            this.dbLatencyCount++;
        }
    },

    /**
     * Records outcome pass/fail counts for tracked game actions during load testing.
     * @param {string} actionType - Name of action ('chat', 'equip', 'vore', 'grapple')
     * @param {boolean} success - Whether the action succeeded
     */
    recordAction(actionType, success) {
        if (!this.metrics.actionStats) {
            this.metrics.actionStats = {};
        }
        if (!this.metrics.actionStats[actionType]) {
            this.metrics.actionStats[actionType] = { success: 0, fail: 0 };
        }
        if (success) {
            this.metrics.actionStats[actionType].success++;
        } else {
            this.metrics.actionStats[actionType].fail++;
        }
    },

    /**
     * Stores and deduplicates client-side runtime errors.
     * @param {string} message - Error message
     * @param {string} stack - Error stack trace snippet
     */
    recordClientError(message, stack) {
        if (!this.metrics.clientErrors) {
            this.metrics.clientErrors = {};
        }
        const key = message + (stack ? stack.substring(0, 100) : '');
        if (this.metrics.clientErrors[key]) {
            this.metrics.clientErrors[key].count++;
            this.metrics.clientErrors[key].lastTime = new Date().toLocaleTimeString();
        } else {
            // OPTIMIZATION: Cap unique error dictionary entries to prevent unbounded memory growth
            if (Object.keys(this.metrics.clientErrors).length >= MAX_CLIENT_ERRORS) {
                this.metrics.clientErrors['_overflow'] = {
                    message: 'Max unique client error limit reached',
                    stack: '',
                    count: (this.metrics.clientErrors['_overflow']?.count || 0) + 1,
                    lastTime: new Date().toLocaleTimeString()
                };
                return;
            }
            this.metrics.clientErrors[key] = {
                message: message,
                stack: stack,
                count: 1,
                lastTime: new Date().toLocaleTimeString()
            };
        }
    },

    /**
     * Records a game frame tick metrics payload and flushes 1-second rolling averages.
     * @param {number} duration - Frame execution time in ms
     * @param {Object} [breakdown={}] - Subsystem timing breakdown (logic, physics, etc.)
     * @param {Object} [entities={}] - Entity snapshot counts
     * @param {Object} [network={}] - Network packets/bytes snapshot
     * @param {number} [queueSize=0] - Database write buffer queue size
     * @param {Object} [spatialHash] - Spatial hash grid object
     */
    recordTick(duration, breakdown = {}, entities = {}, network = {}, queueSize = 0, spatialHash = null) {
        const now = performance.now();
        this.ticksInCurrentSample++;
        this.accumulatedDuration += duration;
        this.metrics.tickDuration = duration; // Instantaneous

        this.peakTickInSample = Math.max(this.peakTickInSample, duration);

        if (spatialHash) {
            this.updateSparseSpatialHash(spatialHash);
        }

        // OPTIMIZATION: Generic type-checked iteration for dynamic subsystem profiling breakdown
        if (breakdown && typeof breakdown === 'object') {
            for (const key in breakdown) {
                if (Object.prototype.hasOwnProperty.call(breakdown, key)) {
                    const val = breakdown[key];
                    if (typeof val === 'number' && !isNaN(val)) {
                        this.accumulatedBreakdown[key] = (this.accumulatedBreakdown[key] || 0) + val;
                    }
                }
            }
        }

        // Accumulate Network
        if (network.packets) this.accumulatedPackets += network.packets;
        if (network.bytes) this.accumulatedBytes += network.bytes;

        // Instantaneous Entity/Queue Snapshot
        this.metrics.entities = entities;
        this.metrics.resilienceQueue = queueSize;

        // Flush 1-second sample window metrics
        if (now - this.lastSampleTime >= this.sampleInterval) {
            const totalTicks = this.ticksInCurrentSample || 1;

            // Update Aggregates
            this.metrics.tickRate = this.ticksInCurrentSample;
            this.metrics.avgTickDuration = this.accumulatedDuration / totalTicks;
            this.metrics.maxTickDuration = this.peakTickInSample;

            // Derive Avg DB Latency & Anatomy Latency
            this.metrics.dbLatency = this.dbLatencyCount > 0 ? this.dbLatencySum / this.dbLatencyCount : 0;
            this.dbLatencySum = 0;
            this.dbLatencyCount = 0;

            if (this.anatomyLatencyCount > 0) {
                this.metrics.anatomyStats.damageLatency = this.anatomyLatencySum / this.anatomyLatencyCount;
                this.anatomyLatencySum = 0;
                this.anatomyLatencyCount = 0;
            }

            if (this.clientPingCount > 0) {
                this.metrics.clientStats.avgPing = Math.round(this.clientPingSum / this.clientPingCount);
                this.clientPingSum = 0;
                this.clientPingCount = 0;
            }

            if (this.clientFpsCount > 0) {
                this.metrics.clientStats.avgFps = Math.round(this.clientFpsSum / this.clientFpsCount);
                this.clientFpsSum = 0;
                this.clientFpsCount = 0;
            }

            this.metrics.tickBreakdown = {
                logic: (this.accumulatedBreakdown.logic || 0) / totalTicks,
                physics: (this.accumulatedBreakdown.physics || 0) / totalTicks,
                shadowcasting: (this.accumulatedBreakdown.shadowcasting || 0) / totalTicks,
                animalAI: (this.accumulatedBreakdown.animalAI || 0) / totalTicks,
                serialize: (this.accumulatedBreakdown.serialize || 0) / totalTicks
            };

            this.metrics.network = {
                packetsSent: this.accumulatedPackets, // Per second (approx)
                bytesSent: this.accumulatedBytes
            };

            // Reset transient accumulators
            this.ticksInCurrentSample = 0;
            this.accumulatedDuration = 0;
            this.accumulatedBreakdown = { logic: 0, physics: 0, shadowcasting: 0, animalAI: 0, serialize: 0 };
            this.accumulatedPackets = 0;
            this.accumulatedBytes = 0;
            this.peakTickInSample = 0;
            this.lastSampleTime = now;

            // Gather Resource Usage
            this.metrics.memoryUsage = process.memoryUsage();

            // Connections
            if (this.io) {
                this.metrics.activeConnections = this.io.engine.clientsCount;
            }
        }
    },

    /**
     * Returns full snapshot of current server metrics and logs.
     * @returns {Object} System health snapshot object for GET /stats
     */
    getStats() {
        return {
            ...this.metrics,
            uptime: process.uptime(),
            logs: logger ? logger.getLogs() : []
        };
    }
};

module.exports = monitoring;
