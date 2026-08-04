---
name: file-refactoring-orchestrator
description: Master orchestrator skill that executes the complete 5-phase file refactoring pipeline (Onboarding → Performance Audit → Risk Analysis → Implementation Plan → Verifier & Annotator) with phase gates for developer review.
---

# TastyTails 5-Phase Refactoring Pipeline Orchestrator

> **Usage Instruction**: Invoke or reference this master skill whenever you want to conduct an end-to-end, fully verified refactor of a single file in **TastyTails.net** (e.g. *"Run the refactoring orchestrator on `src/server-loop.js`"*). It automatically executes Phase 1 through Phase 5 in order, pausing at each phase gate for developer review and feedback.

---

## 🔄 The 5-Phase Pipeline Lifecycle & Data Flow

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ PHASE 1: file-onboarding-analyzer                                       │
 │ Outputs: onboarding_guide_[filename].md                                 │
 │ Context: Subsystem tagging, Mermaid call graphs, symbols & triggers     │
 └───────────────────────────────────┬─────────────────────────────────────┘
                                     │ (Developer Review Gate 1)
                                     ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ PHASE 2: file-performance-health-auditor                                │
 │ Inputs: Target File + onboarding_guide_[filename].md                    │
 │ Outputs: performance_audit_[filename].md                                │
 │ Context: 30Hz tick budget (<33.3ms), GC allocations, P0/P1/P2 diffs     │
 └───────────────────────────────────┬─────────────────────────────────────┘
                                     │ (Developer Review Gate 2)
                                     ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ PHASE 3: file-refactoring-risk-analyzer                                 │
 │ Inputs: Target File + Onboarding Guide + Performance Audit              │
 │ Outputs: risk_assessment_[filename].md                                  │
 │ Context: TastyTails risk vectors, > [!WARNING] callouts, hardened diffs │
 └───────────────────────────────────┬─────────────────────────────────────┘
                                     │ (Developer Review Gate 3)
                                     ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ PHASE 4: file-refactoring-implementation-plan                           │
 │ Inputs: Target File + Onboarding + Audit + Risk + Developer Comments    │
 │ Outputs: implementation_plan_[filename].md                              │
 │ Context: Milestone sequencing, Verification Gates, Pre-flight safety    │
 └───────────────────────────────────┬─────────────────────────────────────┘
                                     │ (Developer Approval Gate 4)
                                     ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ PHASE 5: file-refactoring-verifier-and-annotator                        │
 │ Inputs: Target File + Approved Implementation Plan                      │
 │ Outputs: Code edits, JSDoc/inline annotations, walkthrough_[filename].md │
 │ Context: Test execution (npm test, test:auto, test:load), Walkthrough   │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Step-by-Step Orchestration Protocol

When launched on a target file (e.g. `src/server-loop.js`):

### PHASE 1: ONBOARDING & MAP GENERATION
1. Activate skill **`file-onboarding-analyzer`**.
2. Inspect the target file, map symbols, incoming triggers, and downstream dependents.
3. Generate the artifact **`onboarding_guide_[filename].md`**.
4. **Phase Gate 1**: Present the Onboarding Guide to the developer and ask:
   > *"Phase 1 Complete. Please review the Onboarding Guide. Would you like me to proceed to Phase 2: Performance & Health Audit?"*

---

### PHASE 2: PERFORMANCE & SCALABILITY AUDIT
1. Upon developer approval, activate skill **`file-performance-health-auditor`**.
2. Consume the target file and `onboarding_guide_[filename].md`.
3. Audit against the 30Hz main tick budget (<33.3ms), memory GC allocations, netcode payload sizes, and `DatabaseResilience.js` cache routing.
4. **Mandatory Pre-Refactor Baseline Protocol**:
   - Run baseline benchmarks using the appropriate test harness before making changes (`npm run bench:loop`, `npm run test:perf`, `npm run test:load`, `npm run test:cluster`, `npm run test:bottleneck`, `npm run test:memory`, `npm run test:chatterbox`, `npm run test:db`).
   - Monitor `http://localhost:3000/dashboard.html` for real-time telemetry observation.
5. Generate the artifact **`performance_audit_[filename].md`** with pre-refactor baseline measurements and P0/P1/P2 diffs.
6. **Phase Gate 2**: Present the Performance Audit to the developer and ask:
   > *"Phase 2 Complete. Please review the Performance Audit. Would you like me to proceed to Phase 3: Risk Assessment & Mitigation?"*

---

### PHASE 3: RISK ASSESSMENT & MITIGATION
1. Upon developer approval, activate skill **`file-refactoring-risk-analyzer`**.
2. Consume the target file, Onboarding Guide, and Performance Audit.
3. Cross-examine optimizations against TastyTails risk vectors (netcode desync, write-behind cache memory overflow, AOI occlusion leak, anatomy damage integrity, UI event detachment).
4. Generate the artifact **`risk_assessment_[filename].md`** with hardened code diffs, `> [!WARNING]` callouts, and rollback commands.
5. **Phase Gate 3**: Present the Risk Assessment to the developer and ask:
   > *"Phase 3 Complete. Please review the Risk Assessment. Would you like me to synthesize these reports into Phase 4: Implementation Plan?"*

---

### PHASE 4: IMPLEMENTATION PLAN SYNTHESIS
1. Upon developer approval, activate skill **`file-refactoring-implementation-plan`**.
2. Synthesize Phase 1, Phase 2, Phase 3 outputs along with all developer comments and overrides.
3. Map API/Socket contract changes and define milestones with strict Verification Gates.
4. Perform the Pre-Execution Safety & Feature Regression Audit.
5. Generate the artifact **`implementation_plan_[filename].md`**.
6. **Phase Gate 4**: Present the Implementation Plan to the developer and ask:
   > *"Phase 4 Complete. Please review the Implementation Plan. Once approved, I will execute the code changes, run automated test suites, apply JSDoc annotations, and generate the final Walkthrough."*

---

### PHASE 5: EXECUTION, TEST VERIFICATION & CODE ANNOTATION
1. Upon receiving explicit developer approval of the plan, activate skill **`file-refactoring-verifier-and-annotator`**.
2. Apply code modifications using atomic file replacement tools.
3. **Mandatory Post-Refactor Comparative Verification Protocol**:
   - Execute identical benchmark test suites post-refactor (`npm run bench:loop`, `npm run test:load`, `npm run test:auto`, `npm run test:perf`).
   - Compare post-refactor metrics against Phase 2 pre-refactor baselines to verify performance improvements and zero regressions.
   - Confirm telemetry updates on `http://localhost:3000/dashboard.html`.
4. Apply TastyTails JSDoc headers (`@subsystem`, `@tickBudget`, `@socketEvent`, `@databaseResilience`) and inline optimization comments.
5. Generate the final artifact **`walkthrough_[filename].md`** with empirical baseline vs refactored metric comparison tables and manual QA checklists.

---

## 4. Core Execution Rules
- **Respect Phase Gates**: NEVER leap ahead to code execution without explicit developer approval at Phase Gate 4.
- **Continuous Context Flow**: Ensure each phase reads and builds directly upon the markdown artifacts generated by previous phases.
- **Clickable Links**: All file and symbol references across all artifacts must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
