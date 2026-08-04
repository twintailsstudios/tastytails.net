---
name: file-refactoring-verifier-and-annotator
description: Verifies refactored code using automated tests and load scripts, applies rich JSDoc/inline developer annotations to the target file, and produces a final Walkthrough report.
---

# TastyTails Refactoring Verifier & Developer Annotator Skill

> **Usage Instruction**: Reference or invoke this skill whenever completing a code refactor in **TastyTails.net**. Executes empirical test suites (`npm test`, `npm run test:auto`, `npm run test:load`), applies rich TastyTails JSDoc annotations and inline rationale comments, and generates a `walkthrough_[filename].md` artifact.

---

## 1. Mandatory Empirical Verification Protocol

Run the project verification commands:
1. **Unit Tests**: `npm test` (Mocha test suite passes 100%).
2. **Scenario Simulation**: `npm run test:auto` (automated scenario simulation passes).
3. **Load & Stress Tests**: `npm run test:load` (250-player capacity load test).
4. **Spatial Grid Micro-Benchmark**: `npm run bench:loop` (tick duration < 33.3ms).
5. **Targeted Subsystem Verification**:
   - Cluster Storm: `npm run test:cluster`
   - Taxonomy & Scaling: `npm run test:bottleneck`
   - Memory Leak & GC: `npm run test:memory`
   - Serialization & Bandwidth: `npm run test:chatterbox`
   - Database Write-Behind: `npm run test:db`
   - CI Performance Baseline: `npm run test:perf`
6. **Dashboard Verification**: Confirm live telemetry updates at `http://localhost:3000/dashboard.html`.

---

## 2. TastyTails Developer Annotation Standard

Apply rich JSDoc and inline rationale comments directly to the target file:

### 1. File Header JSDoc
```javascript
/**
 * @fileoverview [File Name] - [Brief Purpose]
 * @subsystem [Server Engine / Netcode / Combat / Database / UI]
 * @tickBudget [Budgeted microsecond execution cost per frame]
 * @socketEvent [Socket packet names emitted/received, if applicable]
 * @databaseResilience [Cached in DatabaseResilience.js write-behind buffer]
 */
```

### 2. Method JSDoc & Optimization Rationale
```javascript
/**
 * [Function Purpose]
 * @param {Type} paramName - Parameter description
 * @returns {Type} Return value description
 */

// OPTIMIZATION (30Hz Loop): Pre-allocated array pool to prevent Garbage Collection stutter.
```

---

## 3. Walkthrough Artifact Blueprint

Generate `walkthrough_[filename].md` structured as follows:

```markdown
# 🚀 Walkthrough: Refactored [File Name]

## 1. Empirical Verification Summary
- **Status**: 🟢 Passed All Verification Gates
- **Automated Unit Tests**: Passed `npm test`
- **Scenario Simulation**: Passed `npm run test:auto`
- **Load & Stress Tests**: Passed `npm run test:load`

### Empirical Performance Comparison
| Metric | Baseline | Refactored | Target Goal | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Avg Tick Duration** | | | $\le 20\text{ ms}$ | 🟢 Pass |
| **Peak Tick Duration** | | | $\le 33.3\text{ ms}$ | 🟢 Pass |

## 2. Code Annotations & File Links Applied
- **Target File**: [`file.js`](file:///path/to/targetfile#L1-L100)
- **Applied Annotations**: TastyTails JSDoc headers, custom `@subsystem` tags, and inline optimization comments.

## 3. Manual Feature Verification Checklist
- [ ] **Movement & Sliding Collision**: Test diagonal movement along walls.
- [ ] **UI & Keycap Buttons**: Test button press animations and click handlers.
- [ ] **Combat & Target Anatomy**: Verify hitboxes and health updates.
- [ ] **Crafting & Inventory**: Test item creation and storage.
```

---

## 4. Core Execution Rules
- **Clean Up Debug Statements**: Remove temporary debug `console.log` statements before finalizing annotations.
- **Clickable Links**: All file and symbol references must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
