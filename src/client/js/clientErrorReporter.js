/**
 * @fileoverview clientErrorReporter.js - Client-Side Error Telemetry Collector
 * 
 * @description
 * Captures uncaught runtime exceptions (window.onerror), unhandled promise rejections (unhandledrejection),
 * and explicit dev console error logs (console.error), sending deduplicated telemetry reports to the server
 * endpoint `/api/client-error` for display on the Server Health Dashboard.
 * Includes client-side rate-limiting and deduplication guards to prevent network flooding.
 */

(function () {
    'use strict';

    /** @constant {number} Minimum milliseconds between sending identical error reports */
    const DEDUPE_INTERVAL_MS = 5000;

    /** @constant {number} Maximum error reports allowed per minute */
    const MAX_REPORTS_PER_MINUTE = 30;

    /** @type {Map<string, number>} Cache of error key -> last reported timestamp */
    const recentErrors = new Map();

    /** @type {Array<number>} Timestamps of reports sent in current rolling minute window */
    const reportTimestamps = [];

    /** @type {boolean} Internal flag to avoid infinite loops if error reporter itself fails */
    let isReporting = false;

    /**
     * Formats object or value arguments into a single string for console.error interception.
     * @param {Array<*>} args - Arguments passed to console.error
     * @returns {string} Formatted error message string
     */
    function stringifyArgs(args) {
        return args.map(arg => {
            if (arg instanceof Error) return arg.message + (arg.stack ? '\n' + arg.stack : '');
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (_e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    /**
     * Sends an error report payload to the server `/api/client-error` endpoint.
     * @param {string} message - Human-readable error description
     * @param {string} [stack] - Optional stack trace string
     */
    function sendErrorReport(message, stack) {
        if (!message || isReporting) return;

        const now = Date.now();

        // Clean up rolling minute window
        while (reportTimestamps.length > 0 && (now - reportTimestamps[0]) > 60000) {
            reportTimestamps.shift();
        }

        // Rate limit guard
        if (reportTimestamps.length >= MAX_REPORTS_PER_MINUTE) return;

        // Deduplication key
        const key = message.substring(0, 150) + (stack ? stack.substring(0, 150) : '');
        const lastSent = recentErrors.get(key);
        if (lastSent && (now - lastSent) < DEDUPE_INTERVAL_MS) {
            return;
        }

        recentErrors.set(key, now);
        reportTimestamps.push(now);

        // Prune old entries from cache
        if (recentErrors.size > 100) {
            for (const [k, ts] of recentErrors.entries()) {
                if (now - ts > DEDUPE_INTERVAL_MS * 2) recentErrors.delete(k);
            }
        }

        isReporting = true;

        try {
            const payload = JSON.stringify({
                message: String(message).substring(0, 500),
                stack: stack ? String(stack).substring(0, 3000) : ''
            });

            if (navigator.sendBeacon) {
                const blob = new Blob([payload], { type: 'application/json' });
                navigator.sendBeacon('/api/client-error', blob);
            } else if (typeof fetch === 'function') {
                fetch('/api/client-error', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload
                }).catch(() => { });
            }
        } catch (_err) {
            // Defensively suppress any error during error reporting
        } finally {
            isReporting = false;
        }
    }

    // 1. Intercept Global Window Uncaught Exceptions
    const origOnError = window.onerror;
    window.onerror = function (msg, url, lineNo, columnNo, error) {
        try {
            const stack = (error && error.stack) ? error.stack : `at ${url}:${lineNo}:${columnNo}`;
            sendErrorReport(msg, stack);
        } catch (_e) { }

        if (typeof origOnError === 'function') {
            return origOnError.apply(this, arguments);
        }
        return false;
    };

    // 2. Intercept Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', function (event) {
        try {
            const reason = event.reason;
            let message = 'Unhandled Promise Rejection';
            let stack = '';

            if (reason instanceof Error) {
                message = reason.message || message;
                stack = reason.stack || '';
            } else if (typeof reason === 'string') {
                message = reason;
            } else if (reason && typeof reason === 'object') {
                try { message = JSON.stringify(reason); } catch (_e) { message = String(reason); }
            }

            sendErrorReport(`[Unhandled Promise] ${message}`, stack);
        } catch (_e) { }
    });

    // 3. Intercept Dev Console Errors (console.error)
    if (typeof console !== 'undefined' && console.error) {
        const origConsoleError = console.error;
        console.error = function () {
            // Execute original console.error first
            origConsoleError.apply(console, arguments);

            try {
                const argsArray = Array.prototype.slice.call(arguments);
                let stack = '';

                // Extract stack trace if one of the arguments is an Error instance
                for (let i = 0; i < argsArray.length; i++) {
                    if (argsArray[i] instanceof Error && argsArray[i].stack) {
                        stack = argsArray[i].stack;
                        break;
                    }
                }

                if (!stack) {
                    try {
                        throw new Error();
                    } catch (e) {
                        // Omit the first couple frames corresponding to this wrapper
                        stack = e.stack ? e.stack.split('\n').slice(3).join('\n') : '';
                    }
                }

                const message = `[Console Error] ${stringifyArgs(argsArray)}`;
                sendErrorReport(message, stack);
            } catch (_e) { }
        };
    }
})();
