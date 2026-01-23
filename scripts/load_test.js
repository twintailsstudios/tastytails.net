
const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const CLIENT_COUNT = 500; // Goal: 500-1000
const RAMP_UP_MS = 20; // Time between connections (ms)
const MOVE_INTERVAL = 1000; // How often they move

console.log(`[LoadTest] Starting... Target: ${CLIENT_COUNT} clients.`);

let connectedCount = 0;
const clients = [];
const latencies = [];

function recordLatency(ms) {
    latencies.push(ms);
    if (latencies.length > 2000) latencies.shift(); // Keep last 1000 samples
}

function createClient(index) {
    // Generate a valid 24-char hex string (mimics MongoDB ObjectId)
    const hexIndex = index.toString(16).padStart(24, '0');
    const charId = hexIndex;
    const socket = io(SERVER_URL, {
        query: { charId: charId, isBot: true },
        reconnection: false,
        transports: ['websocket'], // Force websocket to avoid polling overhead
    });

    socket.on('connect', () => {
        connectedCount++;
        clients.push(socket); // Store socket for tracking
        if (connectedCount % 50 === 0) {
            console.log(`[LoadTest] Connected: ${connectedCount}/${CLIENT_COUNT}`);
        }


        // Random starting position (approx map center 800-1200) -> UPDATED to match player spawn (3300, 4300)
        const startX = 3300 + Math.random() * 400 - 200; // 3100-3500
        const startY = 4300 + Math.random() * 400 - 200; // 4100-4500

        // Start Moving & Pinging
        const intervalId = setInterval(() => {
            if (!socket.connected) return;

            // 1. Movement
            const input = {
                left: Math.random() > 0.5,
                right: Math.random() > 0.5,
                up: Math.random() > 0.5,
                down: Math.random() > 0.5,
                delta: MOVE_INTERVAL / 1000
            };
            socket.emit('playerInput', input);

            // 2. Latency Check (Ping)
            const startPing = Date.now();
            socket.emit('pingTest', startPing, (serverTime) => {
                const endPing = Date.now();
                const latency = endPing - startPing;
                recordLatency(latency);
            });

        }, MOVE_INTERVAL + Math.random() * 500);

        socket._intervalId = intervalId;
    });

    socket.on('disconnect', () => {
        connectedCount--;
        clearInterval(socket._intervalId);
    });
}

// Ramp up
let i = 0;
const interval = setInterval(() => {
    createClient(i);
    i++;
    if (i >= CLIENT_COUNT) {
        clearInterval(interval);
        console.log('[LoadTest] All connection attempts initiated.');
    }
}, RAMP_UP_MS);

// Monitor
// Monitor
setInterval(() => {
    let avg = 0;
    let max = 0;
    if (latencies.length > 0) {
        avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        max = Math.max(...latencies);
    }
    console.log(`Stats: ${connectedCount} connected. Latency (Avg/Max): ${avg.toFixed(1)}ms / ${max}ms`);
    // Clear latencies slightly to keep checking fresh
    if (latencies.length > 5000) latencies.splice(0, latencies.length - 1000);
}, 5000);
