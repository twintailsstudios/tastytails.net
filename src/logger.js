const path = require('path');

const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
};

const fileColors = {
    'index.js': colors.green,
    'server-loop.js': colors.blue,
    'auth.js': colors.yellow,
    'verifyToken.js': colors.magenta,
    'dbInterface.js': colors.cyan,
};

const defaultColor = colors.white;

function getCallerInfo() {
    const error = new Error();
    const stack = error.stack.split('\n');
    // Stack trace format varies, but usually the 3rd line (index 2) is the caller of 'log'
    // If 'log' is called directly. If called via log.error, it might be deeper.

    // We need to find the first line that isn't this file.
    for (let i = 2; i < stack.length; i++) {
        const line = stack[i];
        if (!line.includes(__filename)) {
            // Parse line to get filename and line number
            // Example: "    at Object.<anonymous> (C:\path\to\file.js:10:5)"
            // or "    at functionName (C:\path\to\file.js:10:5)"
            const match = line.match(/[\(\s](.*):(\d+):\d+\)?$/);
            if (match) {
                const fullPath = match[1];
                const lineNumber = match[2];
                const fileName = path.basename(fullPath);
                return { fileName, lineNumber };
            }
        }
    }
    return { fileName: 'unknown', lineNumber: '?' };
}

function formatLog(color, fileName, lineNumber, args) {
    const indent = '    ';
    const fileTag = `Src File: ${fileName}`;
    const lineTag = `at line: ${lineNumber}`;

    // Combine args into a string if possible, or just pass them to console.log
    // But to match the requested format:
    // Src File:  index.js     at line:  26 
    //      Successfully connected to MongoDB!

    console.log(color, fileTag, indent, lineTag, '\n ', indent, ...args, colors.reset);
}

function log(...args) {
    const { fileName, lineNumber } = getCallerInfo();
    const color = fileColors[fileName] || defaultColor;
    formatLog(color, fileName, lineNumber, args);
}

log.error = function (...args) {
    const { fileName, lineNumber } = getCallerInfo();
    // Error logs are always red
    formatLog(colors.red, fileName, lineNumber, args);
};

module.exports = log;