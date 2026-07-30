/**
 * @fileoverview TastyTails Memory Leaker & V8 GC Stress Test Client
 * 
 * @description
 * High-performance automated stress testing script for TastyTails.net that evaluates server memory leak
 * stability and V8 Garbage Collection (GC) pause latencies. Spawns configurable bot swarms to churn
 * object allocations (movement collision vectors and local chat text allocations), measures net post-cleanup
 * heap growth against a 50MB limit, and verifies peak GC pause duration does not exceed 100ms.
 * 
 * Triggered by:
 *   - Manual CLI execution: `node scripts/test_memory_leaker.js [--bots=150] [--duration=15000]`
 *   - Automated diagnostic suite: tastytails-performance-tuner skill
 * 
 * Target Thresholds:
 *   - Memory Leak Stability: net heap growth after client cleanup <= 50.0MB
 *   - Garbage Collection Latency: peak GC pause duration (gcStats.maxDuration) <= 100.0ms
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
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';
const TOTAL_BOTS = parseArg('--bots', 150);
const STRESS_DURATION_MS = parseArg('--duration', 15000);

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
        // OPTIMIZATION: Token cached during connect() to avoid redundant synchronous jwt.sign crypto overhead
        this.token = null;
        this.socket = null;
        this.interval = null;
    }

    /**
     * Establishes a WebSocket connection to the game server and emits character initialization payload.
     * @returns {Promise<void>} Resolves on successful connection or rejects on timeout/error.
     */
    async connect() {
        return new Promise((resolve, reject) => {
            this.token = jwt.sign(
                { _id: `BOT_ACC_${this.id}`, username: this.name },
                TOKEN_SECRET
            );

            this.socket = io(SERVER_URL, {
                query: { charId: this.charId, isBot: true },
                reconnection: false,
                transports: ['websocket'],
                forceNew: true,
                timeout: 10000
            });

            const timeoutId = setTimeout(() => {
                this.socket.disconnect();
                reject(new Error(`[${this.name}] Connection Handshake Timeout`));
            }, 12000);

            this.socket.on('connect', () => {
                clearTimeout(timeoutId);
                // Grid layout positioning
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
     * @param {string} [token=this.token] - JWT authentication token
     */
    startStress(token = this.token) {
        // High-frequency 200ms allocation tick
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
            if (Math.random() > 0.8) {
                this.socket.emit('input', {
                    message: `Allocation stress message from bot ${this.id}`,
                    scope: 'local',
                    token: token,
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
            this.socket.disconnect();
        }
    }
}

/**
 * Queries server health and memory statistics from the GET /stats HTTP endpoint.
 * @returns {Promise<Object>} Server metrics snapshot object
 */
function getStats() {
    return new Promise((resolve, reject) => {
        http.get(`${SERVER_URL}/stats`, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Utility helper returning a Promise that resolves after a specified delay.
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main execution routine orchestrating baseline metrics, batched bot spawning, stress allocation,
 * client cleanup, and telemetry reporting to the Server Health Dashboard.
 */
async function run() {
    console.log("=== Starting Memory Leaker (GC & Object Allocation) Stress Test ===");
    console.log(`Goal: Spawn ${TOTAL_BOTS} bots to churn object allocations, then disconnect and monitor memory leaks & GC latency.`);
    const bots = [];

    try {
        // Query baseline stats before spawning
        console.log("\n[Phase 1] Querying baseline stats...");
        const initialStats = await getStats();
        const initialHeap = (initialStats.memoryUsage.heapUsed || 0) / (1024 * 1024);
        console.log(`Baseline Heap Used: ${initialHeap.toFixed(2)} MB`);

        // OPTIMIZATION: Spawn bots in 10-bot concurrent batches using Promise.allSettled to speed up setup while preventing handshake drops
        console.log(`\n[Phase 2] Spawning ${TOTAL_BOTS} bots in concurrent batches...`);
        const BATCH_SIZE = 10;
        for (let i = 0; i < TOTAL_BOTS; i += BATCH_SIZE) {
            const batch = [];
            for (let j = i; j < Math.min(i + BATCH_SIZE, TOTAL_BOTS); j++) {
                const bot = new BotClient(j);
                // RELIABILITY: Register bot early in bots array so catch block cleans up all created instances on error
                bots.push(bot);
                batch.push(bot.connect());
            }
            const results = await Promise.allSettled(batch);
            const failedCount = results.filter(r => r.status === 'rejected').length;
            if (failedCount > 0) {
                console.warn(`\n[Warning] ${failedCount} bot connection(s) failed in batch ${Math.floor(i / BATCH_SIZE) + 1}`);
            }
            process.stdout.write(".");
            await wait(50);
        }

        console.log(`\nAll bots connected. Starting stress allocation loops for ${(STRESS_DURATION_MS / 1000).toFixed(1)} seconds...`);
        bots.forEach(bot => {
            bot.startStress();
        });

        await wait(STRESS_DURATION_MS);

        // Disconnect all bots
        console.log("\n[Phase 3] Cleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        console.log("Waiting 5s for V8 memory stabilization and garbage collection...");
        await wait(5000);

        // Query ending stats
        console.log("\n[Phase 4] Querying post-cleanup stats...");
        const finalStats = await getStats();
        const finalHeap = (finalStats.memoryUsage.heapUsed || 0) / (1024 * 1024);
        const heapGrowth = finalHeap - initialHeap;

        const initialGCCount = initialStats.gcStats.count || 0;
        const finalGCCount = finalStats.gcStats.count || 0;
        const gcPasses = finalGCCount - initialGCCount;
        const maxGCLatency = finalStats.gcStats.maxDuration || 0;

        console.log("\n=== Memory Leaker Benchmarking Report ===");
        const reportData = [{
            metric: "Baseline Heap Used",
            value: `${initialHeap.toFixed(2)} MB`
        }, {
            metric: "Post-Cleanup Heap Used",
            value: `${finalHeap.toFixed(2)} MB`
        }, {
            metric: "Net Heap Growth (Leak Size)",
            value: `${heapGrowth.toFixed(2)} MB`
        }, {
            metric: "GC Passes during test",
            value: gcPasses
        }, {
            metric: "Peak GC Pause Latency",
            value: `${maxGCLatency.toFixed(2)} ms`
        }];
        console.table(reportData);

        // Evaluations
        const leakSuccess = heapGrowth <= 50.0;
        const latencySuccess = maxGCLatency <= 100.0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${leakSuccess ? "✅" : "❌"} Memory Leak Stability (Limit <= 50.0MB growth): ${heapGrowth.toFixed(2)}MB`);
        console.log(`${latencySuccess ? "✅" : "❌"} Garbage Collection Latency (Limit <= 100.0ms): ${maxGCLatency.toFixed(2)}ms`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true
        });

        // RELIABILITY: Safeguard reporter socket with 10s handshake timeout and error boundary
        try {
            await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reporterSocket.disconnect();
                    reject(new Error("Reporter socket handshake timed out (10s)"));
                }, 10000);

                reporterSocket.on('connect', () => {
                    clearTimeout(timeoutId);
                    reporterSocket.emit('reportAction', { actionType: 'test: memory leak stability', success: leakSuccess });
                    reporterSocket.emit('reportAction', { actionType: 'test: memory gc latency', success: latencySuccess });
                    setTimeout(() => {
                        reporterSocket.disconnect();
                        resolve();
                    }, 1000);
                });

                reporterSocket.on('connect_error', (err) => {
                    clearTimeout(timeoutId);
                    reporterSocket.disconnect();
                    reject(err);
                });
            });
            console.log("✅ Reports submitted to dashboard. Test suite finalized.");
        } catch (reporterErr) {
            console.warn("⚠️ Telemetry dashboard report warning:", reporterErr.message);
        }

        process.exit(0);

    } catch (err) {
        console.error("❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        process.exit(1);
    }
}

run();

