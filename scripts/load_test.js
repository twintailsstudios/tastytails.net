/**
 * @fileoverview High-Player Load Simulator (scripts/load_test.js)
 * 
 * @description
 * Primary End-to-End (E2E) load testing harness for TastyTails.net.
 * Simulates 250 concurrent, autonomous WebSocket client bots executing 30Hz movement inputs,
 * hotspot zone navigation, chat broadcasting, DB stress flushes, and player vore/grapple interactions.
 * 
 * Triggered by: `npm run test:load` or `node scripts/load_test.js`
 */

const io = require('socket.io-client');
const http = require('http');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const CLIENT_COUNT = 250; 
const RAMP_UP_MS = 100; // Delay between connections to prevent hammering
const TICK_RATE_MS = 33; // ~30Hz (33.33ms)
const PING_INTERVAL_MS = 2000; // Check latency every 2s

// Map Dimensions (From mapConfig/alpha_map.json)
const MAP_WIDTH_TILES = 240;
const MAP_HEIGHT_TILES = 240;
const TILE_SIZE = 32;

// Quadrilateral Zones for Spawning & Wandering
const ZONES = [
    { name: 'Grand Altar', prob: 0.20, archetype: 'social', coords: { tl: {x:3546, y:3660}, tr: {x:4038, y:3677}, bl: {x:3601, y:4102}, br: {x:4058, y:4103} } },
    { name: 'Pub', prob: 0.20, archetype: 'social', coords: { tl: {x:3462, y:1558}, tr: {x:4112, y:1545}, bl: {x:3456, y:2059}, br: {x:4136, y:2070} } },
    { name: 'Pub Bathroom', prob: 0.05, archetype: 'social', coords: { tl: {x:3855, y:1077}, tr: {x:4457, y:1131}, bl: {x:3873, y:1238}, br: {x:4455, y:1242} } },
    { name: 'Blacksmith', prob: 0.15, archetype: 'work', coords: { tl: {x:5521, y:3843}, tr: {x:6268, y:3796}, bl: {x:5493, y:4395}, br: {x:6262, y:4363} } },
    { name: 'Tailor', prob: 0.10, archetype: 'work', coords: { tl: {x:2036, y:3737}, tr: {x:3009, y:3966}, bl: {x:2042, y:4189}, br: {x:3029, y:4151} } },
    { name: 'Maintenance', prob: 0.10, archetype: 'work', coords: { tl: {x:499, y:2256}, tr: {x:1070, y:2426}, bl: {x:518, y:3497}, br: {x:1074, y:3494} } },
    { name: 'Great Ash', prob: 0.10, archetype: 'work', coords: { tl: {x:1727, y:953}, tr: {x:2123, y:952}, bl: {x:1650, y:1380}, br: {x:2180, y:1379} } },
    { name: 'Farm Area', prob: 0.05, archetype: 'gather', coords: { tl: {x:6307, y:2391}, tr: {x:7022, y:2386}, bl: {x:6331, y:3331}, br: {x:7032, y:3331} } },
    { name: 'Mining Area', prob: 0.05, archetype: 'gather', coords: { tl: {x:5819, y:392}, tr: {x:6071, y:396}, bl: {x:5831, y:502}, br: {x:6085, y:499} } }
];

const args = process.argv.slice(2);
const dbStressMode = args.includes('--db-stress');
const interactionStressMode = args.includes('--interaction-stress');

console.log(`[LoadTest] Starting Clustered Hotspot Simulation... Target: ${CLIENT_COUNT} clients.`);
if (dbStressMode) {
    console.log(`[LoadTest] \x1b[33mDATABASE STRESSING MODE ENABLED (Write-behind & Chat inserts active)\x1b[0m`);
}
if (interactionStressMode) {
    console.log(`[LoadTest] \x1b[35mINTERACTION & VORE SIMULATION MODE ENABLED\x1b[0m`);
}

let connectedCount = 0;
const clients = new Set();
const latencies = [];

function recordLatency(ms) {
    latencies.push(ms);
    if (latencies.length > 2000) {
        latencies.splice(0, 1000);
    }
}

/**
 * Selects a spawn zone based on weighted probabilities defined in ZONES.
 * @returns {Object} Selected zone metadata.
 */
function selectZoneByProbability() {
    const roll = Math.random();
    let sum = 0;
    for (const z of ZONES) {
        sum += z.prob;
        if (roll <= sum) {
            return z;
        }
    }
    return ZONES[0];
}

/**
 * Computes geometric centroid coordinates for a quadrilateral zone.
 * @param {Object} coords - Quadrilateral corner coordinates (tl, tr, bl, br).
 * @returns {{x: number, y: number}} Center point.
 */
function getZoneCenter(coords) {
    return {
        x: Math.round((coords.tl.x + coords.tr.x + coords.bl.x + coords.br.x) / 4),
        y: Math.round((coords.tl.y + coords.tr.y + coords.bl.y + coords.br.y) / 4)
    };
}

/**
 * Fetches non-colliding valid spawn coordinates from server REST API.
 * OPTIMIZATION: Includes 3000ms socket timeout and error handler safeguards to prevent stalled bot state machines.
 * @param {Object} coords - Quadrilateral zone coordinates.
 * @returns {Promise<{x: number, y: number}>} Valid spawn coordinates.
 */
function fetchValidPoint(coords) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const queryParams = `tlx=${coords.tl.x}&tly=${coords.tl.y}&trx=${coords.tr.x}&try=${coords.tr.y}&blx=${coords.bl.x}&bly=${coords.bl.y}&brx=${coords.br.x}&bry=${coords.br.y}`;
        const url = `${SERVER_URL}/api/valid-point?${queryParams}`;
        
        const req = http.get(url, (res) => {
            if (res.statusCode !== 200) {
                if (!resolved) {
                    resolved = true;
                    reject(new Error(`Failed to get spawn point: ${res.statusCode}`));
                }
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (resolved) return;
                resolved = true;
                try {
                    const parsed = JSON.parse(data);
                    resolve({ x: parsed.x, y: parsed.y });
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (err) => {
            if (!resolved) {
                resolved = true;
                reject(err);
            }
        });

        req.setTimeout(3000, () => {
            if (!resolved) {
                resolved = true;
                req.destroy(new Error('Spawn point request timed out'));
            }
        });
    });
}

/**
 * Simulates a single player client with realistic waypoint navigation behavior.
 */
class BotClient {
    static async create(index) {
        const zone = selectZoneByProbability();
        let point;
        try {
            point = await fetchValidPoint(zone.coords);
        } catch (e) {
            point = getZoneCenter(zone.coords);
        }
        return new BotClient(index, zone, point);
    }

    constructor(index, zone, point) {
        this.index = index;
        this.zone = zone;
        this.x = point.x;
        this.y = point.y;

        // Generate a hex ID similar to MongoDB ObjectId
        this.charId = index.toString(16).padStart(24, '0');

        this.socket = io(SERVER_URL, {
            query: {
                charId: this.charId,
                isBot: true,
                startX: this.x,
                startY: this.y
            },
            reconnection: false,
            transports: ['websocket'],
        });

        this.updateInterval = null;
        this.pingInterval = null;
        this.chatInterval = null;
        this.dbStressInterval = null;
        this.interactionInterval = null;
        this.sequence = 0;

        // Navigation & Interaction State
        this.state = 'IDLE'; // IDLE, MOVING, FETCHING_WAYPOINT
        this.stateTimer = Math.random() * 3000; // Desync initial state transitions
        this.currentInput = { up: false, down: false, left: false, right: false };
        this.targetX = null;
        this.targetY = null;

        // Vore State tracking
        this.consumedBy = null;
        this.visiblePlayers = {};

        // Setup Socket Listeners
        this.socket.on('connect', () => this.onConnect());
        this.socket.on('disconnect', () => this.onDisconnect());

        // Update positions Authoritatively based on Server Updates (prevents desyncs)
        this.socket.on('playerUpdates', (updates) => {
            const myUpdate = updates[this.socket.id];
            if (myUpdate) {
                if (myUpdate.position) {
                    if (myUpdate.position.x !== undefined) this.x = myUpdate.position.x;
                    if (myUpdate.position.y !== undefined) this.y = myUpdate.position.y;
                }
                if (myUpdate.consumedBy !== undefined) {
                    this.consumedBy = myUpdate.consumedBy;
                }
            }

            if (interactionStressMode) {
                Object.keys(updates).forEach(id => {
                    if (id === this.socket.id) return;
                    const u = updates[id];
                    if (u.position) {
                        this.visiblePlayers[id] = {
                            x: u.position.x,
                            y: u.position.y,
                            lastSeen: Date.now()
                        };
                    }
                });

                // Struggle check: if we are swallowed (inside another player), struggle!
                if (this.consumedBy && Math.random() < 0.5) {
                    this.socket.emit('struggleInside');
                }
            }
        });
    }

    onConnect() {
        connectedCount++;
        clients.add(this);

        if (connectedCount % 50 === 0) {
            console.log(`[LoadTest] Connected: ${connectedCount}/${CLIENT_COUNT}`);
        }

        // Random Start Delay to de-sync updates slightly
        setTimeout(() => {
            if (!this.socket.connected) return;
            this.startLoop();
        }, Math.random() * 1000);
    }

    onDisconnect() {
        connectedCount--;
        clients.delete(this);
        this.stopLoop();
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    startLoop() {
        const arch = this.zone.archetype;

        // 1. Movement & Navigation Loop (~30Hz)
        this.updateInterval = setInterval(() => {
            this.updateDeadReckoning();
            this.updateBehavior();
            this.sendInput();
        }, TICK_RATE_MS);

        // 2. Latency Ping Loop
        this.pingInterval = setInterval(() => {
            this.checkLatency();
        }, PING_INTERVAL_MS + Math.random() * 1000);

        // 3. Chat Loop (archetype-based frequencies)
        let chatProb = 0.10;
        if (arch === 'social') chatProb = 0.35;
        if (arch === 'work') chatProb = 0.05;
        if (arch === 'gather') chatProb = 0.02;
        if (dbStressMode) chatProb *= 2;

        this.chatInterval = setInterval(() => {
            if (Math.random() < chatProb) {
                this.sendChat();
            }
        }, 10000);

        // 4. DB Stress Loop (equip clicked events)
        let dbStressProb = 0.10;
        if (arch === 'work') dbStressProb = 0.50; // Work archetypes click equip double frequency

        this.dbStressInterval = setInterval(() => {
            if (dbStressMode || Math.random() < dbStressProb) {
                this.triggerDbWrite();
            }
        }, 5000);

        // 5. Interaction Loop (vore/grapple)
        let interactProb = 0.10;
        if (arch === 'social') interactProb = 0.40;
        if (arch === 'work') interactProb = 0.10;
        if (arch === 'gather') interactProb = 0.05;

        this.interactionInterval = setInterval(() => {
            if (interactionStressMode || Math.random() < interactProb) {
                this.performInteraction();
            }
        }, 6000 + Math.random() * 4000);
    }

    stopLoop() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.chatInterval) clearInterval(this.chatInterval);
        if (this.dbStressInterval) clearInterval(this.dbStressInterval);
        if (this.interactionInterval) clearInterval(this.interactionInterval);
    }

    updateDeadReckoning() {
        if (this.consumedBy) {
            this.currentInput = { up: false, down: false, left: false, right: false };
            return;
        }

        const speed = 100; // Match PLAYER_SPEED in server-loop.js
        const delta = TICK_RATE_MS / 1000;

        let dx = 0;
        let dy = 0;
        if (this.currentInput.left) dx -= 1;
        if (this.currentInput.right) dx += 1;
        if (this.currentInput.up) dy -= 1;
        if (this.currentInput.down) dy += 1;

        // Diagonal normalization
        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        this.x += dx * speed * delta;
        this.y += dy * speed * delta;
    }

    updateBehavior() {
        if (this.consumedBy) {
            this.currentInput = { up: false, down: false, left: false, right: false };
            return;
        }
        if (this.state === 'FETCHING_WAYPOINT') {
            this.currentInput = { up: false, down: false, left: false, right: false };
            return;
        }

        this.stateTimer -= TICK_RATE_MS;

        // 1. Arrived Check (Distance-based waypoint trigger)
        if (this.state === 'MOVING' && this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < 3600) { // 60px * 60px = 3600
                // Arrived! Hang out here.
                this.state = 'IDLE';
                const idleDwell = this.zone.archetype === 'gather' ? 1000 + Math.random() * 2000 : 2000 + Math.random() * 6000;
                this.stateTimer = idleDwell;
                this.currentInput = { up: false, down: false, left: false, right: false };
                this.targetX = null;
                this.targetY = null;
                return;
            }
        }

        // 2. Timer-Based Transitions
        if (this.stateTimer <= 0) {
            if (this.state === 'IDLE') {
                // Local wandering (85%) or migrate to a new zone (15%)
                const stayInZone = Math.random() < 0.85;
                if (!stayInZone) {
                    this.zone = selectZoneByProbability();
                }

                this.state = 'FETCHING_WAYPOINT';
                fetchValidPoint(this.zone.coords)
                    .then(point => {
                        this.state = 'MOVING';
                        this.targetX = point.x;
                        this.targetY = point.y;
                        const travelTimeout = this.zone.archetype === 'gather' ? 10000 : 15000;
                        this.stateTimer = travelTimeout + Math.random() * 15000;
                    })
                    .catch(() => {
                        const point = getZoneCenter(this.zone.coords);
                        this.state = 'MOVING';
                        this.targetX = point.x;
                        this.targetY = point.y;
                        this.stateTimer = 15000 + Math.random() * 15000;
                    });
            } else {
                // Travel timeout / stuck recovery check
                this.state = 'IDLE';
                const idleDwell = this.zone.archetype === 'gather' ? 1000 + Math.random() * 2000 : 2000 + Math.random() * 6000;
                this.stateTimer = idleDwell;
                this.currentInput = { up: false, down: false, left: false, right: false };
                this.targetX = null;
                this.targetY = null;
            }
        }

        // 3. Waypoint Navigation Steering (Sets movement inputs based on target vector)
        if (this.state === 'MOVING' && this.targetX !== null && this.targetY !== null) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;

            // Set inputs with threshold deadzone (15px) to prevent twitching/oscillating
            this.currentInput = {
                left: dx < -15,
                right: dx > 15,
                up: dy < -15,
                down: dy > 15
            };
        }
    }

    performInteraction() {
        if (!this.socket.connected || this.consumedBy) return;

        // Clean up stale visible players
        const now = Date.now();
        Object.keys(this.visiblePlayers).forEach(id => {
            if (now - this.visiblePlayers[id].lastSeen > 5000) {
                delete this.visiblePlayers[id];
            }
        });

        const targets = Object.keys(this.visiblePlayers);
        if (targets.length === 0) return;

        // Find nearest target player
        let nearestTarget = null;
        let minDistSq = Infinity;

        targets.forEach(id => {
            const p = this.visiblePlayers[id];
            const dx = p.x - this.x;
            const dy = p.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestTarget = id;
            }
        });

        // Only interact if within reach (120px -> 14400px^2)
        if (nearestTarget && minDistSq < 14400) {
            const roll = Math.random();
            if (roll < 0.45) {
                // 45% chance to Grab
                this.socket.emit('playerPerformAction', { targetId: nearestTarget, intent: 'grabbing' });
            } else if (roll < 0.80) {
                // 35% chance to Swallow (Vore)
                this.socket.emit('voreAction', {
                    voreType: {
                        isEntrance: true,
                        graphNodeId: 'mouth',
                        destination: 'Stomach',
                        verb: 'swallows'
                    },
                    targetId: nearestTarget
                });
            } else {
                // 20% chance to Release
                this.socket.emit('releaseVoreTarget', { targetId: nearestTarget });
            }
        }
    }

    sendChat() {
        if (!this.socket.connected) return;
        const messages = [
            "Hello world!", "Anyone want to trade?", "Lag?", "Where is the quest?",
            "Nice outfit!", "LFG", "Selling wood", "brb", "lol", ":)",
            "Meet me at the pub!", "Wow, look at all these people here.",
            "Testing database writes...", "Stressing the DB flusher..."
        ];
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.socket.emit('input', { token: 'BOT_TOKEN', message: msg, charId: this.charId, name: `Bot_${this.index}` });
    }

    triggerDbWrite() {
        if (!this.socket.connected) return;
        // Emitting 'equipItemClicked' with a dummy slot ID triggers server-side character save logic
        this.socket.emit('equipItemClicked', 'shirt');
    }

    sendInput() {
        if (!this.socket.connected) return;

        this.sequence++;

        const payload = {
            ...this.currentInput,
            delta: TICK_RATE_MS / 1000,
            sequence: this.sequence,
            clientTimestamp: Date.now()
        };

        this.socket.emit('playerInput', payload);
    }

    checkLatency() {
        if (!this.socket.connected) return;
        const start = Date.now();
        this.socket.emit('pingTest', start, () => {
            const end = Date.now();
            recordLatency(end - start);
        });
    }
}

// Ramp up connections
let i = 0;
const connectionInterval = setInterval(async () => {
    const idx = i;
    i++;
    if (i >= CLIENT_COUNT) {
        clearInterval(connectionInterval);
    }
    try {
        await BotClient.create(idx);
    } catch (err) {
        console.error(`[LoadTest] Failed to spawn bot client ${idx}:`, err);
    }
    if (idx === CLIENT_COUNT - 1) {
        console.log('[LoadTest] All connection attempts initiated.');
    }
}, RAMP_UP_MS);

// Monitor Stats Output to Console
const monitorInterval = setInterval(() => {
    let avg = 0;
    let max = 0;
    if (latencies.length > 0) {
        avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        max = Math.max(...latencies);
    }
    console.log(`[LoadTest] Stats: ${connectedCount} connected. Client Latency (Avg/Max): ${avg.toFixed(1)}ms / ${max}ms`);
}, 5000);

// --- Integration with check-performance.js stats endpoint ---

function fetchServerStats() {
    return new Promise((resolve, reject) => {
        const url = `${SERVER_URL}/stats`;
        http.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Server returned HTTP status code ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Failed to parse stats JSON payload'));
                }
            });
        }).on('error', (err) => reject(err));
    });
}

async function printFinalStats() {
    try {
        const stats = await fetchServerStats();
        console.log('\n════════════════════════════════════════════════════════════');
        console.log('║               FINAL SERVER PERFORMANCE STATS             ║');
        console.log('════════════════════════════════════════════════════════════');
        console.log(`  • Tick Rate:            ${stats.tickRate ? stats.tickRate.toFixed(1) : '--'} Hz`);
        console.log(`  • Avg Tick Duration:    ${stats.avgTickDuration ? stats.avgTickDuration.toFixed(2) : '--'} ms`);
        console.log(`  • Peak Tick Duration:   ${stats.maxTickDuration ? stats.maxTickDuration.toFixed(2) : '--'} ms`);
        console.log(`  • Event Loop Lag:       ${stats.eventLoopLag ? stats.eventLoopLag.toFixed(2) : '--'} ms`);
        console.log(`  • CPU Usage:            ${stats.cpuUsage ? stats.cpuUsage.toFixed(1) : '--'}%`);
        console.log(`  • Memory RSS:           ${stats.memoryRss ? (stats.memoryRss / 1024 / 1024).toFixed(1) : '--'} MB`);
        console.log(`  • Memory Heap:          ${stats.memoryHeapUsed ? (stats.memoryHeapUsed / 1024 / 1024).toFixed(1) : '--'} MB`);
        console.log(`  • Active Connections:   ${stats.activeConnections !== undefined ? stats.activeConnections : '--'}`);
        console.log(`  • DB Resilience Queue:  ${stats.resilienceQueueSize !== undefined ? stats.resilienceQueueSize : '--'}`);
        console.log(`  • DB Write Latency:     ${stats.dbLatency !== undefined ? stats.dbLatency.toFixed(2) : '--'} ms`);
        
        if (stats.tickBreakdown) {
            console.log('\n  Tick Component Breakdown:');
            console.log(`    - Physics:            ${stats.tickBreakdown.physics ? stats.tickBreakdown.physics.toFixed(2) : '--'} ms`);
            console.log(`    - Logic:              ${stats.tickBreakdown.logic ? stats.tickBreakdown.logic.toFixed(2) : '--'} ms`);
            console.log(`    - Shadowcasting:      ${stats.tickBreakdown.shadowcasting ? stats.tickBreakdown.shadowcasting.toFixed(2) : '--'} ms`);
            console.log(`    - Serialize:          ${stats.tickBreakdown.serialize ? stats.tickBreakdown.serialize.toFixed(2) : '--'} ms`);
        }
        console.log('════════════════════════════════════════════════════════════\n');
    } catch (err) {
        console.error(`\n[LoadTest] Failed to retrieve server-side stats: ${err.message}`);
    }
}

let shuttingDown = false;
async function handleShutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[LoadTest] Shutting down bot clients...');

    // Clear connection & monitoring intervals
    clearInterval(connectionInterval);
    clearInterval(monitorInterval);

    // Disconnect all clients
    Array.from(clients).forEach(client => client.disconnect());

    // Fetch and print final server performance stats
    await printFinalStats();

    process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// --- Global Client Error Interception & Reporting ---

function reportGlobalError(err) {
    const errorMsg = err.message || String(err);
    const errorStack = err.stack || '';
    
    // Find the first connected client to transmit the error
    const activeClient = Array.from(clients).find(c => c.socket && c.socket.connected);
    if (activeClient) {
        activeClient.socket.emit('clientError', {
            message: errorMsg,
            stack: errorStack
        });
    }
}

process.on('uncaughtException', (err) => {
    console.error('[LoadTest] Uncaught Exception:', err);
    reportGlobalError(err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[LoadTest] Unhandled Promise Rejection:', reason);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    reportGlobalError(err);
});

