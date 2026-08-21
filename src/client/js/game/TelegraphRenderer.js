/**
 * @fileoverview TelegraphRenderer.js - GPU-Accelerated Universal Combat Telegraph Decal Engine
 * @subsystem Combat & Telegraph Engine
 * @description
 * High-performance client-side combat telegraph renderer for Phaser 3.
 * Uses an object pool of Phaser.GameObjects.Graphics with depth-sorting below player entities.
 * Automatically synchronizes 4-phase attack lifecycles (WINDUP -> FLASH -> ACTIVE -> RECOVERY)
 * and renders smooth dynamic decals across all 5 geometric archetypes.
 */

export class TelegraphRenderer {
    /**
     * @param {Phaser.Scene} scene - Active Phaser game scene
     * @param {Object} [socket=null] - Optional Socket.io client instance
     */
    constructor(scene, socket = null) {
        this.scene = scene;
        this.activeTelegraphs = new Map(); // Key: mobId -> telegraph instance
        this.graphicsPool = [];
        this.registeredSocket = null;

        // Pre-allocate initial graphics pool
        for (let i = 0; i < 15; i++) {
            this.graphicsPool.push(this.createGraphicsObject());
        }

        // Register socket event listeners if socket or scene socket is available
        const activeSocket = socket || scene.socket || (typeof window !== 'undefined' ? window.gameSocket : null);
        if (activeSocket) {
            this.registerSocketListeners(activeSocket);
        }
    }

    /**
     * Explicit initializer to bind socket when connected later in scene lifecycle.
     * @param {Object} socket - Active Socket.IO instance
     */
    init(socket) {
        if (socket && socket !== this.registeredSocket) {
            this.registerSocketListeners(socket);
        }
    }

    /**
     * Creates a pooled Phaser Graphics object with additive blending and ground-level depth.
     * @returns {Phaser.GameObjects.Graphics}
     */
    createGraphicsObject() {
        const gfx = this.scene.add.graphics();
        gfx.setDepth(150); // Above ground tiles and dynamic shadows (depth 100), below character sprites
        gfx.setVisible(false);
        return gfx;
    }

    /**
     * Fetches a graphics object from pool or instantiates new.
     * @returns {Phaser.GameObjects.Graphics}
     */
    getGraphics() {
        if (this.graphicsPool.length > 0) {
            const gfx = this.graphicsPool.pop();
            gfx.setVisible(true);
            gfx.clear();
            return gfx;
        }
        return this.createGraphicsObject();
    }

    /**
     * Returns a graphics object to the pool.
     * @param {Phaser.GameObjects.Graphics} gfx
     */
    recycleGraphics(gfx) {
        if (!gfx) return;
        gfx.clear();
        gfx.setVisible(false);
        this.graphicsPool.push(gfx);
    }

    /**
     * Registers Socket.IO listeners for telegraph lifecycle events.
     * @param {Object} socket - Socket.io client instance
     */
    registerSocketListeners(socket) {
        if (!socket) return;
        this.registeredSocket = socket;

        socket.on('enemyTelegraphStart', (data) => {
            this.onTelegraphStart(data);
        });

        socket.on('enemyTelegraphCancel', (data) => {
            this.onTelegraphCancel(data);
        });

        socket.on('enemyAttackExecute', (data) => {
            this.onAttackExecute(data);
        });

        socket.on('enemyDied', (data) => {
            if (data && data.mobId) {
                this.removeTelegraph(data.mobId);
            }
        });
    }

    /**
     * Initiates a new telegraphed attack decal.
     * @param {Object} data - Telegraph payload from server
     */
    onTelegraphStart(data) {
        const { mobId, attackId, type, origin, angle, targetPos, params, durations, limbGlow } = data;

        // Clean up any existing telegraph for this mob
        if (this.activeTelegraphs.has(mobId)) {
            this.removeTelegraph(mobId);
        }

        const gfx = this.getGraphics();
        const startTime = this.scene.time.now;

        const telegraph = {
            mobId,
            attackId,
            type,
            origin: { x: origin.x, y: origin.y },
            angle: angle || 0,
            targetPos: targetPos || { x: origin.x, y: origin.y },
            params: params || {},
            durations: durations || { windupMs: 1000, flashMs: 150, activeMs: 300, recoveryMs: 600 },
            limbGlow,
            gfx,
            startTime,
            phase: 'windup'
        };

        this.activeTelegraphs.set(mobId, telegraph);

        // Highlight limb on enemy sprite if present in scene
        if (this.scene.enemiesMap && this.scene.enemiesMap.has(mobId)) {
            const enemySprite = this.scene.enemiesMap.get(mobId);
            if (enemySprite && typeof enemySprite.setLimbGlow === 'function') {
                enemySprite.setLimbGlow(limbGlow);
            }
        }
    }

    /**
     * Handles attack cancellation (e.g. weak point stagger interrupt).
     */
    onTelegraphCancel(data) {
        const { mobId, reason, limb } = data;
        const telegraph = this.activeTelegraphs.get(mobId);
        if (telegraph) {
            // Flash blue/cyan stagger particles
            this.spawnCancelFX(telegraph.origin.x, telegraph.origin.y);
            this.removeTelegraph(mobId);
        }
    }

    /**
     * Handles attack hitbox execution: spawns impact FX and cleans up decal.
     */
    onAttackExecute(data) {
        const { mobId, origin, angle } = data;
        const telegraph = this.activeTelegraphs.get(mobId);

        if (telegraph) {
            this.spawnImpactFX(telegraph);
            this.removeTelegraph(mobId);
        }
    }

    /**
     * Removes and recycles a telegraph instance.
     */
    removeTelegraph(mobId) {
        const telegraph = this.activeTelegraphs.get(mobId);
        if (!telegraph) return;

        this.recycleGraphics(telegraph.gfx);
        this.activeTelegraphs.delete(mobId);

        // Reset limb glow on enemy sprite
        if (this.scene.enemiesMap && this.scene.enemiesMap.has(mobId)) {
            const enemySprite = this.scene.enemiesMap.get(mobId);
            if (enemySprite && typeof enemySprite.clearLimbGlow === 'function') {
                enemySprite.clearLimbGlow();
            }
        }
    }

    /**
     * Main client render loop (invoked in Scene update).
     * @param {number} time - Current game time in ms
     * @param {number} delta - Frame delta in ms
     */
    update(time, delta) {
        if (this.activeTelegraphs.size === 0) return;

        for (const [mobId, tele] of this.activeTelegraphs.entries()) {
            const elapsed = time - tele.startTime;
            const windupMs = tele.durations.windupMs || 1000;
            const flashMs = tele.durations.flashMs || 150;

            // If linked to an enemy sprite, track position and heading dynamically for first 60% of windup
            if (this.scene.enemiesMap && this.scene.enemiesMap.has(mobId)) {
                const sprite = this.scene.enemiesMap.get(mobId);
                if (sprite && sprite.active) {
                    const ratio = elapsed / windupMs;
                    if (ratio <= 0.60) {
                        tele.origin.x = sprite.x;
                        tele.origin.y = sprite.y;

                        // Target tracking: Aim towards the player/target during tracking window
                        const targetX = (this.scene.playerContainer) ? this.scene.playerContainer.x : tele.targetPos.x;
                        const targetY = (this.scene.playerContainer) ? this.scene.playerContainer.y : tele.targetPos.y;
                        if (typeof targetX === 'number' && typeof targetY === 'number') {
                            tele.angle = Math.atan2(targetY - tele.origin.y, targetX - tele.origin.x);
                        }
                    }
                }
            }

            // Determine Phase & Colors
            let fillColor = 0xff3b3b; // Warning Red
            let fillAlpha = 0.28;
            let borderColor = 0xff6666;
            let borderAlpha = 0.8;
            let fillRatio = Math.min(1.0, elapsed / windupMs);

            if (elapsed < windupMs) {
                // WINDUP PHASE: Decal expands / fills from 0 to 1
                tele.phase = 'windup';
            } else if (elapsed < windupMs + flashMs) {
                // FLASH PHASE: Bright white neon lock
                tele.phase = 'flash';
                fillColor = 0xffffff;
                fillAlpha = 0.85;
                borderColor = 0xffffff;
                borderAlpha = 1.0;
                fillRatio = 1.0;
            } else {
                // Active / Complete: Handled by execution or timeout fallback
                fillColor = 0xffffff;
                fillAlpha = 0.7;
                fillRatio = 1.0;
            }

            // Render Decal Geometry
            this.renderShape(tele, fillRatio, fillColor, fillAlpha, borderColor, borderAlpha);
        }
    }

    /**
     * Renders specific 2D telegraph shape geometry onto the Phaser Graphics object.
     */
    renderShape(tele, fillRatio, fillColor, fillAlpha, borderColor, borderAlpha) {
        const gfx = tele.gfx;
        gfx.clear();

        const { type, origin, angle, targetPos, params } = tele;

        // Dynamic depth sorting: just below the enemy/player character sprite and above shadows/tiles
        gfx.setDepth(Math.max(120, Math.floor(origin.y) - 5));

        switch (type) {
            case 'linear_runway': {
                const len = params.length || 260;
                const width = params.width || 50;
                const halfW = width * 0.5;
                const currentLen = len * fillRatio;

                // Base outline of entire corridor
                gfx.lineStyle(2, borderColor, borderAlpha * 0.5);
                this.drawRotatedRect(gfx, origin.x, origin.y, angle, len, width, halfW);

                // Filling danger rect along heading
                gfx.fillStyle(fillColor, fillAlpha);
                gfx.lineStyle(2, borderColor, borderAlpha);
                this.drawRotatedRect(gfx, origin.x, origin.y, angle, currentLen, width, halfW, true);
                break;
            }

            case 'conical': {
                const maxRange = params.range || 75;
                const arcDeg = params.arcAngle || 90;
                const arcRad = (arcDeg * Math.PI) / 180;
                const startAngle = angle - arcRad * 0.5;
                const endAngle = angle + arcRad * 0.5;
                const currentR = maxRange * fillRatio;

                // Outer boundary arc
                gfx.lineStyle(2, borderColor, borderAlpha * 0.4);
                gfx.beginPath();
                gfx.moveTo(origin.x, origin.y);
                gfx.arc(origin.x, origin.y, maxRange, startAngle, endAngle, false);
                gfx.closePath();
                gfx.strokePath();

                // Filled cone sector
                gfx.fillStyle(fillColor, fillAlpha);
                gfx.lineStyle(2, borderColor, borderAlpha);
                gfx.beginPath();
                gfx.moveTo(origin.x, origin.y);
                gfx.arc(origin.x, origin.y, currentR, startAngle, endAngle, false);
                gfx.closePath();
                gfx.fillPath();
                gfx.strokePath();
                break;
            }

            case 'radial': {
                const maxR = params.radius || params.range || 100;
                const innerR = params.innerRadius || 0;
                const currentR = innerR + (maxR - innerR) * fillRatio;

                // Outer guide circle
                gfx.lineStyle(2, borderColor, borderAlpha * 0.4);
                gfx.strokeCircle(origin.x, origin.y, maxR);
                if (innerR > 0) {
                    gfx.strokeCircle(origin.x, origin.y, innerR);
                }

                // Filled expanding ring or solid circle
                gfx.fillStyle(fillColor, fillAlpha);
                gfx.lineStyle(2, borderColor, borderAlpha);
                if (innerR > 0) {
                    // Donut Ring
                    gfx.beginPath();
                    gfx.arc(origin.x, origin.y, currentR, 0, Math.PI * 2, false);
                    gfx.arc(origin.x, origin.y, innerR, Math.PI * 2, 0, true);
                    gfx.closePath();
                    gfx.fillPath();
                    gfx.strokePath();
                } else {
                    gfx.fillCircle(origin.x, origin.y, currentR);
                    gfx.strokeCircle(origin.x, origin.y, currentR);
                }
                break;
            }

            case 'targeted_mortar': {
                const radius = params.radius || 80;
                const currentR = radius * fillRatio;
                const tx = targetPos.x;
                const ty = targetPos.y;

                // Outer target reticle
                gfx.lineStyle(2, borderColor, borderAlpha * 0.5);
                gfx.strokeCircle(tx, ty, radius);

                // Crosshairs
                gfx.lineBetween(tx - radius - 6, ty, tx + radius + 6, ty);
                gfx.lineBetween(tx, ty - radius - 6, tx, ty + radius + 6);

                // Inward / Expanding filled danger zone
                gfx.fillStyle(fillColor, fillAlpha);
                gfx.lineStyle(2, borderColor, borderAlpha);
                gfx.fillCircle(tx, ty, currentR);
                gfx.strokeCircle(tx, ty, currentR);
                break;
            }

            case 'directional_bullet': {
                const range = params.range || 250;
                const count = params.count || 5;
                const spreadAngle = ((params.spreadAngle || 30) * Math.PI) / 180;
                const currentRange = range * fillRatio;

                gfx.lineStyle(2, borderColor, borderAlpha);
                const step = count > 1 ? spreadAngle / (count - 1) : 0;
                const startA = angle - spreadAngle * 0.5;

                for (let i = 0; i < count; i++) {
                    const rayAngle = startA + i * step;
                    const ex = origin.x + Math.cos(rayAngle) * currentRange;
                    const ey = origin.y + Math.sin(rayAngle) * currentRange;
                    gfx.lineBetween(origin.x, origin.y, ex, ey);

                    gfx.fillStyle(fillColor, fillAlpha * 1.5);
                    gfx.fillCircle(ex, ey, 6);
                }
                break;
            }
        }
    }

    /**
     * Helper to draw a rotated rectangle corridor along an angle vector.
     */
    drawRotatedRect(gfx, x, y, angle, length, width, halfW, fill = false) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const perpCos = -sin;
        const perpSin = cos;

        // 4 Corners:
        // p1: (0, -halfW), p2: (length, -halfW), p3: (length, halfW), p4: (0, halfW)
        const p1x = x + perpCos * (-halfW);
        const p1y = y + perpSin * (-halfW);

        const p2x = x + cos * length + perpCos * (-halfW);
        const p2y = y + sin * length + perpSin * (-halfW);

        const p3x = x + cos * length + perpCos * (halfW);
        const p3y = y + sin * length + perpSin * (halfW);

        const p4x = x + perpCos * (halfW);
        const p4y = y + perpSin * (halfW);

        gfx.beginPath();
        gfx.moveTo(p1x, p1y);
        gfx.lineTo(p2x, p2y);
        gfx.lineTo(p3x, p3y);
        gfx.lineTo(p4x, p4y);
        gfx.closePath();

        if (fill) {
            gfx.fillPath();
        }
        gfx.strokePath();
    }

    /**
     * Spawns impact shockwave visual particles on attack execution.
     */
    spawnImpactFX(tele) {
        const shockGfx = this.scene.add.graphics();
        const ox = tele.origin.x;
        const oy = tele.origin.y;
        shockGfx.setDepth(Math.max(150, Math.floor(oy) + 5));

        let expandRadius = 100;
        if (tele.params && (tele.params.radius || tele.params.range)) {
            expandRadius = tele.params.radius || tele.params.range;
        }

        this.scene.tweens.add({
            targets: { r: 10, alpha: 0.9 },
            r: expandRadius,
            alpha: 0,
            duration: 350,
            ease: 'Cubic.easeOut',
            onUpdate: (tween, target) => {
                shockGfx.clear();
                shockGfx.lineStyle(4, 0xff4444, target.alpha);
                shockGfx.strokeCircle(ox, oy, target.r);
            },
            onComplete: () => {
                shockGfx.destroy();
            }
        });
    }

    /**
     * Spawns stagger / interrupt disruption particles.
     */
    spawnCancelFX(x, y) {
        const cancelGfx = this.scene.add.graphics();
        cancelGfx.setDepth(Math.max(160, Math.floor(y) + 5));

        this.scene.tweens.add({
            targets: { r: 10, alpha: 1.0 },
            r: 60,
            alpha: 0,
            duration: 400,
            ease: 'Quad.easeOut',
            onUpdate: (tween, target) => {
                cancelGfx.clear();
                cancelGfx.lineStyle(3, 0x33ccff, target.alpha);
                cancelGfx.strokeCircle(x, y, target.r);
            },
            onComplete: () => {
                cancelGfx.destroy();
            }
        });
    }

    /**
     * Destroys all active graphics objects and clears pools on scene shutdown.
     */
    destroy() {
        for (const [mobId, tele] of this.activeTelegraphs.entries()) {
            if (tele.gfx) tele.gfx.destroy();
        }
        this.activeTelegraphs.clear();

        for (const gfx of this.graphicsPool) {
            gfx.destroy();
        }
        this.graphicsPool = [];
    }
}

export default TelegraphRenderer;
