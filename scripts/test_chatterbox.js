/**
 * TastyTails Chatterbox Stress Test
 * 
 * Objective:
 *   Isolate packet serialization and delivery performance by flooding local chat channels
 *   under stationary observer loads.
 * 
 * Target Thresholds:
 *   - Serialization Scaling: average serialize tick duration <= 25.0ms (at 150 bots)
 * 
 * How it Works:
 *   1. Spawns 150 stationary bots staggeredly (50ms interval) to prevent connection timeouts.
 *   2. Keeps all bots stationary so that physics and shadowcasting CPU usage remain at 0ms.
 *   3. Once all bots are connected, triggers a chat flood interval where each bot sends a local
 *      chat message every 500ms (forcing O(N^2) total packet broadcasts).
 *   4. Runs the flood for 10 seconds to collect stats, then disconnects all bots.
 *   5. Reports serialization scaling outcomes to the Server Health Dashboard.
 * 
 * Recommended Execution Duration:
 *   - Approximately 25 seconds.
 * 
 * Usage:
 *   Ensure the game server is running, then execute:
 *     node scripts/test_chatterbox.js
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
        this.name = `ChatterBot_${id}`;
        this.charId = `000000000000000000c${id.toString(16).padStart(5, '0')}`;
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
                // Stationary positions spread slightly
                this.socket.emit('characterUpdate', {
                    x: 3300 + (this.id % 10) * 5,
                    y: 4300 + Math.floor(this.id / 10) * 5,
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

    startChatter(token) {
        this.interval = setInterval(() => {
            this.socket.emit('input', {
                message: `Chatter stress packet from bot ${this.id} at index ${Math.floor(Math.random() * 1000)}`,
                scope: 'local',
                token: token,
                charId: this.charId
            });
        }, 500);
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
    console.log("=== Starting Chatterbox (Serialization & Packet Delivery) Stress Test ===");
    console.log("Goal: Spawn 150 stationary bots flooding local chat to stress packet serialization.");
    const bots = [];

    try {
        console.log("\nSpawning 150 chatty bots...");
        for (let i = 0; i < 150; i++) {
            const bot = new BotClient(i);
            await bot.connect();
            bots.push(bot);
            if (i % 10 === 0) process.stdout.write(".");
            await wait(50); // Stagger connection spawns
        }

        console.log("\nAll chatterbox bots connected. Starting chat flood...");
        bots.forEach(bot => {
            const token = jwt.sign(
                { _id: `BOT_ACC_${bot.id}`, username: bot.name },
                TOKEN_SECRET
            );
            bot.startChatter(token);
        });

        console.log("Flooding chat for 10 seconds...");
        await wait(10000);

        console.log("\nQuerying performance stats...");
        const stats = await getStats();

        const serializeAvg = stats.tickBreakdown.serialize || 0;
        const physicsAvg = stats.tickBreakdown.physics || 0;
        const shadowcastingAvg = stats.tickBreakdown.shadowcasting || 0;
        const totalCPU = serializeAvg + physicsAvg + shadowcastingAvg + (stats.tickBreakdown.logic || 0);

        console.log("\nCleaning up bots...");
        bots.forEach(bot => bot.disconnect());

        console.log("\n=== Chatterbox Benchmarking Report ===");
        const reportData = [{
            metric: "Chatterbox Size",
            value: "150 bots"
        }, {
            metric: "Serialization Duration (Avg)",
            value: `${serializeAvg.toFixed(2)} ms`
        }, {
            metric: "Physics Duration (Avg)",
            value: `${physicsAvg.toFixed(2)} ms`
        }, {
            metric: "Shadowcasting Duration (Avg)",
            value: `${shadowcastingAvg.toFixed(2)} ms`
        }, {
            metric: "Total Tick CPU Duration (Avg)",
            value: `${totalCPU.toFixed(2)} ms`
        }];
        console.table(reportData);

        // Evaluations
        const serializeSuccess = serializeAvg <= 25.0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${serializeSuccess ? "✅" : "❌"} Serialization Scaling (Limit 25.0ms): ${serializeAvg.toFixed(2)}ms`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true
        });

        await new Promise((resolve) => {
            reporterSocket.on('connect', () => {
                reporterSocket.emit('reportAction', { actionType: 'test: chatterbox serialization scaling', success: serializeSuccess });
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
