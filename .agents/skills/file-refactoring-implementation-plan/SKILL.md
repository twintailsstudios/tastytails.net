---
name: file-refactoring-implementation-plan
description: Synthesizes findings from Phase 1, Phase 2, and Phase 3 along with developer comments to generate an actionable, step-by-step implementation plan for executing code refactors and optimizations.
---

# Refactoring Implementation Plan Synthesizer

This skill guides the agent in synthesizing the reports from Phase 1 (`file-onboarding-analyzer`), Phase 2 (`file-performance-health-auditor`), and Phase 3 (`file-refactoring-risk-analyzer`), together with any developer feedback or inline comments, into a step-by-step **Implementation Plan**.

---

### Step 1: Input & Developer Feedback Synthesis

1. Identify the target file path.
2. Read the target file using `view_file`.
3. Gather and synthesize:
   - Developer comments or feedback on previous reports.
   - Phase 1 Onboarding Guide.
   - Phase 2 Performance Audit.
   - Phase 3 Risk Assessment & Hardened Diffs.

---

### Step 2: Implementation Sequencing Protocol

1. **Incorporate Developer Decisions**: Exclude any Phase 2/3 suggestions explicitly rejected in developer feedback. Prioritize developer-requested modifications.
2. **Sequence Changes**:
   - Step 1: Core abstractions, type updates, and safety guards.
   - Step 2: Main file performance refactoring (hot loops, GC allocation pooling, throttling).
   - Step 3: Downstream caller updates across dependent files.
3. **Attach Empirical Verification**: Include exact diagnostic commands (`npm test`, `npm run test:load`) after each execution step.

---

### Step 3: Produce the Implementation Plan

Generate a Markdown artifact titled `implementation_plan_[filename].md` formatted as follows:

```markdown
# Implementation Plan: Refactoring [File Name]

Synthesizing Phase 1 (Onboarding), Phase 2 (Performance Audit), Phase 3 (Risk Mitigation), and Developer Feedback.

## Developer Feedback & Guidance Incorporated
- **Approved Refactors**: List of accepted performance & DX fixes.
- **Developer Directives**: Notes on overrides, adjustments, or rejections from comments.

## Proposed Code Changes

### [Component / Module Name]
#### [MODIFY] [file basename](file:///absolute/path/to/targetfile)
#### [MODIFY / NEW] [file basename](file:///absolute/path/to/dependentfile)

## Execution Milestones

### Milestone 1: Foundational Abstractions & Safety Guards
- [ ] Implement reusable data structures or helper functions.
- [ ] Add defensive error handling and fallbacks.

### Milestone 2: Core File Refactoring
- [ ] Refactor hot loops, memory allocations, and execution frequencies.
- [ ] Re-organize code for DRY reusability and developer ergonomics.

### Milestone 3: Downstream System Sync
- [ ] Update callers in dependent files to align with refactored interfaces.

## Verification & Quality Assurance
- **Automated Benchmarks**: Commands to execute (`npm test`, `npm run test:load`).
- **Target Metrics**: Specific latency/tick duration goals.
```
