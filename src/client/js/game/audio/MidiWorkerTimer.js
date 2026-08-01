/**
 * @fileoverview Off-Thread Web Worker Scheduler Timer for TastyTails.net MIDI Engine
 * 
 * @description
 * Creates an off-thread Web Worker interval timer that emits high-precision tick signals
 * every 25ms to the MidiEngine. Because Web Workers execute in a background thread,
 * worker timers are completely immune to main-thread UI jank, rendering pauses,
 * and aggressive browser tab throttling (which freezes main-thread `setInterval` to 1Hz).
 */

export class MidiWorkerTimer {
    /**
     * Creates an instance of MidiWorkerTimer.
     * @param {Function} tickCallback - High-frequency callback function executed on every timer tick (e.g. MidiEngine._schedulerLoop)
     * @param {number} [intervalMs=25] - Timer interval frequency in milliseconds (default 25ms / 40Hz)
     */
    constructor(tickCallback, intervalMs = 25) {
        /** @type {Function} */
        this.tickCallback = tickCallback;
        /** @type {number} */
        this.intervalMs = intervalMs;
        /** @type {Worker|null} Web Worker instance running off-thread timer */
        this.worker = null;
        /** @type {number|null} Fallback main-thread setInterval ID if Workers unavailable */
        this.fallbackTimerId = null;
        /** @type {boolean} Execution state flag tracking active timer state */
        this.running = false;

        this._initWorker();
    }

    /**
     * Initializes inline Blob Web Worker.
     * 
     * Rationale:
     * - Uses Blob URL string instantiation to eliminate standalone asset file dependencies.
     * - Immediately revokes Blob URL in a finally block to prevent URL registry memory leaks.
     * - Attaches error boundaries to fallback cleanly to main-thread setInterval if worker crashes.
     * 
     * @private
     * @returns {void}
     */
    _initWorker() {
        if (typeof window === 'undefined' || typeof Worker === 'undefined') {
            return;
        }

        try {
            const workerCode = `
                let timerId = null;
                self.onmessage = function(e) {
                    if (e.data.action === 'start') {
                        const interval = e.data.intervalMs || 25;
                        if (timerId) clearInterval(timerId);
                        timerId = setInterval(function() {
                            self.postMessage('tick');
                        }, interval);
                    } else if (e.data.action === 'stop') {
                        if (timerId) {
                            clearInterval(timerId);
                            timerId = null;
                        }
                    }
                };
            `;
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            
            // OPTIMIZATION & MEMORY LEAK SAFEGUARD:
            // Synchronously construct Worker and revoke Blob URL immediately to prevent browser URL leaks.
            try {
                this.worker = new Worker(workerUrl);
            } finally {
                URL.revokeObjectURL(workerUrl);
            }

            // RACE CONDITION SAFEGUARD:
            // Check this.running to ignore stale worker tick messages in transit after stop().
            this.worker.onmessage = (e) => {
                if (this.running && e.data === 'tick') {
                    try {
                        this.tickCallback?.();
                    } catch (err) {
                        console.error('[MidiWorkerTimer] Error executing tick callback:', err);
                    }
                }
            };

            // RELIABILITY SAFEGUARD:
            // Automatically switch to main-thread setInterval if the background Web Worker encounters an error.
            this.worker.onerror = (err) => {
                console.warn('[MidiWorkerTimer] Web Worker runtime error, falling back to main-thread timer:', err);
                const wasRunning = this.running;
                this.destroy();
                if (wasRunning) {
                    this.start();
                }
            };
        } catch (err) {
            console.warn('[MidiWorkerTimer] Web Worker initialization failed, falling back to main-thread timer:', err);
            this.worker = null;
        }
    }

    /**
     * Starts the timer.
     * Signals Web Worker thread or initiates fallback main-thread interval timer.
     * @returns {void}
     */
    start() {
        this.stop();
        this.running = true;
        if (this.worker) {
            this.worker.postMessage({ action: 'start', intervalMs: this.intervalMs });
        } else {
            // Main-thread fallback for CSP restricted or non-worker environments
            this.fallbackTimerId = setInterval(() => {
                if (this.running) {
                    try {
                        this.tickCallback?.();
                    } catch (err) {
                        console.error('[MidiWorkerTimer] Error executing fallback tick callback:', err);
                    }
                }
            }, this.intervalMs);
        }
    }

    /**
     * Stops the timer without terminating worker instance.
     * @returns {void}
     */
    stop() {
        this.running = false;
        if (this.worker) {
            this.worker.postMessage({ action: 'stop' });
        }
        if (this.fallbackTimerId) {
            clearInterval(this.fallbackTimerId);
            this.fallbackTimerId = null;
        }
    }

    /**
     * Cleans up worker resources and terminates worker thread.
     * @returns {void}
     */
    destroy() {
        this.stop();
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}
