/**
 * @fileoverview benchmark-gameloop.js - Spatial Hashing & Visibility Determination Micro-Benchmark
 *
 * @description
 * Micro-benchmark measuring the computational performance of TastyTails' spatial partitioning
 * (Spatial Hash Grid) and visibility determination algorithms under a synthetic load of 1,000 active players.
 *
 * Primary Objectives:
 * 1. Simulates 1,000 player entities on a 5000x5000 world map with 3-vertex vision cones.
 * 2. Buckets player entities into a Spatial Hash Grid (AOI_CELL_SIZE = 400).
 * 3. Evaluates observer visibility across a 7x7 grid search radius (GRID_RADIUS = 3).
 * 4. Measures execution tick duration against a strict 33.3ms performance budget (30 Hz server tick rate).
 *
 * Key Optimizations Applied:
 * - OPTIMIZATION (Memory & GC): Zero-allocation bitwise integer spatial keys `((cx + 32768) << 16) | ((cy + 32768) & 0xFFFF)`
 *   replacing heap-allocated string template literals (`${cx},${cy}`).
 * - OPTIMIZATION (CPU): Pre-calculated Axis-Aligned Bounding Box (AABB) bounds (`minX, maxX, minY, maxY`)
 *   skipping vertex loop iterations inside `isPointInPolygon` containment tests.
 * - OPTIMIZATION (Safety): Hardened integer offset (+32,768) for negative spatial coordinate safety and defensive property checks.
 */

const { performance } = require('perf_hooks');

// --- 1. GEOMETRY & POINT-IN-POLYGON HELPERS ---

/**
 * Computes Axis-Aligned Bounding Box (AABB) extents for a 2D vertex array.
 * @param {Array<[number, number]>} vs - Array of 2D vertex coordinates [[x1, y1], [x2, y2], ...]
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null} AABB extent object or null if invalid.
 */
function computeAABB(vs) {
    if (!vs || vs.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
    }
    return { minX, maxX, minY, maxY };
}

/**
 * Evaluates whether a target coordinate point (x, y) falls inside a 2D polygon array.
 * Uses ray-casting algorithm (even-odd rule) with pre-filtered AABB extent checking.
 *
 * @param {number} x - Target point X coordinate.
 * @param {number} y - Target point Y coordinate.
 * @param {Array<[number, number]>} vs - Array of 2D polygon vertices.
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} [aabb=null] - Pre-calculated AABB bounds (optional).
 * @returns {boolean} True if (x, y) is inside the polygon, false otherwise.
 */
function isPointInPolygon(x, y, vs, aabb = null) {
    if (!vs || vs.length === 0) return false;

    // OPTIMIZATION (CPU): Fast-fail AABB check. Uses pre-calculated AABB if available, else calculates on demand.
    const box = aabb || computeAABB(vs);
    if (box && (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY)) {
        return false;
    }

    // Raycast (Even-Odd Rule)
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- 2. SETUP BENCHMARK DATA ---

const NUM_PLAYERS = 1000;
const MAP_SIZE = 5000;
const AOI_CELL_SIZE = 400;
const GRID_RADIUS = 3; // 7x7 cell search radius (400px * 3 = 1200px coverage >= 950px view distance)
const SPATIAL_OFFSET = 32768; // Safe offset for bitwise spatial hash encoding (-32768 to +32767 cells)

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

    // OPTIMIZATION: Pre-compute AABB bounding box on entity setup to avoid hot-loop re-calculation
    const aabb = computeAABB(poly);

    players.push({
        id: i,
        position: { x: px, y: py },
        visibilityPolygon: poly,
        aabb: aabb
    });
}

// Helper to compute zero-allocation 32-bit integer spatial key
function getSpatialKey(cx, cy) {
    return ((cx + SPATIAL_OFFSET) << 16) | ((cy + SPATIAL_OFFSET) & 0xFFFF);
}

// --- 3. RUN SIMULATION (1 Tick) ---

console.log(`Starting Game Loop Tick Simulation...`);
const start = performance.now();

// Step A: Spatial Hash Build using Map and bitwise integer keys (Zero Heap Allocations)
// OPTIMIZATION: Map<number, Array<Player>> avoids short-lived string key allocations (${cx},${cy})
const playerGrid = new Map();

players.forEach(p => {
    const cx = Math.floor(p.position.x / AOI_CELL_SIZE);
    const cy = Math.floor(p.position.y / AOI_CELL_SIZE);
    const key = getSpatialKey(cx, cy);
    let cell = playerGrid.get(key);
    if (!cell) {
        cell = [];
        playerGrid.set(key, cell);
    }
    cell.push(p);
});

let totalChecks = 0;
let visibleCount = 0;

// Step B: Observer Checks across 7x7 Grid Neighborhood
players.forEach(observer => {
    if (!observer || !observer.position) return;

    const oX = observer.position.x;
    const oY = observer.position.y;
    const cellX = Math.floor(oX / AOI_CELL_SIZE);
    const cellY = Math.floor(oY / AOI_CELL_SIZE);

    // Search 7x7 Grid (GRID_RADIUS = 3) to cover maximum view distance (950px)
    for (let cx = cellX - GRID_RADIUS; cx <= cellX + GRID_RADIUS; cx++) {
        for (let cy = cellY - GRID_RADIUS; cy <= cellY + GRID_RADIUS; cy++) {
            const cellKey = getSpatialKey(cx, cy);
            const cellPlayers = playerGrid.get(cellKey);

            if (cellPlayers) {
                for (const target of cellPlayers) {
                    // Safety check & skip self
                    if (!target || !target.position || observer.id === target.id) continue;

                    // 1. Distance Check (Squared) - VIEW_DISTANCE = 950px
                    const dx = oX - target.position.x;
                    const dy = oY - target.position.y;
                    const distSq = dx * dx + dy * dy;

                    if (distSq < 950 * 950) {
                        totalChecks++;

                        // 2. Visibility Check (Proximity + AABB + Raycast)
                        if (distSq < 22500) { // Close Proximity Bypass (150px squared)
                            visibleCount++;
                        }
                        else if (isPointInPolygon(target.position.x, target.position.y, observer.visibilityPolygon, observer.aabb)) {
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

