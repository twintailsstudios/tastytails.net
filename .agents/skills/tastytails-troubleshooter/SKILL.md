---
name: tastytails-troubleshooter
description: Deep-dive root-cause investigator and troubleshooting engine for TastyTails.net. Use whenever debugging, analyzing complex bug reports, performing safety impact audits, or fixing codebase regressions.
---

# TastyTails Technical Troubleshooting & Root-Cause Remediation Skill

> **Usage Instruction**: Reference or activate this skill whenever you need to investigate, troubleshoot, debug, or repair an issue in **TastyTails.net**. It enforces a 5-phase lifecycle: Codebase Investigation → Diagnostic Breakdown Report → Implementation Plan & Comprehensive Safety Impact Audit → Execution & Verification → Diagnostic Logging & Root-Cause Reset Loop.

---

## 1. Project Architecture Reference Map

When investigating issues across TastyTails.net, keep these core systems in mind:
- **Authoritative Server Loop**: 30Hz tick loop (33.3ms frame budget) in [`src/server-loop.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server-loop.js). Input queuing via `inputQueue`, sliding collision logic in [`src/server/mapConfig.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server/mapConfig.js).
- **Spatial Hashing & AOI**: 400px x 400px spatial hash grid buckets. LOD throttling (10Hz vs 30Hz) and line-of-sight raycasting anti-cheat via `visibility-polygon`.
- **Target Anatomy & Combat System**: Individual limb targeting, damage application flow, medical remedies, and anatomical health state transitions ([`docs/ANATOMY_FORGE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/ANATOMY_FORGE.md)).
- **Database Resilience**: Write-behind cache in [`src/classes/DatabaseResilience.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/classes/DatabaseResilience.js) batching Mongoose updates every 30s. Never invoke blocking synchronous DB calls in tick updates.
- **Frontend & UI Design System**: Phaser 3 game client, custom Web Audio/MIDI synthesis, and Universal Style Guide tokens ([`docs/UNIVERSAL_STYLE_GUIDE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/UNIVERSAL_STYLE_GUIDE.md)).
- **Test & Telemetry Infrastructure**:
  - Unit Tests: `npm test`
  - Automated E2E Mechanics Suite: `npm run test:auto`
  - 250-Player Load Simulator: `npm run test:load`
  - Spatial Grid Micro-Benchmark: `npm run bench:loop`
  - Subsystem Stress Suites: `npm run test:cluster`, `npm run test:bottleneck`, `npm run test:memory`, `npm run test:chatterbox`, `npm run test:db`, `npm run test:perf`
  - Server Health Dashboard: Observe live telemetry and trigger in-dashboard test controller at `http://localhost:3000/dashboard.html`

---

## 2. Mandatory 5-Phase Troubleshooting Lifecycle

```
 Phase 1: Deep Codebase Investigation & Mapping
    │
    ▼
 Phase 2: Diagnostic Breakdown Report & Clarification Callouts
    │  (Requires User Approval to Proceed)
    ▼
 Phase 3: Implementation Plan & Comprehensive Safety Impact Audit
    │  (Requires Pre-Execution Safety Audit & User Approval)
    ▼
 Phase 4: Code Execution, Automated Testing & Verification Walkthrough
    │
    ├──► [If Fixed] ──► DONE!
    │
    └──► [If Bug Persists] ──► Phase 5: Diagnostic Logging & Root-Cause Reset Loop
```

---

### PHASE 1: DEEP CODEBASE INVESTIGATION & MAPPING
When presented with a bug report or symptom description (e.g., "there is an issue with how a weapon applies damage to characters"):
1. **Never guess code logic, schemas, or file locations**.
2. Perform code searches using `grep_search` and file inspection to identify **all** code paths, socket events, data structures, item definitions, and UI listeners connected to the issue.
3. Map the complete end-to-end component interaction flow from user interaction/socket packet down to state updates and database writes.
4. Formulate an empirical hypothesis based strictly on authoritative code inspection.

---

### PHASE 2: DIAGNOSTIC BREAKDOWN REPORT & CLARIFICATION ARTIFACT
Create a markdown report artifact named `diagnostic_report.md` structured as follows:

```markdown
# 🔍 Diagnostic Breakdown Report: [Issue Summary]

## 1. Problem Understanding & System Mapping
- Detailed description of the reported symptom and mapped codebase workflow.
- Component Interaction Matrix (showing how affected modules communicate).

## 2. Root Cause Analysis & Potential Triggers
- Primary suspected root cause with clickable file links (`file:///path/to/file.js#LXX`).
- Secondary contributing factors (race conditions, tick budget overruns, unhandled state edge cases, desync).

## 3. Clarifying Questions & Open Ambiguities
> [!IMPORTANT]
> Highlight any underspecified requirements, ambiguities in the user's issue description, or missing domain assumptions here.

## 4. Recommended Fix Strategy & Trade-Offs
- Step-by-step remediation strategy.
- Potential performance or downstream system trade-offs.
```

**Gate Requirement**: Conclude the report by asking:
> *"Would you like me to generate a detailed, step-by-step Implementation Plan to apply the recommended fixes?"*

**STOP and wait for explicit user review and approval before proceeding to Phase 3.**

---

### PHASE 3: IMPLEMENTATION PLAN & COMPREHENSIVE SAFETY IMPACT AUDIT
Upon receiving user approval, create or update `implementation_plan.md` detailing exact file changes, functions to modify, new unit tests to write, and validation procedures.

#### 🛡️ Mandatory Pre-Execution Safety & Feature Regression Audit
Before touching any code, perform a comprehensive safety audit against all surrounding systems and document the results in `implementation_plan.md`:

1. **Frontend UI & Visual Experience**:
   - **Styles & Layout**: Verify that CSS modifications or DOM restructuring do not break global design system tokens ([`docs/UNIVERSAL_STYLE_GUIDE.md`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/docs/UNIVERSAL_STYLE_GUIDE.md)), responsive layouts, or page-specific themes.
   - **Interactive UI & Buttons**: Ensure button IDs, click handlers, modal triggers, and event listeners in UI views (character bank, play page, crafting panel, voice studio) remain fully intact and operational.
2. **Core Gameplay & Feature Safety**:
   - **Movement & Collisions**: Confirm proposed changes do not alter axis-separated sliding collision or tile boundary logic ([`src/server/mapConfig.js`](file:///c:/Users/kkmcl/Documents/GitHub/tastytails.net/src/server/mapConfig.js)).
   - **Player Actions & Systems**: Verify that crafting, inventory management, health/anatomy updates, player-to-player interactions, and zone transitions will operate normally without side effects.
3. **Server Performance & Netcode Safety**:
   - **Tick Budget**: Confirm no blocking synchronous code, expensive loops, or unthrottled I/O operations are introduced that would push server ticks beyond 33.3ms.
   - **Socket Contracts & AOI**: Verify Socket.io payload schemas are preserved and spatial hash visibility filtering remains consistent.
   - **Database Resilience**: Confirm database updates remain routed through `DatabaseResilience.js` write-behind caching without triggering direct synchronous Mongoose saves.

> [!IMPORTANT]
> If any requirements, file locations, existing conventions, or safety audit items reveal ambiguity, embed clarifying questions directly in `implementation_plan.md` using `> [!IMPORTANT]` alerts.

**Gate Requirement**: Present the implementation plan and safety audit to the user and wait for explicit approval to execute.

---

### PHASE 4: EXECUTION, AUTOMATED TESTING & VERIFICATION WALKTHROUGH
Upon user approval of the implementation plan:
1. Apply the precise code modifications using atomic file replacement tools.
2. Run available automated test suites:
   - `npm test` (Mocha unit tests)
   - `npm run test:auto` (automated scenario simulation)
   - `npm run test:load` (if performance or tick rate could be impacted)
3. Create or update `walkthrough.md` summarizing:
   - Code modifications applied (with clickable file links).
   - Automated test execution results.
   - **Step-by-Step Manual Verification Checklist**: Detailed instructions guiding the user on how to manually test both the primary fix AND surrounding features (movement, UI buttons, crafting, combat) to confirm zero regressions.

---

### PHASE 5: DIAGNOSTIC LOGGING & ROOT-CAUSE RESET LOOP (IF BUG PERSISTS)
If the user reports that the issue persists after testing:
1. **Immediate Step-Back**: Do NOT apply ad-hoc blind trial-and-error patches. Reset your diagnostic assumptions and re-evaluate the problem from first principles.
2. **Instrument Targeted Diagnostic Logging**:
   - Inject precision `console.log` / diagnostic tracing instrumentation into key execution paths (socket handlers, tick loops, damage calculators, state sync functions, UI button listeners).
   - Ensure logs include high-resolution timestamps, payload snapshots, entity IDs, and state flags.
3. **User Logging Instructions**:
   - Present specific, clear instructions to the user on what action to trigger and what exact console/server output to copy and paste back into the chat.
4. **Log Analysis & Re-Diagnosis**:
   - Once the user provides the log output, analyze the empirical data to uncover hidden state anomalies, timing issues, or unhandled branches.
   - Create an updated `diagnostic_report.md` explaining:
     - New insights revealed by the diagnostic logs.
     - Why the initial fix was insufficient.
     - The updated root cause and proposed new fixes.
5. Proceed back through Phase 3 (Implementation Plan & Safety Audit → Approval → Execution → Verification Walkthrough).

---

## 3. Core Execution Rules
- **No Symptom Masking**: Never swallow exceptions or return dummy defaults to mask bugs.
- **Preserve Contracts & Features**: Preserving UI button listeners, CSS design tokens, gameplay mechanics, API contracts, and tick loop budgets is mandatory.
- **Clickable Markdown Links**: Always include clickable markdown links for all modified files using standard file URI notation (`[basename.js](file:///path/to/basename.js#L10)`).
