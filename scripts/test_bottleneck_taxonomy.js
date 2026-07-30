/**
 * @fileoverview TastyTails Bottleneck Taxonomy Stress Test
 * 
 * @description
 * Progressively scales client WebSocket connections to isolate and attribute server performance
 * bottlenecks to CPU calculations (physics, shadowcasting, game logic), network serialization payload,
 * or Node.js event loop blocking/jitter.
 * 
 * Architecture & Call Flow:
 *   [CLI Runner / Automation] ──► run() ──► Baseline (0 bots) ──► Medium Load (50 bots) ──► High Load (150 bots)
 *                                  │
 *                                  ├──► getStats() ──► HTTP GET /stats ──► parseMetrics()
 *                                  └──► reporterSocket ──► Emit 'reportAction' to Server Dashboard
 * 
 * Target Thresholds:
 *   - CPU Scaling: physics + shadowcasting + logic <= 15.0ms (at 150 bots)
 *   - Serialization Scaling: serialize duration <= 35.0ms (at 150 bots)
 *   - Event Loop Stability: eventLoopLag <= 50.0ms (at 150 bots)
 * 
 * Usage:
 *   node scripts/test_bottleneck_taxonomy.js
 */
const http = require('http');
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';

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
    }

    /**
     * Establishes a Socket.io WebSocket connection for the bot entity.
     * @returns {Promise<void>} Resolves when connection handshake and game state initialization complete.
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
                // Initialize in game state so bots are registered in physics & loop
                this.socket.emit('characterUpdate', {
                    x: 3291 + (this.id % 10) * 10,
                    y: 4287 + Math.floor(this.id / 10) * 10,
                    firstName: this.name,
                    lastName: 'Bot',
                    isInGame: true
                });

                // Simulate high-frequency movement and chatter
                this.interval = setInterval(() => {
                    this.socket.emit('playerInput', {
                        left: Math.random() > 0.5,
                        right: Math.random() > 0.5,
                        up: Math.random() > 0.5,
                        down: Math.random() > 0.5,
                        delta: 0.016,
                        clientTimestamp: Date.now()
                    });

                    // Occasional spatial chat emission to generate serialization payload load
                    if (Math.random() > 0.95) {
                        this.socket.emit('input', {
                            message: `Hi I am bot ${this.id} and I am testing performance!`,
                            scope: 'local',
                            token: token,
                            charId: this.charId
                        });
                    }
                }, 200);

                resolve();
            });

            this.socket.on('connect_error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }

    /**
     * Clears high-frequency simulation timers and disconnects the underlying WebSocket.
     */
    disconnect() {
        if (this.interval) clearInterval(this.interval);
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

/**
 * Fetches server performance telemetry from the GET /stats HTTP endpoint.
 * Includes defensive timeout and single-settlement guards.
 * 
 * @returns {Promise<Object>} Resolves to parsed server telemetry metrics object.
 */
function getStats() {
    return new Promise((resolve, reject) => {
        let isSettled = false;

        const req = http.get(`${SERVER_URL}/stats`, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (isSettled) return;
                isSettled = true;
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse GET /stats response JSON: ${e.message}`));
                }
            });
        });

        // SAFETY: Prevent process hangs if server drops HTTP request under load
        req.setTimeout(5000, () => {
            if (isSettled) return;
            isSettled = true;
            req.destroy();
            reject(new Error('GET /stats request timed out after 5000ms'));
        });

        req.on('error', (err) => {
            if (isSettled) return;
            isSettled = true;
            reject(err);
        });
    });
}

/**
 * Parses raw server telemetry stats into standardized CPU, Serialization, and Jitter metrics.
 * 
 * @param {Object} stats - Server telemetry payload from GET /stats.
 * @returns {{ cpu: number, serialize: number, jitter: number }} Extracted taxonomy metrics in ms.
 */
function parseMetrics(stats) {
    const breakdown = (stats && stats.tickBreakdown) || {};
    const cpu = (breakdown.physics || 0) + (breakdown.shadowcasting || 0) + (breakdown.logic || 0);
    const serialize = breakdown.serialize || 0;
    const jitter = (stats && stats.eventLoopLag) || 0;
    return { cpu, serialize, jitter };
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
 * Orchestrates the progressive 3-phase stress test lifecycle and dashboard submission.
 */
async function run() {
    console.log("=== Starting Bottleneck Taxonomy Stress Test ===");
    const bots = [];
    const reportData = [];

    try {
        // Phase 1: Baseline
        console.log("\n[Phase 1] Measuring idle server baseline...");
        await wait(3000);
        const baselineStats = await getStats();
        const { cpu: baselineCPU, serialize: baselineSerialize, jitter: baselineJitter } = parseMetrics(baselineStats);

        reportData.push({
            load: 'Baseline (0 bots)',
            cpu: baselineCPU.toFixed(2) + " ms",
            serialize: baselineSerialize.toFixed(2) + " ms",
            jitter: baselineJitter.toFixed(2) + " ms"
        });

        // Phase 2: Medium Load (50 Bots)
        console.log("\n[Phase 2] Spawning 50 bots (Medium Load)...");
        for (let i = 0; i < 50; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if (i % 10 === 0) process.stdout.write(".");
            await wait(50); // 50ms connection stagger
        }
        console.log("\nBots connected. Waiting 5s for stabilization...");
        await wait(5000);
        
        const medStats = await getStats();
        const { cpu: medCPU, serialize: medSerialize, jitter: medJitter } = parseMetrics(medStats);

        reportData.push({
            load: 'Medium (50 bots)',
            cpu: medCPU.toFixed(2) + " ms",
            serialize: medSerialize.toFixed(2) + " ms",
            jitter: medJitter.toFixed(2) + " ms"
        });

        // Phase 3: High Load (150 Bots)
        console.log("\n[Phase 3] Spawning 100 additional bots (total 150, High Load)...");
        for (let i = 50; i < 150; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if (i % 10 === 0) process.stdout.write(".");
            await wait(50); // 50ms connection stagger
        }
        console.log("\nBots connected. Waiting 5s for stabilization...");
        await wait(5000);

        const highStats = await getStats();
        const { cpu: highCPU, serialize: highSerialize, jitter: highJitter } = parseMetrics(highStats);

        reportData.push({
            load: 'High (150 bots)',
            cpu: highCPU.toFixed(2) + " ms",
            serialize: highSerialize.toFixed(2) + " ms",
            jitter: highJitter.toFixed(2) + " ms"
        });

        // Cleanup Bots immediately
        console.log("\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        // Display comparative markdown table
        console.log("\n=== Bottleneck Taxonomy Benchmarking Report ===");
        console.table(reportData);

        // Evaluate Scaling Limits
        const cpuSuccess = highCPU <= 15.0;
        const serializeSuccess = highSerialize <= 35.0;
        const stabilitySuccess = highJitter <= 50.0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${cpuSuccess ? "✅" : "❌"} CPU Scaling (Limit 15.0ms): ${highCPU.toFixed(2)}ms`);
        console.log(`${serializeSuccess ? "✅" : "❌"} Serialization Scaling (Limit 35.0ms): ${highSerialize.toFixed(2)}ms`);
        console.log(`${stabilitySuccess ? "✅" : "❌"} Event Loop Stability (Limit 50.0ms): ${highJitter.toFixed(2)}ms`);

        // Connect reporter client to report outcomes to Server Health Dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true,
            timeout: 5000
        });

        await new Promise((resolve) => {
            const reporterTimeout = setTimeout(() => {
                console.warn("⚠️ Telemetry dashboard reporter socket timed out. Skipping dashboard submission.");
                try { reporterSocket.disconnect(); } catch (e) {}
                resolve();
            }, 5000);

            reporterSocket.on('connect', () => {
                clearTimeout(reporterTimeout);
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy cpu scaling', success: cpuSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy serialization scaling', success: serializeSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy event loop stability', success: stabilitySuccess });
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

        console.log("✅ Benchmark report execution complete.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        process.exit(1);
    }
}

run();

