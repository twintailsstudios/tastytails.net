/**
 * @fileoverview TastyTails CLI Performance Benchmark & Telemetry Audit Utility - Upgraded Engine
 * 
 * @description
 * High-level architectural role: CLI diagnostic, benchmarking, regression detection, and baseline persistence utility for TastyTails.net.
 * Connects via HTTP GET to the running game server's `/stats` endpoint to sample vital server statistics, tick breakdowns,
 * GC pauses, DB latencies, network throughput, spatial hash bucket density, memory usage, and diagnostic logs.
 * 
 * Upgraded Features:
 *   1. Network Throughput & Active Spatial Hash Bucket Density in Baselines & Comparison Reports
 *   2. Zero-Baseline & Absolute Delta Noise Floor Safeguards (eliminates Infinity% false regressions)
 *   3. Defensive Non-Keepalive HTTP Poller with ECONNRESET Retry Policy
 *   4. Server Health Dashboard Live Telemetry Submission
 * 
 * Usage:
 *   node scripts/check-performance.js                                  - Runs a live performance audit.
 *   node scripts/check-performance.js --save-baseline                  - Audits and saves metrics as baseline.
 *   node scripts/check-performance.js --compare                        - Audits and compares against baseline.
 *   node scripts/check-performance.js --compare --fail-on-regression   - Compares metrics and exits code 1 if regressed.
 *   node scripts/check-performance.js --port=3000 --timeout=5000       - Custom port and socket timeout.
 *   node scripts/check-performance.js --help                           - Displays usage documentation.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const io = require('socket.io-client');

// CLI Argument Extraction & Configuration
const args = process.argv.slice(2);

// Display Help Manual if requested
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
TastyTails CLI Performance Benchmark Utility

Usage:
  node scripts/check-performance.js [options]

Options:
  --save-baseline          Audits server stats and saves results to scripts/perf-baseline.json
  --compare                Compares live audit results against the saved baseline
  --fail-on-regression     When used with --compare, exits code 1 if metrics exceed tolerance
  --threshold=<PCT>        Tolerance percentage for regression checks (default: 5.0%)
  --port=<PORT>            Target server port (default: process.env.PORT || 3000)
  --host=<HOST>            Target server host (default: localhost)
  --timeout=<MS>           HTTP request socket timeout in milliseconds (default: 5000ms)
  --help, -h               Displays this help documentation
`);
    process.exit(0);
}

const saveMode = args.includes('--save-baseline');
const compareMode = args.includes('--compare');
const failOnRegression = args.includes('--fail-on-regression');

const portArg = args.find(a => a.startsWith('--port='));
const PORT = portArg ? parseInt(portArg.split('=')[1], 10) : (process.env.PORT || 3000);

const hostArg = args.find(a => a.startsWith('--host='));
const HOST = hostArg ? hostArg.split('=')[1] : 'localhost';

const timeoutArg = args.find(a => a.startsWith('--timeout='));
const TIMEOUT_MS = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 5000;

const thresholdArg = args.find(a => a.startsWith('--threshold='));
const TOLERANCE_PCT = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 5.0;

const URL_PATH = `http://${HOST}:${PORT}/stats?_t=`;
const SERVER_URL = `http://${HOST}:${PORT}`;
const BASELINE_PATH = path.join(__dirname, 'perf-baseline.json');
const SAMPLE_COUNT = 5;
const SAMPLE_INTERVAL = 1000;

// Non-keepalive HTTP agent preventing ECONNRESET socket resets under load
const httpAgent = new http.Agent({ keepAlive: false });

/**
 * Fetches server telemetry stats snapshot via HTTP GET request with ECONNRESET retry policy.
 * @param {number} [retries=2] - Number of retry attempts on socket reset.
 * @returns {Promise<Object>} Resolves to parsed telemetry stats object from /stats.
 */
function getStats(retries = 2) {
    return new Promise((resolve, reject) => {
        let settled = false;

        const req = http.get(`${URL_PATH}${Date.now()}`, { agent: httpAgent }, (res) => {
            if (res.statusCode !== 200) {
                settled = true;
                return reject(new Error(`Server returned status code ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                if (settled) return;
                settled = true;
                try {
                    const data = Buffer.concat(chunks).toString('utf8');
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.setTimeout(TIMEOUT_MS, () => {
            if (!settled) {
                settled = true;
                req.destroy();
                reject(new Error(`Request timed out after ${TIMEOUT_MS}ms`));
            }
        });

        req.on('error', async (err) => {
            if (!settled) {
                settled = true;
                if (retries > 0 && (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED')) {
                    await new Promise(r => setTimeout(r, 200));
                    try {
                        const retryResult = await getStats(retries - 1);
                        resolve(retryResult);
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(err);
                }
            }
        });
    });
}

/**
 * Formats raw byte counts into human-readable strings (e.g. 101.21 MB).
 * @param {number} bytes - Raw byte count.
 * @returns {string} Human readable formatted memory string.
 */
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Executes multi-sample audit sequence, collecting metrics across sample window.
 * @returns {Promise<{avg: Object, samples: Array<Object>}>} Aggregated stats and raw sample array.
 */
async function runAudit() {
    console.log(`[Performance Benchmark] Sampling server stats ${SAMPLE_COUNT} times at ${SAMPLE_INTERVAL}ms intervals...`);
    const samples = [];
    for (let i = 0; i < SAMPLE_COUNT; i++) {
        try {
            const stats = await getStats();
            samples.push(stats);
            process.stdout.write('· ');
        } catch (err) {
            console.log('\n');
            console.error(`\x1b[31m[Error] Connection Failed: ${err.message}\x1b[0m`);
            console.error(`\x1b[33mPlease ensure the server is running on ${HOST}:${PORT}.\x1b[0m`);
            process.exit(1);
        }
        await new Promise(r => setTimeout(r, SAMPLE_INTERVAL));
    }
    console.log('\n[Performance Benchmark] Calculating aggregates...');

    const avg = {
        tickRate: 0,
        avgTickDuration: 0,
        maxTickDuration: 0,
        eventLoopLag: 0,
        cpuUsage: 0,
        dbLatency: 0,
        gcCount: 0,
        gcMaxDuration: 0,
        logic: 0,
        physics: 0,
        shadowcasting: 0,
        animalAI: 0,
        serialize: 0,
        memoryRss: 0,
        memoryHeapUsed: 0,
        packetsSent: 0,
        bytesSent: 0,
        spatialBuckets: 0
    };

    samples.forEach(s => {
        avg.tickRate += (s.tickRate || 0);
        avg.avgTickDuration += (s.avgTickDuration || 0);
        avg.maxTickDuration = Math.max(avg.maxTickDuration, s.maxTickDuration || 0);
        avg.eventLoopLag += (s.eventLoopLag || 0);
        avg.cpuUsage += (s.cpuUsage || 0);
        avg.dbLatency += (s.dbLatency || 0);
        if (s.gcStats) {
            avg.gcCount = Math.max(avg.gcCount, s.gcStats.count || 0);
            avg.gcMaxDuration = Math.max(avg.gcMaxDuration, s.gcStats.maxDuration || 0);
        }
        if (s.tickBreakdown) {
            avg.logic += (s.tickBreakdown.logic || 0);
            avg.physics += (s.tickBreakdown.physics || 0);
            avg.shadowcasting += (s.tickBreakdown.shadowcasting || 0);
            avg.animalAI += (s.tickBreakdown.animalAI || 0);
            avg.serialize += (s.tickBreakdown.serialize || 0);
        }
        if (s.memoryUsage) {
            avg.memoryRss += (s.memoryUsage.rss || 0);
            avg.memoryHeapUsed += (s.memoryUsage.heapUsed || 0);
        }
        if (s.network) {
            avg.packetsSent += (s.network.packetsSent || 0);
            avg.bytesSent += (s.network.bytesSent || 0);
        }
        if (Array.isArray(s.sparseSpatialHash)) {
            avg.spatialBuckets += s.sparseSpatialHash.length;
        }
    });

    const count = samples.length;
    avg.tickRate /= count;
    avg.avgTickDuration /= count;
    avg.eventLoopLag /= count;
    avg.cpuUsage /= count;
    avg.dbLatency /= count;
    avg.logic /= count;
    avg.physics /= count;
    avg.shadowcasting /= count;
    avg.animalAI /= count;
    avg.serialize /= count;
    avg.memoryRss /= count;
    avg.memoryHeapUsed /= count;
    avg.packetsSent /= count;
    avg.bytesSent /= count;
    avg.spatialBuckets /= count;

    return { avg, samples };
}

/**
 * Formats metric comparison deltas between current audit and baseline snapshot with zero-baseline safeguards.
 * 
 * @param {number} current - Current metric value.
 * @param {number} baseline - Baseline metric value.
 * @param {string} unit - Measurement unit label (e.g. ' ms', ' Hz', '%').
 * @param {boolean} isTime - True if metric represents latency/resource load (lower is better); false for throughput.
 * @param {number} [absNoiseFloor=0.5] - Absolute threshold to ignore tiny measurement jitter.
 * @returns {string} Formatted comparison string with status indicator.
 */
function formatDiff(current, baseline, unit = '', isTime = true, absNoiseFloor = 0.5) {
    const currVal = typeof current === 'number' && !isNaN(current) ? current : 0;
    const baseVal = typeof baseline === 'number' && !isNaN(baseline) ? baseline : 0;
    const diff = currVal - baseVal;

    if (!baseVal || baseVal === 0) {
        if (Math.abs(currVal) <= absNoiseFloor) {
            return `${currVal.toFixed(2)}${unit} [Baseline: 0.00${unit} | 🟢 (Nominal)]`;
        }
        return `${currVal.toFixed(2)}${unit} [Baseline: 0.00${unit} | 🟡 (+${currVal.toFixed(2)}${unit})]`;
    }

    const pct = (diff / baseVal) * 100;
    const sign = diff >= 0 ? '+' : '';
    
    // Status assessment with noise floor safeguard
    let status = '🟡';
    if (Math.abs(diff) <= absNoiseFloor) {
        status = '🟢 (Stable)';
    } else if (Math.abs(pct) > TOLERANCE_PCT) {
        if (isTime) {
            status = diff < 0 ? '🟢 (Improved)' : '🔴 (Regressed)';
        } else {
            status = diff > 0 ? '🟢 (Improved)' : '🔴 (Regressed)';
        }
    }
    return `${currVal.toFixed(2)}${unit} [Baseline: ${baseVal.toFixed(2)}${unit} | ${sign}${pct.toFixed(1)}% | ${status}]`;
}

/**
 * Formats metrics object for baseline persistence with metadata header and rounded numbers.
 * @param {Object} stats - Raw metrics object from audit run.
 * @returns {Object} Cleaned baseline object with metadata and formatted floats.
 */
function formatBaselineForSave(stats) {
    const formatted = {
        _metadata: {
            schemaVersion: "1.1",
            createdAt: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        }
    };
    for (const [key, value] of Object.entries(stats)) {
        if (typeof value === 'number') {
            formatted[key] = Number(value.toFixed(4));
        } else {
            formatted[key] = value;
        }
    }
    return formatted;
}

/**
 * Submits audit and regression outcome telemetry to the Server Health Dashboard.
 * @param {string} actionType - Telemetry event category label
 * @param {boolean} success - Outcome status
 */
async function reportDashboardTelemetry(actionType, success) {
    return new Promise((resolve) => {
        const reporterSocket = io(SERVER_URL, {
            query: { charId: '000000000000000000000001', isBot: true },
            transports: ['websocket'],
            forceNew: true,
            timeout: 3000
        });

        const timeoutId = setTimeout(() => {
            try { reporterSocket.disconnect(); } catch (e) {}
            resolve();
        }, 3000);

        reporterSocket.on('connect', () => {
            clearTimeout(timeoutId);
            reporterSocket.emit('reportAction', { actionType, success });
            setTimeout(() => {
                reporterSocket.disconnect();
                resolve();
            }, 500);
        });

        reporterSocket.on('connect_error', () => {
            clearTimeout(timeoutId);
            try { reporterSocket.disconnect(); } catch (e) {}
            resolve();
        });
    });
}

/**
 * Controller function executing Audit, Save Baseline, or Compare Baseline modes.
 */
async function main() {
    const { avg: current, samples } = await runAudit();

    if (saveMode) {
        const payload = formatBaselineForSave(current);
        fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2));
        console.log(`\n\x1b[32m[Success] Saved performance baseline to: ${BASELINE_PATH}\x1b[0m`);
        console.log(JSON.stringify(payload, null, 2));
        await reportDashboardTelemetry('test: cli performance baseline saved', true);
        return;
    }

    if (compareMode) {
        if (!fs.existsSync(BASELINE_PATH)) {
            console.error(`\n\x1b[31m[Error] Baseline file does not exist at: ${BASELINE_PATH}\x1b[0m`);
            console.error(`Please save a baseline first using: \x1b[33mnode scripts/check-performance.js --save-baseline\x1b[0m`);
            process.exit(1);
        }

        let baseline;
        try {
            baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
        } catch (e) {
            console.error(`\n\x1b[31m[Error] Failed to read or parse baseline file at ${BASELINE_PATH}: ${e.message}\x1b[0m`);
            process.exit(1);
        }

        console.log('\n# Performance Benchmark Comparison Report\n');
        if (baseline._metadata) {
            console.log(`* **Baseline Version:** ${baseline._metadata.schemaVersion || '1.0'} (Saved: ${baseline._metadata.createdAt || 'N/A'})\n`);
        }
        console.log(`* **Tick Rate:** ${formatDiff(current.tickRate, baseline.tickRate, ' Hz', false)}`);
        console.log(`* **Avg Tick Duration:** ${formatDiff(current.avgTickDuration, baseline.avgTickDuration, ' ms', true)}`);
        console.log(`* **Peak Tick Duration:** ${formatDiff(current.maxTickDuration, baseline.maxTickDuration, ' ms', true)}`);
        console.log(`* **Event Loop Lag:** ${formatDiff(current.eventLoopLag, baseline.eventLoopLag, ' ms', true)}`);
        console.log(`* **CPU Load:** ${formatDiff(current.cpuUsage, baseline.cpuUsage, '%', true, 1.0)}`);
        console.log(`* **DB Write Latency:** ${formatDiff(current.dbLatency, baseline.dbLatency, ' ms', true)}`);
        console.log(`* **GC Pause (Max):** ${formatDiff(current.gcMaxDuration, baseline.gcMaxDuration, ' ms', true)} (GC Sweeps: ${current.gcCount} vs baseline: ${baseline.gcCount})`);
        
        console.log('\n### Tick Breakdown (ms)');
        console.log(`* **Logic:** ${formatDiff(current.logic, baseline.logic, ' ms', true)}`);
        console.log(`* **Physics:** ${formatDiff(current.physics, baseline.physics, ' ms', true)}`);
        console.log(`* **Shadowcasting:** ${formatDiff(current.shadowcasting, baseline.shadowcasting, ' ms', true)}`);
        console.log(`* **Animal AI:** ${formatDiff(current.animalAI, baseline.animalAI, ' ms', true)}`);
        console.log(`* **Serialize:** ${formatDiff(current.serialize, baseline.serialize, ' ms', true)}`);

        console.log('\n### Network & Spatial Telemetry');
        const kbSentCurr = (current.bytesSent || 0) / 1024;
        const kbSentBase = (baseline.bytesSent || 0) / 1024;
        console.log(`* **Packet Throughput:** ${formatDiff(current.packetsSent, baseline.packetsSent, ' pkts/sec', false)}`);
        console.log(`* **Network Bandwidth:** ${formatDiff(kbSentCurr, kbSentBase, ' KB/sec', false)}`);
        console.log(`* **Active Spatial Hash Buckets:** ${formatDiff(current.spatialBuckets, baseline.spatialBuckets, ' buckets', false)}`);

        console.log('\n### Memory Usage');
        console.log(`* **RSS Memory:** ${formatBytes(current.memoryRss)} (Baseline: ${formatBytes(baseline.memoryRss)})`);
        console.log(`* **Heap Used:** ${formatBytes(current.memoryHeapUsed)} (Baseline: ${formatBytes(baseline.memoryHeapUsed)})`);

        // Check for regressions with zero-baseline noise floor safeguards
        let regressedCount = 0;
        const checkRegressed = (currVal, baseVal, isTime, absThreshold = 0.5) => {
            if (baseVal === undefined || baseVal === null || isNaN(baseVal)) return false;
            const diff = currVal - baseVal;
            
            // Ignore noise below absolute threshold
            if (Math.abs(diff) <= absThreshold) return false;

            let isRegressed = false;
            if (baseVal === 0) {
                isRegressed = isTime ? (currVal > absThreshold) : false;
            } else {
                const pct = (diff / baseVal) * 100;
                isRegressed = isTime ? pct > TOLERANCE_PCT : pct < -TOLERANCE_PCT;
            }
            if (isRegressed) regressedCount++;
            return isRegressed;
        };

        checkRegressed(current.tickRate, baseline.tickRate, false, 1.0);
        checkRegressed(current.avgTickDuration, baseline.avgTickDuration, true, 0.5);
        checkRegressed(current.eventLoopLag, baseline.eventLoopLag, true, 2.0);

        const isSuccess = regressedCount === 0;
        await reportDashboardTelemetry('test: cli performance regression audit', isSuccess);

        if (failOnRegression && regressedCount > 0) {
            console.error(`\n\x1b[31m[Error] CI Verification Failed: ${regressedCount} core metric(s) regressed beyond ${TOLERANCE_PCT}% tolerance!\x1b[0m`);
            process.exit(1);
        }
        return;
    }

    // Default Audit Mode (Markdown print)
    console.log('\n# Server Health Audit Report\n');
    console.log(`* **Tick Rate:** ${current.tickRate.toFixed(1)} Hz (Target: 30)`);
    console.log(`* **Avg Tick Duration:** ${current.avgTickDuration.toFixed(2)} ms`);
    console.log(`* **Peak Tick Duration:** ${current.maxTickDuration.toFixed(2)} ms`);
    console.log(`* **Event Loop Lag:** ${current.eventLoopLag.toFixed(2)} ms`);
    console.log(`* **CPU Load:** ${current.cpuUsage.toFixed(1)}%`);
    console.log(`* **DB Write Latency:** ${current.dbLatency.toFixed(1)} ms`);
    console.log(`* **GC Sweeps:** ${current.gcCount} runs (Max pause: ${current.gcMaxDuration.toFixed(1)} ms)`);
    
    console.log('\n### Tick Breakdown (ms)');
    console.log(`* **Logic:** ${current.logic.toFixed(2)} ms`);
    console.log(`* **Physics:** ${current.physics.toFixed(2)} ms`);
    console.log(`* **Shadowcasting:** ${current.shadowcasting.toFixed(2)} ms`);
    console.log(`* **Animal AI:** ${current.animalAI.toFixed(2)} ms`);
    console.log(`* **Serialize:** ${current.serialize.toFixed(2)} ms`);

    console.log('\n### Network & Spatial Telemetry');
    console.log(`* **Packet Throughput:** ${current.packetsSent.toFixed(1)} pkts/sec`);
    console.log(`* **Network Bandwidth:** ${((current.bytesSent || 0) / 1024).toFixed(1)} KB/sec`);
    console.log(`* **Active Spatial Hash Buckets:** ${current.spatialBuckets.toFixed(1)} buckets`);

    console.log('\n### Memory Usage');
    console.log(`* **RSS Memory:** ${formatBytes(current.memoryRss)}`);
    console.log(`* **Heap Used:** ${formatBytes(current.memoryHeapUsed)}`);

    // Retrieve client errors and server warning/error logs from the last sample
    const lastSample = samples[samples.length - 1];
    
    if (lastSample && lastSample.clientErrors && Object.keys(lastSample.clientErrors).length > 0) {
        console.log('\n### Unique Client Side Errors');
        for (const [err, count] of Object.entries(lastSample.clientErrors)) {
            console.log(`* [Count: ${count}] \x1b[31m${err}\x1b[0m`);
        }
    }
    
    if (lastSample && lastSample.logs && lastSample.logs.length > 0) {
        const errorLogs = lastSample.logs.filter(l => l.level === 'ERROR' || l.level === 'WARN');
        if (errorLogs.length > 0) {
            console.log('\n### Server Console Errors & Warnings');
            errorLogs.slice(-15).forEach(l => {
                const color = l.level === 'ERROR' ? '\x1b[31m' : '\x1b[33m';
                console.log(`* [${l.timestamp}] ${color}[${l.level}] [${l.module}] ${l.message}\x1b[0m`);
            });
        }
    }

    await reportDashboardTelemetry('test: cli live performance audit', true);
}

main().catch(err => {
    console.error('\n[Error] Failed to run benchmark:', err);
});
