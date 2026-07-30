---
name: file-performance-health-auditor
description: Performs an in-depth audit of a single file for CPU/Memory performance, high-player scalability, race conditions, network payload efficiency, and developer maintainability (DX). Generates a prioritized refactoring and health report.
---

# File Performance, Scalability & Health Auditor

This skill guides the agent in conducting a rigorous performance, scalability, and code maintainability audit on a target file (building upon its **File Onboarding Guide**).

It searches for CPU bottlenecks, memory allocations in hot loops, high-concurrency player scaling risks, race conditions, DOM/render thrashing, and code smells that hinder developer efficiency.

---

### Step 1: Input Context Gathering

1. Identify the target file path.
2. Read the target file completely using `view_file`.
3. Locate or generate the file's **Onboarding Guide** (using the `file-onboarding-analyzer` skill if not already present) to understand caller context and system execution frequency.

---

### Step 2: Active Code Audit Checklist

Examine the code across four critical technical axes:

#### 1. Performance & Memory Efficiency (Hot Loops & Tick Rates)
- **Invocation Frequency**: Is this function called per frame, per tick, or on demand? Is invocation frequency higher than necessary? Can execution be throttled, staggered, or debounced?
- **Memory Allocations in Hot Loops**: Check for object allocations (`new Vector()`, array mappings/filters, closures) inside game ticks or tight loops that trigger Garbage Collection (GC) pauses.
- **CPU Bottlenecks**: Identify $O(N^2)$ nested loops, redundant mathematical calculations, un-memoized lookups, or unoptimized spatial partitioning.
- **Client Render / DOM Overhead**: Check for un-batched DOM mutations, layout thrashing, or redundant scene redrawing.

#### 2. High-Player Scalability & Concurrency
- **Scale Under Load**: Analyze how memory, CPU, and network usage scale when entity or player counts increase (100 ➡️ 500 ➡️ 2000 concurrent entities).
- **Network Serialization Payload**: Check if full state objects are being serialized over WebSocket/HTTP instead of lightweight delta payloads.
- **Race Conditions & Concurrency**: Audit asynchronous handlers for non-atomic state updates, out-of-order execution, or socket disconnect race conditions.

#### 3. Reliability & Resilience
- **Error Isolation**: Ensure isolated entity failures (e.g. bad data) do not crash the entire loop or server process.
- **Edge Cases**: Check null/undefined dereferencing, out-of-bounds index access, and unhandled promise rejections.

#### 4. Developer Experience (DX) & Maintainability
- **Shotgun Surgery Risks**: Does extending this file require modifying multiple distant files? How can logic be encapsulated?
- **DRY & Reusability**: Identify copy-pasted code or missed abstraction opportunities.
- **Readability**: Identify overly complex or bloated functions that should be refactored into smaller helpers.

---

### Step 3: Produce the Performance & Health Audit Report

Generate a Markdown artifact titled `performance_audit_[filename].md` formatted as follows:

```markdown
# Performance & Health Audit: [File Name]

## 1. Executive Health Summary
- **Overall Health Score**: 🟢 Good / 🟡 Moderate Risk / 🔴 Critical Bottleneck
- **Top High-Impact Issues**: Key vulnerabilities summarized in 2–3 bullets.
- **Multiplayer Scalability Assessment**: How well this file holds up under high player count.

## 2. Performance & Scaling Bottlenecks
For each issue:
- **Location**: `functionName()` (Lines X-Y)
- **Category**: [CPU / Memory & GC / Network / Scaling / Render]
- **Problem**: Explanation of overhead or bottleneck under load.
- **Proposed Refactor (with Code Diff)**:

```diff
- // Unoptimized pattern
+ // Optimized pattern
```

## 3. Reliability & Edge Case Audit
- **Race Conditions & Concurrency Risks**: Async or concurrency bugs.
- **Error Boundaries**: Unhandled failures or missing safeguards.

## 4. Maintainability & Developer Experience (DX)
- **Code Smells & Coupling**: Opportunities for decoupling.
- **DRY & Consolidation**: Opportunities to reduce duplicate code and shotgun surgery.

## 5. Action Plan & Verification Steps
- **Quick Wins**: High-reward, low-effort fixes.
- **Architectural Improvements**: Long-term scalability fixes.
- **Verification Plan**: Diagnostic commands or load test scripts (`npm run test:load`) to verify the fixes.
```
