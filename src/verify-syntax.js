/**
 * @fileoverview verify-syntax.js - Pre-Flight Server Module Syntax Guard
 * 
 * @description
 * Programmatically loads and evaluates critical server-side modules to detect
 * JavaScript syntax errors, missing module dependencies, or top-level evaluation
 * failures prior to spinning up full database or socket listeners.
 * 
 * Invoked by: Developers via CLI (`node src/verify-syntax.js`) or CI build pipelines.
 */

/**
 * List of core server modules to evaluate for syntax and initialization integrity.
 * @type {Array<{name: string, path: string}>}
 */
const modulesToTest = [
    { name: 'server-loop', path: './server-loop' },
    { name: 'craftingHandlers', path: './sockets/craftingHandlers' },
    { name: 'inventoryHandlers', path: './sockets/inventoryHandlers' },
    { name: 'voreHandlers', path: './sockets/voreHandlers' },
    { name: 'interactionHandlers', path: './sockets/interactionHandlers' }
];

let hasErrors = false;
const failedModules = [];

// REFACTOR: Evaluate modules independently in a loop to log all syntax failures across the codebase
// in a single pass, rather than halting on the first error.
for (const mod of modulesToTest) {
    try {
        require(mod.path);
        console.log(`PASS: ${mod.name} syntax`);
    } catch (e) {
        console.error(`FAIL: ${mod.name} syntax -`, e.message || e);
        failedModules.push({ name: mod.name, error: e });
        hasErrors = true;
    }
}

// FAIL-SAFE: Enforce process exit code 1 if any module failed to pass syntax verification
if (hasErrors) {
    console.error(`\nSyntax verification failed for ${failedModules.length} module(s).`);
    process.exit(1);
}


