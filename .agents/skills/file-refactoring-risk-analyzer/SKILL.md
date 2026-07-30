---
name: file-refactoring-risk-analyzer
description: Evaluates proposed refactors and performance fixes for unintended consequences, downstream breaking changes, performance trade-offs, and state desynchronization. Generates a risk mitigation and hardened code implementation report.
---

# Refactoring Impact & Risk Mitigation Analyzer

This skill guides the agent in conducting a safety and side-effect risk assessment on optimizations proposed during Phase 2 (`file-performance-health-auditor`).

It ensures that performance enhancements, tick throttling, caching, or code refactors do not accidentally break existing contracts, introduce stale state, create memory leaks, or degrade performance elsewhere in the system.

---

### Step 1: Input Gathering & Context Review

1. Identify the target file path.
2. Read the target file using `view_file`.
3. Read or synthesize the context from:
   - Phase 1: **Onboarding Guide** (`file-onboarding-analyzer`)
   - Phase 2: **Performance & Health Audit** (`file-performance-health-auditor`)

---

### Step 2: Active Side-Effect & Downstream Risk Audit

Cross-examine every proposed change against the workspace using `grep_search` and code inspection:

#### 1. Downstream Contract & Breaking Changes
- Will changing a signature, type, or object schema break dependent files?
- Are callers expecting synchronous returns where async/batched logic was introduced?

#### 2. Timing, Latency & State Synchronization Trade-offs
- **Throttling/Staggering**: Does reducing tick rates introduce client visual lag, input delay, or out-of-order state updates?
- **Caching**: Does caching calculations or DB results introduce stale data bugs or memory leaks over time?
- **Batching**: Does queuing writes or socket broadcasts delay critical game events (e.g. health updates, combat, room transitions)?

#### 3. Concurrency & Edge-Case Hazards
- Do async queue refactors introduce race conditions during rapid player movement, disconnections, or simultaneous DB flushes?
- Are fallbacks in place if a cached value becomes invalid?

---

### Step 3: Produce the Risk Assessment & Mitigation Report

Generate a Markdown artifact titled `risk_assessment_[filename].md` formatted as follows:

```markdown
# Refactoring Impact & Risk Assessment: [File Name]

## 1. Executive Risk Matrix
| Proposed Refactor (Phase 2) | Risk Level | Unintended Consequence | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| *[Refactor Description]* | 🟢 Low / 🟡 Med / 🔴 High | *[Side Effect / Regression Risk]* | *[Mitigation Strategy]* |

## 2. Detailed Side-Effect Analysis & Hardened Code Diffs
For each proposed change:
- **Phase 2 Refactor**: What was suggested.
- **Potential Unintended Consequence**: Downstream impact or degradation risk.
- **Affected Subsystems**: Files or callers at risk.
- **Hardened Code Implementation**: Refined code diff that keeps the performance gains while eliminating side-effect risks.

```diff
- // Unmitigated Phase 2 Change
+ // Hardened Phase 3 Implementation with Safeguards
```

## 3. Pre-Merge Safety Checklist & Regression Verification
- **Automated Verification**: Specific test scripts or commands (`npm test`, `npm run test:load`) to run before merging.
- **Manual QA Checklist**: Specific edge-case scenarios to test manually.
```
