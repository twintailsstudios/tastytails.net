const { performance, PerformanceObserver } = require('perf_hooks');

const monitoring = {
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
        gcStats: {
            count: 0,
            totalDuration: 0,
            maxDuration: 0
        },
        // Detailed Profiling
        tickBreakdown: { logic: 0, physics: 0, shadowcasting: 0, animalAI: 0, serialize: 0 },
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

    // Config
    sampleInterval: 1000, // ms
    lastSampleTime: performance.now(),

    ticksInCurrentSample: 0,
    accumulatedDuration: 0,
    accumulatedBreakdown: { logic: 0, physics: 0, shadowcasting: 0, animalAI: 0, serialize: 0 },
    accumulatedPackets: 0,
    accumulatedBytes: 0,

    peakTickInSample: 0,
    dbLatencyInSample: [],

    init(io) {
        this.io = io;

        // Start Event Loop Lag Loop
        let lastLoop = performance.now();
        setInterval(() => {
            const now = performance.now();
            const lag = now - lastLoop - 100; // Expected 100ms
            this.metrics.eventLoopLag = Math.max(0, lag);
            lastLoop = now;
        }, 100);

        // CPU Tracking Setup
        let startCpu = process.cpuUsage();
        let startTime = performance.now();
        this.cpuInterval = setInterval(() => {
            const endCpu = process.cpuUsage(startCpu);
            const endTime = performance.now();
            const timeDiff = endTime - startTime; // ms
            if (timeDiff > 0) {
                const cpuTime = (endCpu.user + endCpu.system) / 1000; // convert to ms
                this.metrics.cpuUsage = (cpuTime / timeDiff) * 100;
            }
            startCpu = process.cpuUsage();
            startTime = endTime;
        }, 1000);

        // GC Performance Observer Setup
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
            // PerformanceObserver for GC is supported in Node 12+ but might fail in sandboxed or older environments
            console.warn('[Monitoring] Failed to initialize GC observer:', e);
        }
    },

    recordDbLatency(ms) {
        this.dbLatencyInSample.push(ms);
    },

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

    recordClientError(message, stack) {
        if (!this.metrics.clientErrors) {
            this.metrics.clientErrors = {};
        }
        const key = message + (stack ? stack.substring(0, 100) : '');
        if (this.metrics.clientErrors[key]) {
            this.metrics.clientErrors[key].count++;
            this.metrics.clientErrors[key].lastTime = new Date().toLocaleTimeString();
        } else {
            this.metrics.clientErrors[key] = {
                message: message,
                stack: stack,
                count: 1,
                lastTime: new Date().toLocaleTimeString()
            };
        }
    },

    recordTick(duration, breakdown = {}, entities = {}, network = {}, queueSize = 0) {
        const now = performance.now();
        this.ticksInCurrentSample++;
        this.accumulatedDuration += duration;
        this.metrics.tickDuration = duration; // Instantaneous

        this.peakTickInSample = Math.max(this.peakTickInSample, duration);

        // Accumulate Breakdown
        if (breakdown.physics) this.accumulatedBreakdown.physics += breakdown.physics;
        if (breakdown.logic) this.accumulatedBreakdown.logic += breakdown.logic;
        if (breakdown.shadowcasting) this.accumulatedBreakdown.shadowcasting += breakdown.shadowcasting;
        if (breakdown.animalAI) this.accumulatedBreakdown.animalAI += breakdown.animalAI;
        if (breakdown.serialize) this.accumulatedBreakdown.serialize += breakdown.serialize;

        // Accumulate Network
        if (network.packets) this.accumulatedPackets += network.packets;
        if (network.bytes) this.accumulatedBytes += network.bytes;

        // Instantaneous Entity/Queue Snapshot
        this.metrics.entities = entities;
        this.metrics.resilienceQueue = queueSize;

        if (now - this.lastSampleTime >= this.sampleInterval) {
            const totalTicks = this.ticksInCurrentSample || 1;

            // Update Aggregates
            this.metrics.tickRate = this.ticksInCurrentSample;
            this.metrics.avgTickDuration = this.accumulatedDuration / totalTicks;
            this.metrics.maxTickDuration = this.peakTickInSample;

            // Calculate Avg DB Latency
            if (this.dbLatencyInSample.length > 0) {
                const totalDbTime = this.dbLatencyInSample.reduce((sum, ms) => sum + ms, 0);
                this.metrics.dbLatency = totalDbTime / this.dbLatencyInSample.length;
            } else {
                this.metrics.dbLatency = 0;
            }

            this.metrics.tickBreakdown = {
                logic: this.accumulatedBreakdown.logic / totalTicks,
                physics: this.accumulatedBreakdown.physics / totalTicks,
                shadowcasting: this.accumulatedBreakdown.shadowcasting / totalTicks,
                animalAI: this.accumulatedBreakdown.animalAI / totalTicks,
                serialize: this.accumulatedBreakdown.serialize / totalTicks
            };

            this.metrics.network = {
                packetsSent: this.accumulatedPackets, // Per second (approx)
                bytesSent: this.accumulatedBytes
            };

            // Reset
            this.ticksInCurrentSample = 0;
            this.accumulatedDuration = 0;
            this.accumulatedBreakdown = { logic: 0, physics: 0, shadowcasting: 0, animalAI: 0, serialize: 0 };
            this.accumulatedPackets = 0;
            this.accumulatedBytes = 0;
            this.peakTickInSample = 0;
            this.dbLatencyInSample = [];
            this.lastSampleTime = now;

            // Gather Resource Usage
            this.metrics.memoryUsage = process.memoryUsage();

            // Connections
            if (this.io) {
                this.metrics.activeConnections = this.io.engine.clientsCount;
            }
        }
    },

    getStats() {
        return {
            ...this.metrics,
            uptime: process.uptime(),
            logs: require('../logger').getLogs()
        };
    }
};

module.exports = monitoring;
