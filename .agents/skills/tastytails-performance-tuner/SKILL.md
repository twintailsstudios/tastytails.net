---
name: tastytails-performance-tuner
description: Audit and optimize the game server tick rate, tick duration, database resilience, memory allocation, and client reconciliation for TastyTails.net using the project's performance diagnostic and load test suites.
---

# tastytails-performance-tuner

This skill is designed to guide agents in auditing, optimizing, and empirically verifying the performance of the **tastytails.net** gaming stack (built with Node.js, Socket.IO, Mongoose/MongoDB, and Phaser 3). Use this skill when requested to improve tick rates, lower latency, reduce event loop lag, or diagnose performance regressions.

---

### Step 1: Core Subsystem Audit Focus Areas

Examine the following concrete locations in the repository:

1.  **Game Loop & Raycasting-Based Shadows (`src/server-loop.js`)**:
    *   *Visibility Polygon*: Focus on `updatePlayerShadows` and `VisibilityPolygon.compute(pos, relevantSegments)` (from `visibility-polygon` library) which is CPU-bound.
    *   *Point Containment*: Optimize `isPointInPolygon` checks in the O(N^2) observer-target loop. Look at AABB optimization and cross-cell thresholds.
    *   *Staggering & LOD*: Optimize `serverTickCount % 3` visibility recalculation and `isFar` LOD throttling.
2.  **Animal AI Updates & Culling (`src/server-loop.js` & `src/server/mechanics/Animal.js`)**:
    *   *Culling check*: Look at the culling check `getPlayersInRange(animal.x, animal.y, 1500)` in `gameLoop` which runs for every animal every tick.
3.  **Digestion / Vore Mechanics (`src/server/mechanics/digestion.js` & `src/sockets/voreHandlers.js`)**:
    *   *Interval Loop*: Check `processDigestion` running every 1 second. Ensure it does not block the main game tick when processing stomach interactions.
4.  **Database Resilience & Write-Behind Cache (`src/classes/DatabaseResilience.js`)**:
    *   *Write-Behind Buffer*: Evaluate `DatabaseResilience.queueUpdate` and the `writeBuffer` Map. Review the `flushIntervalMS` (30s) and coordinate saving debounces (`SAVE_COOLDOWN = 5000`).
5.  **Client-Side Prediction & Reconciliation (`src/client/js/game/reconcile.js` & `update.js`)**:
    *   *Reconciliation*: Optimize client speed, snapping thresholds (`dist > 5.0`), lerping (`0.3`), and ensure DOM cache dirty checks prevent layout thrashing.

---

### Step 2: The Empirical Performance Verification Cycle

Before and after modifying code, you must execute the diagnostics and compile comparative performance logs:

#### A. Establish the Baseline
1.  Start the server: `npm start`
2.  Run the baseline benchmark: `node scripts/check-performance.js --save-baseline`

#### B. Run Diagnostics
Run the following tools to target specific subsystems:
1.  **Bottleneck Taxonomy** (`node scripts/test_bottleneck_taxonomy.js`): Measures scaling under load (0, 50, 150 bots).
    *   *Target CPU*: $\le 15$ ms
    *   *Target Serialization*: $\le 35$ ms
    *   *Target Event Loop Lag*: $\le 50$ ms
2.  **Cluster Storm Collision** (`node scripts/test_cluster_storm.js`): Packs 150 bots in a tight area to force $O(N^2)$ visibility/collision checks.
    *   *Target Physics (Avg)*: $\le 10$ ms
    *   *Target Shadowcasting (Avg)*: $\le 8$ ms
3.  **Chatterbox Network Broadcast** (`node scripts/test_chatterbox.js`): Floods chat to measure serialization.
    *   *Target Serialization (Avg)*: $\le 25$ ms
4.  **Memory Leaker** (`node scripts/test_memory_leaker.js`): Tracks heap and GC pauses.
    *   *Target Heap Growth*: $\le 50$ MB
    *   *Target Peak GC Pause*: $\le 100$ ms
5.  **DB Heavy Lift** (`node scripts/test_db_heavy_lift.js`): Measures loop lag during DB flush intervals.
    *   *Target DB Write Latency*: $\le 1000$ ms
    *   *Target Event Loop Lag*: $\le 100$ ms

#### C. E2E Load Testing (The Ultimate Indicator)
Run the load simulator:
`npm run test:load` (runs `scripts/load_test.js`)
*   Spawns **250 simulated client bots** in a staggered fashion using a **100ms connection interval** ramp-up delay.
*   Monitor stats via `/stats` or the `TastyTails Server Health Dashboard`.
*   *Target Average Tick Duration*: $\le 20.0$ ms
*   *Target Max Peak Tick Duration*: $\le 33.3$ ms
*   *Target Average Client Latency (RTT)*: $\le 150$ ms
*   *Target Event Loop Lag*: $\le 30$ ms

#### D. Comparison Table
Compare your results using the following layout in your final report:

| Metric | Baseline | Optimized | Target | Status (Pass/Fail) |
| :--- | :--- | :--- | :--- | :--- |
| **Idle Tick Duration** | | | - | |
| **Max Peak Tick Duration** | | | - | |
| **Taxonomy Event Loop Lag** | | | $\le 50$ ms | |
| **Cluster Storm Physics** | | | $\le 10$ ms | |
| **Cluster Storm Shadowcasting** | | | $\le 8$ ms | |
| **Chatterbox Serialization** | | | $\le 25$ ms | |
| **Memory Leak Net Growth** | | | $\le 50$ MB | |
| **GC Peak Pause Latency** | | | $\le 100$ ms | |
| **DB Flush Event Loop Lag** | | | $\le 100$ ms | |
| **Load Test Avg Tick Duration (250 bots)** | | | $\le 20$ ms | |
| **Load Test Peak Tick Duration (250 bots)** | | | $\le 33.3$ ms | |
| **Load Test Avg Client Latency (RTT)** | | | $\le 150$ ms | |
| **Load Test Event Loop Lag (250 bots)** | | | $\le 30$ ms | |
