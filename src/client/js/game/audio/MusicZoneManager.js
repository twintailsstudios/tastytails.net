/**
 * @fileoverview Spatial Music Zone Geometry & Position Evaluator for TastyTails.net
 * 
 * @description
 * High-level spatial geometry evaluator that parses Tiled map object layers (rectangles, polygons, door proximity points),
 * evaluates player (x, y) coordinates against spatial zones, calculates entrance proximity distance blend ratios,
 * and enforces spatial/temporal hysteresis to prevent audio border thrashing.
 * 
 * Triggered by: MidiEngine.updatePlayerPosition(px, py) on every frame/movement tick.
 */

export class MusicZoneManager {
    constructor() {
        /** @type {Array<Object>} List of registered zone definitions */
        this.zones = [];
        /** @type {string} Default baseline zone key when outside all specific zones */
        this.defaultZone = 'overworld';
        /** @type {string} Last evaluated active zone key */
        this.activeZone = 'overworld';
        
        // Hysteresis & Debouncing parameters
        /** @type {number} Minimum time in ms between zone shifts to prevent rapid flickering */
        this.debounceMs = 300;
        /** @type {number} Timestamp of last zone change */
        this.lastTransitionTime = 0;
        /** @type {number} Hysteresis boundary padding in pixels */
        this.hysteresisPadding = 16;

        /** @type {Object|null} Cached tilemap reference or layer for fallback lookups */
        this._cachedMusicLayer = null;

        // OPTIMIZATION: Zero-GC result object pooling. Returning a pre-allocated object prevents 60Hz heap allocations,
        // avoiding Garbage Collection sweeps that cause Web Audio buffer underruns, clicks, and pops.
        /** 
         * Pre-allocated result object to eliminate Garbage Collection allocations in 60Hz hot loops.
         * Preventing GC sweeps is essential to ensure clean, crisp audio playback free of micro-jank and pops.
         */
        this._evalResult = {
            targetZone: 'overworld',
            proximityZone: null,
            proximityRatio: 0.0,
            fadeTimeMs: 1000
        };
    }

    /**
     * Registers a music zone definition extracted from Tiled map layers.
     * Pre-computes Axis-Aligned Bounding Box (AABB) bounds for polygon zones to optimize spatial queries.
     * 
     * @param {Object} zoneData 
     * @param {string} zoneData.key - Zone identifier (e.g., 'pub', 'cave')
     * @param {number} [zoneData.x] - Top-left X coordinate
     * @param {number} [zoneData.y] - Top-left Y coordinate
     * @param {number} [zoneData.width] - Zone width
     * @param {number} [zoneData.height] - Zone height
     * @param {Array<{x: number, y: number}>} [zoneData.polygon] - Optional polygon points array
     * @param {number} [zoneData.doorX] - Optional entrance door X coordinate for proximity blending
     * @param {number} [zoneData.doorY] - Optional entrance door Y coordinate for proximity blending
     * @param {number} [zoneData.fadeTimeMs=1000] - Custom crossfade speed in ms
     * @param {number} [zoneData.proximityRadius=192] - Proximity blend radius around door in pixels
     */
    registerZone(zoneData) {
        if (!zoneData || !zoneData.key) return;

        const x = Number(zoneData.x || 0);
        const y = Number(zoneData.y || 0);
        const width = Number(zoneData.width || 0);
        const height = Number(zoneData.height || 0);
        const polygon = Array.isArray(zoneData.polygon) && zoneData.polygon.length >= 3 ? zoneData.polygon : null;
        const proximityRadius = Number(zoneData.proximityRadius || 192);

        // OPTIMIZATION: Pre-calculate Axis-Aligned Bounding Box (AABB) coordinates to allow O(1) early-out
        // spatial rejection before running O(V) ray-casting math on polygon vertices.
        let minX = x;
        let maxX = x + width;
        let minY = y;
        let maxY = y + height;

        if (polygon) {
            minX = Infinity;
            maxX = -Infinity;
            minY = Infinity;
            maxY = -Infinity;
            for (let i = 0; i < polygon.length; i++) {
                const vx = polygon[i].x + x;
                const vy = polygon[i].y + y;
                if (vx < minX) minX = vx;
                if (vx > maxX) maxX = vx;
                if (vy < minY) minY = vy;
                if (vy > maxY) maxY = vy;
            }
        }

        const zoneObj = {
            key: String(zoneData.key).toLowerCase(),
            x,
            y,
            width,
            height,
            polygon,
            minX,
            maxX,
            minY,
            maxY,
            doorX: zoneData.doorX !== undefined ? Number(zoneData.doorX) : (x + width / 2),
            doorY: zoneData.doorY !== undefined ? Number(zoneData.doorY) : (y + height / 2),
            fadeTimeMs: Number(zoneData.fadeTimeMs || 1000),
            proximityRadius,
            proximityRadiusSq: proximityRadius * proximityRadius
        };

        this.zones.push(zoneObj);
        console.log(`[MusicZoneManager] Registered music zone '${zoneObj.key}' at (${zoneObj.x}, ${zoneObj.y}) [${zoneObj.width}x${zoneObj.height}]`);
    }

    /**
     * Clears all registered music zones (e.g. when changing maps).
     */
    clearZones() {
        this.zones = [];
        this.activeZone = this.defaultZone;
        this._cachedMusicLayer = null;
        this.lastTransitionTime = 0;
        this._evalResult.targetZone = this.defaultZone;
        this._evalResult.proximityZone = null;
        this._evalResult.proximityRatio = 0.0;
        this._evalResult.fadeTimeMs = 1000;
    }

    /**
     * Evaluates spatial player coordinates against registered zones.
     * Uses pre-allocated result objects to prevent Garbage Collection pauses, ensuring
     * crisp, click-free Web Audio playback.
     * 
     * IMPORTANT: Returns a pooled internal object reference to eliminate GC pressure.
     * Callers MUST read returned values synchronously within the current tick and MUST NOT
     * retain or mutate the returned object reference across frames.
     * 
     * @param {number} px - Player X coordinate
     * @param {number} py - Player Y coordinate
     * @param {number} [nowMs] - Current timestamp in milliseconds
     * @returns {{ targetZone: string, proximityZone: string|null, proximityRatio: number, fadeTimeMs: number }}
     */
    evaluatePosition(px, py, nowMs = performance.now()) {
        const playerX = Number(px) || 0;
        const playerY = Number(py) || 0;

        let insideZone = null;
        let proximityZone = null;
        let proximityRatio = 0.0;

        // OPTIMIZATION: Two-pass spatial hysteresis. Pass 1 checks exact (0px padding) containment so entering
        // new adjacent zones is instantaneous. Pass 2 applies 16px hysteresis padding to active zone exits to prevent border-stepping audio thrashing.
        // 1a. Primary Pass: Check exact containment (0px padding) across all registered zones
        for (const z of this.zones) {
            if (this._isPointInsideZone(playerX, playerY, z, 0)) {
                insideZone = z;
                break;
            }
        }

        // 1b. Hysteresis Pass: If outside all zones, check if player is within active zone's 16px hysteresis padding
        if (!insideZone && this.activeZone !== this.defaultZone) {
            for (const z of this.zones) {
                if (z.key === this.activeZone && this._isPointInsideZone(playerX, playerY, z, this.hysteresisPadding)) {
                    insideZone = z;
                    break;
                }
            }
        }

        // 2. Check active tilemap 'music' tile layer if not inside an object zone
        if (!insideZone && typeof window !== 'undefined' && window.gameScene && window.gameScene.map) {
            try {
                const map = window.gameScene.map;
                // OPTIMIZATION: Cache tilemap layer references with scene validation to avoid layer array string searches on every frame.
                if (!this._cachedMusicLayer || this._cachedMusicLayer.map !== map || !this._cachedMusicLayer.scene) {
                    this._cachedMusicLayer = map.getLayer('music') || map.getLayer('Music') || null;
                }
                if (this._cachedMusicLayer) {
                    const tile = map.getTileAtWorldXY(playerX, playerY, true, undefined, this._cachedMusicLayer.name);
                    if (tile && tile.index > -1) {
                        const tileZoneKey = tile.properties?.zoneKey || tile.properties?.musicZone || tile.properties?.zone;
                        if (tileZoneKey) {
                            insideZone = { key: String(tileZoneKey).toLowerCase(), fadeTimeMs: 1000 };
                        }
                    }
                }
            } catch (err) {
                this._cachedMusicLayer = null;
            }
        }

        // 3. Check proximity blending if not inside a specific interior zone
        if (!insideZone) {
            for (const z of this.zones) {
                const dx = playerX - z.doorX;
                const dy = playerY - z.doorY;
                const distSq = dx * dx + dy * dy;

                // OPTIMIZATION: Compare squared distances (distSq <= radiusSq) to eliminate Math.sqrt calculations for players outside the door proximity radius.
                if (distSq <= z.proximityRadiusSq) {
                    proximityZone = z;
                    const dist = Math.sqrt(distSq);
                    proximityRatio = 1.0 - (dist / z.proximityRadius);
                    break;
                }
            }
        }

        const rawTargetKey = insideZone ? insideZone.key : this.defaultZone;
        let finalTargetKey = this.activeZone;

        // 4. Enforce Debouncing & Hysteresis
        if (rawTargetKey !== this.activeZone) {
            if ((nowMs - this.lastTransitionTime) >= this.debounceMs) {
                this.activeZone = rawTargetKey;
                this.lastTransitionTime = nowMs;
                finalTargetKey = rawTargetKey;
            }
        }

        // OPTIMIZATION: Populate pre-allocated result object reference to eliminate 60Hz GC allocations
        this._evalResult.targetZone = finalTargetKey;
        this._evalResult.proximityZone = proximityZone ? proximityZone.key : null;
        this._evalResult.proximityRatio = proximityRatio;
        this._evalResult.fadeTimeMs = insideZone ? insideZone.fadeTimeMs : 1000;

        return this._evalResult;
    }

    /**
     * Checks if point (px, py) lies inside a rectangle or polygon zone geometry.
     * Incorporates optional spatial hysteresis padding and fast AABB pre-filtering.
     * 
     * @private
     * @param {number} px - Point X
     * @param {number} py - Point Y
     * @param {Object} zone - Zone object definition
     * @param {number} [padding=0] - Spatial hysteresis padding in pixels
     * @returns {boolean} True if point lies inside geometry or padded boundary
     */
    _isPointInsideZone(px, py, zone, padding = 0) {
        // OPTIMIZATION: Fast AABB bounding box check (with hysteresis padding) before doing expensive polygon/point tests
        if (
            px < (zone.minX - padding) ||
            px > (zone.maxX + padding) ||
            py < (zone.minY - padding) ||
            py > (zone.maxY + padding)
        ) {
            return false;
        }

        if (zone.polygon && zone.polygon.length >= 3) {
            // Ray-casting algorithm for arbitrary polygons
            let inside = false;
            const pts = zone.polygon;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                const xi = pts[i].x + zone.x, yi = pts[i].y + zone.y;
                const xj = pts[j].x + zone.x, yj = pts[j].y + zone.y;

                const intersect = ((yi > py) !== (yj > py)) &&
                    (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }

        // If AABB passed and no polygon, it's inside the rectangle
        return true;
    }
}


