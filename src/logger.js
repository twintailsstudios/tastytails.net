const reset = "\x1b[0m"; // ANSI color code for reset
const fgYellow = "\x1b[33m"; // ANSI color code for yellow
const fgGreen = "\x1b[32m"; // ANSI color code for green
const fgRed = "\x1b[31m"; // ANSI color code for red
const fgCyan = "\x1b[36m"; // ANSI color code for cyan
const fgBlue = "\x1b[34m"; // ANSI color code for blue
const fgMagenta = "\x1b[35m" // ANSI color code for magenta
const fgWhite = "\x1b[37m"; // ANSI color code for white


const indent = '    '; // 4 spaces
function log(data, next, next2, next3) {
    const error = new Error();
    // console.log('error.stack = ', error.stack);
    const callerLine = error.stack.split("\n")[2];
    const callerLineParts = callerLine.split('\\');
    const secondLastWord = callerLineParts[callerLineParts.length - 2];
    // console.log('secondLastWord = ', secondLastWord);
    // console.log('callerLine = ', callerLine);
    const fileName = callerLine.split('\\').pop();
    // console.log(fileName);
    const parts = fileName.split(':');
    const callerFile = parts.shift();
    var afterColon = parts.join(':');
    afterColon = afterColon.slice(0, -1);

    if (secondLastWord === 'routes') {
        if (callerFile.includes('dbInterface.js')) {
            console.log(fgCyan, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
          } else if (callerFile.includes('index.js')) {
            console.log(fgGreen, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
            } else if(callerFile.includes('auth.js')) {
                console.log(fgYellow, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
                } else if (callerFile.includes('verifyToken.js')) {
                    console.log(fgMagenta, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
                } else {
                    console.log(fgWhite, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
                }
    } else {
        if (callerFile.includes('index.js')) {
            console.log(fgRed, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
        } else{
            console.log(fgWhite, 'Src File: ', callerFile, indent, 'at line: ', afterColon, '\n ', indent, data, next ? next : '', next2 ? next2 : '', next3 ? next3 : '', reset);
        }
    }
    
    // console.log(callerFile);
    // if (typeof next === 'object' && next !== null) {
    //     next = JSON.stringify(next, null, 2); // Convert object to string
    // }
}

module.exports = log;