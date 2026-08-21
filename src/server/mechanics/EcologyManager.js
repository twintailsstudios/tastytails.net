/**
 * @fileoverview EcologyManager.js - Authoritative Ecological Spawning & Life-Cycle Orchestrator
 * @subsystem World Generation, Flora Spawning, Dietary Ecology & NPC AI
 * @description
 * Coordinates dynamic vegetation population (`plantZone`), weighted forageable generation,
 * herbivore grazing cycles, player harvesting, dynamic relocation respawning, and fauna
 * population equilibrium across `alpha_map.json` painted zone layers.
 */

const log = require('../../logger');
const ecologyDefs = require('../../data/ecologyDefinitions');
const resourceNodeDefs = require('../../data/resourceNodeData');

class EcologyManager {
    constructor() {
        this.io = null;
        this.activeResourceNodes = {};
        this.worldItems = [];
        this.addItemToGrid = null;
        this.removeItemFromGrid = null;
        this.enemyManager = null;
        this.isTileSolid = () => false;

        // Zone Tile Coordinate Registries: Array<{ x: number, y: number, tileX: number, tileY: number }>
        this.plantTiles = [];
        this.herbivoreTiles = [];
        this.carnivoreTiles = [];

        // Active Flora Instance Tracking: Map<string, Object>
        this.activeFlora = {};

        // Pending Dynamic Respawns
        this.pendingFloraRespawns = [];
        this.pendingFaunaRespawns = {
            herbivores: [],
            carnivores: []
        };

        this.initialized = false;
        this.floraCounter = 0;
        this.faunaCounter = 0;
    }

    /**
     * Initializes the EcologyManager with server dependencies and map data.
     * @param {Object} config
     * @param {Object} config.io - Socket.io server instance
     * @param {Object} config.tilemapData - Loaded Tiled map JSON object
     * @param {Object} config.activeResourceNodes - Server global activeResourceNodes dictionary
     * @param {Array} config.worldItems - Server global worldItems array
     * @param {Function} config.addItemToGrid - Spatial hash add callback
     * @param {Function} config.removeItemFromGrid - Spatial hash remove callback
     * @param {Object} config.enemyManager - Master EnemyManager singleton
     * @param {Function} [config.isTileSolid] - Point collision checker
     */
    init(config = {}) {
        this.io = config.io || null;
        this.activeResourceNodes = config.activeResourceNodes || {};
        this.worldItems = config.worldItems || [];
        this.addItemToGrid = config.addItemToGrid || null;
        this.removeItemFromGrid = config.removeItemFromGrid || null;
        this.enemyManager = config.enemyManager || null;
        this.isTileSolid = config.isTileSolid || (() => false);

        const tilemapData = config.tilemapData;
        if (!tilemapData) {
            log.warn('[EcologyManager] No tilemapData provided during initialization.');
            return;
        }

        // 1. Scan and Extract Zone Tiles from Tilemap Data
        this.scanZoneLayers(tilemapData);

        // 2. Populate Initial Dynamic Flora into World
        this.populateInitialFlora();

        // 3. Populate Initial Fauna (Herbivores & Carnivores)
        this.populateInitialFauna();

        this.initialized = true;
        log.info(`[EcologyManager] Initialized: ${this.plantTiles.length} plant tiles (${Object.keys(this.activeFlora).length} active flora), ${this.herbivoreTiles.length} herbivore tiles, ${this.carnivoreTiles.length} carnivore tiles.`);
    }

    /**
     * Scans tile layers for 'plantZone', 'herbivoreZone', 'carnivoreZone' (or custom zone properties)
     * and compiles pixel coordinates.
     * @param {Object} tilemapData
     */
    scanZoneLayers(tilemapData) {
        this.plantTiles = [];
        this.herbivoreTiles = [];
        this.carnivoreTiles = [];

        const mapWidth = tilemapData.width || 240;
        const mapHeight = tilemapData.height || 240;
        const tileSize = tilemapData.tilewidth || 32;

        // Build global GID to zone string mapping from tilesets
        const zoneGids = {};
        if (Array.isArray(tilemapData.tilesets)) {
            tilemapData.tilesets.forEach(ts => {
                const firstgid = ts.firstgid;
                if (Array.isArray(ts.tiles)) {
                    ts.tiles.forEach(tile => {
                        const globalId = firstgid + tile.id;
                        if (Array.isArray(tile.properties)) {
                            // Direct zone property
                            const zoneProp = tile.properties.find(p => p.name === 'zone');
                            if (zoneProp && zoneProp.value) {
                                zoneGids[globalId] = String(zoneProp.value).toLowerCase();
                            }
                            // Nested custom property
                            const customProp = tile.properties.find(p => p.name === 'custom');
                            if (customProp && customProp.value) {
                                let customObj = customProp.value;
                                if (typeof customObj === 'string') {
                                    try { customObj = JSON.parse(customObj); } catch (e) {}
                                }
                                if (customObj && customObj.zone) {
                                    zoneGids[globalId] = String(customObj.zone).toLowerCase();
                                }
                            }
                        }
                    });
                }
            });
        }

        if (Array.isArray(tilemapData.layers)) {
            tilemapData.layers.forEach(layer => {
                if (layer.type !== 'tilelayer' || !Array.isArray(layer.data)) return;

                const layerNameLower = (layer.name || '').toLowerCase();
                const isPlantLayer = layerNameLower.includes('plant');
                const isHerbivoreLayer = layerNameLower.includes('herbivore');
                const isCarnivoreLayer = layerNameLower.includes('carnivore');

                layer.data.forEach((gid, index) => {
                    if (gid === 0) return;

                    const tileX = index % mapWidth;
                    const tileY = Math.floor(index / mapWidth);
                    if (tileX >= mapWidth || tileY >= mapHeight) return;

                    const worldX = tileX * tileSize + tileSize / 2;
                    const worldY = tileY * tileSize + tileSize / 2;
                    const tileRecord = { x: worldX, y: worldY, tileX, tileY };

                    const zoneVal = zoneGids[gid] || '';

                    if (isPlantLayer || zoneVal === 'plants' || zoneVal === 'plant') {
                        this.plantTiles.push(tileRecord);
                    } else if (isHerbivoreLayer || zoneVal === 'herbivores' || zoneVal === 'herbivore') {
                        this.herbivoreTiles.push(tileRecord);
                    } else if (isCarnivoreLayer || zoneVal === 'carnivores' || zoneVal === 'carnivore') {
                        this.carnivoreTiles.push(tileRecord);
                    }
                });
            });
        }
    }

    /**
     * Rolls a random flora type key based on weighted probabilities from ecologyDefinitions.
     * @returns {string} Flora type key (e.g. 'flora_tall_grass')
     */
    rollWeightedFlora() {
        const pool = ecologyDefs.floraPool;
        const entries = Object.entries(pool);
        if (entries.length === 0) return 'flora_tall_grass';

        let totalWeight = 0;
        for (let i = 0; i < entries.length; i++) {
            totalWeight += (entries[i][1].weight || 1);
        }

        let roll = Math.random() * totalWeight;
        for (let i = 0; i < entries.length; i++) {
            const [key, def] = entries[i];
            const weight = def.weight || 1;
            if (roll < weight) {
                return key;
            }
            roll -= weight;
        }

        return entries[0][0];
    }

    /**
     * Populates initial flora nodes across plantZone up to calculated density cap.
     */
    populateInitialFlora() {
        if (this.plantTiles.length === 0) {
            log.info('[EcologyManager] No plantZone tiles found; skipping flora generation.');
            return;
        }

        const cfg = ecologyDefs.config || {};
        const tilesPerFlora = cfg.tilesPerFlora || 3.5;
        const minCount = cfg.minFloraCount || 20;
        const maxCount = cfg.maxFloraCount || 75;

        // Calculate target count bounded by min and max
        const rawTarget = Math.floor(this.plantTiles.length / tilesPerFlora);
        const targetCount = Math.max(minCount, Math.min(maxCount, rawTarget));

        // Shuffle plant tile candidates
        const shuffled = [...this.plantTiles].sort(() => Math.random() - 0.5);
        const chosen = shuffled.slice(0, targetCount);

        chosen.forEach(tile => {
            this.spawnFloraNode(tile.x, tile.y);
        });

        log.info(`[EcologyManager] Populated ${Object.keys(this.activeFlora).length} wild flora nodes across ${this.plantTiles.length} painted tiles.`);
    }

    /**
     * Spawns a single weighted flora resource node with sub-pixel jitter.
     * @param {number} baseX
     * @param {number} baseY
     * @param {string} [floraKeyOverride]
     * @returns {Object} Spawned node object
     */
    spawnFloraNode(baseX, baseY, floraKeyOverride = null) {
        const floraKey = floraKeyOverride || this.rollWeightedFlora();
        const def = ecologyDefs.floraPool[floraKey] || ecologyDefs.floraPool.flora_tall_grass;
        const nodeDef = resourceNodeDefs[floraKey] || {};

        const jitter = (ecologyDefs.config && ecologyDefs.config.jitterPixels) || 10;
        const offsetX = (Math.random() * (2 * jitter)) - jitter;
        const offsetY = (Math.random() * (2 * jitter)) - jitter;

        this.floraCounter += 1;
        const uid = `flora_${this.floraCounter}_${Date.now()}`;

        const floraItem = {
            uid: uid,
            uniqueId: uid,
            id: uid,
            type: floraKey,
            itemId: floraKey,
            name: def.name,
            description: def.description || '',
            texture: floraKey,
            icon: 'fa-solid fa-seedling',
            size: 1,
            x: Math.round(baseX + offsetX),
            y: Math.round(baseY + offsetY),
            capacity: def.maxCapacity || 1,
            maxCapacity: def.maxCapacity || 1,
            regrowTimer: 0,
            isDynamicFlora: true,
            gatherable: true,
            preventPickup: true,
            isGround: def.isGround !== false,
            interactType: 'gather',
            gatherItem: def.harvestItem || 'fiber_plant',
            gatherTool: def.harvestTool || 'none',
            nutritionValue: def.nutritionValue || 20,
            respawnCooldown: def.respawnCooldown || 60,
            properties: {
                isItem: true,
                gatherable: true,
                preventPickup: true,
                isDynamicFlora: true
            }
        };

        // Register in activeResourceNodes for player and animal consumption
        this.activeResourceNodes[uid] = floraItem;
        this.activeFlora[uid] = floraItem;

        // Register in worldItems and spatial hash grid
        if (Array.isArray(this.worldItems)) {
            this.worldItems.push(floraItem);
        }
        if (typeof this.addItemToGrid === 'function') {
            this.addItemToGrid(floraItem);
        }

        // Broadcast to clients if server is running
        if (this.io) {
            this.io.emit('itemSpawned', floraItem);
            this.io.emit('resourceNodeUpdate', {
                id: uid,
                type: floraKey,
                x: floraItem.x,
                y: floraItem.y,
                capacity: floraItem.capacity,
                frame: (nodeDef.capacityFrames && nodeDef.capacityFrames[floraItem.capacity]) || 0
            });
        }

        return floraItem;
    }

    /**
     * Handles flora depletion (consumed by animal or harvested by player).
     * Removes the node from the world completely and queues a relocation respawn.
     * @param {string} uid
     */
    handleFloraDepleted(uid) {
        const node = this.activeFlora[uid] || this.activeResourceNodes[uid];
        if (!node) return;

        const def = (ecologyDefs.floraPool && ecologyDefs.floraPool[node.type]) || {};
        const respawnDuration = def.respawnCooldown || node.respawnCooldown || 60;

        // Remove from worldItems array
        if (Array.isArray(this.worldItems)) {
            const idx = this.worldItems.findIndex(i => i && (i.uid === uid || i.uniqueId === uid || i.id === uid));
            if (idx > -1) {
                this.worldItems.splice(idx, 1);
            }
        }

        // Remove from spatial hash grid
        if (typeof this.removeItemFromGrid === 'function') {
            this.removeItemFromGrid(node);
        }

        // Delete from active registries
        delete this.activeFlora[uid];
        delete this.activeResourceNodes[uid];

        // Broadcast removal packet to all clients
        if (this.io) {
            this.io.emit('itemRemoved', { uid: uid, id: uid });
            this.io.emit('resourceNodeRemoved', { id: uid, uid: uid });
        }

        // Queue relocation respawn
        this.pendingFloraRespawns.push({
            remainingSeconds: respawnDuration,
            originalType: node.type
        });

        log.info(`[EcologyManager] Flora ${uid} (${node.type}) depleted. Relocation respawn queued in ${respawnDuration}s.`);
    }

    /**
     * Populates initial fauna (herbivores and carnivores) within their spawn zones.
     */
    populateInitialFauna() {
        if (!this.enemyManager) return;

        // 1. Herbivore Population (e.g. Bunnies, Sheep)
        if (this.herbivoreTiles.length > 0 && ecologyDefs.faunaPools.herbivores) {
            const pool = ecologyDefs.faunaPools.herbivores;
            const targetCount = pool.targetPopulation || 6;

            for (let i = 0; i < targetCount; i++) {
                const randomTile = this.herbivoreTiles[Math.floor(Math.random() * this.herbivoreTiles.length)];
                const speciesDefId = this.rollWeightedFauna('herbivores');

                this.faunaCounter += 1;
                const mobId = `wild_${speciesDefId}_${this.faunaCounter}`;

                const jitter = 16;
                const spawnX = Math.round(randomTile.x + (Math.random() * 2 * jitter - jitter));
                const spawnY = Math.round(randomTile.y + (Math.random() * 2 * jitter - jitter));

                this.enemyManager.spawnEnemy(
                    mobId,
                    speciesDefId,
                    spawnX,
                    spawnY,
                    this.isTileSolid
                );
            }
            log.info(`[EcologyManager] Spawned ${targetCount} wild herbivores in herbivoreZone.`);
        }

        // 2. Carnivore Population (e.g. Feral Wolves, Boars)
        if (this.carnivoreTiles.length > 0 && ecologyDefs.faunaPools.carnivores) {
            const pool = ecologyDefs.faunaPools.carnivores;
            const targetCount = pool.targetPopulation || 3;

            for (let i = 0; i < targetCount; i++) {
                const randomTile = this.carnivoreTiles[Math.floor(Math.random() * this.carnivoreTiles.length)];
                const speciesDefId = this.rollWeightedFauna('carnivores');

                this.faunaCounter += 1;
                const mobId = `wild_${speciesDefId}_${this.faunaCounter}`;

                const jitter = 16;
                const spawnX = Math.round(randomTile.x + (Math.random() * 2 * jitter - jitter));
                const spawnY = Math.round(randomTile.y + (Math.random() * 2 * jitter - jitter));

                this.enemyManager.spawnEnemy(
                    mobId,
                    speciesDefId,
                    spawnX,
                    spawnY,
                    this.isTileSolid
                );
            }
            log.info(`[EcologyManager] Spawned ${targetCount} wild carnivores in carnivoreZone.`);
        }
    }

    /**
     * Rolls a random species defId based on weighted probabilities for a given fauna pool.
     * @param {'herbivores'|'carnivores'} poolKey
     * @returns {string} defId
     */
    rollWeightedFauna(poolKey) {
        const pool = ecologyDefs.faunaPools[poolKey];
        if (!pool || !Array.isArray(pool.species) || pool.species.length === 0) {
            return poolKey === 'herbivores' ? 'bunny' : 'tiger';
        }

        let totalWeight = 0;
        for (let i = 0; i < pool.species.length; i++) {
            totalWeight += (pool.species[i].weight || 1);
        }

        let roll = Math.random() * totalWeight;
        for (let i = 0; i < pool.species.length; i++) {
            const spec = pool.species[i];
            const w = spec.weight || 1;
            if (roll < w) {
                return spec.defId;
            }
            roll -= w;
        }

        return pool.species[0].defId;
    }

    /**
     * Authoritative tick loop execution (invoked from server-loop.js at 30Hz).
     * Processes pending flora and fauna respawn timers.
     * @param {number} delta - Frame delta in seconds (e.g. 0.033)
     */
    update(delta) {
        if (!this.initialized) return;

        // 1. Process Pending Flora Respawns
        if (this.pendingFloraRespawns.length > 0 && this.plantTiles.length > 0) {
            for (let i = this.pendingFloraRespawns.length - 1; i >= 0; i--) {
                const respawn = this.pendingFloraRespawns[i];
                respawn.remainingSeconds -= delta;

                if (respawn.remainingSeconds <= 0) {
                    // Pick a random plant tile for relocation
                    const randomTile = this.plantTiles[Math.floor(Math.random() * this.plantTiles.length)];
                    this.spawnFloraNode(randomTile.x, randomTile.y);
                    this.pendingFloraRespawns.splice(i, 1);
                }
            }
        }

        // 2. Check and Maintain Fauna Population Equilibrium
        if (this.enemyManager) {
            this.checkFaunaEquilibrium('herbivores', delta);
            this.checkFaunaEquilibrium('carnivores', delta);
        }
    }

    /**
     * Checks if current active population of a fauna pool is below target and handles respawn timers.
     * @param {'herbivores'|'carnivores'} poolKey
     * @param {number} delta
     */
    checkFaunaEquilibrium(poolKey, delta) {
        const pool = ecologyDefs.faunaPools[poolKey];
        const tiles = poolKey === 'herbivores' ? this.herbivoreTiles : this.carnivoreTiles;
        if (!pool || tiles.length === 0) return;

        const targetCount = pool.targetPopulation || (poolKey === 'herbivores' ? 6 : 3);
        const speciesKeys = new Set(pool.species.map(s => s.defId));

        // Count current active matching mobs
        let activeCount = 0;
        if (this.enemyManager.activeEnemies) {
            for (const enemy of Object.values(this.enemyManager.activeEnemies)) {
                if (enemy && enemy.state !== 'DEAD' && speciesKeys.has(enemy.defId)) {
                    activeCount++;
                }
            }
        }

        // If below target and no respawn currently queued for this missing count, queue a respawn
        const missingCount = targetCount - (activeCount + this.pendingFaunaRespawns[poolKey].length);
        if (missingCount > 0) {
            for (let m = 0; m < missingCount; m++) {
                this.pendingFaunaRespawns[poolKey].push({
                    remainingSeconds: pool.respawnCooldown || 90
                });
                log.info(`[EcologyManager] Queued ${poolKey} fauna respawn in ${pool.respawnCooldown || 90}s (active: ${activeCount}, target: ${targetCount})`);
            }
        }

        // Process queued fauna respawns
        for (let i = this.pendingFaunaRespawns[poolKey].length - 1; i >= 0; i--) {
            const resp = this.pendingFaunaRespawns[poolKey][i];
            resp.remainingSeconds -= delta;

            if (resp.remainingSeconds <= 0) {
                const randomTile = tiles[Math.floor(Math.random() * tiles.length)];
                const speciesDefId = this.rollWeightedFauna(poolKey);

                this.faunaCounter += 1;
                const mobId = `wild_${speciesDefId}_${this.faunaCounter}`;

                const jitter = 16;
                const spawnX = Math.round(randomTile.x + (Math.random() * 2 * jitter - jitter));
                const spawnY = Math.round(randomTile.y + (Math.random() * 2 * jitter - jitter));

                this.enemyManager.spawnEnemy(
                    mobId,
                    speciesDefId,
                    spawnX,
                    spawnY,
                    this.isTileSolid
                );

                this.pendingFaunaRespawns[poolKey].splice(i, 1);
                log.info(`[EcologyManager] Respawned ${speciesDefId} (${mobId}) at (${spawnX}, ${spawnY}) in ${poolKey} zone.`);
            }
        }
    }

    /**
     * Returns a snapshot of all active dynamic flora nodes for newly connected clients.
     * @returns {Array<Object>}
     */
    getAllFloraSnapshot() {
        return Object.values(this.activeFlora).map(node => {
            const nodeDef = resourceNodeDefs[node.type] || {};
            return {
                id: node.uid,
                uid: node.uid,
                type: node.type,
                x: node.x,
                y: node.y,
                capacity: node.capacity,
                frame: (nodeDef.capacityFrames && nodeDef.capacityFrames[node.capacity]) || 0
            };
        });
    }
}

// Singleton Export
const instance = new EcologyManager();
module.exports = instance;
