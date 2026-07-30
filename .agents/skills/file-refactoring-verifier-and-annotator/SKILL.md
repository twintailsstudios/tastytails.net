---
name: file-refactoring-verifier-and-annotator
description: Verifies refactored code using automated tests and load scripts, applies rich JSDoc/inline developer annotations to the target file, and produces a final Walkthrough report.
---

# Refactoring Verifier & Inline Code Annotator

This skill guides the agent in conducting final quality assurance verification on refactored code, adding clear inline developer comments/JSDoc annotations, and writing a comprehensive **Walkthrough Artifact**.

---

### Step 1: Empirical Verification & Diagnostic Run

1. Identify the target file path.
2. Run test suites and diagnostics:
   - Run unit/integration tests (`npm test`).
   - Run load & diagnostic scripts (`npm run test:load` or equivalent).
3. Validate that no tests are failing and that performance metrics meet project targets.

---

### Step 2: Apply Inline Developer Annotations

Use `replace_file_content` or `multi_replace_file_content` to add comprehensive, readable developer comments directly to the target file:

1. **File Header JSDoc**:
   ```javascript
   /**
    * @fileoverview [File Name] - [Brief Purpose]
    * 
    * @description
    * High-level architectural role of this file in the project.
    * Triggered by: [System events, routes, socket messages, tick loops]
    */
   ```
2. **Function & Method JSDoc**:
   ```javascript
   /**
    * [Function Purpose]
    * @param {Type} paramName - Description of input parameter
    * @returns {Type} Description of return value
    */
   ```
3. **Rationale Annotations**:
   ```javascript
   // OPTIMIZATION: [Explain why pooling, debouncing, or caching is used here to help future devs maintain performance]
   ```

---

### Step 3: Produce the Walkthrough Artifact

Generate a Markdown artifact titled `walkthrough_[filename].md` formatted as follows:

```markdown
# Walkthrough: Refactored [File Name]

## 1. Verification Summary
- **Status**: 🟢 Verified & Passed
- **Test Suite Results**: Passed `npm test`
- **Load Benchmark Results**: Passed `npm run test:load`

### Empirical Performance Comparison
| Metric | Before Refactor | After Refactor | Target Goal | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Avg Tick Duration** | | | $\le 20$ ms | 🟢 Pass |
| **Peak Tick Duration** | | | $\le 33.3$ ms | 🟢 Pass |
| **Heap Growth** | | | $\le 50$ MB | 🟢 Pass |

## 2. Changes & Annotations Applied
- **Target File**: [file basename](file:///absolute/path/to/targetfile)
- **Inline Annotations**: JSDoc and rationale comments applied across all functions and hot loops.

## 3. Developer Guidance
- Key invariants and rules for future developers extending this file.
```
