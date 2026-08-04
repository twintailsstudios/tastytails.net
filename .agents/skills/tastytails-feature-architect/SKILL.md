---
name: tastytails-feature-architect
description: Comprehensive feature design, brainstorming, architectural planning, safety auditing, execution, and developer annotation engine for building new features in TastyTails.net.
---

# TastyTails Feature Architect & Innovation Skill

> **Usage Instruction**: Reference or activate this skill whenever you want to design, build, and implement a brand new feature or system in **TastyTails.net** (e.g. *"I want to create a new feature where players can play Blackjack with each other in the tavern"*). It enforces an 8-phase lifecycle from deep codebase research and creative brainstorming to safety audits, execution, verification, troubleshooting fallback, and final developer code annotation.

---

## 1. Project Architecture Reference Map

When designing and building new features for TastyTails.net, keep these core systems in mind:
- **Authoritative Server Loop**: 30Hz tick loop (33.3ms frame budget) in [`src/server-loop.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server-loop.js). New features must sync via Socket.io events and remain within frame budgets.
- **Spatial Hashing & AOI**: 400px x 400px spatial hash grid buckets for entity observation. LOD throttling (10Hz vs 30Hz) and raycast line-of-sight anti-cheat via `visibility-polygon`.
- **Target Anatomy & Combat Engine**: Individual limb hitboxes, health states, damage flow, and medical remedies ([`docs/ANATOMY_FORGE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/ANATOMY_FORGE.md)).
- **Database Resilience**: Mongoose write-behind cache in [`src/classes/DatabaseResilience.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/classes/DatabaseResilience.js) batching updates every 30s. Never invoke blocking synchronous DB saves inside tick updates or rapid socket handlers.
- **Frontend & UI Design System**: Phaser 3 game client, custom Web Audio/MIDI synthesis, and Universal Style Guide tokens ([`docs/UNIVERSAL_STYLE_GUIDE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/UNIVERSAL_STYLE_GUIDE.md)).
- **Test Infrastructure**: Unit tests (`npm test`), Load testing (`npm run test:load`), Automated scenario testing (`npm run test:auto`), and benchmark scripts in `scripts/`.

---

## 2. Mandatory 8-Phase Feature Development Lifecycle

```
 Phase 1: Deep Codebase Research & Context Alignment
    │
    ▼
 Phase 2: Creative Brainstorming & Feature Concept Expansion
    │
    ▼
 Phase 3: Feature Concept Report & Clarification Artifact
    │  (Requires User Review & Feedback)
    ▼
 Phase 4: Implementation Plan, Safety Audit & DX Extensibility Check
    │  (Requires User Approval)
    ▼
 Phase 5: Feature Execution & Automated Testing
    │
    ▼
 Phase 6: Verification Walkthrough & Manual Test Guide
    │
    ├──► [If Bugs/Issues Reported] ──► Phase 7: Seamless Troubleshooting Handoff
    │                                  (Uses tastytails-troubleshooter skill)
    ▼
 Phase 8: Developer Annotations & Code Documentation Polish
```

---

### PHASE 1: DEEP CODEBASE RESEARCH & CONTEXT ALIGNMENT
When requested to build a new feature (e.g. "I want to add a multiplayer Blackjack card game"):
1. **Explore the Codebase**: Perform thorough code searches using `grep_search` and file inspection across server scripts, client components, Socket.io event registries, Mongoose schemas, and UI views.
2. **Understand Existing Patterns**: Identify existing game state machines, player interactions, modal overlays, item systems, and network packet handlers so the new feature integrates naturally into existing architecture.

---

### PHASE 2: CREATIVE BRAINSTORMING & FEATURE CONCEPT EXPANSION
1. **Analyze Core Spirit**: Understand the overarching goal and fantasy of the requested feature.
2. **Think Outside the Box**: Brainstorm creative enhancements, micro-interactions, visual polish, audio cues, or gameplay mechanics that elevate the initial idea. (e.g. For Blackjack: tavern table UI overlays, chip betting systems, card-flip Web Audio sound effects, chat reaction emotes, or score tracking).

---

### PHASE 3: FEATURE CONCEPT REPORT & CLARIFICATION ARTIFACT
Generate a markdown report artifact named `feature_concept_report.md` structured as follows:

```markdown
# 💡 Feature Concept Report: [Feature Name]

## 1. Feature Goal & Core Mechanics Understanding
- Detailed summary of the requested feature and how it fits into TastyTails.net.

## 2. Creative Brainstorming & Enhancements
- Recommended feature additions and creative polish ideas to elevate the concept.
- UI/UX mockups, visual layouts, and audio/interaction suggestions.

## 3. Clarifying Questions & Open Ambiguities
> [!IMPORTANT]
> Highlight any underspecified requirements, missing rules, edge-case behaviors, or architectural decisions requiring user clarification.

## 4. Proposed Architectural Blueprint
- Client-server event flow diagram (Socket.io packets, server state machine, UI panels).
- Data model extensions (Mongoose schemas or write-behind cache updates).
```

**Gate Requirement**: End the report by asking for user feedback on the concept, recommendations, and clarifying questions before moving to Phase 4.

---

### PHASE 4: IMPLEMENTATION PLAN, SAFETY AUDIT & DX EXTENSIBILITY CHECK
Upon receiving user feedback on the concept report, create `implementation_plan.md` outlining a step-by-step development strategy.

#### 🛡️ Mandatory Safety, Performance & DX Extensibility Audit
Before writing code, evaluate the implementation plan against three critical pillars:

1. **Server & Performance Safety**:
   - Authoritative server validation for all game logic to prevent client-side cheating.
   - Maintain 30Hz loop tick budget (< 33.3ms). Route database operations through `DatabaseResilience.js` write-behind cache.
2. **Feature Regression Prevention**:
   - Ensure new socket handlers, UI components, or stylesheets do NOT break existing features (movement, combat, anatomy engine, crafting, UI buttons, design tokens).
3. **Developer Experience (DX) & Extensibility**:
   - Code MUST be modular, decoupled, clean, and easily extensible.
   - Design state machines and data structures so future developers can easily add new card games, items, or interactions without refactoring core logic.

> [!IMPORTANT]
> Include any final clarifying questions regarding file structures, API contracts, or edge cases directly in `implementation_plan.md` using `> [!IMPORTANT]` alerts.

**Gate Requirement**: Present the implementation plan to the user and wait for explicit approval to execute.

---

### PHASE 5: FEATURE EXECUTION & AUTOMATED TESTING
Upon user approval:
1. Build out the feature modularly, starting from core data models and server handlers to frontend UI components and Socket.io event listeners.
2. Run available automated test suites (`npm test`, `npm run test:auto`, `npm run test:load`) to verify system stability.

---

### PHASE 6: VERIFICATION WALKTHROUGH & MANUAL TEST GUIDE
Create or update `walkthrough.md` detailing:
- Summary of new components, socket events, and UI panels built (with clickable file links).
- Automated test execution results.
- **Step-by-Step Manual Testing Guide**: Clear instructions for testing the new feature in-game, verifying edge cases, and checking UI interactions.

---

### PHASE 7: SEAMLESS TROUBLESHOOTING HANDOFF (IF ISSUES ARISE)
If the user reports any bugs, regressions, or unexpected behaviors during testing:
1. Seamlessly activate the **`tastytails-troubleshooter`** skill while preserving all conversation context, architectural decisions, and feature reports.
2. Execute the 5-phase troubleshooting lifecycle: Diagnostic Report → Implementation Plan & Safety Audit → Targeted Console Logging → Fix Execution.

---

### PHASE 8: DEVELOPER ANNOTATIONS & CODE DOCUMENTATION POLISH
Once the feature is fully verified working by the user:
1. Review all created and modified source files.
2. Apply rich, clean JSDoc headers, function signatures, and inline developer comments explaining:
   - Module responsibilities and socket event payload contracts.
   - State transition rules and network sync logic.
   - Guidance for future developers on how to extend or customize the feature.

---

## 3. Core Execution Rules
- **Authoritative Validation**: Never trust client inputs for game state calculations or currency/game updates.
- **Modular & Extensible Code**: Prioritize clean abstractions and modular files over monolithic scripts.
- **Clickable Markdown Links**: Use standard markdown file links for all references (`[basename.js](file:///path/to/basename.js#L10)`).
