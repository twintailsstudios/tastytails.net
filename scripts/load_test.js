
const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const CLIENT_COUNT = 250; // Goal: 500-1000
const RAMP_UP_MS = 100; // Delay between connections to prevent hammering
const TICK_RATE_MS = 33; // ~30Hz (33.33ms)
const PING_INTERVAL_MS = 2000; // Check latency every 2s

// Map Dimensions (From mapConfig/alpha_map.json)
const MAP_WIDTH_TILES = 240;
const MAP_HEIGHT_TILES = 240;
const TILE_SIZE = 32;


console.log(`[LoadTest] Starting... Target: ${CLIENT_COUNT} clients at ${Math.round(1000 / TICK_RATE_MS)}Hz inputs.`);

let connectedCount = 0;
const clients = [];
const latencies = [];

function recordLatency(ms) {
    latencies.push(ms);
    if (latencies.length > 2000) latencies.shift();
}

/**
 * Simulates a single player client with realistic behavior.
 */
class BotClient {
    constructor(index) {
        this.index = index;
        // Generate a hex ID similar to MongoDB
        this.charId = index.toString(16).padStart(24, '0');

        // Generate Random Start Position
        const margin = 200;
        const mapW = MAP_WIDTH_TILES * TILE_SIZE;
        const mapH = MAP_HEIGHT_TILES * TILE_SIZE;
        const startX = Math.floor(Math.random() * (mapW - margin * 2)) + margin;
        const startY = Math.floor(Math.random() * (mapH - margin * 2)) + margin;

        this.socket = io(SERVER_URL, {
            query: {
                charId: this.charId,
                isBot: true,
                startX: startX,
                startY: startY
            },
            reconnection: false,
            transports: ['websocket'],
        });


        this.updateInterval = null;
        this.pingInterval = null;
        this.sequence = 0;

        // Behavior State
        this.state = 'IDLE'; // IDLE, MOVING
        this.stateTimer = 0;
        this.currentInput = { up: false, down: false, left: false, right: false };

        // Navigation State
        this.targetX = null;
        this.targetY = null;

        // Chat State
        this.chatInterval = null;

        // Setup Socket
        this.socket.on('connect', () => this.onConnect());
        this.socket.on('disconnect', () => this.onDisconnect());
    }

    onConnect() {
        connectedCount++;
        clients.push(this);

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
        this.stopLoop();
    }

    startLoop() {
        // 1. Movement Loop (~30Hz)
        this.updateInterval = setInterval(() => {
            this.updateBehavior();
            this.sendInput();
        }, TICK_RATE_MS);

        // 2. Latency Loop (Infrequent)
        this.pingInterval = setInterval(() => {
            this.checkLatency();
        }, PING_INTERVAL_MS + Math.random() * 1000);

        // 3. Chat Loop (Very infrequent to avoid flooding logs, but present)
        this.chatInterval = setInterval(() => {
            if (Math.random() < 0.1) { // 10% chance every 10s = ~1 msg per 100s per bot
                this.sendChat();
            }
        }, 10000);

    }

    stopLoop() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.pingInterval) clearInterval(this.pingInterval);
    }

    updateBehavior() {
        this.stateTimer -= TICK_RATE_MS;

        if (this.stateTimer <= 0) {
            // Pick new state
            if (Math.random() < 0.2) {
                // IDLE
                this.state = 'IDLE';
                this.stateTimer = 1000 + Math.random() * 3000; // Rest for 1-4s
                this.currentInput = { up: false, down: false, left: false, right: false };
            } else {
                // MOVING (Longer duration for "Travel")
                this.state = 'MOVING';
                this.stateTimer = 2000 + Math.random() * 6000; // Move for 2-8s

                // Pick random direction(s)
                const dir = Math.floor(Math.random() * 8);
                this.currentInput = {
                    up: dir === 0 || dir === 4 || dir === 5,
                    down: dir === 1 || dir === 6 || dir === 7,
                    left: dir === 2 || dir === 4 || dir === 6,
                    right: dir === 3 || dir === 5 || dir === 7
                };
            }
        }
    }

    sendChat() {
        if (!this.socket.connected) return;
        const messages = [
            "Hello world!", "Anyone want to trade?", "Lag?", "Where is the quest?",
            "Nice outfit!", "LFG", "Selling wood", "brb", "lol", ":)"
        ];
        const msg = messages[Math.floor(Math.random() * messages.length)];
        this.socket.emit('chatMessage', msg);
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

// Ramp up creation
let i = 0;
const interval = setInterval(() => {
    new BotClient(i);
    i++;
    if (i >= CLIENT_COUNT) {
        clearInterval(interval);
        console.log('[LoadTest] All connection attempts initiated.');
    }
}, RAMP_UP_MS);

// Monitor Stats
setInterval(() => {
    let avg = 0;
    let max = 0;
    if (latencies.length > 0) {
        avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        max = Math.max(...latencies);
    }
    console.log(`Stats: ${connectedCount} connected. Latency (Avg/Max): ${avg.toFixed(1)}ms / ${max}ms`);
    // Keep stats fresh
    if (latencies.length > 5000) latencies.splice(0, latencies.length - 1000);
}, 5000);
