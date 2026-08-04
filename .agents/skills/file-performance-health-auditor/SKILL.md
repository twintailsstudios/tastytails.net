---
name: file-performance-health-auditor
description: Performs an in-depth performance, tick-budget, memory GC, netcode scalability, and code maintainability audit of a target file in TastyTails.net. Integrates with benchmark scripts and load tests to generate prioritized refactoring reports.
---

# TastyTails Performance, Scalability & Health Auditor Skill

> **Usage Instruction**: Reference or invoke this skill whenever auditing a file in **TastyTails.net** for CPU/memory bottlenecks, 30Hz tick rate budget compliance, high-player scalability risks, race conditions, or code tech debt. Generates a visual `performance_audit_[filename].md` report with benchmark measurements and prioritized diffs.

---

## 1. TastyTails Performance & Architecture Auditing Standards

When auditing a file in TastyTails.net, evaluate against these project standards:
- **Main Server Loop Budget**: 30Hz tick rate = **33.3ms total frame budget** ([`src/server-loop.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server-loop.js)). Functions in hot loops must execute in microseconds.
- **Database Write-Behind Cache**: Writes MUST be cached in memory and flushed via `DatabaseResilience.js` ([`src/classes/DatabaseResilience.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/classes/DatabaseResilience.js)). Direct synchronous DB saves in tick loops are strict P0 violations.
- **Spatial Hash & AOI Netcode**: Movement and entity state updates MUST be filtered by 400x400 AOI grid cells and line-of-sight raycasting (`visibility-polygon`).
- **Benchmark & Test Suite Mapping**:
  - Physics / Spatial Grid / Visibility $\rightarrow$ `npm run bench:loop` & `npm run test:cluster`
  - Algorithmic Complexity / Scaling $\rightarrow$ `npm run test:bottleneck`
  - Memory Allocations / GC Pauses $\rightarrow$ `npm run test:memory`
  - Socket Serialization & Bandwidth $\rightarrow$ `npm run test:chatterbox`
  - Database Write-Behind Cache $\rightarrow$ `npm run test:db`
  - Automated CI Performance Baseline $\rightarrow$ `npm run test:perf`
  - High-Player E2E Capacity (250 bots) $\rightarrow$ `npm run test:load`
  - End-to-End Mechanics & AOI $\rightarrow$ `npm run test:auto`
  - Server Health Dashboard $\rightarrow$ Observe live telemetry at `http://localhost:3000/dashboard.html`

---

## 2. Mandatory 4-Axis Audit Checklist

### Axis 1: CPU, Memory GC & Hot Loops
- **Hot Loop Allocations**: Check for `new Object()`, array `.map()`/`.filter()`, closure instantiations inside the 30Hz loop that trigger Garbage Collection (GC) pauses.
- **Algorithm Complexity**: Identify $O(N^2)$ checks that should use spatial hashing or indexed lookups.
- **Micro-Optimizations**: Check un-memoized calculations, redundant string concatenations, or math operations repeated inside loops.

### Axis 2: High-Player Scalability & Netcode
- **Scaling Threshold**: Estimate CPU and bandwidth behavior as entity counts scale ($N = 50 \to 200 \to 1000$).
- **Socket Payload Size**: Ensure Socket.io events broadcast delta updates instead of full entity state objects. Check LOD throttling (10Hz vs 30Hz for distant entities).

### Axis 3: Reliability, Async I/O & Race Conditions
- **Event Loop Blocking**: Verify asynchronous functions do not block the event loop.
- **Database Safety**: Confirm Mongoose operations route through `DatabaseResilience.js` write-behind cache.
- **Disconnect & Edge State Safety**: Check for race conditions during player disconnects or rapid socket packet bursts.

### Axis 4: Developer Experience (DX) & Maintainability
- **Shotgun Surgery & Coupling**: Check if changing this file requires modifying multiple distant files.
- **Code Duplication & Abstraction**: Identify copy-pasted code or missing helper abstractions.

---

## 3. Performance & Health Audit Report Blueprint

Generate a markdown artifact titled `performance_audit_[filename].md` structured as follows:

```markdown
# ⚡ Performance & Health Audit: [File Name]

## 1. Executive Summary & Health Score
- **Overall Health Score**: 🟢 Good / 🟡 Moderate Risk / 🔴 Critical Bottleneck
- **30Hz Tick Budget Impact**: Estimated $\mu\text{s}$ per tick window (< 33.3ms).
- **Multiplayer Scalability Rating**: Assessment for $N=100+$ concurrent entities.

## 2. Prioritized Issue Breakdown

### P0: Critical Blockers (Loop Freezes / Crashing Risks)
- **Location**: `functionName()` ([`file.js:LXX-LYY`](file:///path/to/file.js#LXX-LYY))
- **Impact**: Detailed explanation of event loop stall or crash mechanism.
- **Proposed Fix (Code Diff)**:
  ```diff
  - // Unoptimized pattern
  + // Optimized pattern
  ```

### P1: High GC / Bandwidth / Scalability Drains
- Breakdown of memory allocations, $O(N^2)$ bottlenecks, or unthrottled socket payloads.

### P2: DX & Maintainability Tech Debt
- Opportunities for decoupling, DRY helper refactoring, and code clarity.

## 3. Benchmark Verification & Test Suite
- **Baseline Command**: `node scripts/benchmark-gameloop.js` or `node scripts/check-performance.js`.
- **Load Test Command**: `npm run test:load` ([`scripts/load_test.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/scripts/load_test.js)).
```

---

## 4. Core Execution Rules
- **Empirical Diagnostics**: Base performance ratings on exact code analysis and benchmark commands.
- **Clickable Links**: All file and symbol references must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
