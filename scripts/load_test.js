
const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const CLIENT_COUNT = 250; // Goal: 500-1000
const RAMP_UP_MS = 100; // Delay between connections to prevent hammering
const TICK_RATE_MS = 33; // ~30Hz (33.33ms)
const PING_INTERVAL_MS = 2000; // Check latency every 2s

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

        this.socket = io(SERVER_URL, {
            query: { charId: this.charId, isBot: true },
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
    }

    stopLoop() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.pingInterval) clearInterval(this.pingInterval);
    }

    updateBehavior() {
        // Simple State Machine
        this.stateTimer -= TICK_RATE_MS;

        if (this.stateTimer <= 0) {
            // Pick new state
            if (Math.random() < 0.3) {
                this.state = 'IDLE';
                this.stateTimer = 1000 + Math.random() * 2000; // Rest for 1-3s
                this.currentInput = { up: false, down: false, left: false, right: false };
            } else {
                this.state = 'MOVING';
                this.stateTimer = 500 + Math.random() * 1500; // Move for 0.5-2s

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
