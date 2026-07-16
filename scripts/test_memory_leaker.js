/**
 * TastyTails Memory Leaker Stress Test
 * 
 * Objective:
 *   Generate intensive object allocations to monitor heap growth and V8 Garbage Collection (GC)
 *   pause latencies, identifying leaks or GC-related stuttering (jitter).
 * 
 * Target Thresholds:
 *   - Memory Leak Stability: heap growth after client cleanup <= 50.0MB
 *   - Garbage Collection Latency: peak GC pause duration (gcStats.maxDuration) <= 100.0ms
 * 
 * How it Works:
 *   1. Phase 1 (Baseline): Query baseline stats and starting heap usage.
 *   2. Phase 2 (Peak Load): Spawn 150 bots staggeredly, program them to send high-frequency
 *      movement and chat inputs for 15 seconds to churn memory allocations.
 *   3. Phase 3 (Cleanup): Disconnect all bots and wait 5 seconds for memory stabilization.
 *   4. Phase 4 (Evaluation): Measure net heap growth and GC pause latencies, comparing them
 *      against thresholds, and report outcomes to the Server Health Dashboard.
 * 
 * Recommended Execution Duration:
 *   - Approximately 35 seconds.
 * 
 * Usage:
 *   Ensure the game server is running, then execute:
 *     node scripts/test_memory_leaker.js
 */
const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const SERVER_URL = 'http://localhost:3000';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'testsecret';

class BotClient {
    constructor(id) {
        this.id = id;
        this.name = `LeakBot_${id}`;
        this.charId = `000000000000000000d${id.toString(16).padStart(5, '0')}`;
        this.socket = null;
        this.interval = null;
    }

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
                // Grid layout
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

    startStress(token) {
        this.interval = setInterval(() => {
            // Movement inputs to trigger collision vector instantiations
            this.socket.emit('playerInput', {
                left: Math.random() > 0.5,
                right: Math.random() > 0.5,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: 0.016,
                clientTimestamp: Date.now()
            });

            // Local chat inputs to churn text allocations
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

    disconnect() {
        if (this.interval) clearInterval(this.interval);
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

function getStats() {
    return new Promise((resolve, reject) => {
        const http = require('http');
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

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log("=== Starting Memory Leaker (GC & Object Allocation) Stress Test ===");
    console.log("Goal: Spawn 150 bots to churn object allocations, then disconnect and monitor memory leaks & GC latency.");
    const bots = [];

    try {
        // Query baseline stats before spawning
        console.log("\n[Phase 1] Querying baseline stats...");
        const initialStats = await getStats();
        const initialHeap = (initialStats.memoryUsage.heapUsed || 0) / (1024 * 1024);
        console.log(`Baseline Heap Used: ${initialHeap.toFixed(2)} MB`);

        // Spawn bots
        console.log("\n[Phase 2] Spawning 150 bots...");
        for (let i = 0; i < 150; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if (i % 10 === 0) process.stdout.write(".");
            await wait(50); // Stagger connection spawns
        }

        console.log("\nAll bots connected. Starting stress allocation loops for 15 seconds...");
        bots.forEach(bot => {
            const token = jwt.sign(
                { _id: `BOT_ACC_${bot.id}`, username: bot.name },
                TOKEN_SECRET
            );
            bot.startStress(token);
        });

        await wait(15000);

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

        await new Promise((resolve) => {
            reporterSocket.on('connect', () => {
                reporterSocket.emit('reportAction', { actionType: 'test: memory leak stability', success: leakSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: memory gc latency', success: latencySuccess });
                setTimeout(() => {
                    reporterSocket.disconnect();
                    resolve();
                }, 1000);
            });
        });

        console.log("✅ Reports submitted. Test suite finalized.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        process.exit(1);
    }
}

run();
