/**
 * TastyTails Cluster Storm Stress Test
 * 
 * Objective:
 *   Force high-density player concentrations to stress the spatial partitioning hash grid
 *   and verify that narrow-phase collision calculations and shadowcasting stay within limits.
 * 
 * Target Thresholds:
 *   - Physics Scaling: average physics tick duration <= 10.0ms (at 150 clustered bots)
 *   - Shadowcasting Scaling: average shadowcasting tick duration <= 8.0ms (at 150 clustered bots)
 * 
 * How it Works:
 *   1. Spawns 150 bots staggeredly (50ms interval) to avoid connection drops.
 *   2. Centers all bot coordinates at a single hub point (3300, 4300) with minor random jitter.
 *   3. Programs bots to send high-frequency direction inputs, forcing continuous collisions.
 *   4. Runs for 10 seconds to collect stats, then disconnects all bots.
 *   5. Submits physics and shadowcasting status reports via Socket.io.
 * 
 * Recommended Execution Duration:
 *   - Approximately 25 seconds.
 * 
 * Usage:
 *   Ensure the game server is running, then execute:
 *     node scripts/test_cluster_storm.js
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
        this.name = `ClusterBot_${id}`;
        this.charId = `000000000000000000b${id.toString(16).padStart(5, '0')}`;
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
                // Cluster tightly around (3300, 4300) inside the pub/blacksmith area
                const spawnX = 3300 + Math.floor(Math.random() * 100 - 50);
                const spawnY = 4300 + Math.floor(Math.random() * 100 - 50);

                this.socket.emit('characterUpdate', {
                    x: spawnX,
                    y: spawnY,
                    firstName: this.name,
                    lastName: 'Bot',
                    isInGame: true
                });

                // Simulate continuous movement requests to trigger intense collision resolution
                this.interval = setInterval(() => {
                    this.socket.emit('playerInput', {
                        left: Math.random() > 0.5,
                        right: Math.random() > 0.5,
                        up: Math.random() > 0.5,
                        down: Math.random() > 0.5,
                        delta: 0.016,
                        clientTimestamp: Date.now()
                    });

                    // Randomly speak to trigger some serialization activity
                    if (Math.random() > 0.98) {
                        this.socket.emit('input', {
                            message: `Squeezing into coordinates (${spawnX}, ${spawnY})`,
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
    console.log("=== Starting Cluster Storm (Spatial & Collision) Stress Test ===");
    console.log("Goal: Spawn 150 bots tightly clustered at (3300, 4300) to stress broad/narrow collisions.");
    const bots = [];

    try {
        console.log("\nSpawning 150 bots in a cluster...");
        for (let i = 0; i < 150; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if (i % 10 === 0) process.stdout.write(".");
            await wait(50); // Stagger connection spawns
        }

        console.log("\nAll cluster bots connected. Running stress physics for 10 seconds...");
        await wait(10000);

        console.log("\nQuerying performance stats...");
        const stats = await getStats();

        const physicsAvg = stats.tickBreakdown.physics || 0;
        const shadowcastingAvg = stats.tickBreakdown.shadowcasting || 0;
        const serializeAvg = stats.tickBreakdown.serialize || 0;
        const totalCPU = physicsAvg + shadowcastingAvg + (stats.tickBreakdown.logic || 0);

        console.log("\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        console.log("\n=== Cluster Storm Benchmarking Report ===");
        const reportData = [{
            metric: "Cluster Size",
            value: "150 bots"
        }, {
            metric: "Physics Duration (Avg)",
            value: `${physicsAvg.toFixed(2)} ms`
        }, {
            metric: "Shadowcasting Duration (Avg)",
            value: `${shadowcastingAvg.toFixed(2)} ms`
        }, {
            metric: "Serialization Duration (Avg)",
            value: `${serializeAvg.toFixed(2)} ms`
        }, {
            metric: "Total Tick CPU Duration (Avg)",
            value: `${totalCPU.toFixed(2)} ms`
        }];
        console.table(reportData);

        // Evaluations
        const physicsSuccess = physicsAvg <= 10.0;
        const shadowcastingSuccess = shadowcastingAvg <= 8.0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${physicsSuccess ? "✅" : "❌"} Physics Scaling (Limit 10.0ms): ${physicsAvg.toFixed(2)}ms`);
        console.log(`${shadowcastingSuccess ? "✅" : "❌"} Shadowcasting Scaling (Limit 8.0ms): ${shadowcastingAvg.toFixed(2)}ms`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true
        });

        await new Promise((resolve) => {
            reporterSocket.on('connect', () => {
                reporterSocket.emit('reportAction', { actionType: 'test: cluster storm physics scaling', success: physicsSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: cluster storm shadowcasting scaling', success: shadowcastingSuccess });
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
