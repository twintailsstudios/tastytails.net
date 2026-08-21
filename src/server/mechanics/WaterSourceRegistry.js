/**
 * @fileoverview WaterSourceRegistry.js - Dynamic Water Source Tile Ingestion & Spatial Query Engine
 * @subsystem Environment & NPC Desire Engine
 * @description
 * Parses map tilesets (specifically alpha_ground_set in ground layer) to dynamically index
 * all tiles possessing the 'waterSource' custom property. Provides O(1) spatial hashing
 * and nearest-water queries with adjacent shoreline standing spot resolution.
 */

const log = require('../../logger');

class WaterSourceRegistry {
    constructor() {
        /** @type {Set<number>} */
        this.waterGids = new Set();
        /** @type {Set<string>} Key: "tx,ty" */
        this.waterTileSet = new Set();
        /** @type {Array<{tx: number, ty: number, worldX: number, worldY: number, gid: number}>} */
        this.waterTileList = [];
        /** @type {Array<{waterTile: Object, standingSpot: Object, tx: number, ty: number, worldX: number, worldY: number}>} */
        this.shorelineList = [];
        /** @type {Map<string, Array<Object>>} Spatial Hash Buckets (400px cells) */
        this.spatialGrid = new Map();
        
        this.tileSize = 32;
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.bucketSize = 400; // 400px spatial hash cell size
    }

    /**
     * Initializes the registry by parsing tilesets and tile layers from Tiled JSON map data.
     * @param {Object} tilemapData - Parsed JSON object of alpha_map.json
     * @param {number} [tileSize=32] - Tile dimension in pixels
     */
    initFromMap(tilemapData, tileSize = 32) {
        this.waterGids.clear();
        this.waterTileSet.clear();
        this.waterTileList = [];
        this.shorelineList = [];
        this.spatialGrid.clear();

        if (!tilemapData) return;

        this.tileSize = tileSize;
        this.mapWidth = tilemapData.width || 0;
        this.mapHeight = tilemapData.height || 0;

        // 1. Scan Tilesets for waterSource property with strict integer ID checks
        if (Array.isArray(tilemapData.tilesets)) {
            tilemapData.tilesets.forEach(tileset => {
                const firstgid = tileset.firstgid || 1;
                if (!Array.isArray(tileset.tiles)) return;

                tileset.tiles.forEach(tile => {
                    // Critical Guard: Only process tiles with a valid, non-null integer ID
                    if (!tile || typeof tile.id !== 'number' || tile.id < 0 || !tile.properties) return;

                    let hasWater = false;
                    for (let i = 0; i < tile.properties.length; i++) {
                        const prop = tile.properties[i];
                        if (!prop) continue;

                        // Check direct property name 'waterSource'
                        if (prop.name === 'waterSource') {
                            if (prop.value === true || prop.value === 'True' || prop.value === 'true' || prop.value === 1) {
                                hasWater = true;
                                break;
                            }
                        }

                        // Check custom property container { waterSource: true }
                        if (prop.name === 'custom' && prop.value) {
                            let customVal = prop.value;
                            if (typeof customVal === 'string') {
                                try {
                                    customVal = JSON.parse(customVal);
                                } catch (_) {}
                            }
                            if (customVal && (customVal.waterSource === true || customVal.waterSource === 'True' || customVal.waterSource === 'true' || customVal.waterSource === 1)) {
                                hasWater = true;
                                break;
                            }
                        }
                    }

                    if (hasWater) {
                        const globalGid = firstgid + tile.id;
                        this.waterGids.add(globalGid);
                    }
                });
            });
        }

        // 2. Scan Tile Layers (primarily 'ground' and other ground tile layers)
        if (Array.isArray(tilemapData.layers)) {
            tilemapData.layers.forEach(layer => {
                if (layer.type !== 'tilelayer' || !Array.isArray(layer.data)) return;

                const layerName = (layer.name || '').toLowerCase();
                const isGroundOrWater = layerName.includes('ground') || layerName.includes('water') || layerName.includes('terrain');

                layer.data.forEach((gid, index) => {
                    if (gid === 0) return;

                    if (this.waterGids.has(gid)) {
                        const tx = index % this.mapWidth;
                        const ty = Math.floor(index / this.mapWidth);
                        const key = `${tx},${ty}`;

                        if (!this.waterTileSet.has(key)) {
                            this.waterTileSet.add(key);
                            const worldX = tx * tileSize + (tileSize * 0.5);
                            const worldY = ty * tileSize + (tileSize * 0.5);
                            const entry = { tx, ty, worldX, worldY, gid };
                            this.waterTileList.push(entry);
                        }
                    }
                });
            });
        }

        // 3. Pre-compute Shoreline Water Tiles (tiles bordering dry land) & Spatial Grid
        const CARDINAL_OFFSETS = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 }
        ];

        for (let i = 0; i < this.waterTileList.length; i++) {
            const wTile = this.waterTileList[i];
            let isShoreline = false;
            let primaryDrySpot = null;

            for (let o = 0; o < CARDINAL_OFFSETS.length; o++) {
                const off = CARDINAL_OFFSETS[o];
                const nx = wTile.tx + off.dx;
                const ny = wTile.ty + off.dy;

                // If neighbor is within map bounds and NOT a water tile, it is dry shore!
                if (nx >= 0 && nx < this.mapWidth && ny >= 0 && ny < this.mapHeight && !this.isWaterTile(nx, ny)) {
                    isShoreline = true;
                    if (!primaryDrySpot) {
                        primaryDrySpot = {
                            tx: nx,
                            ty: ny,
                            worldX: nx * tileSize + (tileSize * 0.5),
                            worldY: ny * tileSize + (tileSize * 0.5)
                        };
                    }
                }
            }

            if (isShoreline) {
                const shoreEntry = {
                    waterTile: wTile,
                    standingSpot: primaryDrySpot || { tx: wTile.tx, ty: wTile.ty, worldX: wTile.worldX, worldY: wTile.worldY },
                    tx: wTile.tx,
                    ty: wTile.ty,
                    worldX: wTile.worldX,
                    worldY: wTile.worldY,
                    gid: wTile.gid
                };
                this.shorelineList.push(shoreEntry);

                // Spatial Hash Bucketing on shoreline spots
                const bx = Math.floor(shoreEntry.worldX / this.bucketSize);
                const by = Math.floor(shoreEntry.worldY / this.bucketSize);
                const bucketKey = `${bx},${by}`;
                if (!this.spatialGrid.has(bucketKey)) {
                    this.spatialGrid.set(bucketKey, []);
                }
                this.spatialGrid.get(bucketKey).push(shoreEntry);
            }
        }

        log.info(`[WaterSourceRegistry] Indexed ${this.waterGids.size} water GIDs: [${Array.from(this.waterGids).join(', ')}], ${this.waterTileList.length} water tiles, and ${this.shorelineList.length} shoreline standing spots.`);
    }

    /**
     * Checks if a grid coordinate contains an indexed water source tile.
     * @param {number} tx - Tile X
     * @param {number} ty - Tile Y
     * @returns {boolean}
     */
    isWaterTile(tx, ty) {
        return this.waterTileSet.has(`${tx},${ty}`);
    }

    /**
     * Finds the nearest water source tile and calculates the optimal adjacent dry shore standing spot.
     * 
     * @param {number} fromPixelX - Search origin X in world pixels
     * @param {number} fromPixelY - Search origin Y in world pixels
     * @param {Array<Array<number>>|Function} [collisionMap] - Collision grid to verify dry standing spot
     * @param {number} [maxRadius=10000] - Maximum search distance in pixels
     * @returns {{ waterTile: {tx: number, ty: number, worldX: number, worldY: number}, standingSpot: {tx: number, ty: number, worldX: number, worldY: number}, distance: number }|null}
     */
    findNearestWaterSource(fromPixelX, fromPixelY, collisionMap = null, maxRadius = 10000) {
        // Prioritize searching shoreline tiles bordering dry land
        const searchList = this.shorelineList.length > 0 ? this.shorelineList : this.waterTileList;
        if (searchList.length === 0) return null;

        const maxRadSq = maxRadius * maxRadius;
        let bestCandidate = null;
        let minDistanceSq = Infinity;

        // Optimization: Sample nearby spatial hash buckets first
        const centerBx = Math.floor(fromPixelX / this.bucketSize);
        const centerBy = Math.floor(fromPixelY / this.bucketSize);
        const bucketRadius = Math.ceil(maxRadius / this.bucketSize);

        const candidates = [];
        for (let bx = centerBx - bucketRadius; bx <= centerBx + bucketRadius; bx++) {
            for (let by = centerBy - bucketRadius; by <= centerBy + bucketRadius; by++) {
                const bList = this.spatialGrid.get(`${bx},${by}`);
                if (bList && bList.length > 0) {
                    for (let i = 0; i < bList.length; i++) {
                        candidates.push(bList[i]);
                    }
                }
            }
        }

        const targetList = candidates.length > 0 ? candidates : searchList;

        const CARDINAL_OFFSETS = [
            { dx: 0, dy: -1 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 },
            { dx: 1, dy: 0 }
        ];

        for (let i = 0; i < targetList.length; i++) {
            const entry = targetList[i];
            const wTile = entry.waterTile || entry;
            const distSq = (wTile.worldX - fromPixelX) ** 2 + (wTile.worldY - fromPixelY) ** 2;

            if (distSq < minDistanceSq && distSq <= maxRadSq) {
                // Find closest unblocked adjacent dry shoreline spot
                let bestSpot = null;
                let minSpotDistSq = Infinity;

                for (let o = 0; o < CARDINAL_OFFSETS.length; o++) {
                    const off = CARDINAL_OFFSETS[o];
                    const stx = wTile.tx + off.dx;
                    const sty = wTile.ty + off.dy;

                    const isWater = this.isWaterTile(stx, sty);
                    const isBlocked = this._isBlocked(stx, sty, collisionMap);

                    if (!isWater && !isBlocked) {
                        const spotWorldX = stx * this.tileSize + (this.tileSize * 0.5);
                        const spotWorldY = sty * this.tileSize + (this.tileSize * 0.5);
                        const spotDistSq = (spotWorldX - fromPixelX) ** 2 + (spotWorldY - fromPixelY) ** 2;

                        if (spotDistSq < minSpotDistSq) {
                            minSpotDistSq = spotDistSq;
                            bestSpot = {
                                tx: stx,
                                ty: sty,
                                worldX: spotWorldX,
                                worldY: spotWorldY
                            };
                        }
                    }
                }

                // Fallback to entry's standingSpot or tile center
                if (!bestSpot) {
                    bestSpot = entry.standingSpot || {
                        tx: wTile.tx,
                        ty: wTile.ty,
                        worldX: wTile.worldX,
                        worldY: wTile.worldY
                    };
                }

                minDistanceSq = distSq;
                bestCandidate = {
                    waterTile: wTile,
                    standingSpot: bestSpot,
                    distance: Math.sqrt(distSq)
                };
            }
        }

        return bestCandidate;
    }

    /**
     * Helper to test tile collision on grid.
     * @private
     */
    _isBlocked(tx, ty, collisionMap) {
        if (typeof collisionMap === 'function') {
            return collisionMap(tx, ty);
        }
        if (!Array.isArray(collisionMap)) return false;
        if (ty < 0 || ty >= collisionMap.length) return true;
        const row = collisionMap[ty];
        if (!Array.isArray(row) || tx < 0 || tx >= row.length) return true;
        return row[tx] === 1 || row[tx] === true;
    }

    /**
     * Returns total water tiles indexed.
     * @returns {number}
     */
    getTotalWaterTiles() {
        return this.waterTileList.length;
    }

    /**
     * Returns total shoreline water spots indexed.
     * @returns {number}
     */
    getTotalShorelineSpots() {
        return this.shorelineList.length;
    }
}

// Singleton Export
const instance = new WaterSourceRegistry();
module.exports = instance;
