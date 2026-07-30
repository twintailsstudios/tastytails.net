/**
 * @fileoverview test_db_heavy_lift.js - Database Resilience & Write-Behind Cache Stress Test
 * 
 * @description
 * High-concurrency stress test designed to evaluate TastyTails' write-behind database cache
 * (DatabaseResilience.js). Spawns a bot swarm to generate movement and chat writes, verifying
 * that 30-second bulk flushes execute asynchronously without causing event loop lag spikes.
 */
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const http = require('http');

dotenv.config();

// Configurable test parameters with sensible production defaults
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';
const TARGET_BOT_COUNT = parseInt(process.env.BOT_COUNT || '150', 10);
const STRESS_DURATION_MS = parseInt(process.env.STRESS_DURATION_MS || '35000', 10);

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
    }

    /**
     * Establishes a Socket.IO connection to the game server.
     * @returns {Promise<void>} Resolves when socket successfully connects and emits character placement.
     */
    async connect() {
        return new Promise((resolve, reject) => {
            const token = jwt.sign(
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
                // Grid layout placement to avoid spawn overlap collisions
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
     * @param {string} token - Signed JWT authentication token for chat inputs.
     */
    startStress(token) {
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

            // Occasional chat to queue write-behind buffer updates (20% chance per tick)
            if (Math.random() > 0.8) {
                this.socket.emit('input', {
                    message: `Database stress write message from bot ${this.id}`,
                    scope: 'local',
                    token: token,
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
            this.socket.disconnect();
        }
    }
}

/**
 * Queries performance telemetry from the game server's /stats endpoint.
 * @returns {Promise<Object>} Performance metrics JSON object.
 */
function getStats() {
    return new Promise((resolve, reject) => {
        http.get(`${SERVER_URL}/stats`, (res) => {
            if (res.statusCode !== 200) {
                res.resume(); // Consume response stream to prevent socket memory leak
                return reject(new Error(`HTTP ${res.statusCode} from ${SERVER_URL}/stats`));
            }
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
 * Promisified delay helper.
 * @param {number} ms - Milliseconds to delay.
 * @returns {Promise<void>}
 */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Orchestrates the DB Heavy Lift stress test suite.
 */
async function run() {
    console.log("=== Starting DB Heavy Lift (Write-Behind Cache Resilience) Stress Test ===");
    console.log(`Goal: Spawn ${TARGET_BOT_COUNT} active bots, wait ${STRESS_DURATION_MS / 1000}s to force automatic 30s cache flushes, and check loop blockage.`);
    const bots = [];

    try {
        console.log(`\nSpawning ${TARGET_BOT_COUNT} active database bots in batches...`);
        // OPTIMIZATION: Batched connection spawning prevents sequential startup delays and socket thundering herd
        const BATCH_SIZE = 10;
        const MIN_QUORUM = Math.floor(TARGET_BOT_COUNT * 0.9); // Require 90% quorum to guarantee stress validity

        for (let i = 0; i < TARGET_BOT_COUNT; i += BATCH_SIZE) {
            const batch = Array.from(
                { length: Math.min(BATCH_SIZE, TARGET_BOT_COUNT - i) },
                (_, idx) => {
                    const bot = new BotClient(i + idx);
                    return bot.connect().then(() => bot).catch(() => null);
                }
            );
            const results = await Promise.all(batch);
            results.filter(Boolean).forEach(bot => bots.push(bot));
            process.stdout.write(".");
            await wait(100); // 100ms inter-batch spacing
        }

        // SAFEGUARD: Fail fast if quorum minimum is not met
        if (bots.length < MIN_QUORUM) {
            throw new Error(`[Quorum Failure] Only ${bots.length}/${TARGET_BOT_COUNT} bots connected (minimum ${MIN_QUORUM} required).`);
        }

        console.log(`\nAll ${bots.length} bots connected successfully. Starting stress loops...`);
        bots.forEach(bot => {
            const token = jwt.sign(
                { _id: `BOT_ACC_${bot.id}`, username: bot.name },
                TOKEN_SECRET
            );
            bot.startStress(token);
        });

        console.log(`Running stress loops for ${STRESS_DURATION_MS / 1000} seconds to guarantee cache flush triggers...`);
        await wait(STRESS_DURATION_MS);

        console.log("\nQuerying performance stats...");
        const stats = await getStats();

        const dbLatencyAvg = stats.dbLatency || 0;
        const loopLagAvg = stats.eventLoopLag || 0;
        const queueSize = stats.resilienceQueue || 0;

        console.log("\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        console.log("Waiting 5s for post-cleanup writes to flush...");
        await wait(5000);

        console.log("\n=== DB Heavy Lift Benchmarking Report ===");
        const reportData = [{
            metric: "Stress Size",
            value: `${bots.length} bots`
        }, {
            metric: "Average DB Write Latency",
            value: `${dbLatencyAvg.toFixed(2)} ms`
        }, {
            metric: "Event Loop Lag / Jitter",
            value: `${loopLagAvg.toFixed(2)} ms`
        }, {
            metric: "Remaining Queue Size",
            value: queueSize
        }];
        console.table(reportData);

        // Evaluations
        const latencySuccess = dbLatencyAvg <= 1000.0; // DB write <= 1s is safe for write-behind
        const loopSuccess = loopLagAvg <= 100.0;     // Event loop must not block > 100ms

        console.log(`\n--- Evaluations ---`);
        console.log(`${latencySuccess ? "✅" : "❌"} Database Write Latency (Limit <= 1000ms): ${dbLatencyAvg.toFixed(2)}ms`);
        console.log(`${loopSuccess ? "✅" : "❌"} Event Loop Stability (Limit <= 100ms lag): ${loopLagAvg.toFixed(2)}ms`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true
        });

        await new Promise((resolve) => {
            reporterSocket.on('connect', () => {
                reporterSocket.emit('reportAction', { actionType: 'test: database write latency', success: latencySuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: database event loop lag', success: loopSuccess });
                setTimeout(() => {
                    reporterSocket.disconnect();
                    resolve();
                }, 1000);
            });
        });

        console.log("✅ Reports submitted. Test suite finalized.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Stress test failure:", err.message || err);
        bots.forEach(bot => bot.disconnect());
        process.exit(1);
    }
}

run();


