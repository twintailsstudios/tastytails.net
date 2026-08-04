/**
 * @fileoverview TastyTails Bottleneck Taxonomy Stress Test - Upgraded Engine
 * 
 * @description
 * Progressively scales client WebSocket connections across 3 load phases (Baseline -> 50 bots -> 150 bots)
 * to isolate and attribute server performance bottlenecks to CPU processing (physics/shadowcasting/logic),
 * network serialization payload overhead, Node.js event loop jitter, V8 GC pauses, or DB queue latency.
 * Calculates algorithmic growth scaling exponents (alpha) to detect O(N^2) bottlenecks.
 * 
 * Target Thresholds:
 *   - CPU Scaling: physics + shadowcasting + logic <= 15.0ms (at 150 bots)
 *   - Serialization Scaling: serialize duration <= 35.0ms (at 150 bots)
 *   - Event Loop Stability: eventLoopLag <= 50.0ms (at 150 bots)
 *   - Algorithmic Exponent (Alpha): alpha <= 1.5 (Linear/Sub-quadratic scaling)
 * 
 * Usage:
 *   node scripts/test_bottleneck_taxonomy.js
 */
const http = require('http');
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const SERVER_URL = BASE_URL.replace(/\/$/, '');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';

// Non-keepalive HTTP agent preventing ECONNRESET socket resets under load
const httpAgent = new http.Agent({ keepAlive: false });

/**
 * Synthetic Bot Client representing an active player WebSocket connection.
 */
class BotClient {
    /**
     * @param {number} id - Unique numeric bot identifier.
     */
    constructor(id) {
        this.id = id;
        this.name = `TaxonomyBot_${id}`;
        this.charId = `000000000000000000a${id.toString(16).padStart(5, '0')}`;
        this.socket = null;
        this.interval = null;
        this.token = jwt.sign(
            { _id: `BOT_ACC_${this.id}`, username: this.name },
            TOKEN_SECRET
        );
    }

    /**
     * Establishes a Socket.io WebSocket connection for the bot entity in an IDLE state.
     * Does NOT start input loop until startStress() is called.
     * @returns {Promise<void>} Resolves when connection handshake completes.
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.socket = io(SERVER_URL, {
                query: { charId: this.charId, isBot: true },
                reconnection: false,
                transports: ['websocket'],
                forceNew: true,
                timeout: 20000
            });

            const timeoutId = setTimeout(() => {
                if (this.socket) this.socket.disconnect();
                reject(new Error(`[${this.name}] Connection Handshake Timeout`));
            }, 20000);

            this.socket.on('connect', () => {
                clearTimeout(timeoutId);

                this.socket.on('error', (err) => console.error(`[${this.name}] Socket error:`, err));
                this.socket.on('disconnect', () => {
                    if (this.interval) clearInterval(this.interval);
                });

                // Initialize in game state
                this.socket.emit('characterUpdate', {
                    x: 3291 + (this.id % 10) * 10,
                    y: 4287 + Math.floor(this.id / 10) * 10,
                    firstName: this.name,
                    lastName: 'Bot',
                    isInGame: true
                });

                resolve();
            });

            this.socket.on('connect_error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }

    /**
     * Starts high-frequency input and chat simulation loop.
     * Invoked after all bots in phase have connected and server has stabilized.
     */
    startStress() {
        if (this.interval) clearInterval(this.interval);

        this.interval = setInterval(() => {
            this.socket.emit('playerInput', {
                left: Math.random() > 0.5,
                right: Math.random() > 0.5,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: 0.016,
                clientTimestamp: Date.now()
            });

            // Occasional spatial chat emission
            if (Math.random() > 0.98) {
                this.socket.emit('input', {
                    message: `TaxonomyBot ${this.id} load test message`,
                    scope: 'local',
                    token: this.token,
                    charId: this.charId
                });
            }
        }, 200);
    }

    /**
     * Disconnects the underlying WebSocket and clears timers.
     */
    disconnect() {
        if (this.interval) clearInterval(this.interval);
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
        }
    }
}

/**
 * Fetches server performance telemetry from GET /stats with retry fallback.
 * @param {number} [retries=2] - Number of retry attempts on socket reset.
 * @returns {Promise<Object>} Resolves to parsed telemetry JSON.
 */
function getStats(retries = 2) {
    return new Promise((resolve, reject) => {
        const req = http.get(`${SERVER_URL}/stats`, { agent: httpAgent }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse GET /stats JSON: ${e.message}`));
                }
            });
        });

        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('GET /stats request timed out after 5000ms'));
        });

        req.on('error', async (err) => {
            if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')) {
                await wait(200);
                try {
                    const retryResult = await getStats(retries - 1);
                    resolve(retryResult);
                } catch (e) {
                    reject(e);
                }
            } else {
                reject(err);
            }
        });
    });
}

/**
 * Promise-based async delay helper.
 * @param {number} ms - Delay duration in milliseconds.
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Computes percentile value from numerical dataset.
 * @param {Array<number>} arr - Numerical dataset
 * @param {number} p - Percentile (0 to 100)
 * @returns {number} Percentile value
 */
function getPercentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Parses multi-sample telemetry snapshots into 5-vector taxonomy metrics (Mean & P95).
 * @param {Array<Object>} samples - Array of telemetry snapshots from phase.
 * @returns {{ cpu: number, serialize: number, jitter: number, gcPause: number, dbLatency: number }} Taxonomy metrics in ms.
 */
function summarizePhaseSamples(samples) {
    if (!samples || samples.length === 0) {
        return { cpu: 0, serialize: 0, jitter: 0, gcPause: 0, dbLatency: 0 };
    }

    const cpuArr = samples.map(s => (s.tickBreakdown?.physics || 0) + (s.tickBreakdown?.shadowcasting || 0) + (s.tickBreakdown?.logic || 0));
    const serializeArr = samples.map(s => s.tickBreakdown?.serialize || 0);
    const jitterArr = samples.map(s => s.eventLoopLag || 0);
    const gcPauseArr = samples.map(s => s.gcStats?.maxDuration || 0);
    const dbLatencyArr = samples.map(s => s.dbLatency || 0);

    return {
        cpu: getPercentile(cpuArr, 95),
        serialize: getPercentile(serializeArr, 95),
        jitter: getPercentile(jitterArr, 95),
        gcPause: Math.max(...gcPauseArr),
        dbLatency: getPercentile(dbLatencyArr, 95)
    };
}

/**
 * Main async stress test orchestrator.
 */
async function run() {
    console.log("=== Starting Upgraded Bottleneck Taxonomy Stress Test ===");
    console.log("Goal: Isolate CPU, Serialization, Jitter, GC, and DB bottlenecks & compute growth exponent (alpha).");
    const bots = [];
    const reportData = [];
    let reporterSocket = null;

    try {
        // Phase 1: Baseline (0 Bots)
        console.log("\n[Phase 1/3] Profiling idle server baseline (5 seconds)...");
        const phase1Samples = [];
        for (let s = 0; s < 5; s++) {
            await wait(1000);
            try { phase1Samples.push(await getStats()); } catch (e) {}
        }
        const p1Metrics = summarizePhaseSamples(phase1Samples);
        reportData.push({
            Phase: 'Baseline (0 bots)',
            'CPU P95': p1Metrics.cpu.toFixed(2) + " ms",
            'Serialize P95': p1Metrics.serialize.toFixed(2) + " ms",
            'Jitter P95': p1Metrics.jitter.toFixed(2) + " ms",
            'GC Peak': p1Metrics.gcPause.toFixed(2) + " ms",
            'DB Latency': p1Metrics.dbLatency.toFixed(2) + " ms"
        });

        // Phase 2: Medium Load (50 Bots)
        console.log("\n[Phase 2/3] Spawning 50 bots in batches of 15 (Medium Load)...");
        for (let i = 0; i < 50; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if ((i + 1) % 15 === 0) {
                process.stdout.write(` [Batch ${(i + 1) / 15}/3]`);
                await wait(300);
            } else {
                process.stdout.write(".");
                await wait(60);
            }
        }
        console.log("\n50 bots connected. Waiting 2000ms to stabilize, then starting stress loops...");
        await wait(2000);
        bots.forEach(b => b.startStress());

        console.log("Profiling Medium Load (5 seconds)...");
        const phase2Samples = [];
        for (let s = 0; s < 5; s++) {
            await wait(1000);
            try { phase2Samples.push(await getStats()); } catch (e) {}
        }
        const p2Metrics = summarizePhaseSamples(phase2Samples);
        reportData.push({
            Phase: 'Medium (50 bots)',
            'CPU P95': p2Metrics.cpu.toFixed(2) + " ms",
            'Serialize P95': p2Metrics.serialize.toFixed(2) + " ms",
            'Jitter P95': p2Metrics.jitter.toFixed(2) + " ms",
            'GC Peak': p2Metrics.gcPause.toFixed(2) + " ms",
            'DB Latency': p2Metrics.dbLatency.toFixed(2) + " ms"
        });

        // Phase 3: High Load (150 Bots total)
        console.log("\n[Phase 3/3] Spawning 100 additional bots in batches of 15 (High Load, total 150)...");
        for (let i = 50; i < 150; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if ((i - 49) % 15 === 0) {
                process.stdout.write(` [Batch ${Math.ceil((i - 49) / 15)}/7]`);
                await wait(300);
            } else {
                process.stdout.write(".");
                await wait(60);
            }
        }
        console.log("\nAll 150 bots connected. Waiting 2000ms to stabilize, then starting stress loops...");
        await wait(2000);
        bots.forEach(b => b.startStress());

        console.log("Profiling High Load (5 seconds)...");
        const phase3Samples = [];
        for (let s = 0; s < 5; s++) {
            await wait(1000);
            try { phase3Samples.push(await getStats()); } catch (e) {}
        }
        const p3Metrics = summarizePhaseSamples(phase3Samples);
        reportData.push({
            Phase: 'High (150 bots)',
            'CPU P95': p3Metrics.cpu.toFixed(2) + " ms",
            'Serialize P95': p3Metrics.serialize.toFixed(2) + " ms",
            'Jitter P95': p3Metrics.jitter.toFixed(2) + " ms",
            'GC Peak': p3Metrics.gcPause.toFixed(2) + " ms",
            'DB Latency': p3Metrics.dbLatency.toFixed(2) + " ms"
        });

        // Cleanup Bots
        console.log("\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        // Display Comparative Table
        console.log("\n=== Bottleneck Taxonomy Multi-Vector Report ===");
        console.table(reportData);

        // Algorithmic Growth Exponent Calculation (Alpha)
        // Alpha = log(T_high / T_med) / log(150 / 50) = log(T_150 / T_50) / log(3)
        const cpuAlpha = Math.max(0, Math.log(Math.max(0.1, p3Metrics.cpu) / Math.max(0.1, p2Metrics.cpu)) / Math.log(3));
        const serializeAlpha = Math.max(0, Math.log(Math.max(0.1, p3Metrics.serialize) / Math.max(0.1, p2Metrics.serialize)) / Math.log(3));

        // Evaluation Thresholds
        const cpuSuccess = p3Metrics.cpu <= 15.0;
        const serializeSuccess = p3Metrics.serialize <= 35.0;
        const jitterSuccess = p3Metrics.jitter <= 50.0;
        const alphaSuccess = cpuAlpha <= 1.5 && serializeAlpha <= 1.5;

        console.log(`\n--- Evaluations & Scaling Exponents ---`);
        console.log(`${cpuSuccess ? "✅" : "❌"} CPU P95 Scaling (Limit 15.0ms): ${p3Metrics.cpu.toFixed(2)}ms`);
        console.log(`${serializeSuccess ? "✅" : "❌"} Serialization P95 Scaling (Limit 35.0ms): ${p3Metrics.serialize.toFixed(2)}ms`);
        console.log(`${jitterSuccess ? "✅" : "❌"} Event Loop Stability (Limit 50.0ms): ${p3Metrics.jitter.toFixed(2)}ms`);
        console.log(`${cpuAlpha <= 1.5 ? "✅" : "❌"} CPU Scaling Exponent (Alpha <= 1.5): alpha = ${cpuAlpha.toFixed(2)} (${cpuAlpha > 1.5 ? 'Quadratic O(N^2) Warning!' : 'Linear O(N)'})`);
        console.log(`${serializeAlpha <= 1.5 ? "✅" : "❌"} Serialization Exponent (Alpha <= 1.5): alpha = ${serializeAlpha.toFixed(2)} (${serializeAlpha > 1.5 ? 'Quadratic O(N^2) Warning!' : 'Linear O(N)'})`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true,
            timeout: 5000
        });

        await new Promise((resolve) => {
            const reporterTimeout = setTimeout(() => {
                console.warn("⚠️ Dashboard reporter socket timed out. Skipping dashboard submission.");
                try { reporterSocket.disconnect(); } catch (e) {}
                resolve();
            }, 5000);

            reporterSocket.on('connect', () => {
                clearTimeout(reporterTimeout);
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy cpu scaling', success: cpuSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy serialization scaling', success: serializeSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy event loop stability', success: jitterSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy algorithmic alpha precision', success: alphaSuccess });
                setTimeout(() => {
                    reporterSocket.disconnect();
                    resolve();
                }, 1000);
            });

            reporterSocket.on('connect_error', (err) => {
                clearTimeout(reporterTimeout);
                console.warn(`⚠️ Dashboard reporter connection error (${err.message}). Proceeding to finalize test.`);
                try { reporterSocket.disconnect(); } catch (e) {}
                resolve();
            });
        });

        console.log("✅ Taxonomy benchmark execution complete.");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        if (reporterSocket) reporterSocket.disconnect();
        process.exit(1);
    }
}

run();
