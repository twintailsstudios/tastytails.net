/**
 * TastyTails CLI Performance Benchmark Utility
 * 
 * Usage:
 *   node scripts/check-performance.js                  - Runs a live performance audit.
 *   node scripts/check-performance.js --save-baseline  - Audits and saves metrics as baseline.
 *   node scripts/check-performance.js --compare        - Audits and compares against baseline.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}/stats?_t=`;
const BASELINE_PATH = path.join(__dirname, 'perf-baseline.json');
const SAMPLE_COUNT = 5;
const SAMPLE_INTERVAL = 1000;

const args = process.argv.slice(2);
const saveMode = args.includes('--save-baseline');
const compareMode = args.includes('--compare');

function getStats() {
    return new Promise((resolve, reject) => {
        http.get(`${URL}${Date.now()}`, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Server returned status code ${res.statusCode}`));
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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
            console.error(`\x1b[33mPlease ensure the server is running locally on port ${PORT}.\x1b[0m`);
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
        memoryHeapUsed: 0
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

    return { avg, samples };
}

function formatDiff(current, baseline, unit = '', isTime = true) {
    const diff = current - baseline;
    if (!baseline || baseline === 0) return `${current.toFixed(2)}${unit} (No Baseline)`;
    const pct = (diff / baseline) * 100;
    const sign = diff >= 0 ? '+' : '';
    
    // Status assessment
    let status = '🟡';
    if (Math.abs(pct) > 5) {
        if (isTime) {
            status = diff < 0 ? '🟢 (Improved)' : '🔴 (Regressed)';
        } else { // Tick Rate
            status = diff > 0 ? '🟢 (Improved)' : '🔴 (Regressed)';
        }
    }
    return `${current.toFixed(2)}${unit} [Baseline: ${baseline.toFixed(2)}${unit} | ${sign}${pct.toFixed(1)}% | ${status}]`;
}

async function main() {
    const { avg: current, samples } = await runAudit();

    if (saveMode) {
        fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2));
        console.log(`\n\x1b[32m[Success] Saved performance baseline to: ${BASELINE_PATH}\x1b[0m`);
        console.log(JSON.stringify(current, null, 2));
        return;
    }

    if (compareMode) {
        if (!fs.existsSync(BASELINE_PATH)) {
            console.error(`\n\x1b[31m[Error] Baseline file does not exist at: ${BASELINE_PATH}\x1b[0m`);
            console.error(`Please save a baseline first using: \x1b[33mnode scripts/check-performance.js --save-baseline\x1b[0m`);
            process.exit(1);
        }

        const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
        console.log('\n# Performance Benchmark Comparison Report\n');
        console.log(`* **Tick Rate:** ${formatDiff(current.tickRate, baseline.tickRate, ' Hz', false)}`);
        console.log(`* **Avg Tick Duration:** ${formatDiff(current.avgTickDuration, baseline.avgTickDuration, ' ms', true)}`);
        console.log(`* **Peak Tick Duration:** ${formatDiff(current.maxTickDuration, baseline.maxTickDuration, ' ms', true)}`);
        console.log(`* **Event Loop Lag:** ${formatDiff(current.eventLoopLag, baseline.eventLoopLag, ' ms', true)}`);
        console.log(`* **CPU Load:** ${formatDiff(current.cpuUsage, baseline.cpuUsage, '%', true)}`);
        console.log(`* **DB Write Latency:** ${formatDiff(current.dbLatency, baseline.dbLatency, ' ms', true)}`);
        console.log(`* **GC Pause (Max):** ${formatDiff(current.gcMaxDuration, baseline.gcMaxDuration, ' ms', true)} (GC Sweeps: ${current.gcCount} vs baseline: ${baseline.gcCount})`);
        
        console.log('\n### Tick Breakdown (ms)');
        console.log(`* **Logic:** ${formatDiff(current.logic, baseline.logic, ' ms', true)}`);
        console.log(`* **Physics:** ${formatDiff(current.physics, baseline.physics, ' ms', true)}`);
        console.log(`* **Shadowcasting:** ${formatDiff(current.shadowcasting, baseline.shadowcasting, ' ms', true)}`);
        console.log(`* **Animal AI:** ${formatDiff(current.animalAI, baseline.animalAI, ' ms', true)}`);
        console.log(`* **Serialize:** ${formatDiff(current.serialize, baseline.serialize, ' ms', true)}`);

        console.log('\n### Memory Usage');
        console.log(`* **RSS Memory:** ${formatBytes(current.memoryRss)} (Baseline: ${formatBytes(baseline.memoryRss)})`);
        console.log(`* **Heap Used:** ${formatBytes(current.memoryHeapUsed)} (Baseline: ${formatBytes(baseline.memoryHeapUsed)})`);
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
}

main().catch(err => {
    console.error('\n[Error] Failed to run benchmark:', err);
});
