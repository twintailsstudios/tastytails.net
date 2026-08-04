---
name: tastytails-performance-tuner
description: Audit and optimize the game server tick rate, tick duration, database resilience, memory allocation, and client reconciliation for TastyTails.net using the project's performance diagnostic and load test suites.
---

# TastyTails Performance Tuner & Benchmark Engine Skill

> **Usage Instruction**: Reference or invoke this skill whenever asked to optimize server tick rates, lower latency, reduce event loop lag, eliminate GC pauses, or conduct load tests on **TastyTails.net**. Generates a visual `performance_tuning_report.md` artifact comparing baseline vs optimized benchmark metrics across 13 key targets.

---

## 1. Core Subsystem Audit Focus Areas

Examine these concrete subsystems in the codebase:
1. **Game Loop & Shadowcasting (`src/server-loop.js`)**:
   - *Visibility Polygon*: CPU-bound `updatePlayerShadows` & `VisibilityPolygon.compute()`.
   - *Point Containment*: Optimize `isPointInPolygon` in $O(N^2)$ observer loops; check AABB bounding boxes.
   - *Staggering & LOD*: Optimize `serverTickCount % 3` visibility recalculations and `isFar` LOD throttling (10Hz vs 30Hz).
2. **Animal AI Updates & Culling (`src/server/mechanics/Animal.js`)**:
   - *Spatial Culling*: Optimize `getPlayersInRange(animal.x, animal.y, 1500)` in `gameLoop`.
3. **Digestion / Mechanics Loop (`src/server/mechanics/digestion.js`)**:
   - *Interval Processing*: Ensure 1s digestion loops run off-tick and do not block the 33.3ms main tick.
4. **Database Resilience & Write-Behind Cache (`src/classes/DatabaseResilience.js`)**:
   - *Write Buffer*: Evaluate `writeBuffer` Map, `flushIntervalMS` (30s), and coordinate save debounces (`SAVE_COOLDOWN = 5000`).
5. **Client Prediction & Reconciliation (`src/client/js/game/reconcile.js`)**:
   - *Lerp & DOM Thrashing*: Optimize position snapping (`dist > 5.0`), lerping (`0.3`), and DOM dirty checks.

---

## 2. Empirical Performance Verification Cycle

### Step 1: Pre-Refactor Baseline
1. Start server: `npm start`
2. Open Dashboard: `http://localhost:3000/dashboard.html` for real-time telemetry observation.
3. Save baseline: `npm run test:perf -- --save-baseline`

### Step 2: Diagnostic Suite Execution
Execute targeted diagnostics via npm script shortcuts:
1. **Gameloop Micro-Benchmark** (`npm run bench:loop`): P95 Tick Duration $\le 33.3$ms.
2. **Bottleneck Taxonomy** (`npm run test:bottleneck`): CPU $\le 15$ms, Serialization $\le 35$ms, Loop Lag $\le 50$ms, $\alpha \le 1.5$.
3. **Cluster Storm Collision** (`npm run test:cluster`): Physics $\le 10$ms, Shadowcasting $\le 8$ms.
4. **Chatterbox Network Broadcast** (`npm run test:chatterbox`): Serialization $\le 25$ms, Bandwidth $\le 500$KB/sec.
5. **Memory Leaker** (`npm run test:memory`): Heap Growth $\le 50$MB, Churn Rate $\le 5.0$MB/sec, GC Pause $\le 100$ms.
6. **DB Heavy Lift** (`npm run test:db`): Write Latency $\le 1000$ms, Loop Lag $\le 100$ms, Post-Drain Buffer Queue $= 0$.

### Step 3: End-to-End Load Simulator (250 Bots)
Run the 250-bot load simulator:
`npm run test:load` ([`scripts/load_test.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/scripts/load_test.js))
- *Target Avg Tick Duration*: $\le 20.0$ ms
- *Target Peak Tick Duration*: $\le 33.3$ ms
- *Target Client Ping P95*: $\le 1500$ ms
- *Target Event Loop Lag*: $\le 30$ ms

---

## 3. Performance Tuning Report Artifact Blueprint

Generate a markdown artifact titled `performance_tuning_report.md` structured as follows:

```markdown
# ⚡ Performance Tuning Report: TastyTails.net Stack

## 1. Executive Summary & Optimization Highlights
- Key bottlenecks identified and optimizations applied.
- Overall tick rate and latency improvement summary.

## 2. Visual & Gameplay Trade-Off Clarifications
> [!IMPORTANT]
> Highlight any trade-offs made between performance gains and visual/gameplay fidelity (e.g. shadow resolution, LOD distances) requiring developer review.

## 3. Empirical 13-Metric Benchmark Comparison
| Metric | Baseline | Optimized | Target | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Idle Tick Duration** | | | - | |
| **Max Peak Tick Duration** | | | $\le 33.3$ ms | 🟢 Pass |
| **Taxonomy Event Loop Lag** | | | $\le 50$ ms | 🟢 Pass |
| **Cluster Storm Physics** | | | $\le 10$ ms | 🟢 Pass |
| **Cluster Storm Shadowcasting** | | | $\le 8$ ms | 🟢 Pass |
| **Chatterbox Serialization** | | | $\le 25$ ms | 🟢 Pass |
| **Memory Leak Net Growth** | | | $\le 50$ MB | 🟢 Pass |
| **GC Peak Pause Latency** | | | $\le 100$ ms | 🟢 Pass |
| **DB Flush Event Loop Lag** | | | $\le 100$ ms | 🟢 Pass |
| **Load Test Avg Tick (250 bots)** | | | $\le 20$ ms | 🟢 Pass |
| **Load Test Peak Tick (250 bots)** | | | $\le 33.3$ ms | 🟢 Pass |
| **Load Test Avg Client RTT** | | | $\le 150$ ms | 🟢 Pass |
| **Load Test Event Loop Lag** | | | $\le 30$ ms | 🟢 Pass |

## 4. Regression Verification
- Passed `npm test` & `npm run test:auto` (zero gameplay regressions).
```

---

## 4. Core Execution Rules
- **No Unverified Claims**: All performance gains must be backed by empirical test logs.
- **Clickable Links**: All file and symbol references must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
