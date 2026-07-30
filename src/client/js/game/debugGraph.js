/**
 * @fileoverview Client Network Diagnostics & Visual Oscilloscope HUD
 * 
 * @description
 * Maintains zero-allocation ring buffers for client-server round-trip latency (RTT in ms)
 * and player prediction drift (distance in pixels). Renders formatted stats text and a live
 * 2D canvas telemetry graph inside the Options menu modal.
 * 
 * Triggered by:
 * - Initialization: `create.js` via `initDebugGraph()`
 * - Tick Updates: `reconcile.js` via `window.updateDebugStats(rtt, dist)`
 */

// Diagnostic Telemetry Constants
const MAX_DATA_POINTS = 100;
const MAX_RTT_SCALE_MS = 200;
const MAX_DIST_SCALE_PX = 50;

// Module-level DOM Reference Caches (OPTIMIZATION: avoids document.getElementById tree search per tick)
let cachedGraphCanvas = null;
let cachedOptionsDisplay = null;
let cachedRttEl = null;
let cachedDistEl = null;
let cachedCtx = null;

/**
 * Validates whether a cached DOM node is still attached to the document tree.
 * Re-queries the DOM if missing or detached (e.g., after dynamic modal partial re-renders).
 * 
 * @param {string} id - HTML element DOM ID
 * @param {HTMLElement|null} currentCache - Currently cached DOM element handle
 * @returns {HTMLElement|null} Valid attached DOM element or null
 */
function getValidElement(id, currentCache) {
    if (currentCache && document.contains(currentCache)) {
        return currentCache;
    }
    return document.getElementById(id);
}

// OPTIMIZATION: Module-scoped string formatting helpers to avoid function object allocation in hot loops
const pad3 = (n) => String(Math.round(n)).padStart(3, '0');
const padFloat6 = (n) => String(Number(n).toFixed(2)).padStart(6, '0');

/**
 * Initializes diagnostic history arrays and attaches the global `window.updateDebugStats` callback.
 * Invoked once during Phaser scene creation in `create.js`.
 */
export function initDebugGraph() {
    // OPTIMIZATION: Fixed-size typed arrays for zero-allocation ring buffers (eliminates Array.shift GC pauses)
    const rttHistory = new Float32Array(MAX_DATA_POINTS);
    const distHistory = new Float32Array(MAX_DATA_POINTS);
    let writeIndex = 0;
    let sampleCount = 0;

    // Reset cached DOM references on initialization (safety guard against stale handles across scene restarts)
    cachedGraphCanvas = null;
    cachedOptionsDisplay = null;
    cachedRttEl = null;
    cachedDistEl = null;
    cachedCtx = null;

    /**
     * Global telemetry update hook invoked per server reconciliation tick in `reconcile.js`.
     * 
     * @param {number} rtt - Round Trip Time in milliseconds
     * @param {number} dist - Position reconciliation error distance in pixels
     */
    window.updateDebugStats = (rtt, dist) => {
        // Sanitize numerical inputs against NaN or invalid types
        const cleanRtt = (typeof rtt === 'number' && Number.isFinite(rtt)) ? Math.max(0, rtt) : 0;
        const cleanDist = (typeof dist === 'number' && Number.isFinite(dist)) ? Math.max(0, dist) : 0;

        // Check if canvas element is present
        cachedGraphCanvas = getValidElement('debug-graph', cachedGraphCanvas);
        if (!cachedGraphCanvas) return;

        // Check if Options display modal is visible (offsetParent === null when hidden)
        cachedOptionsDisplay = getValidElement('optionsDisplay', cachedOptionsDisplay);
        if (cachedOptionsDisplay && cachedOptionsDisplay.offsetParent === null) {
            return;
        }

        // Update Ring Buffers
        rttHistory[writeIndex] = cleanRtt;
        distHistory[writeIndex] = cleanDist;
        writeIndex = (writeIndex + 1) % MAX_DATA_POINTS;
        if (sampleCount < MAX_DATA_POINTS) sampleCount++;

        // Single-pass computation for min, max, and sum
        let sumRtt = 0, minRtt = Infinity, maxRtt = 0;
        let sumDist = 0, minDist = Infinity, maxDist = 0;

        for (let i = 0; i < sampleCount; i++) {
            const r = rttHistory[i];
            const d = distHistory[i];
            if (r < minRtt) minRtt = r;
            if (r > maxRtt) maxRtt = r;
            sumRtt += r;
            if (d < minDist) minDist = d;
            if (d > maxDist) maxDist = d;
            sumDist += d;
        }

        if (sampleCount === 0) {
            minRtt = 0;
            minDist = 0;
        }

        const avgRtt = sampleCount > 0 ? (sumRtt / sampleCount).toFixed(0) : '0';
        const avgDist = sampleCount > 0 ? (sumDist / sampleCount).toFixed(2) : '0.00';

        // Update Text Display
        cachedRttEl = getValidElement('debug-rtt', cachedRttEl);
        cachedDistEl = getValidElement('debug-dist', cachedDistEl);
        if (cachedRttEl) cachedRttEl.textContent = `RTT: ${pad3(cleanRtt)}ms (Avg: ${pad3(avgRtt)}ms) [Lo: ${pad3(minRtt)}ms | Hi: ${pad3(maxRtt)}ms]`;
        if (cachedDistEl) cachedDistEl.textContent = `Dist: ${padFloat6(cleanDist)}px (Avg: ${padFloat6(avgDist)}px) [Lo: ${padFloat6(minDist)}px | Hi: ${padFloat6(maxDist)}px]`;

        // Draw 2D Canvas Graph
        if (!cachedCtx || cachedCtx.canvas !== cachedGraphCanvas) {
            cachedCtx = cachedGraphCanvas.getContext('2d');
        }

        if (cachedCtx) {
            const w = cachedGraphCanvas.width;
            const h = cachedGraphCanvas.height;

            cachedCtx.clearRect(0, 0, w, h);

            // Background
            cachedCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            cachedCtx.fillRect(0, 0, w, h);

            // Grid Lines (5 steps)
            cachedCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            cachedCtx.lineWidth = 1;
            cachedCtx.beginPath();
            for (let i = 0; i <= 5; i++) {
                const y = h - (i * (h / 5));
                cachedCtx.moveTo(0, y);
                cachedCtx.lineTo(w, y);
            }
            cachedCtx.stroke();

            // Calculate chronological start index for ring buffer
            const startIdx = sampleCount < MAX_DATA_POINTS ? 0 : writeIndex;

            // Draw RTT (Green) - Scale 0-200
            cachedCtx.strokeStyle = '#00ff00';
            cachedCtx.lineWidth = 2;
            cachedCtx.beginPath();
            for (let i = 0; i < sampleCount; i++) {
                const dataIdx = (startIdx + i) % MAX_DATA_POINTS;
                const x = (i / (MAX_DATA_POINTS - 1)) * w;
                const normalizedY = Math.min(rttHistory[dataIdx] / MAX_RTT_SCALE_MS, 1);
                const y = h - (normalizedY * h);
                if (i === 0) cachedCtx.moveTo(x, y);
                else cachedCtx.lineTo(x, y);
            }
            cachedCtx.stroke();

            // Draw Dist (Red) - Scale 0-50
            cachedCtx.strokeStyle = '#ff0000';
            cachedCtx.lineWidth = 2;
            cachedCtx.beginPath();
            for (let i = 0; i < sampleCount; i++) {
                const dataIdx = (startIdx + i) % MAX_DATA_POINTS;
                const x = (i / (MAX_DATA_POINTS - 1)) * w;
                const normalizedY = Math.min(distHistory[dataIdx] / MAX_DIST_SCALE_PX, 1);
                const y = h - (normalizedY * h);
                if (i === 0) cachedCtx.moveTo(x, y);
                else cachedCtx.lineTo(x, y);
            }
            cachedCtx.stroke();
        }
    };
}

