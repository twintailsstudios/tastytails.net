const { performance } = require('perf_hooks');

const monitoring = {
    metrics: {
        tickDuration: 0, // ms
        tickRate: 0, // ticks per second
        lastTickTime: performance.now(),
        tickCount: 0,
        memoryUsage: {},
        activeConnections: 0,
        eventLoopLag: 0
    },

    // Config
    sampleInterval: 1000, // ms
    lastSampleTime: performance.now(),

    ticksInCurrentSample: 0,
    accumulatedDuration: 0,

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

    recordTick(duration) {
        const now = performance.now();
        this.ticksInCurrentSample++;
        this.accumulatedDuration += duration;
        this.metrics.tickDuration = duration; // Instantaneous

        if (now - this.lastSampleTime >= this.sampleInterval) {
            // Update Aggregates
            this.metrics.tickRate = this.ticksInCurrentSample;
            this.metrics.avgTickDuration = this.accumulatedDuration / this.ticksInCurrentSample;

            // Reset
            this.ticksInCurrentSample = 0;
            this.accumulatedDuration = 0;
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
