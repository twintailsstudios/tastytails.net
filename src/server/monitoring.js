const { performance } = require('perf_hooks');

const monitoring = {
    metrics: {
        tickDuration: 0, // ms
        tickRate: 0, // ticks per second
        lastTickTime: performance.now(),
        tickCount: 0,
        memoryUsage: {},
        activeConnections: 0,
        eventLoopLag: 0,
        // Detailed Profiling
        tickBreakdown: { physics: 0, logic: 0, serialize: 0 },
        // Entity Counts
        entities: { clients: 0, items: 0, corpses: 0 },
        // Network
        network: { packetsSent: 0, bytesSent: 0 },
        // Queue
        resilienceQueue: 0
    },

    // Config
    sampleInterval: 1000, // ms
    lastSampleTime: performance.now(),

    ticksInCurrentSample: 0,
    accumulatedDuration: 0,
    accumulatedBreakdown: { physics: 0, logic: 0, serialize: 0 },
    accumulatedPackets: 0,
    accumulatedBytes: 0,

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
    },

    recordTick(duration, breakdown = {}, entities = {}, network = {}, queueSize = 0) {
        const now = performance.now();
        this.ticksInCurrentSample++;
        this.accumulatedDuration += duration;
        this.metrics.tickDuration = duration; // Instantaneous

        // Accumulate Breakdown
        if (breakdown.physics) this.accumulatedBreakdown.physics += breakdown.physics;
        if (breakdown.logic) this.accumulatedBreakdown.logic += breakdown.logic;
        if (breakdown.serialize) this.accumulatedBreakdown.serialize += breakdown.serialize;

        // Accumulate Network
        if (network.packets) this.accumulatedPackets += network.packets;
        if (network.bytes) this.accumulatedBytes += network.bytes;

        // Instantaneous Entity/Queue Snapshot
        this.metrics.entities = entities;
        this.metrics.resilienceQueue = queueSize;

        if (now - this.lastSampleTime >= this.sampleInterval) {
            // Update Aggregates
            this.metrics.tickRate = this.ticksInCurrentSample;
            this.metrics.avgTickDuration = this.accumulatedDuration / this.ticksInCurrentSample;

            this.metrics.tickBreakdown = {
                physics: this.accumulatedBreakdown.physics / this.ticksInCurrentSample,
                logic: this.accumulatedBreakdown.logic / this.ticksInCurrentSample,
                serialize: this.accumulatedBreakdown.serialize / this.ticksInCurrentSample
            };

            this.metrics.network = {
                packetsSent: this.accumulatedPackets, // Per second (approx)
                bytesSent: this.accumulatedBytes
            };

            // Reset
            this.ticksInCurrentSample = 0;
            this.accumulatedDuration = 0;
            this.accumulatedBreakdown = { physics: 0, logic: 0, serialize: 0 };
            this.accumulatedPackets = 0;
            this.accumulatedBytes = 0;
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
            uptime: process.uptime()
        };
    }
};

module.exports = monitoring;
