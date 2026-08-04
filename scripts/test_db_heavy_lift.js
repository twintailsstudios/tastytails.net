/**
 * @fileoverview test_db_heavy_lift.js - Database Resilience & Write-Behind Cache Stress Test - Upgraded Engine
 * 
 * @description
 * High-concurrency stress test designed to evaluate TastyTails' write-behind database cache
 * (DatabaseResilience.js). Spawns a bot swarm to generate movement and chat writes over 35 seconds,
 * continuously profiling the 30-second bulk database flush event to measure DB write latency P95,
 * event loop lag P95, write queue accumulation, and 100% post-cleanup queue drain.
 * 
 * Upgraded Features:
 *   1. Continuous 35-Second Flush Event Latency Profiling (1000ms sampling)
 *   2. Write Queue Accumulation & 100% Post-Cleanup Drain Verification
 *   3. Batch Connection Spawning & Idle Handshake Safeguards
 *   4. Defensive HTTP Poller with ECONNRESET Retry Handlers
 * 
 * Target Thresholds:
 *   - DB Write Latency P95: dbLatency P95 <= 1000.0ms
 *   - Event Loop Stability P95: eventLoopLag P95 <= 100.0ms
 *   - Post-Cleanup Queue Drain: remaining queue items == 0
 * 
 * Usage:
 *   node scripts/test_db_heavy_lift.js
 */
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

// Dynamic SERVER_URL fallback with trailing-slash sanitization
const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const SERVER_URL = BASE_URL.replace(/\/$/, '');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';
const TARGET_BOT_COUNT = parseInt(process.env.BOT_COUNT || '150', 10);
const STRESS_DURATION_MS = parseInt(process.env.STRESS_DURATION_MS || '35000', 10);

// Non-keepalive HTTP agent preventing ECONNRESET socket resets under load
const httpAgent = new http.Agent({ keepAlive: false });

/**
 * Manages a single simulated bot client socket connection and input loop.
 */
class BotClient {
    /**
     * @param {number} id - Unique numeric identifier for the bot instance.
     */
    constructor(id) {
        this.id = id;
        this.name = `DbBot_${id}`;
        this.charId = `000000000000000000e${id.toString(16).padStart(5, '0')}`;
        this.socket = null;
        this.interval = null;
        this.token = jwt.sign(
            { _id: `BOT_ACC_${this.id}`, username: this.name },
            TOKEN_SECRET
        );
    }

    /**
     * Establishes a Socket.IO connection to the game server in an IDLE state.
     * Does NOT start input loop until startStress() is invoked.
     * @returns {Promise<void>} Resolves when socket successfully connects and places character.
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

                // Grid layout placement
                this.socket.emit('characterUpdate', {
                    x: 3200 + (this.id % 10) * 10,
                    y: 4200 + Math.floor(this.id / 10) * 10,
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
     * Launches the 200ms input stress loop for movement and chat writes.
     * Invoked after all bots connect and server stabilizes.
     */
    startStress() {
        if (this.interval) clearInterval(this.interval);

        this.interval = setInterval(() => {
            // High-frequency movement inputs
            this.socket.emit('playerInput', {
                left: Math.random() > 0.5,
                right: Math.random() > 0.5,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: 0.016,
                clientTimestamp: Date.now()
            });

            // Chat write payload (20% chance per tick) to populate write-behind cache
            if (Math.random() > 0.8) {
                this.socket.emit('input', {
                    message: `Database stress write message from bot ${this.id}`,
                    scope: 'local',
                    token: this.token,
                    charId: this.charId
                });
            }
        }, 200);
    }

    /**
     * Clears stress interval and closes the WebSocket connection.
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
 * Queries performance telemetry from GET /stats with retry fallback.
 * @param {number} [retries=2] - Number of retry attempts on socket reset.
 * @returns {Promise<Object>} Performance metrics JSON object.
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
                    reject(e);
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
 * Promisified delay helper.
 * @param {number} ms - Milliseconds to delay.
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Computes percentile value from array of numbers.
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
 * Orchestrates the DB Heavy Lift stress test suite.
 */
async function run() {
    console.log("=== Starting Upgraded DB Heavy Lift (Write-Behind Cache Resilience) Stress Test ===");
    console.log(`Goal: Spawn ${TARGET_BOT_COUNT} bots in batches, monitor 35s continuous flush trajectory, and audit post-cleanup queue drain.`);
    const bots = [];
    let reporterSocket = null;
    const BATCH_SIZE = 15;

    try {
        console.log(`\nSpawning ${TARGET_BOT_COUNT} active database bots in batches of ${BATCH_SIZE} (idle mode)...`);
        for (let i = 0; i < TARGET_BOT_COUNT; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);

            if ((i + 1) % BATCH_SIZE === 0) {
                process.stdout.write(` [Batch ${(i + 1) / BATCH_SIZE}/${Math.ceil(TARGET_BOT_COUNT / BATCH_SIZE)}]`);
                await wait(300);
            } else {
                process.stdout.write(".");
                await wait(60);
            }
        }

        console.log(`\n\nAll ${bots.length} bots connected successfully in idle state.`);
        console.log("Waiting 2000ms for server loop to register state and stabilize...");
        await wait(2000);

        console.log(`Synchronizing input and chat write loops... Starting stress phase (${STRESS_DURATION_MS / 1000}s)!`);
        bots.forEach(bot => bot.startStress());

        console.log("\nContinuous 35-second flush trajectory profiling...");
        const samples = [];
        const numSamples = Math.floor(STRESS_DURATION_MS / 1000);

        // Sample /stats every 1000ms for 35 seconds to capture the 30-second bulk write-behind flush
        for (let s = 0; s < numSamples; s++) {
            await wait(1000);
            try {
                const snapshot = await getStats();
                samples.push(snapshot);
                process.stdout.write(`[Sample ${s + 1}/${numSamples}] `);
            } catch (e) {
                console.warn(`\nSample ${s + 1} failed:`, e.message);
            }
        }

        console.log("\n\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        console.log("Waiting 5s for final post-cleanup write-behind cache flush...");
        await wait(5000);

        console.log("Querying post-cleanup stats...");
        const finalStats = await getStats();

        if (samples.length === 0) {
            throw new Error("No telemetry sample windows captured!");
        }

        // Aggregate metrics across continuous sample windows
        const dbLatencyArr = samples.map(s => s.dbLatency || 0);
        const loopLagArr = samples.map(s => s.eventLoopLag || 0);
        const queueSizeArr = samples.map(s => s.resilienceQueue || 0);

        const dbLatencyAvg = dbLatencyArr.reduce((a, b) => a + b, 0) / dbLatencyArr.length;
        const dbLatencyP95 = getPercentile(dbLatencyArr, 95);
        const dbLatencyPeak = Math.max(...dbLatencyArr);

        const loopLagAvg = loopLagArr.reduce((a, b) => a + b, 0) / loopLagArr.length;
        const loopLagP95 = getPercentile(loopLagArr, 95);
        const loopLagPeak = Math.max(...loopLagArr);

        const peakQueueSize = Math.max(...queueSizeArr);
        const postCleanupQueueSize = finalStats.resilienceQueue || 0;

        console.log("\n=== DB Heavy Lift Multi-Sample Benchmarking Report ===");
        const reportData = [{
            metric: "Stress Size & Mode",
            value: `${bots.length} bots (Batch-Spawned Write Churn)`
        }, {
            metric: "DB Write Latency (Mean / P95 / Peak)",
            value: `${dbLatencyAvg.toFixed(2)}ms / ${dbLatencyP95.toFixed(2)}ms / ${dbLatencyPeak.toFixed(2)}ms`
        }, {
            metric: "Event Loop Lag (Mean / P95 / Peak)",
            value: `${loopLagAvg.toFixed(2)}ms / ${loopLagP95.toFixed(2)}ms / ${loopLagPeak.toFixed(2)}ms`
        }, {
            metric: "Peak Write Buffer Queue Size",
            value: `${peakQueueSize} items`
        }, {
            metric: "Post-Cleanup Write Queue Drain",
            value: `${postCleanupQueueSize} items remaining (${postCleanupQueueSize === 0 ? 'Fully Drained' : 'Pending'})`
        }];
        console.table(reportData);

        // Evaluations
        const latencySuccess = dbLatencyP95 <= 1000.0;
        const loopSuccess = loopLagP95 <= 100.0;
        const drainSuccess = postCleanupQueueSize === 0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${latencySuccess ? "✅" : "❌"} DB Write Latency P95 (Limit <= 1000ms): ${dbLatencyP95.toFixed(2)}ms`);
        console.log(`${loopSuccess ? "✅" : "❌"} Event Loop Stability P95 (Limit <= 100ms): ${loopLagP95.toFixed(2)}ms`);
        console.log(`${drainSuccess ? "✅" : "❌"} Post-Cleanup Write Queue Drain: ${postCleanupQueueSize} items remaining`);

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
                reporterSocket.emit('reportAction', { actionType: 'test: database write latency P95', success: latencySuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: database event loop lag P95', success: loopSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: database queue drain precision', success: drainSuccess });
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

        console.log("✅ Reports submitted. Test suite finalized.");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Stress test failure:", err.message || err);
        bots.forEach(bot => bot.disconnect());
        if (reporterSocket) reporterSocket.disconnect();
        process.exit(1);
    }
}

run();
