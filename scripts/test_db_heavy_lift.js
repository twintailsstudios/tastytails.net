/**
 * TastyTails DB Heavy Lift Stress Test
 * 
 * Objective:
 *   Stress the DatabaseResilience write-behind queue to verify that database synchronization
 *   BulkWrite flushes operate fully asynchronously and do not block the main event loop thread.
 * 
 * Target Thresholds:
 *   - Database Write Latency: average database write duration <= 1000.0ms
 *   - Event Loop Stability: peak event loop lag <= 100.0ms (during active db sync flushes)
 * 
 * How it Works:
 *   1. Spawns 150 bots staggeredly (50ms interval) to hub coordinates.
 *   2. Bots send continuous movement and chat inputs, populating the write-behind buffer.
 *   3. Runs stress activity for 35 seconds to guarantee that the 30-second interval automatic
 *      write-behind cache flush fires under peak load.
 *   4. Queries performance stats, disconnects bots, and waits 5 seconds for final cleanup writes to flush.
 *   5. Submits database latency and loop stability reports to the Server Health Dashboard.
 * 
 * Recommended Execution Duration:
 *   - Approximately 55 seconds.
 * 
 * Usage:
 *   Ensure the game server is running, then execute:
 *     node scripts/test_db_heavy_lift.js
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
        this.name = `DbBot_${id}`;
        this.charId = `000000000000000000e${id.toString(16).padStart(5, '0')}`;
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
                // Position in grid layout
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

    startStress(token) {
        this.interval = setInterval(() => {
            // Movement inputs
            this.socket.emit('playerInput', {
                left: Math.random() > 0.5,
                right: Math.random() > 0.5,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: 0.016,
                clientTimestamp: Date.now()
            });

            // Occasional chat to queue database batched updates
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
    console.log("=== Starting DB Heavy Lift (Write-Behind Cache Resilience) Stress Test ===");
    console.log("Goal: Spawn 150 active bots, wait 35s to force automatic 30s cache flushes, and check loop blockage.");
    const bots = [];

    try {
        console.log("\nSpawning 150 active database bots...");
        for (let i = 0; i < 150; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if (i % 10 === 0) process.stdout.write(".");
            await wait(50); // Stagger connection spawns
        }

        console.log("\nAll bots connected. Starting stress loops...");
        bots.forEach(bot => {
            const token = jwt.sign(
                { _id: `BOT_ACC_${bot.id}`, username: bot.name },
                TOKEN_SECRET
            );
            bot.startStress(token);
        });

        console.log("Running stress loops for 35 seconds to guarantee cache flush triggers...");
        await wait(35000);

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
            value: "150 bots"
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
        console.error("❌ Stress test failure:", err);
        bots.forEach(bot => bot.disconnect());
        process.exit(1);
    }
}

run();
