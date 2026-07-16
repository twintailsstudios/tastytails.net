/**
 * TastyTails Bottleneck Taxonomy Stress Test
 * 
 * Objective:
 *   Progressively scale client connections to isolate and attribute server performance bottlenecks
 *   to CPU calculations, network serialization, or event loop blocking.
 * 
 * Target Thresholds:
 *   - CPU Scaling: physics + shadowcasting + logic <= 15.0ms (at 150 bots)
 *   - Serialization Scaling: serialize duration <= 35.0ms (at 150 bots)
 *   - Event Loop Stability: eventLoopLag <= 50.0ms (at 150 bots)
 * 
 * How it Works:
 *   1. Phase 1 (Baseline): Measure idle server performance (0 bots).
 *   2. Phase 2 (Medium Load): Spawn 50 active bots (staggered by 50ms), wait 5s, query stats.
 *   3. Phase 3 (High Load): Spawn 100 additional bots (150 total), wait 5s, query stats.
 *   4. Reporting: Print comparative benchmarking table and submit reports via Socket.io.
 *   5. Cleanup: Disconnect all bots.
 * 
 * Recommended Execution Duration:
 *   - Approximately 30 seconds.
 * 
 * Usage:
 *   Ensure the game server is running, then execute:
 *     node scripts/test_bottleneck_taxonomy.js
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
        this.name = `TaxonomyBot_${id}`;
        this.charId = `000000000000000000a${id.toString(16).padStart(5, '0')}`;
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
                // Initialize in game state so they are tracked by physics & loop
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

                    // Occasional chat to generate serialization load
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
    console.log("=== Starting Bottleneck Taxonomy Stress Test ===");
    const bots = [];
    const reportData = [];

    try {
        // Phase 1: Baseline
        console.log("\n[Phase 1] Measuring idle server baseline...");
        await wait(3000);
        const baselineStats = await getStats();
        
        const baselineCPU = (baselineStats.tickBreakdown.physics || 0) + 
                            (baselineStats.tickBreakdown.shadowcasting || 0) + 
                            (baselineStats.tickBreakdown.logic || 0);
        const baselineSerialize = baselineStats.tickBreakdown.serialize || 0;
        const baselineJitter = baselineStats.eventLoopLag || 0;

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
            await wait(50); // 50ms stagger
        }
        console.log("\nBots connected. Waiting 5s for stabilization...");
        await wait(5000);
        
        const medStats = await getStats();
        const medCPU = (medStats.tickBreakdown.physics || 0) + 
                       (medStats.tickBreakdown.shadowcasting || 0) + 
                       (medStats.tickBreakdown.logic || 0);
        const medSerialize = medStats.tickBreakdown.serialize || 0;
        const medJitter = medStats.eventLoopLag || 0;

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
            await wait(50); // 50ms stagger
        }
        console.log("\nBots connected. Waiting 5s for stabilization...");
        await wait(5000);

        const highStats = await getStats();
        const highCPU = (highStats.tickBreakdown.physics || 0) + 
                        (highStats.tickBreakdown.shadowcasting || 0) + 
                        (highStats.tickBreakdown.logic || 0);
        const highSerialize = highStats.tickBreakdown.serialize || 0;
        const highJitter = highStats.eventLoopLag || 0;

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

        // Evaluate Scaling
        const cpuSuccess = highCPU <= 15.0;
        const serializeSuccess = highSerialize <= 35.0;
        const stabilitySuccess = highJitter <= 50.0;

        console.log(`\n--- Evaluations ---`);
        console.log(`${cpuSuccess ? "✅" : "❌"} CPU Scaling (Limit 15.0ms): ${highCPU.toFixed(2)}ms`);
        console.log(`${serializeSuccess ? "✅" : "❌"} Serialization Scaling (Limit 35.0ms): ${highSerialize.toFixed(2)}ms`);
        console.log(`${stabilitySuccess ? "✅" : "❌"} Event Loop Stability (Limit 50.0ms): ${highJitter.toFixed(2)}ms`);

        // Connect reporter client to report outcomes to dashboard
        console.log("\nReporting test results to Server Health Dashboard...");
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true
        });

        await new Promise((resolve) => {
            reporterSocket.on('connect', () => {
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy cpu scaling', success: cpuSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy serialization scaling', success: serializeSuccess });
                reporterSocket.emit('reportAction', { actionType: 'test: taxonomy event loop stability', success: stabilitySuccess });
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
