---
name: file-refactoring-risk-analyzer
description: Evaluates proposed refactors and performance fixes for unintended consequences, downstream breaking changes, performance trade-offs, and state desynchronization in TastyTails.net. Generates a risk mitigation and hardened code implementation report.
---

# TastyTails Refactoring Impact & Risk Mitigation Skill

> **Usage Instruction**: Reference or invoke this skill whenever evaluating proposed code refactors or performance optimizations in **TastyTails.net** for side-effect risks, netcode desync, memory leaks, or breaking changes. Generates a `risk_assessment_[filename].md` report artifact with hardened defensive code diffs and rollback protocols.

---

## 1. TastyTails Specific Risk Audit Vectors

Cross-examine every proposed refactor against these 5 project risk vectors:
1. **Netcode & Input Queue Desync**: Check if throttling input queues or movement steps in [`src/server-loop.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server-loop.js) causes player movement stutter or sliding collision desync in [`src/server/mapConfig.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server/mapConfig.js).
2. **Database Resilience & Memory Overflow**: Check if batching writes in [`DatabaseResilience.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/classes/DatabaseResilience.js) risks buffer overflows during database disconnections (>60s offline buffer threshold).
3. **AOI Grid & Anti-Cheat Occlusion**: Check if altering 400x400 spatial hash buckets or line-of-sight raycasting (`visibility-polygon`) exposes hidden entities to client cheat tools.
4. **Anatomy Engine & Combat Cascade**: Check if modifying damage handlers bypasses limb hitboxes, health thresholds, or medical remedies ([`docs/ANATOMY_FORGE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/ANATOMY_FORGE.md)).
5. **UI & Event Listener Detachment**: Check if restructuring Phaser client components or DOM elements breaks keycap button handlers or design tokens ([`docs/UNIVERSAL_STYLE_GUIDE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/UNIVERSAL_STYLE_GUIDE.md)).

---

## 2. Risk Mitigation & Hardened Code Protocol

1. **Risk Categorization**:
   - 🟢 **Low Risk**: Pure internal refactors with zero contract or timing changes.
   - 🟡 **Medium Risk**: Throttling or caching internal calculations; caller updates required.
   - 🔴 **High Risk**: Altering public APIs, Socket.io packet schemas, main 30Hz loop execution, or Mongoose resilience logic.
2. **High Risk Alert Callout**: Embed a `> [!WARNING]` alert block for any 🔴 High Risk refactor requesting explicit developer confirmation.
3. **Hardened Code Diffs**: Wrap optimizations in defensive assertions, try/catch error boundaries, and state validation checks.
4. **Emergency Rollback Protocol**: Define step-by-step git/reversion commands to back out changes cleanly if issues occur in staging.

---

## 3. Risk Assessment Artifact Blueprint

Generate `risk_assessment_[filename].md` structured as follows:

```markdown
# 🛡️ Refactoring Risk & Mitigation Report: [File Name]

## 1. Executive Risk Matrix
| Proposed Refactor | Risk Level | Potential Side Effect / Regression | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| *[Refactor Description]* | 🟢 Low / 🟡 Med / 🔴 High | *[Desync / GC / Breaking Change]* | *[Defensive Guard / Fallback]* |

## 2. High-Risk Warnings & Clarification Requests
> [!WARNING]
> Highlight any 🔴 High Risk refactors that alter core API contracts, socket event schemas, or main loop timing.

## 3. Hardened Code Implementation Diffs
For each proposed optimization:
- **Proposed Optimization**: What was suggested in Phase 2.
- **Specific Side-Effect Risk**: Impact on netcode, combat, DB cache, or UI.
- **Hardened Code Implementation**:
  ```diff
  - // Unmitigated Phase 2 Pattern
  + // Hardened Phase 3 Implementation with Safety Guards
  ```

## 4. Pre-Merge Safety & Emergency Rollback Plan
- **Automated Tests**: Commands (`npm test`, `node scripts/benchmark-gameloop.js`, `npm run test:load`).
- **Emergency Rollback Commands**: Step-by-step instructions for reverting changes cleanly.
```

---

## 4. Core Execution Rules
- **No Unmitigated High Risks**: Never propose a 🔴 High Risk refactor without a hardened code diff and rollback plan.
- **Clickable Links**: All file and symbol references must use clickable markdown syntax (`[file.js](file:///path/to/file.js#L10)`).
