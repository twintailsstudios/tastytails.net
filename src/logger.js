/**
 * @fileoverview Custom Logger & Diagnostics Utility - TastyTails Server Architecture
 * 
 * @description
 * Provides zero-dependency terminal logging, level-based severity output, stack trace call site resolution,
 * execution stopwatch timers, ASCII table rendering, health snapshots, and a fixed O(1) circular ring buffer
 * (`logBuffer`) exposed for monitoring dashboards.
 * 
 * Triggered by: Express route handlers, Socket.IO packet handlers, game loop tick engine, DB resilience wrapper, telemetry APIs.
 */

const path = require('path');
const util = require('util');

// --- Logger Use Key ---
// log.info() - General Information -> Standard white log.
// log.success() - Success Messages -> Green log with a checkmark.
// log.warn() - Warning Messages -> Yellow log with a warning symbol.
// log.error() - Error Messages -> Red log with an error symbol.
// log.debug() - Debug Messages -> Magenta log with a bug symbol.
// log.important() - Important Messages -> Cyan log (Stands Out).
// log.highlight() - Highlight Messages -> This creates a cyan box frame around the text.
// log.divider() - Divider Messages -> This creates a horizontal line.
// log.group() / log.groupEnd() - Group messages with indentation.
// log.table() - Print arrays of objects as a table.
// log.health() - Print server health stats.
// log.startTimer() / log.endTimer() - Measure execution time.

// --- Configuration & Constants ---

// ANSI Escape Codes for Colors & Styles
const STYLES = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    fg: {
        black: "\x1b[30m",
        red: "\x1b[31m",
        green: "\x1b[32m",
        yellow: "\x1b[33m",
        blue: "\x1b[34m",
        magenta: "\x1b[35m",
        cyan: "\x1b[36m",
        white: "\x1b[37m",
        gray: "\x1b[90m",
    },
    bg: {
        black: "\x1b[40m",
        red: "\x1b[41m",
        green: "\x1b[42m",
        yellow: "\x1b[43m",
        blue: "\x1b[44m",
        magenta: "\x1b[45m",
        cyan: "\x1b[46m",
        white: "\x1b[47m",
    }
};

// Log Levels with associated colors and labels
const LEVELS = {
    info: { color: STYLES.fg.white, label: 'INFO', icon: 'ℹ️' },
    success: { color: STYLES.fg.green, label: 'SUCCESS', icon: '✅' },
    warn: { color: STYLES.fg.yellow, label: 'WARN', icon: '⚠️' },
    error: { color: STYLES.fg.red, label: 'ERROR', icon: '❌' },
    debug: { color: STYLES.fg.magenta, label: 'DEBUG', icon: '🐞' },
    important: { color: STYLES.fg.cyan, label: 'IMPORTANT', icon: '📢' }
};

// File-specific specific colors (optional overrides)
const FILE_TOKEN_COLORS = {
    'index.js': STYLES.fg.green,
    'server-loop.js': STYLES.fg.blue,
    'auth.js': STYLES.fg.yellow,
    'verifyToken.js': STYLES.fg.magenta,
    'dbInterface.js': STYLES.fg.cyan,
};

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

// --- Internal State for Advanced Features ---
let currentIndentLevel = 0;
const timers = new Map();
const MAX_LOGS = process.env.MAX_LOGS ? (parseInt(process.env.MAX_LOGS, 10) || 1000) : 1000;
const logBuffer = new Array(MAX_LOGS);
let logHead = 0;
let logCount = 0;

// --- Helper Functions ---

/**
 * Generates a consistent color for a string (used for filenames without explicit overrides)
 */
function getColorForString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorKeys = Object.keys(STYLES.fg).filter(k => k !== 'black' && k !== 'gray' && k !== 'white'); // visual pop only
    const index = Math.abs(hash) % colorKeys.length;
    return STYLES.fg[colorKeys[index]];
}

/**
 * Gets a timestamp string in HH:MM:SS format
 */
function getTimestamp() {
    const now = new Date();
    return now.toTimeString().split(' ')[0]; // Returns HH:MM:SS
}

/**
 * Identifies the caller file and line number
 * @returns {{fileName: string, lineNumber: string|number}} Caller details
 */
function getCallerInfo() {
    // OPTIMIZATION: Uses V8 Error.prepareStackTrace CallSite reflection wrapped in try...finally.
    // Avoids costly new Error().stack string splitting and regex parsing on every log call.
    const origPrepare = Error.prepareStackTrace;
    try {
        Error.prepareStackTrace = (_, stack) => stack;
        const err = new Error();
        Error.captureStackTrace(err, getCallerInfo);
        const stack = err.stack;

        if (Array.isArray(stack)) {
            for (const site of stack) {
                if (!site || typeof site.getFileName !== 'function') continue;
                const fileName = site.getFileName();
                if (typeof fileName === 'string' && fileName.length > 0 && !fileName.includes(__filename) && !fileName.startsWith('node:')) {
                    return {
                        fileName: path.basename(fileName),
                        lineNumber: typeof site.getLineNumber === 'function' ? (site.getLineNumber() || '?') : '?'
                    };
                }
            }
        }
    } catch (_e) {
        // Safe fallback if V8 prepareStackTrace fails in non-standard environments
    } finally {
        Error.prepareStackTrace = origPrepare;
    }
    return { fileName: 'unknown', lineNumber: '?' };
}

/**
 * Format arguments for logging (handles objects, errors, etc.)
 * @param {Array<*>} args - Raw log arguments
 * @returns {string} Formatted log message
 */
function formatArgs(args) {
    return args.map(arg => {
        if (arg instanceof Error) {
            return `${STYLES.fg.red}${arg.stack}${STYLES.reset}`;
        }
        if (typeof arg === 'object' && arg !== null) {
            // OPTIMIZATION: Cap inspection depth (depth: 4, maxArrayLength: 50) to prevent event-loop lockups on huge objects
            return util.inspect(arg, { colors: true, depth: 4, maxArrayLength: 50, compact: false, breakLength: 80 });
        }
        return arg;
    }).join(' ');
}

// --- Main Logging Logic ---

function baseLog(levelKey, ...args) {
    const { fileName, lineNumber } = getCallerInfo();
    const timestamp = getTimestamp();

    const level = LEVELS[levelKey] || LEVELS.info;
    const fileColor = FILE_TOKEN_COLORS[fileName] || getColorForString(fileName);

    // Format Parts
    const timePart = `${STYLES.fg.gray}[${timestamp}]${STYLES.reset}`;
    const levelPart = `${level.color}[${level.label}]${STYLES.reset}`;
    const filePart = `${fileColor}[${fileName}:${lineNumber}]${STYLES.reset}`;

    // Handle Indentation
    const indent = '    '.repeat(currentIndentLevel);
    const message = formatArgs(args).split('\n').map((line, i) => {
        return i === 0 ? line : indent + line; // Indent subsequent lines of a multiline message too? Maybe not for objects.
    }).join('\n');

    // Assembly: [Time] [Level] [File]   Indent Message
    // align columns slightly for readability
    console.log(`${timePart} ${levelPart.padEnd(20)} ${filePart.padEnd(30)} ${indent}${message}`);

    // OPTIMIZATION: Write to O(1) ring buffer index pointer instead of O(N) logBuffer.shift() re-indexing
    const cleanMsg = message.replace(ANSI_REGEX, '');
    const cleanLogStr = `[${timestamp}] [${level.label}] [${fileName}:${lineNumber}] ${cleanMsg}`;
    
    logBuffer[logHead] = {
        time: timestamp,
        level: levelKey,
        label: level.label,
        caller: `${fileName}:${lineNumber}`,
        message: cleanMsg,
        raw: cleanLogStr
    };
    logHead = (logHead + 1) % MAX_LOGS;
    if (logCount < MAX_LOGS) logCount++;
}

// --- Public API ---

const logger = {};

// Generate methods for each level: log.info(), log.error(), etc.
Object.keys(LEVELS).forEach(key => {
    logger[key] = (...args) => baseLog(key, ...args);
});

// Default 'log' alias to info
logger.log = logger.info;

/**
 * Special Highlighting & Formatting
 */
logger.highlight = (label, value) => {
    const width = 60;
    const border = '═'.repeat(width);
    const padText = (text, w) => {
        const len = text.length;
        const padding = Math.max(0, w - len);
        const padLeft = Math.floor(padding / 2);
        const padRight = padding - padLeft;
        return ' '.repeat(padLeft) + text + ' '.repeat(padRight);
    };

    console.log(`\n${STYLES.fg.cyan}${border}`);
    console.log(`║${padText('', width - 2)}║`);
    console.log(`║${STYLES.bright}${padText(`${label}: ${value}`, width - 2)}${STYLES.reset}${STYLES.fg.cyan}║`);
    console.log(`║${padText('', width - 2)}║`);
    console.log(`${border}${STYLES.reset}\n`);

    baseLog('important', `${label}: ${value}`);
};

logger.divider = (title = '') => {
    const width = 60;
    const line = '─'.repeat(width);
    if (title) {
        console.log(`\n${STYLES.fg.gray}${line}\n   ${title.toUpperCase()}\n${line}${STYLES.reset}\n`);
    } else {
        console.log(`\n${STYLES.fg.gray}${line}${STYLES.reset}\n`);
    }
};

/**
 * Log Grouping
 */
logger.group = (label) => {
    logger.info(label);
    currentIndentLevel++;
};

logger.groupEnd = () => {
    if (currentIndentLevel > 0) currentIndentLevel--;
};

/**
 * Performance Timers
 */
logger.startTimer = (label) => {
    timers.set(label, Date.now());
};

logger.endTimer = (label) => {
    if (timers.has(label)) {
        const startTime = timers.get(label);
        const duration = Date.now() - startTime;
        timers.delete(label);

        let color = STYLES.fg.green;
        if (duration > 100) color = STYLES.fg.yellow;
        if (duration > 500) color = STYLES.fg.red;

        // We manually construct the message to inject the color for the time
        const timeMsg = `${color}${duration}ms${STYLES.reset}`;
        logger.info(`Timer '${label}': ${timeMsg}`);
    } else {
        logger.warn(`Timer '${label}' does not exist.`);
    }
};

/**
 * Tabular Data Display
 */
logger.table = (data) => {
    if (!Array.isArray(data) || data.length === 0 || !data[0] || typeof data[0] !== 'object') {
        logger.info("No data found for table.");
        return;
    }

    const headers = Object.keys(data[0]);
    const colWidths = headers.map(h => h.length);

    // Calculate max widths
    data.forEach(row => {
        headers.forEach((h, i) => {
            const val = String(row[h]);
            if (val.length > colWidths[i]) colWidths[i] = val.length;
        });
    });

    const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';

    // Header
    let headerRow = '|';
    headers.forEach((h, i) => {
        headerRow += ` ${h.padEnd(colWidths[i])} |`;
    });

    console.log(separator);
    console.log(headerRow);
    console.log(separator);

    // Rows
    data.forEach(row => {
        let line = '|';
        headers.forEach((h, i) => {
            const val = String(row[h]);
            line += ` ${val.padEnd(colWidths[i])} |`;
        });
        console.log(line);
    });
    console.log(separator);
};

/**
 * System Health Snapshot
 */
logger.health = () => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    const formatMem = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    const formatTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    logger.highlight("SYSTEM HEALTH", "SNAPSHOT");
    const stats = [
        { Metric: 'Uptime', Value: formatTime(uptime) },
        { Metric: 'RSS Memory', Value: formatMem(memUsage.rss) },
        { Metric: 'Heap Total', Value: formatMem(memUsage.heapTotal) },
        { Metric: 'Heap Used', Value: formatMem(memUsage.heapUsed) },
    ];
    logger.table(stats);
};

logger.getLogs = () => {
    if (logCount < MAX_LOGS) {
        return logBuffer.slice(0, logCount);
    }
    return [...logBuffer.slice(logHead, MAX_LOGS), ...logBuffer.slice(0, logHead)];
};

module.exports = logger;