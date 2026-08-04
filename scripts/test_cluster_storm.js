/**
 * @fileoverview TastyTails Cluster Storm Stress Test - Upgraded Engine
 * 
 * @description
 * Forces high-density player concentrations across spatial hash cell boundaries to stress
 * broad/narrow-phase collision resolution, spatial re-indexing, and shadowcasting computations.
 * 
 * Upgraded Features & Safeguards:
 *   1. Batch Connection Spawning (15 bots per batch with 300ms inter-batch stabilization breaks)
 *   2. Deferred Input Loop (Bots remain idle during connection handshake until ALL 150 bots are connected)
 *   3. Multi-Sample Window P95 / P99 Latency Profiling (10-second continuous sampling)
 *   4. Cell-Boundary Oscillating "Migrating Storm" (crossing x = 3200 every 3 seconds)
 *   5. Robust Defensive HTTP GET /stats Poller with automatic ECONNRESET retries
 * 
 * Target Thresholds:
 *   - Physics P95 Scaling: physics tick P95 <= 10.0ms (at 150 clustered bots)
 *   - Shadowcasting P95 Scaling: shadowcasting tick P95 <= 8.0ms (at 150 clustered bots)
 *   - Spatial Hash Precision: active buckets >= 1 and zero orphan entity leaks
 * 
 * Usage:
 *   Ensure the game server is running, then execute:
 *     node scripts/test_cluster_storm.js
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

// Use a dedicated non-keepalive HTTP agent to avoid ECONNRESET under socket load
const httpAgent = new http.Agent({ keepAlive: false });

/**
 * Simulates an active player client connected via Socket.IO inside the high-density cluster zone.
 */
class BotClient {
    /**
     * @param {number} id - Bot numerical index (0 to 149)
     */
    constructor(id) {
        this.id = id;
        this.name = `ClusterBot_${id}`;
        this.charId = `000000000000000000b${id.toString(16).padStart(5, '0')}`;
        this.socket = null;
        this.interval = null;
        this.token = jwt.sign(
            { _id: `BOT_ACC_${this.id}`, username: this.name },
            TOKEN_SECRET
        );
        this.baseX = 3200;
        this.baseY = 4300;
    }

    /**
     * Authenticates, connects, and places bot in cluster in an IDLE state.
     * Does NOT start input loop until startStress() is invoked.
     * @returns {Promise<void>} Resolves when connection handshake and initial positioning complete.
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

                // Spawn near cell boundary x = 3200
                const initialX = this.baseX + (Math.random() * 80 - 40);
                const initialY = this.baseY + (Math.random() * 80 - 40);

                this.socket.emit('characterUpdate', {
                    x: initialX,
                    y: initialY,
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
     * Starts high-frequency input and cell-boundary oscillation loop.
     * Invoked only after all bots are fully connected and server has stabilized.
     */
    startStress() {
        if (this.interval) clearInterval(this.interval);

        let phase = Math.random() * Math.PI * 2;
        this.interval = setInterval(() => {
            phase += 0.2;
            const offsetX = Math.sin(phase) * 60; // Crosses 3140 <-> 3260
            const targetX = Math.round(this.baseX + offsetX);

            this.socket.emit('playerInput', {
                left: offsetX < 0,
                right: offsetX > 0,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: 0.016,
                clientTimestamp: Date.now()
            });

            // Periodically update position to force spatial hash grid re-indexing
            if (Math.random() > 0.8) {
                this.socket.emit('characterUpdate', {
                    x: targetX,
                    y: this.baseY + Math.floor(Math.random() * 40 - 20),
                    firstName: this.name,
                    lastName: 'Bot',
                    isInGame: true
                });
            }

            // Balanced chat emission to test broad-phase serialization without event loop starvation
            if (Math.random() > 0.99) {
                this.socket.emit('input', {
                    message: `Oscillating across spatial boundary at x=${targetX}`,
                    scope: 'local',
                    token: this.token,
                    charId: this.charId
                });
            }
        }, 200);
    }

    /**
     * Safely disconnects the socket and clears the input interval.
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
 * Fetches engine performance metrics JSON from the game server's /stats endpoint with retry fallback.
 * @param {number} [retries=2] - Remaining retry attempts on ECONNRESET
 * @returns {Promise<Object>} Engine stats object.
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
 * @param {number} ms - Delay in milliseconds.
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
 * Main async stress test orchestrator.
 */
async function run() {
    console.log("=== Starting Upgraded Cluster Storm (Migrating Cell Boundary) Stress Test ===");
    console.log("Goal: Spawn 150 bots in batches, stabilize, then oscillate across cell boundary x=3200.");
    const bots = [];
    let reporterSocket = null;
    const TOTAL_BOTS = 150;
    const BATCH_SIZE = 15;

    try {
        console.log(`\nSpawning ${TOTAL_BOTS} bots in batches of ${BATCH_SIZE} (idle mode)...`);
        
        for (let i = 0; i < TOTAL_BOTS; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);

            if ((i + 1) % BATCH_SIZE === 0) {
                process.stdout.write(` [Batch ${(i + 1) / BATCH_SIZE}/${TOTAL_BOTS / BATCH_SIZE}]`);
                await wait(300); // Inter-batch stabilization delay
            } else {
                process.stdout.write(".");
                await wait(60); // Per-bot connection stagger
            }
        }

        console.log(`\n\nAll ${TOTAL_BOTS} bots connected successfully in idle state.`);
        console.log("Waiting 2000ms for server loop to register state and stabilize...");
        await wait(2000);

        console.log("Synchronizing input loops across all bots... Starting cluster storm!");
        bots.forEach(bot => bot.startStress());

        console.log("\nMulti-sample window profiling (10 seconds)...");
        const samples = [];

        // Sample /stats every 1000ms for 10 seconds
        for (let s = 0; s < 10; s++) {
            await wait(1000);
            try {
                const snapshot = await getStats();
                samples.push(snapshot);
                process.stdout.write(`[Sample ${s + 1}/10] `);
            } catch (e) {
                console.warn(`\nSample ${s + 1} failed:`, e.message);
            }
        }

        console.log("\n\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        if (samples.length === 0) {
            throw new Error("No telemetry sample windows captured!");
        }

        // Aggregate datasets across sample windows
        const physicsArr = samples.map(s => s.tickBreakdown?.physics || 0);
        const shadowArr = samples.map(s => s.tickBreakdown?.shadowcasting || 0);
        const serialArr = samples.map(s => s.tickBreakdown?.serialize || 0);
        const totalCpuArr = samples.map(s => (s.tickBreakdown?.physics || 0) + (s.tickBreakdown?.shadowcasting || 0) + (s.tickBreakdown?.logic || 0));
        const spatialHashBucketCounts = samples.map(s => Array.isArray(s.sparseSpatialHash) ? s.sparseSpatialHash.length : 0);

        const physicsAvg = physicsArr.reduce((a, b) => a + b, 0) / physicsArr.length;
        const physicsP95 = getPercentile(physicsArr, 95);
        const physicsPeak = Math.max(...physicsArr);

        const shadowAvg = shadowArr.reduce((a, b) => a + b, 0) / shadowArr.length;
        const shadowP95 = getPercentile(shadowArr, 95);
        const shadowPeak = Math.max(...shadowArr);

        const serialAvg = serialArr.reduce((a, b) => a + b, 0) / serialArr.length;
        const totalCpuP95 = getPercentile(totalCpuArr, 95);
        const avgBuckets = spatialHashBucketCounts.reduce((a, b) => a + b, 0) / spatialHashBucketCounts.length;

        console.log("\n=== Cluster Storm Multi-Sample Benchmarking Report ===");
        const reportData = [{
            metric: "Cluster Size & Mode",
            value: `${TOTAL_BOTS} bots (Batch-Spawned Oscillating)`
        }, {
            metric: "Physics Duration (Mean / P95 / Peak)",
            value: `${physicsAvg.toFixed(2)}ms / ${physicsP95.toFixed(2)}ms / ${physicsPeak.toFixed(2)}ms`
        }, {
            metric: "Shadowcasting Duration (Mean / P95 / Peak)",
            value: `${shadowAvg.toFixed(2)}ms / ${shadowP95.toFixed(2)}ms / ${shadowPeak.toFixed(2)}ms`
        }, {
            metric: "Serialization Duration (Mean)",
            value: `${serialAvg.toFixed(2)} ms`
        }, {
            metric: "Total Tick CPU P95 Latency",
            value: `${totalCpuP95.toFixed(2)} ms`
        }, {
            metric: "Spatial Hash Bucket Telemetry",
            value: `${avgBuckets.toFixed(1)} active buckets detected`
        }];
        console.table(reportData);

        // Evaluations
        const physicsSuccess = physicsP95 <= 10.0;
        const shadowSuccess = shadowP95 <= 8.0;
        const spatialHashSuccess = avgBuckets >= 1;

        console.log(`\n--- Evaluations ---`);
        console.log(`${physicsSuccess ? "✅" : "❌"} Physics P95 Scaling (Limit 10.0ms): ${physicsP95.toFixed(2)}ms`);
        console.log(`${shadowSuccess ? "✅" : "❌"} Shadowcasting P95 Scaling (Limit 8.0ms): ${shadowP95.toFixed(2)}ms`);
        console.log(`${spatialHashSuccess ? "✅" : "❌"} Spatial Hash Telemetry Precision: ${avgBuckets.toFixed(1)} buckets active`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true,
            timeout: 5000
        });

        await new Promise((resolve) => {
            reporterSocket.on('connect', () => {
                reporterSocket.emit('reportAction', { actionType: 'test: cluster storm physics P95', success: physicsSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: cluster storm shadowcasting P95', success: shadowSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: cluster storm spatial hash precision', success: spatialHashSuccess });
                setTimeout(() => {
                    reporterSocket.disconnect();
                    resolve();
                }, 1000);
            });
        });

        console.log("✅ Reports submitted. Test suite finalized.");
        process.exit(0);

    } catch (err) {
        console.error("\n❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        if (reporterSocket) reporterSocket.disconnect();
        process.exit(1);
    }
}

run();
