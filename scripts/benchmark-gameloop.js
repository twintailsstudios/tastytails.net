const { performance } = require('perf_hooks');

// --- 1. COPIED OPTIMIZED FUNCTIONS (Simulating server-loop.js) ---

function isPointInPolygon(x, y, vs) {
    if (!vs || vs.length === 0) return false;

    // AABB Check
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
    }
    if (x < minX || x > maxX || y < minY || y > maxY) return false;

    // Raycast
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- 2. SETUP DATA ---
const NUM_PLAYERS = 1000;
const MAP_SIZE = 5000;
const players = [];

console.log(`Generating ${NUM_PLAYERS} players on ${MAP_SIZE}x${MAP_SIZE} map...`);

for (let i = 0; i < NUM_PLAYERS; i++) {
    const px = Math.random() * MAP_SIZE;
    const py = Math.random() * MAP_SIZE;

    // Create a simple visibility polygon around the player (e.g., triangle/cone approximation)
    const poly = [
        [px, py],
        [px + 400, py - 200],
        [px + 400, py + 200]
    ];

    players.push({
        id: i,
        position: { x: px, y: py },
        visibilityPolygon: poly
    });
}

// --- 3. RUN SIMULATION (1 Tick) ---
console.log(`Starting Game Loop Tick Simulation...`);
const start = performance.now();

// Step A: Spatial Hash Build
const AOI_CELL_SIZE = 400;
const playerGrid = {};

players.forEach(p => {
    const cx = Math.floor(p.position.x / AOI_CELL_SIZE);
    const cy = Math.floor(p.position.y / AOI_CELL_SIZE);
    const key = `${cx},${cy}`;
    if (!playerGrid[key]) playerGrid[key] = [];
    playerGrid[key].push(p);
});

let totalChecks = 0;
let visibleCount = 0;

// Step B: Observer Checks
players.forEach(observer => {
    const oX = observer.position.x;
    const oY = observer.position.y;
    const cellX = Math.floor(oX / AOI_CELL_SIZE);
    const cellY = Math.floor(oY / AOI_CELL_SIZE);

    // Check 5x5 Grid (Range 2) to match code
    // Although code said -3 to +3 (Range 3), let's be conservative and test Range 3
    for (let cx = cellX - 3; cx <= cellX + 3; cx++) {
        for (let cy = cellY - 3; cy <= cellY + 3; cy++) {
            const cellKey = `${cx},${cy}`;
            const cellPlayers = playerGrid[cellKey];

            if (cellPlayers) {
                for (const target of cellPlayers) {
                    if (observer.id === target.id) continue;

                    // 1. Distance Check (Squared) - VIEW_DISTANCE = 950
                    const dx = oX - target.position.x;
                    const dy = oY - target.position.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < 950 * 950) {
                        totalChecks++;
                        // 2. Visibility Check (Proximity + AABB optimized)
                        if (distSq < 22500) { // This is 150*150
                            visibleCount++;
                        }
                        else if (isPointInPolygon(target.position.x, target.position.y, observer.visibilityPolygon)) {
                            visibleCount++;
                        }
                    }
                }
            }
        }
    }
});

const end = performance.now();
const duration = end - start;

console.log('--- RESULTS ---');
console.log(`Tick Duration: ${duration.toFixed(3)}ms`);
console.log(`Total Visibility Checks: ${totalChecks}`);
console.log(`Visible Pairs Found: ${visibleCount}`);
console.log(`Status: ${duration < 33 ? 'PASS (<33ms)' : 'FAIL (>33ms)'}`);

if (duration > 33) process.exit(1);
