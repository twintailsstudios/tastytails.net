---
name: file-onboarding-analyzer
description: Deep-dive analysis and reverse engineering of a single file in the project. Traces incoming triggers, internal execution logic, design rationale, upstream/downstream dependencies, and generates a developer onboarding guide artifact.
---

# File Onboarding & Deep-Dive Analyzer

This skill guides the agent in conducting an exhaustive, file-by-file reverse-engineering audit for any specified file in the repository. The end product is an easy-to-read, comprehensive **Developer Onboarding Guide** created as an artifact in the user's workspace, intended to allow a new developer to instantly understand, modify, and build upon that file.

---

### Step 1: Target Identification & Inspection

1. Determine the target file path provided by the user (or prompt for one if not specified).
2. Open and read the complete contents of the target file using `view_file`.
3. Audit every exported function, class, type definition, state variable, interface, and side effect within the file.

---

### Step 2: Trigger & Call Graph Investigation

Use search tools (`grep_search`) across the workspace to map how the file interacts with the rest of the application:

1. **Incoming Triggers**: Search for calls to exported functions/classes from the target file.
   - What events, HTTP endpoints, WebSocket packet handlers, timers, or parent lifecycle hooks trigger execution in this file?
   - Trace the call stack from the initial system entry point down into this target file.
2. **Upstream Dependencies**: Examine all `import` or `require` statements.
   - What services, utilities, database models, or external libraries does this file rely on?
3. **Downstream Dependents**: Identify every file across the workspace that imports or references this target file.

---

### Step 3: Architectural Rationale & Design Patterns

Analyze **why** the file is designed the way it is:
- **Design Patterns**: Identify structural/behavioral patterns (e.g., Singleton, Middleware, Observer, Pub/Sub, Factory, State Machine).
- **Design Rationale**: Explain non-obvious design choices (e.g., why async queues are used over direct writes, why state is cached locally, batching, thread safety, or performance optimizations).

---

### Step 4: Produce the Developer Onboarding Guide

Generate a structured Markdown artifact titled `onboarding_guide_[filename].md` with the following standard sections:

```markdown
# Onboarding Guide: [File Name]

## 1. TL;DR & Mental Model
- **Primary Goal**: High-level explanation (2–3 sentences) of what this file accomplishes.
- **Key Responsibilities**: Top 3–5 core responsibilities.
- **Mental Model**: Intuitive analogy or summary of how a developer should conceptualize this file.

## 2. Architecture & Call Flow
- **Triggers**: What events, requests, or schedules invoke this file?
- **Entry Points**: Primary public functions, classes, or exported methods.
- **Data & Control Flow**:
  `[Trigger Event / Upstream File]` ➡️ `[Public Method in Target]` ➡️ `[Internal Logic]` ➡️ `[Downstream Side Effect]`

## 3. Code & Component Breakdown
Detail key classes, functions, and structures:
- **`functionOrClassName()`**:
  - **Purpose**: What it does.
  - **Inputs & Outputs**: Parameter types and return values.
  - **Key Logic**: Summary of algorithms, mutations, or async flows.

## 4. Upstream & Downstream Dependencies
| Direction | File / Module | Purpose / Relationship |
| :--- | :--- | :--- |
| **Upstream** (Imports) | `[File Path]` | Uses `[utility/service]` to perform `[action]` |
| **Downstream** (Dependents) | `[File Path]` | Invokes `[target function]` when `[event]` occurs |

## 5. Architectural Rationale & Design Patterns
- **Design Patterns**: List patterns used.
- **Why It's Built This Way**: Design trade-offs, performance reasons, or concurrency considerations.

## 6. Developer Cheat Sheet (How to Modify & Extend)
- **How to Add Features**: Step-by-step guide for common extensions.
- **Edge Cases & Gotchas**: 2–4 potential traps, concurrency assumptions, or state bugs to watch out for.
- **Test Coverage**: Locations of unit, integration, or diagnostic tests for this file.
```
