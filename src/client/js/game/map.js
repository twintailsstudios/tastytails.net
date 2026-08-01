/**
 * @fileoverview Client-Side World Builder & Tilemap Instantiation Engine for TastyTails.net
 * 
 * @description
 * Parses preloaded Tiled JSON maps (`dynamic_map`), creates render layers, binds texture keys,
 * configures Arcade Physics collision boundaries, and asynchronously spawns interactive map objects 
 * (resource nodes, crafting stations, interactive doors) and NPC animals without blocking the main UI thread.
 * 
 * Triggered by: GameScene.create() during scene initialization.
 * Downstream consumers: contextMenu.js, crafting.js, dropMode.js, reconcile.js, update.js.
 */

import { Animal } from './entity/Animal.js';
import { createAnimations } from './animations.js';
import resourceNodeData from './resourceNodeData.js';

/**
 * Normalizes Tiled properties (array format or key-value object format) into a clean Object map.
 * @param {Array<Object>|Object} objProps - Raw Tiled properties array or object map.
 * @returns {Object} Key-value map of normalized properties.
 */
function extractObjectProperties(objProps) {
    const map = {};
    if (Array.isArray(objProps)) {
        objProps.forEach(p => {
            if (p.type === 'bool' || typeof p.value === 'boolean' || p.value === 'true' || p.value === 'false') {
                map[p.name] = (p.value === true || p.value === 'true');
            } else {
                map[p.name] = p.value;
            }
        });
    } else if (objProps && typeof objProps === 'object') {
        Object.assign(map, objProps);
    }
    return map;
}

/**
 * Primary tilemap factory function. Instantiates the Phaser tilemap, binds tileset textures,
 * creates collision layers, initializes physics groups, and triggers non-blocking object generation.
 * @param {Phaser.Scene} scene - The active Phaser GameScene context.
 * @param {Function} [onProgress] - Optional callback (ratio) => void reported as objects spawn.
 * @returns {Phaser.Tilemaps.Tilemap} The created tilemap instance.
 */
export function createMap(scene, onProgress) {
    //----- Loads the json  file and also the map tileset -----//
    const map = scene.make.tilemap({ key: 'dynamic_map' }); // Using the dynamic key
    if (!map.tilesets || map.tilesets.length === 0) {
        console.error("[createMap] No tilesets found in map data!");
        const rawCache = scene.cache.tilemap.get('dynamic_map');
        console.log("[createMap] Raw cache entry:", rawCache);
        if (rawCache) {
            console.log("[createMap] Raw Cache Data:", rawCache.data);
        } else {
            console.error("[createMap] Cache entry for 'dynamic_map' is missing!");
        }
    }

    // 2. Identify Tilesets and Load Images Dynamically
    // OPTIMIZATION: Retrieve raw tilemap cache once outside the tileset loop
    const tilemapCache = scene.cache.tilemap.get('dynamic_map');
    const rawData = tilemapCache ? tilemapCache.data : null;

    map.tilesets.forEach(tileset => {
        let type = 'Single Image Tileset';

        if (rawData && rawData.tilesets) {
            const rawTileset = rawData.tilesets.find(t => t.name === tileset.name);
            if (rawTileset && !rawTileset.image) {
                type = 'Collection of Images';
            }
        }

        // --- Dynamic Image Binding ---
        const tilesetName = tileset.name;
        if (tilesetName === 'AutoMap Rules') {
            return;
        }

        if (type === 'Collection of Images') {
            // Skipping Collection of Images
        } else if (scene.textures.exists(tilesetName)) {
            map.addTilesetImage(tilesetName, tilesetName);
        } else {
            const isLikelyObject = tilesetName.toLowerCase().endsWith('.png') || tileset.total === 1;
            if (!isLikelyObject) {
                console.error(`[createMap] FAILED to match tileset '${tilesetName}' to any loaded image key. Strict matching enabled.`);
            }
        }
    });

    // Check if any tilesets failed to load
    if (map.tilesets.length > 0 && !map.tilesets[0].image) {
        console.log("[createMap] Tileset loading process complete (check for previous errors if black screen).");
    }

    // --- Animal System Group Initialization ---
    scene.animals = scene.physics.add.group({
        classType: Animal,
        runChildUpdate: true
    });

    if (!scene.animalsMap) {
        scene.animalsMap = new Map();
    }

    // We create a single physics group for ALL objects in the world
    scene.objectGroup = scene.physics.add.group({ immovable: true });

    // Start Async Object Building (Non-blocking)
    buildMapObjectsAsync(scene, map, onProgress);

    // Add collision for the player against ALL these objects at once
    if (scene.players) {
        scene.physics.add.collider(scene.players, scene.objectGroup);
    } else {
        console.warn('[createMap] scene.players not found during map creation');
    }

    //----- Creates "layers" of different map tiles to be placed on top of one another -----//
    scene.mapLayers = [];
    scene.tableTopObjects = []; // Optimization: Cached list for Drop Mode

    map.layers.forEach((layerData, index) => {
        const layer = map.createLayer(layerData.name, map.tilesets, 0, 0);

        if (layer) {
            scene.mapLayers.push(layer);

            // Set collision property
            layer.setCollisionByProperty({ blocked: true });

            // OPTIMIZATION: Check if any tile in layer data has collision flags set to avoid unnecessary physics checks
            if (layer.layer && layer.layer.data) {
                layer.hasCollision = layer.layer.data.some(row => row && row.some(tile => tile && tile.collides));
            } else {
                layer.hasCollision = false;
            }

            if (layerData.name === 'ground') {
                layer.depth = -10;
            } else if (layerData.name === 'grass') {
                layer.depth = -8;
            } else {
                layer.depth = 0; // Default
            }

            // Hide 'zones' and 'music' utility layers by default (unless music tiles toggle is enabled)
            const lname = layerData.name.toLowerCase();
            if (lname.includes('music')) {
                layer.alpha = scene.showMusicTiles ? 0.75 : 0;
            } else if (lname.includes('zones')) {
                layer.alpha = scene.showDebug ? 0.5 : 0;
            }
        }
    });

    // Store tilemap reference on scene for spatial queries
    scene.map = map;

    // Collide animals with world blocked tiles only on collidable layers
    if (scene.mapLayers && scene.animals) {
        scene.mapLayers.forEach(layer => {
            if (layer.hasCollision) {
                scene.physics.add.collider(scene.animals, layer);
            }
        });
    }

    // Initialize Animations for known animals (Sheep)
    if (scene.anims) {
        createAnimations(scene, ['sheep']);
    }

    scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    return map;
}


/**
 * Asynchronously builds game objects from Tiled Object Layers.
 * Uses a 12ms frame-budget yield to prevent blocking the UI/Loading Screen on large maps.
 * 
 * @param {Phaser.Scene} scene - Active Phaser GameScene context.
 * @param {Phaser.Tilemaps.Tilemap} map - Instantiated Phaser Tilemap.
 * @param {Function} [onProgress] - Progress reporting callback.
 * @returns {Promise<void>}
 */
async function buildMapObjectsAsync(scene, map, onProgress) {
    // 1. Pre-fetch raw data for all tilesets.
    const rawTilesets = [];
    const rawMapData = scene.cache.tilemap.get('dynamic_map').data;

    if (rawMapData && rawMapData.tilesets) {
        rawMapData.tilesets.forEach(rawTs => {
            const tsData = {
                name: rawTs.name,
                image: rawTs.image,
                firstgid: rawTs.firstgid,
                tilecount: rawTs.tilecount || 0,
                tiles: {}
            };

            if (rawTs.tiles) {
                rawTs.tiles.forEach(tile => {
                    const tileData = { properties: {} };
                    if (tile.properties) {
                        const props = {};
                        tile.properties.forEach(p => {
                            if (p.type === 'bool' || typeof p.value === 'boolean' || p.value === 'true' || p.value === 'false') {
                                props[p.name] = (p.value === true || p.value === 'true');
                            } else if (p.type === 'int' || p.type === 'float' || (!isNaN(p.value) && typeof p.value !== 'boolean')) {
                                props[p.name] = Number(p.value);
                            } else {
                                props[p.name] = p.value;
                            }
                        });
                        tileData.properties = props;
                    }
                    if (tile.image) {
                        tileData.image = tile.image;
                    }
                    tsData.tiles[tile.id] = tileData;
                });
            }
            rawTilesets.push(tsData);
        });
    }

    // 2. Process Layers
    const objectLayers = (rawMapData && rawMapData.layers) 
        ? rawMapData.layers.filter(l => l.type === 'objectgroup')
        : (map.objects || []);

    if (objectLayers.length > 0) {
        let totalObjects = 0;
        objectLayers.forEach(l => { if (l.objects) totalObjects += l.objects.length; });
        let objectsProcessed = 0;
        let lastYieldTime = performance.now();

        for (const layerData of objectLayers) {
            const objects = layerData.objects;
            if (!objects) continue;

            // Process in chunks
            let i = 0;
            const chunkSize = 20;

            while (i < objects.length) {
                const end = Math.min(i + chunkSize, objects.length);
                for (let j = i; j < end; j++) {
                    try {
                        spawnObject(scene, map, objects[j], rawTilesets, layerData.name);
                    } catch (err) {
                        console.warn(`[World Builder] Error spawning object ID ${objects[j]?.id} in layer '${layerData.name}':`, err);
                    }
                    objectsProcessed++;
                }
                i += chunkSize;

                // Report Progress
                if (onProgress && totalObjects > 0) {
                    onProgress(objectsProcessed / totalObjects);
                }

                // OPTIMIZATION: Yield using setTimeout(0) only when frame execution time exceeds 12ms
                const now = performance.now();
                if (now - lastYieldTime > 12) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                    lastYieldTime = performance.now();
                }
            }
        }
    }

    // 3. Signal Completion
    if (scene.loadingFlags) {
        scene.loadingFlags.mapObjects = true;
        if (typeof scene.checkLoadingComplete === 'function') {
            scene.checkLoadingComplete();
        }
    }
}

/**
 * Spawns a single object.
 * 
 * @param {Phaser.Scene} scene - Active Phaser GameScene context.
 * @param {Phaser.Tilemaps.Tilemap} map - Active Phaser Tilemap.
 * @param {Object} obj - Tiled object layer element definition.
 * @param {Array<Object>} rawTilesets - Pre-fetched raw tileset definitions.
 * @param {string} layerName - Name of the Tiled object layer.
 */
function spawnObject(scene, map, obj, rawTilesets, layerName) {
    let textureKey;
    let frame = null;
    let tileProps = {};
    let usedLocalID = -1;
    let rawImage = null;

    // 1. Find Raw Tileset (Backwards index search without array allocation)
    let rawTs = null;
    for (let k = rawTilesets.length - 1; k >= 0; k--) {
        if (obj.gid >= rawTilesets[k].firstgid) {
            rawTs = rawTilesets[k];
            break;
        }
    }

    if (rawTs) {
        const trueLocalID = obj.gid - rawTs.firstgid;
        usedLocalID = trueLocalID;

        if (rawTs.tiles[trueLocalID]) {
            tileProps = rawTs.tiles[trueLocalID].properties;
            rawImage = rawTs.tiles[trueLocalID].image;
        }
    } else {
        console.warn(`[World Builder] Could not find Raw Tileset for GID ${obj.gid}`);
    }

    // Extract & normalize properties
    const objPropsMap = extractObjectProperties(obj.properties);
    const mergedProps = { ...tileProps, ...objPropsMap };

    // Check for Spatial MusicZone object definition
    const isMusicZone = obj.type === 'MusicZone' || 
                        Boolean(mergedProps.zoneKey) || 
                        Boolean(mergedProps.musicZone) || 
                        (layerName && layerName.toLowerCase().includes('music'));

    if (isMusicZone && scene.midiEngine && scene.midiEngine.spatialZones) {
        const zoneKey = mergedProps.zoneKey || mergedProps.musicZone || obj.name;
        if (zoneKey) {
            scene.midiEngine.spatialZones.registerZone({
                key: zoneKey,
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                polygon: obj.polygon,
                doorX: mergedProps.doorX,
                doorY: mergedProps.doorY,
                fadeTimeMs: mergedProps.fadeTimeMs,
                proximityRadius: mergedProps.proximityRadius
            });
        }
    }

    // Treat as item if layer is 'items' or isItem property is true
    const isItem = mergedProps.isItem === true || 
                   mergedProps.isItem === 'true' || 
                   layerName?.toLowerCase() === 'items';

    if (isItem) {
        return;
    }

    // 2. Determine Texture Key
    if (tileProps && tileProps.texture) {
        textureKey = tileProps.texture;
    } else if (rawImage) {
        const normalizedPath = rawImage.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        const filename = parts[parts.length - 1];
        textureKey = filename.split('.')[0];
    } else if (rawTs && rawTs.image) {
        // Resolve from tileset image path
        const normalizedPath = rawTs.image.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        const filename = parts[parts.length - 1];
        textureKey = filename.split('.')[0];
    } else if (rawTs && rawTs.name) {
        // Resolve from tileset name
        textureKey = rawTs.name;
    } else {
        const phaserTileset = map.tilesets.find(ts => obj.gid >= ts.firstgid && obj.gid < (ts.firstgid + ts.total));
        if (phaserTileset) {
            const localID = obj.gid - phaserTileset.firstgid;
            usedLocalID = localID;
            textureKey = 'tilesetSprite';
            frame = localID;
            if (phaserTileset.tileProperties && phaserTileset.tileProperties[localID]) {
                tileProps = phaserTileset.tileProperties[localID];
            }
        } else {
            console.warn(`[World Builder] Critical: Could not resolve tileset for GID ${obj.gid}`);
            return;
        }
    }

    // 3. Create the Sprite
    // --- Animal Special Handling ---
    const isAnimal = mergedProps.isAnimal === true || 
                     mergedProps.isAnimal === 'true' || 
                     mergedProps.isAnimal === 1 || 
                     mergedProps.isAnimal === '1' ||
                     layerName?.toLowerCase() === 'animals';

    if (isAnimal) {
        if (!mergedProps.id) {
            mergedProps.id = `${layerName}_${obj.id}`;
        }

        const spawnX = obj.x + (obj.width ? obj.width / 2 : 16);
        const spawnY = obj.y;

        const animal = new Animal(scene, spawnX, spawnY, textureKey, frame, mergedProps);

        if (scene.animals) {
            scene.animals.add(animal);
        } else {
            scene.add.existing(animal);
        }

        const animalId = mergedProps.id;
        if (!scene.animalsMap) {
            scene.animalsMap = new Map();
        }
        scene.animalsMap.set(animalId, animal);

        animal.once('destroy', () => {
            if (scene.animalsMap) scene.animalsMap.delete(animalId);
        });

        return; // Skip standard sprite creation
    }

    const sprite = scene.objectGroup.create(obj.x, obj.y, textureKey, frame);
    if (!sprite) {
        console.error(`[World Builder] Failed to create sprite for ${textureKey}`);
        return;
    }

    // --- Door System Special Handling ---
    if (textureKey === 'alpha_door') {
        if (!scene.anims.exists('door_open')) {
            scene.anims.create({
                key: 'door_open',
                frames: scene.anims.generateFrameNumbers('alpha_door', { frames: [0, 1, 2] }),
                frameRate: 10,
                repeat: 0
            });
        }
        if (!scene.anims.exists('door_close')) {
            scene.anims.create({
                key: 'door_close',
                frames: scene.anims.generateFrameNumbers('alpha_door', { frames: [2, 1, 0] }),
                frameRate: 10,
                repeat: 0
            });
        }
        sprite.setFrame(0);
        sprite.setInteractive({ cursor: 'pointer' });
        sprite.on('pointerdown', (pointer) => {
            if (pointer.button !== 0) return;
            pointer.interactionHandled = true;
            const player = scene.playerContainer;
            if (player) {
                const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y);
                if (dist < 150) {
                    if (scene.socket) {
                        scene.socket.emit('doorInteract', sprite.objectInfo.uniqueId);
                    }
                } else {
                    console.log(`[Door] Too far - Smart Walking towards door: ${sprite.objectInfo.uniqueId}`);
                    scene.smartWalkTarget = {
                        target: sprite,
                        range: 110, // closer than 150 to avoid network race conditions
                        onReach: () => {
                            console.log(`[Door] Smart Walk reached door: ${sprite.objectInfo.uniqueId}`);
                            if (scene.socket) {
                                scene.socket.emit('doorInteract', sprite.objectInfo.uniqueId);
                            }
                        }
                    };
                }
            }
        });
    }

    // 4. Apply "Smart" Configuration
    sprite.setOrigin(0, 1);
    sprite.setDepth(sprite.y);

    let customCollisionApplied = false;

    // Check centralized configuration first
    const nodeDef = resourceNodeData[textureKey];

    if (nodeDef) {
        if (nodeDef.bodyWidth && nodeDef.bodyHeight) {
            sprite.body.setSize(nodeDef.bodyWidth, nodeDef.bodyHeight);
            customCollisionApplied = true;
        }
        if (nodeDef.bodyOffsetY !== undefined) {
            const widthDiff = sprite.width - (nodeDef.bodyWidth || sprite.width);
            const offsetX = widthDiff / 2;
            const offsetY = sprite.height - (nodeDef.bodyHeight || sprite.height) - nodeDef.bodyOffsetY;
            sprite.body.setOffset(offsetX, offsetY);
            customCollisionApplied = true;
        }
    } else if (tileProps) {
        if (tileProps.bodyWidth && tileProps.bodyHeight) {
            sprite.body.setSize(tileProps.bodyWidth, tileProps.bodyHeight);
            customCollisionApplied = true;
        }

        if (tileProps.bodyOffsetY !== undefined) {
            const widthDiff = sprite.width - (tileProps.bodyWidth || sprite.width);
            const offsetX = widthDiff / 2;
            const offsetY = sprite.height - (tileProps.bodyHeight || sprite.height) - tileProps.bodyOffsetY;
            sprite.body.setOffset(offsetX, offsetY);
            customCollisionApplied = true;
        } else if (customCollisionApplied) {
            const widthDiff = sprite.width - (tileProps.bodyWidth || sprite.width);
            const heightDiff = sprite.height - (tileProps.bodyHeight || sprite.height);
            sprite.body.setOffset(widthDiff / 2, heightDiff);
        }
    }

    if (!customCollisionApplied) {
        sprite.body.setSize(sprite.width, sprite.height * 0.2);
        sprite.body.setOffset(0, sprite.height * 0.8);
    }

    // 5. Enable Interaction & Metadata
    sprite.setInteractive();

    const stationType = mergedProps.stationType || null;

    sprite.objectInfo = {
        Identifier: 'mapObject',
        uniqueId: `${layerName}_${obj.id}`,
        name: nodeDef ? nodeDef.name : (tileProps.name || obj.name || textureKey),
        description: nodeDef ? nodeDef.description : (tileProps.description || tileProps.desc || tileProps.icDescrip || 'It is a ' + (obj.type || 'object') + '.'),
        stationType: stationType,
        gatherTool: nodeDef ? nodeDef.gatherTool : null,
        interactType: nodeDef ? nodeDef.interactType : null
    };

    // Register into fast O(1) scene lookup Map
    if (scene.mapObjectsMap && sprite.objectInfo.uniqueId) {
        const uid = sprite.objectInfo.uniqueId;
        scene.mapObjectsMap.set(uid, sprite);
        sprite.once('destroy', () => {
            if (scene.mapObjectsMap) scene.mapObjectsMap.delete(uid);
        });
    }

    // --- Zone Transparency Prop ---
    const clearZone = mergedProps.clearZone || null;
    if (clearZone) {
        sprite.clearZone = clearZone;
    }

    // --- TableTop Property ---
    const isTableTop = mergedProps.tableTop === true || mergedProps.tableTop === 'true';
    if (isTableTop) {
        sprite.objectInfo.tableTop = true;
        if (scene.tableTopObjects) scene.tableTopObjects.push(sprite);
    }

    // --- Blocked Property (Collision) ---
    let isBlocked = true;
    if (mergedProps.blocked === false || mergedProps.blocked === 'false') {
        isBlocked = false;
    }

    if (!isBlocked) {
        sprite.body.enable = false;
    }
}
