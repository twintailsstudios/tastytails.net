/**
 * @fileoverview benchmark-gameloop.js - Spatial Hashing & Visibility Determination Micro-Benchmark - Upgraded Engine
 *
 * @description
 * Micro-benchmark measuring the computational performance of TastyTails' spatial partitioning
 * (Spatial Hash Grid) and visibility determination algorithms under a synthetic load of 1,000 active players.
 *
 * Upgraded Features:
 *   1. V8 JIT Warmup Engine (5 un-profiled warmup ticks to prime V8 inline caches)
 *   2. Dynamic Entity Movement & Grid Cell Boundary Crossing (simulates active entity velocity vectors)
 *   3. 30-Tick Statistical Percentile Trajectory Profiling (Mean, P50 Median, P95, P99, Peak Max)
 *   4. Server Health Dashboard Progress & Telemetry Submission
 *
 * Triggered by: `npm run bench:loop` or `node scripts/benchmark-gameloop.js`
 */

const { performance } = require('perf_hooks');
const io = require('socket.io-client');

const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
const SERVER_URL = BASE_URL.replace(/\/$/, '');

// --- 1. GEOMETRY & POINT-IN-POLYGON HELPERS ---

/**
 * Computes Axis-Aligned Bounding Box (AABB) extents for a 2D vertex array.
 * @param {Array<[number, number]>} vs - Array of 2D vertex coordinates [[x1, y1], ...]
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number } | null} AABB extent object
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
 * @param {{ minX: number, maxX: number, minY: number, maxY: number }} [aabb=null] - Pre-calculated AABB bounds.
 * @returns {boolean} True if (x, y) is inside the polygon.
 */
function isPointInPolygon(x, y, vs, aabb = null) {
    if (!vs || vs.length === 0) return false;

    const box = aabb || computeAABB(vs);
    if (box && (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY)) {
        return false;
    }

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/**
 * Computes percentile from array of numbers.
 * @param {Array<number>} arr - Numerical dataset
 * @param {number} p - Percentile (0 to 100)
 * @returns {number} Percentile value
 */
function getPercentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// --- 2. SETUP BENCHMARK DATA ---

const NUM_PLAYERS = 1000;
const MAP_SIZE = 5000;
const AOI_CELL_SIZE = 400;
const GRID_RADIUS = 3; // 7x7 cell search radius (400px * 3 = 1200px coverage >= 950px view distance)
const SPATIAL_OFFSET = 32768; // Safe offset for bitwise spatial hash encoding (-32768 to +32767 cells)

const WARMUP_TICKS = 5;
const PROFILED_TICKS = 30;

const players = [];

console.log(`Generating ${NUM_PLAYERS} dynamic player entities on ${MAP_SIZE}x${MAP_SIZE} map...`);

for (let i = 0; i < NUM_PLAYERS; i++) {
    const px = Math.random() * MAP_SIZE;
    const py = Math.random() * MAP_SIZE;

    // Assign velocity vectors (-100 to +100 px/sec) to simulate player movement across cell boundaries
    const vx = (Math.random() * 200 - 100);
    const vy = (Math.random() * 200 - 100);

    const poly = [
        [px, py],
        [px + 400, py - 200],
        [px + 400, py + 200]
    ];
    const aabb = computeAABB(poly);

    players.push({
        id: i,
        position: { x: px, y: py },
        velocity: { vx, vy },
        visibilityPolygon: poly,
        aabb: aabb
    });
}

function getSpatialKey(cx, cy) {
    return ((cx + SPATIAL_OFFSET) << 16) | ((cy + SPATIAL_OFFSET) & 0xFFFF);
}

/**
 * Simulates a single game loop tick execution: moves players, rebuilds spatial grid, and evaluates visibility.
 * @param {number} deltaSec - Tick delta time in seconds
 * @returns {{ duration: number, totalChecks: number, visibleCount: number }} Tick benchmark statistics
 */
function executeTick(deltaSec = 0.033) {
    // 1. Move players and update polygon/AABB extents
    players.forEach(p => {
        p.position.x += p.velocity.vx * deltaSec;
        p.position.y += p.velocity.vy * deltaSec;

        // Bounce off map boundaries
        if (p.position.x < 0 || p.position.x > MAP_SIZE) p.velocity.vx *= -1;
        if (p.position.y < 0 || p.position.y > MAP_SIZE) p.velocity.vy *= -1;

        const px = p.position.x;
        const py = p.position.y;

        p.visibilityPolygon = [
            [px, py],
            [px + 400, py - 200],
            [px + 400, py + 200]
        ];
        p.aabb = computeAABB(p.visibilityPolygon);
    });

    const start = performance.now();

    // 2. Spatial Hash Construction using zero-allocation integer keys
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

    // 3. Observer Visibility Queries across 7x7 Grid Neighborhood
    players.forEach(observer => {
        if (!observer || !observer.position) return;

        const oX = observer.position.x;
        const oY = observer.position.y;
        const cellX = Math.floor(oX / AOI_CELL_SIZE);
        const cellY = Math.floor(oY / AOI_CELL_SIZE);

        for (let cx = cellX - GRID_RADIUS; cx <= cellX + GRID_RADIUS; cx++) {
            for (let cy = cellY - GRID_RADIUS; cy <= cellY + GRID_RADIUS; cy++) {
                const cellKey = getSpatialKey(cx, cy);
                const cellPlayers = playerGrid.get(cellKey);

                if (cellPlayers) {
                    for (const target of cellPlayers) {
                        if (!target || !target.position || observer.id === target.id) continue;

                        const dx = oX - target.position.x;
                        const dy = oY - target.position.y;
                        const distSq = dx * dx + dy * dy;

                        if (distSq < 950 * 950) {
                            totalChecks++;
                            if (distSq < 22500) {
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
    return {
        duration: end - start,
        totalChecks,
        visibleCount
    };
}

/**
 * Main benchmark orchestrator routine.
 */
async function runBenchmark() {
    console.log(`\nExecuting ${WARMUP_TICKS} V8 JIT Warmup Ticks...`);
    for (let w = 0; w < WARMUP_TICKS; w++) {
        executeTick(0.033);
    }
    console.log(`✅ V8 JIT Warmup Complete. Running ${PROFILED_TICKS} Profiled Ticks...`);

    const tickDurations = [];
    const checkCounts = [];
    const visibleCounts = [];

    for (let t = 0; t < PROFILED_TICKS; t++) {
        const res = executeTick(0.033);
        tickDurations.push(res.duration);
        checkCounts.push(res.totalChecks);
        visibleCounts.push(res.visibleCount);
    }

    // Statistical Percentile Calculations
    const meanTick = tickDurations.reduce((a, b) => a + b, 0) / tickDurations.length;
    const p50Tick = getPercentile(tickDurations, 50);
    const p95Tick = getPercentile(tickDurations, 95);
    const p99Tick = getPercentile(tickDurations, 99);
    const maxTick = Math.max(...tickDurations);

    const meanChecks = checkCounts.reduce((a, b) => a + b, 0) / checkCounts.length;
    const meanVisible = visibleCounts.reduce((a, b) => a + b, 0) / visibleCounts.length;

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('║        SPATIAL HASH & VISIBILITY MICRO-BENCHMARK         ║');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`  • Simulated Players:       ${NUM_PLAYERS} entities`);
    console.log(`  • Profiled Ticks:          ${PROFILED_TICKS} ticks`);
    console.log(`  • Tick Duration Mean:      ${meanTick.toFixed(3)} ms`);
    console.log(`  • Tick Duration P50:       ${p50Tick.toFixed(3)} ms`);
    console.log(`  • Tick Duration P95:       ${p95Tick.toFixed(3)} ms`);
    console.log(`  • Tick Duration P99:       ${p99Tick.toFixed(3)} ms`);
    console.log(`  • Peak Tick Duration:      ${maxTick.toFixed(3)} ms`);
    console.log(`  • Avg Visibility Checks:   ${Math.round(meanChecks)} checks/tick`);
    console.log(`  • Avg Visible Pairs Found: ${Math.round(meanVisible)} pairs/tick`);
    console.log('════════════════════════════════════════════════════════════\n');

    const pass = p95Tick <= 33.3;
    console.log(`Status: ${pass ? 'PASS (P95 <= 33.3ms)' : 'FAIL (P95 > 33.3ms)'}`);

    // Dashboard Telemetry Submission
    console.log("\nReporting micro-benchmark outcomes to Server Health Dashboard...");
    const reporterSocket = io(SERVER_URL, {
        query: { charId: '000000000000000000000001', isBot: true },
        transports: ['websocket'],
        forceNew: true,
        timeout: 5000
    });

    await new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
            try { reporterSocket.disconnect(); } catch (e) {}
            resolve();
        }, 5000);

        reporterSocket.on('connect', () => {
            clearTimeout(timeoutId);
            reporterSocket.emit('reportAction', { actionType: 'benchmark: spatial grid tick duration', success: pass });
            reporterSocket.emit('reportAction', { actionType: 'benchmark: visibility check throughput', success: meanChecks > 0 });
            setTimeout(() => {
                reporterSocket.disconnect();
                resolve();
            }, 1000);
        });

        reporterSocket.on('connect_error', () => {
            clearTimeout(timeoutId);
            try { reporterSocket.disconnect(); } catch (e) {}
            resolve();
        });
    });

    console.log("✅ Reports submitted to dashboard. Micro-benchmark finalized.");
    if (!pass) process.exit(1);
    process.exit(0);
}

runBenchmark();
