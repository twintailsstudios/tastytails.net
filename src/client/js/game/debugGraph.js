export function initDebugGraph() {
    const rttHistory = new Array(100).fill(0);
    const distHistory = new Array(100).fill(0);
    const maxDataPoints = 100;

    window.updateDebugStats = (rtt, dist) => {
        const overlay = document.getElementById('debug-overlay');
        if (!overlay || overlay.style.display === 'none') return;

        // Update History
        rttHistory.push(rtt);
        if (rttHistory.length > maxDataPoints) rttHistory.shift();

        distHistory.push(dist);
        if (distHistory.length > maxDataPoints) distHistory.shift();

        // Calculate Stats
        const minRtt = Math.min(...rttHistory);
        const maxRtt = Math.max(...rttHistory);
        const minDist = Math.min(...distHistory);
        const maxDist = Math.max(...distHistory);
        const avgRtt = (rttHistory.reduce((a, b) => a + b, 0) / rttHistory.length).toFixed(0);
        const avgDist = (distHistory.reduce((a, b) => a + b, 0) / distHistory.length).toFixed(2);

        // Helper for fixed width
        const pad = (n) => String(n).padStart(3, '0');
        const padFloat = (n) => String(Number(n).toFixed(2)).padStart(6, '0');

        // Update Text
        const rttEl = document.getElementById('debug-rtt');
        const distEl = document.getElementById('debug-dist');
        if (rttEl) rttEl.textContent = `RTT: ${pad(rtt)}ms (Avg: ${pad(avgRtt)}ms) [Lo: ${pad(minRtt)}ms | Hi: ${pad(maxRtt)}ms]`;
        if (distEl) distEl.textContent = `Dist: ${padFloat(dist)}px (Avg: ${padFloat(avgDist)}px) [Lo: ${padFloat(minDist)}px | Hi: ${padFloat(maxDist)}px]`;

        // Draw Graph
        const canvas = document.getElementById('debug-graph');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const w = canvas.width;
            const h = canvas.height;

            ctx.clearRect(0, 0, w, h);

            // Background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, w, h);

            // Grid Lines (5 steps)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i <= 5; i++) {
                const y = h - (i * (h / 5));
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
            }
            ctx.stroke();

            // Draw RTT (Green) - Scale 0-200
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < rttHistory.length; i++) {
                const x = (i / maxDataPoints) * w;
                const normalizedY = Math.min(rttHistory[i] / 200, 1);
                const y = h - (normalizedY * h);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Draw Dist (Red) - Scale 0-50
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < distHistory.length; i++) {
                const x = (i / maxDataPoints) * w;
                const normalizedY = Math.min(distHistory[i] / 50, 1);
                const y = h - (normalizedY * h);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
    };
}
