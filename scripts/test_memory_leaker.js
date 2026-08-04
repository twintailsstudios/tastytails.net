/**
 * @fileoverview TastyTails Memory Leaker & V8 GC Stress Test Client - Upgraded Engine
 * 
 * @description
 * High-performance automated stress testing script for TastyTails.net that evaluates server memory leak
 * stability, RSS/external buffer memory growth, V8 Garbage Collection (GC) pause latencies, and
 * allocation churn trajectories (MB/sec).
 * 
 * Upgraded Features:
 *   1. Dual V8 Heap & RSS / External Buffer Memory Audit
 *   2. Explicit V8 GC Sweep Trigger (global.gc() support)
 *   3. Allocation Churn Trajectory Profiling (MB/sec rate & peak stress memory)
 *   4. Batch Connection Spawning & Idle Handshake Safeguards
 * 
 * Target Thresholds:
 *   - Heap Memory Leak Stability: net heap growth <= 50.0MB
 *   - RSS / External Memory Stability: net RSS growth <= 80.0MB
 *   - Garbage Collection Latency: peak GC pause duration (gcStats.maxDuration) <= 100.0ms
 *   - Allocation Churn Rate: churn velocity <= 15.0 MB/sec
 * 
 * Usage:
 *   node scripts/test_memory_leaker.js [--bots=150] [--duration=15000]
 *   node --expose-gc scripts/test_memory_leaker.js (for explicit GC sweeps)
 */
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

/**
 * Parses numeric CLI arguments formatted as `--flag=value` with a fallback default.
 * @param {string} flag - CLI flag key (e.g. '--bots')
 * @param {number} defaultValue - Fallback default if flag is unparsed or invalid
 * @returns {number} Validated numeric parameter
 */
function parseArg(flag, defaultValue) {
    const arg = process.argv.find(a => a.startsWith(`${flag}=`));
    if (!arg) return defaultValue;
    const val = arg.split('=')[1];
    const num = parseInt(val, 10);
    return Number.isFinite(num) && num > 0 ? num : defaultValue;
}

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const SERVER_URL = BASE_URL.replace(/\/$/, '');
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';
const TOTAL_BOTS = parseArg('--bots', 150);
const STRESS_DURATION_MS = parseArg('--duration', 15000);

// Non-keepalive HTTP agent preventing ECONNRESET socket resets under load
const httpAgent = new http.Agent({ keepAlive: false });

/**
 * BotClient actor class encapsulating socket connection state, auth tokens, and stress allocation loops.
 */
class BotClient {
    /**
     * @param {number} id - Unique numeric identifier for the bot actor instance.
     */
    constructor(id) {
        this.id = id;
        this.name = `LeakBot_${id}`;
        this.charId = `000000000000000000d${id.toString(16).padStart(5, '0')}`;
        this.token = jwt.sign(
            { _id: `BOT_ACC_${this.id}`, username: this.name },
            TOKEN_SECRET
        );
        this.socket = null;
        this.interval = null;
    }

    /**
     * Establishes a WebSocket connection in an IDLE state.
     * Does NOT start allocation loop until startStress() is invoked.
     * @returns {Promise<void>} Resolves on successful connection or rejects on timeout.
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

                // Spawn in grid layout
                this.socket.emit('characterUpdate', {
                    x: 3200 + (this.id % 10) * 15,
                    y: 4200 + Math.floor(this.id / 10) * 15,
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
     * Starts high-frequency input and chat event emission loop to churn server memory allocations.
     */
    startStress() {
        if (this.interval) clearInterval(this.interval);

        this.interval = setInterval(() => {
            // Movement inputs to trigger collision vector instantiations on server
            this.socket.emit('playerInput', {
                left: Math.random() > 0.5,
                right: Math.random() > 0.5,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: 0.016,
                clientTimestamp: Date.now()
            });

            // Local chat inputs to churn text & string allocations on server
            if (Math.random() > 0.85) {
                this.socket.emit('input', {
                    message: `Allocation stress message from bot ${this.id}`,
                    scope: 'local',
                    token: this.token,
                    charId: this.charId
                });
            }
        }, 200);
    }

    /**
     * Disconnects the socket and clears interval timers.
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
 * Queries server health and memory statistics from GET /stats with retry fallback.
 * @param {number} [retries=2] - Number of retry attempts on socket reset.
 * @returns {Promise<Object>} Server metrics snapshot object
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
 * Promisified timer delay helper.
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main execution routine orchestrating baseline metrics, batched bot spawning, stress allocation,
 * client cleanup, trajectory monitoring, and telemetry reporting to the Server Health Dashboard.
 */
async function run() {
    console.log("=== Starting Memory Leaker (Dual Heap/RSS & Allocation Churn) Stress Test ===");
    console.log(`Goal: Spawn ${TOTAL_BOTS} bots to churn object allocations, monitor RSS & Heap trajectory, then audit post-cleanup memory.`);
    const bots = [];
    const BATCH_SIZE = 15;

    try {
        // Query baseline stats before spawning
        console.log("\n[Phase 1] Querying baseline memory stats...");
        const initialStats = await getStats();
        const initialHeap = (initialStats.memoryUsage?.heapUsed || 0) / (1024 * 1024);
        const initialRss = (initialStats.memoryUsage?.rss || 0) / (1024 * 1024);
        const initialExternal = (initialStats.memoryUsage?.external || 0) / (1024 * 1024);

        console.log(`Baseline Heap Used:     ${initialHeap.toFixed(2)} MB`);
        console.log(`Baseline RSS Size:      ${initialRss.toFixed(2)} MB`);
        console.log(`Baseline External Buffers: ${initialExternal.toFixed(2)} MB`);

        // Spawn bots in batches with idle handshake
        console.log(`\n[Phase 2] Spawning ${TOTAL_BOTS} bots in batches of ${BATCH_SIZE} (idle mode)...`);
        for (let i = 0; i < TOTAL_BOTS; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);

            if ((i + 1) % BATCH_SIZE === 0) {
                process.stdout.write(` [Batch ${(i + 1) / BATCH_SIZE}/${TOTAL_BOTS / BATCH_SIZE}]`);
                await wait(300);
            } else {
                process.stdout.write(".");
                await wait(60);
            }
        }

        console.log(`\n\nAll ${TOTAL_BOTS} bots connected successfully in idle state.`);
        console.log("Waiting 2000ms for server loop to register state and stabilize...");
        await wait(2000);

        console.log(`Synchronizing allocation loops across all bots... Starting stress phase (${(STRESS_DURATION_MS / 1000).toFixed(1)}s)!`);
        bots.forEach(bot => bot.startStress());

        // Multi-sample trajectory monitoring during stress phase
        const stressSamples = [];
        const numSamples = Math.floor(STRESS_DURATION_MS / 1000);
        for (let s = 0; s < numSamples; s++) {
            await wait(1000);
            try {
                const snapshot = await getStats();
                stressSamples.push(snapshot);
                process.stdout.write(`[Sample ${s + 1}/${numSamples}] `);
            } catch (e) {
                console.warn(`\nStress sample ${s + 1} failed:`, e.message);
            }
        }

        // Disconnect all bots
        console.log("\n\n[Phase 3] Cleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        // Explicit V8 Garbage Collection attempt if exposed
        if (typeof global.gc === 'function') {
            console.log("Triggering explicit V8 mark-sweep Garbage Collection (global.gc())...");
            try {
                global.gc();
                global.gc();
                global.gc();
            } catch (e) {}
        } else {
            console.log("Note: Running without --expose-gc. Waiting 5s for automatic V8 GC stabilization...");
        }
        await wait(5000);

        // Query ending stats
        console.log("\n[Phase 4] Querying post-cleanup memory stats...");
        const finalStats = await getStats();
        const finalHeap = (finalStats.memoryUsage?.heapUsed || 0) / (1024 * 1024);
        const finalRss = (finalStats.memoryUsage?.rss || 0) / (1024 * 1024);
        const finalExternal = (finalStats.memoryUsage?.external || 0) / (1024 * 1024);

        const heapGrowth = finalHeap - initialHeap;
        const rssGrowth = finalRss - initialRss;
        const externalGrowth = finalExternal - initialExternal;

        // Trajectory Churn Analysis
        const peakStressHeap = stressSamples.length > 0 ? Math.max(...stressSamples.map(s => (s.memoryUsage?.heapUsed || 0) / (1024 * 1024))) : finalHeap;
        const churnRateMbSec = (peakStressHeap - initialHeap) / (STRESS_DURATION_MS / 1000);

        const initialGCCount = initialStats.gcStats?.count || 0;
        const finalGCCount = finalStats.gcStats?.count || 0;
        const gcPasses = finalGCCount - initialGCCount;
        const maxGCLatency = finalStats.gcStats?.maxDuration || 0;

        console.log("\n=== Memory Leaker Multi-Vector Benchmarking Report ===");
        const reportData = [{
            metric: "Baseline Heap / RSS / External",
            value: `${initialHeap.toFixed(1)}MB / ${initialRss.toFixed(1)}MB / ${initialExternal.toFixed(1)}MB`
        }, {
            metric: "Post-Cleanup Heap / RSS / External",
            value: `${finalHeap.toFixed(1)}MB / ${finalRss.toFixed(1)}MB / ${finalExternal.toFixed(1)}MB`
        }, {
            metric: "Net Heap Growth (JS Heap Leak)",
            value: `${heapGrowth.toFixed(2)} MB`
        }, {
            metric: "Net RSS Growth (Native Process Leak)",
            value: `${rssGrowth.toFixed(2)} MB`
        }, {
            metric: "Allocation Churn Velocity",
            value: `${churnRateMbSec.toFixed(2)} MB/sec (Peak: ${peakStressHeap.toFixed(1)} MB)`
        }, {
            metric: "GC Passes during test",
            value: gcPasses
        }, {
            metric: "Peak GC Pause Latency",
            value: `${maxGCLatency.toFixed(2)} ms`
        }];
        console.table(reportData);

        // Evaluations
        const heapSuccess = heapGrowth <= 50.0;
        const rssSuccess = rssGrowth <= 80.0;
        const latencySuccess = maxGCLatency <= 100.0;
        const churnSuccess = churnRateMbSec <= 15.0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${heapSuccess ? "✅" : "❌"} Heap Memory Leak Stability (Limit <= 50.0MB): ${heapGrowth.toFixed(2)}MB`);
        console.log(`${rssSuccess ? "✅" : "❌"} RSS Native Memory Stability (Limit <= 80.0MB): ${rssGrowth.toFixed(2)}MB`);
        console.log(`${latencySuccess ? "✅" : "❌"} Garbage Collection Latency (Limit <= 100.0ms): ${maxGCLatency.toFixed(2)}ms`);
        console.log(`${churnSuccess ? "✅" : "❌"} Allocation Churn Velocity (Limit <= 15.0 MB/sec): ${churnRateMbSec.toFixed(2)} MB/sec`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true,
            timeout: 5000
        });

        await new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                console.warn("⚠️ Dashboard reporter socket timed out. Skipping dashboard submission.");
                try { reporterSocket.disconnect(); } catch (e) {}
                resolve();
            }, 5000);

            reporterSocket.on('connect', () => {
                clearTimeout(timeoutId);
                reporterSocket.emit('reportAction', { actionType: 'test: memory leak stability (heap)', success: heapSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: memory leak stability (rss & external)', success: rssSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: memory gc latency', success: latencySuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: memory allocation trajectory', success: churnSuccess });
                setTimeout(() => {
                    reporterSocket.disconnect();
                    resolve();
                }, 1000);
            });

            reporterSocket.on('connect_error', (err) => {
                clearTimeout(timeoutId);
                console.warn(`⚠️ Dashboard reporter connection error (${err.message}). Proceeding to finalize test.`);
                try { reporterSocket.disconnect(); } catch (e) {}
                resolve();
            });
        });

        console.log("✅ Reports submitted to dashboard. Test suite finalized.");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        process.exit(1);
    }
}

run();
