---
name: file-refactoring-implementation-plan
description: Synthesizes findings from Phase 1, Phase 2, and Phase 3 along with developer comments to generate an actionable, step-by-step implementation plan for executing code refactors and optimizations in TastyTails.net.
---

# TastyTails Refactoring Implementation Plan Synthesizer Skill

> **Usage Instruction**: Reference or invoke this skill whenever synthesizing Phase 1 (Onboarding), Phase 2 (Performance Audit), Phase 3 (Risk Analysis), and developer feedback into a milestone-driven `implementation_plan_[filename].md` artifact for **TastyTails.net**.

---

## 1. Synthesis & Sequencing Protocol

### Step 1: Input Gathering & Developer Feedback Integration
1. Read target file completely using `view_file`.
2. Gather developer feedback, approved refactors, and rejected proposals.
3. Audit for underspecified requirements or architectural ambiguities.

### Step 2: Contract & Interface Migration Mapping
Map all function signatures, Socket.io event schemas, or Mongoose model changes being modified:
- Identify every downstream caller file in the workspace using `grep_search`.
- Ensure changes preserve API backward compatibility or schedule caller updates in Milestone 3.

### Step 3: Milestone Sequencing with Verification Gates
Structure implementation into 3 ordered milestones:
- **Milestone 1: Foundational Abstractions & Defensive Guards**:
  - Reusable helpers, memory pools, type guards.
  - *Verification Gate*: Run `npm test` (unit tests pass 100%).
- **Milestone 2: Core Refactoring & Performance Optimizations**:
  - Refactor hot loops, GC allocations, 30Hz tick throttling, and `DatabaseResilience.js` cache routing.
  - *Verification Gate*: Run `node scripts/benchmark-gameloop.js` (tick duration < 33.3ms).
- **Milestone 3: Downstream Caller Sync & Regression Check**:
  - Update all caller sites across dependent workspace files.
  - *Verification Gate*: Run `npm run test:auto` & `npm run test:load`.

---

## 2. Implementation Plan Artifact Blueprint

Generate `implementation_plan_[filename].md` structured as follows:

```markdown
# 🛠️ Implementation Plan: Refactoring [File Name]

## 1. Developer Directives & Feedback Incorporated
- **Approved Refactors**: Accepted performance & DX fixes.
- **Developer Overrides**: Rejected proposals or custom developer guidelines.

## 2. Clarifying Questions & Open Ambiguities
> [!IMPORTANT]
> Highlight any underspecified requirements, breaking schema changes, or design choices requiring developer review before execution.

## 3. Pre-Execution Safety & Regression Audit
- **UI & Styles**: Confirms design tokens ([`docs/UNIVERSAL_STYLE_GUIDE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/UNIVERSAL_STYLE_GUIDE.md)) and button handlers are preserved.
- **Gameplay & Mechanics**: Confirms sliding collision ([`src/server/mapConfig.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server/mapConfig.js)), combat, and crafting operate without side effects.
- **Server & Netcode**: Confirms 30Hz loop budget (< 33.3ms) and write-behind cache ([`DatabaseResilience.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/classes/DatabaseResilience.js)) compliance.

## 4. API & Socket Schema Contract Mapping
| Symbol / Socket Event | Changes | Downstream Caller Files |
| :--- | :--- | :--- |
| `functionName()` ([`file.js:LXX`](file:///path/to/file.js#LXX)) | Add parameter `delta` | [`caller.js`](file:///path/to/caller.js#LYY) |

## 5. Milestone Execution Plan & Verification Gates

### Milestone 1: Foundational Abstractions & Safety Guards
- [ ] Implement memory pools or helper utilities.
- **Verification Gate**: `npm test`

### Milestone 2: Core File Refactoring
- [ ] Refactor hot loops and memory allocations.
- **Verification Gate**: `node scripts/benchmark-gameloop.js`

### Milestone 3: Downstream System Sync
- [ ] Update callers across dependent workspace files.
- **Verification Gate**: `npm run test:auto` & `npm run test:load`
```

---

## 3. Core Execution Rules
- **No Unverifiable Milestones**: Every milestone must have a clear automated verification command.
- **Clickable Links**: All file and symbol references must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
