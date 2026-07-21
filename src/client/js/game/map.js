import { Animal } from './entity/Animal.js';
import { createAnimations } from './animations.js';
import resourceNodeData from './resourceNodeData.js';

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
    } else {
        // console.log(`[createMap] Found ${map.tilesets.length} tilesets in map.`);
    }

    // 1. Identify Object Layers
    // Phaser puts all layers with type="objectgroup" into the 'objects' array.
    // 1. Identify Object Layers
    // Phaser puts all layers with type="objectgroup" into the 'objects' array.
    // console.log("--- Object Layers Found ---");
    /*
    if (map.objects) {
        map.objects.forEach(layerData => {
            console.log(`Name: ${layerData.name}, Object Count: ${layerData.objects.length}`);
        });
    }
    */

    // 2. Identify Tilesets and Load Images Dynamically
    // developer_note:
    // This loop iterates through every tileset defined in the map JSON.
    // It attempts to finding a matching image key in Phaser's texture manager.
    // If you see a "black screen" or missing tiles, it usually means the key in preload.js
    // does not match the tileset name in Tiled.
    // console.log("--- Tilesets Found ---");
    map.tilesets.forEach(tileset => {
        const hasCustomProps = tileset.tileProperties && Object.keys(tileset.tileProperties).length > 0;
        let type = 'Single Image Tileset';

        // Peek at raw data to verify type
        const tilemapCache = scene.cache.tilemap.get('dynamic_map');
        const rawData = tilemapCache ? tilemapCache.data : null;
        if (rawData && rawData.tilesets) {
            const rawTileset = rawData.tilesets.find(t => t.name === tileset.name);
            if (rawTileset && !rawTileset.image) {
                type = 'Collection of Images';
            }
        }

        // console.log(`Name: ${tileset.name}`);
        // console.log(`- Type: ${type}`);
        // console.log(`- First GID: ${tileset.firstgid}`);
        // console.log(`- Total Tiles: ${tileset.total}`);

        // --- Dynamic Image Binding ---
        const tilesetName = tileset.name;
        if (tilesetName === 'AutoMap Rules') {
            // console.log(`[createMap] Skipping internal Tiled layer '${tilesetName}'`);
            return;
        }

        // We assume the image key in Phaser cache matches the tileset name from Tiled 
        // SKIPPING Collection of Images (they don't use a single master image)
        if (type === 'Collection of Images') {
            // console.log(`[createMap] Skipping addTilesetImage for '${tilesetName}' (Collection of Images)`);
        } else if (scene.textures.exists(tilesetName)) {
            // console.log(`[createMap] Matched tileset '${tilesetName}' to image key '${tilesetName}'`);
            map.addTilesetImage(tilesetName, tilesetName);
        } else {
            // Smart Filter: Ignore "Object-Only" Tilesets
            // if it looks like a single image (ends in .png) OR has only 1 tile, it is likely an Object Sprite.
            // The Object Spawner (spawnObject) handles these by stripping the extension manually.
            const isLikelyObject = tilesetName.toLowerCase().endsWith('.png') || tileset.total === 1;

            if (isLikelyObject) {
                // Silently skip or log at debug level
                // console.warn(`[createMap] Info: Tileset '${tilesetName}' skipped for painting (assuming Object Sprite).`);
            } else {
                console.error(`[createMap] FAILED to match tileset '${tilesetName}' to any loaded image key. Strict matching enabled.`);
            }
        }
    });

    // Check if any tilesets failed to load
    if (map.tilesets.length > 0 && !map.tilesets[0].image) {
        console.log("[createMap] Tileset loading process complete (check for previous errors if black screen).");
    }

    // --- THE AUTOMATION START ---

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
    // DYNAMIC LAYER LOADING REFACTOR
    scene.mapLayers = [];
    scene.tableTopObjects = []; // Optimization: Cached list for Drop Mode

    map.layers.forEach((layerData, index) => {
        // console.log(`Creating layer: ${layerData.name}`);
        const layer = map.createLayer(layerData.name, map.tilesets, 0, 0);

        if (layer) {
            scene.mapLayers.push(layer);

            // Check if this layer should have collision
            // We check if any tile in the layer has collision enabled in Tiled
            // Updated to 'blocked' (lowercase) and boolean true
            layer.setCollisionByProperty({ blocked: true });

            // Set depth based on Tiled order or custom logic
            // Default behavior: layers render in order of creation.
            // If explicit depth is needed, we can set it.
            // For now, let's keep the 'grass' behavior (depth -6) if named grass, otherwise standard.
            if (layerData.name === 'ground') {
                layer.depth = -10;
            } else if (layerData.name === 'grass') {
                layer.depth = -8;
            } else {
                layer.depth = 0; // Default
            }

            // Hillhome handling (Example usage from previous code)
            // If the layer is 'objects2', the original code made it fade.
            // We'll rely on index or name if that feature is needed, but the server event handles transparency via scene.mapLayers index.
            // Since we push in order, the indexes should align IF the map file has the same structure.
            // If not, we might need a more robust way to identify "Roof" layers.

            // Hide 'zones' layer by default
            if (layerData.name.toLowerCase().includes('zones')) {
                layer.alpha = 0;
            }
        }
    });

    // --- Animal System ---
    scene.animals = scene.physics.add.group({
        classType: Animal,
        runChildUpdate: true
    });

    // Collide animals with world blocked tiles
    if (scene.mapLayers) {
        scene.mapLayers.forEach(layer => {
            scene.physics.add.collider(scene.animals, layer);
        });
    }

    // Initialize Animations for known animals (Sheep)
    // We reuse the player animation creator because the sprite sheet layout is identical (36 frames)
    if (scene.anims) {
        createAnimations(scene, ['sheep']);
    }

    scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    return map;
}


/**
 * Asynchronously builds game objects from Tiled Object Layers.
 * Uses time-slicing to prevent blocking the UI/Loading Screen.
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
                            if (p.type === 'int' || p.type === 'float' || !isNaN(p.value)) {
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
    if (map.objects) {
        let totalObjects = 0;
        map.objects.forEach(l => { if (l.objects) totalObjects += l.objects.length; });
        let objectsProcessed = 0;

        for (const layerData of map.objects) {
            const objects = layerData.objects;
            if (!objects) continue;

            // Process in chunks
            let i = 0;
            const chunkSize = 20;

            while (i < objects.length) {
                const end = Math.min(i + chunkSize, objects.length);
                for (let j = i; j < end; j++) {
                    spawnObject(scene, map, objects[j], rawTilesets, layerData.name);
                    objectsProcessed++;
                }
                i += chunkSize;

                // Report Progress
                if (onProgress && totalObjects > 0) {
                    onProgress(objectsProcessed / totalObjects);
                }

                // Yield to main thread
                await new Promise(resolve => setTimeout(resolve, 0));
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
 */
function spawnObject(scene, map, obj, rawTilesets, layerName) {
    let textureKey;
    let frame = null;
    let tileProps = {};
    let usedLocalID = -1;
    let rawImage = null;

    // 1. Find Raw Tileset
    const rawTs = rawTilesets
        .slice()
        .reverse()
        .find(ts => obj.gid >= ts.firstgid);

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

    // Treat as item if layer is 'items' or isItem property is true
    const isItem = tileProps.isItem || 
                   layerName?.toLowerCase() === 'items' || 
                   obj.properties?.some(p => p.name === 'isItem' && p.value === true) ||
                   (obj.properties && !Array.isArray(obj.properties) && obj.properties.isItem);

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
            // console.log(`[World Builder] Fallback to tilesetSprite: frame ${frame} for GID ${obj.gid}`);
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
    if (tileProps.isAnimal || obj.properties?.some(p => p.name === 'isAnimal' && p.value === true)) {
        // Merge properties
        const mergedProps = { ...tileProps, ...obj.properties };
        // Handle array of properties from Tiled
        if (Array.isArray(obj.properties)) {
            obj.properties.forEach(p => { mergedProps[p.name] = p.value; });
        }

        // [FIX] Force ID to match Server Format for synchronization
        // Server uses: `${layerName}_${obj.id}`. We assume layer is 'animals'.
        if (!mergedProps.id) {
            mergedProps.id = `animals_${obj.id}`;
        }

        const animal = new Animal(scene, obj.x, obj.y, textureKey, frame, mergedProps);

        // Add to specific group
        if (scene.animals) {
            scene.animals.add(animal);
        } else {
            console.warn('scene.animals group missing, adding to display list only');
            scene.add.existing(animal);
        }
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

    let stationType = null;
    if (obj.properties) {
        if (Array.isArray(obj.properties)) {
            const p = obj.properties.find(prop => prop.name === 'stationType');
            if (p) stationType = p.value;
        } else {
            if (obj.properties.stationType) stationType = obj.properties.stationType;
        }
    }
    if (!stationType && tileProps && tileProps.stationType) {
        stationType = tileProps.stationType;
    }

    sprite.objectInfo = {
        Identifier: 'mapObject',
        uniqueId: `${layerName}_${obj.id}`,
        name: nodeDef ? nodeDef.name : (tileProps.name || obj.name || textureKey),
        description: nodeDef ? nodeDef.description : (tileProps.description || tileProps.desc || tileProps.icDescrip || 'It is a ' + (obj.type || 'object') + '.'),
        stationType: stationType,
        gatherTool: nodeDef ? nodeDef.gatherTool : null,
        interactType: nodeDef ? nodeDef.interactType : null
    };

    // --- Zone Transparency Prop ---
    let clearZone = null;
    if (obj.properties) {
        if (Array.isArray(obj.properties)) {
            const p = obj.properties.find(prop => prop.name === 'clearZone');
            if (p) clearZone = p.value;
        } else {
            if (obj.properties.clearZone) clearZone = obj.properties.clearZone;
        }
    }
    if (!clearZone && tileProps && tileProps.clearZone) {
        clearZone = tileProps.clearZone;
    }
    if (clearZone) {
        sprite.clearZone = clearZone;
    }

    // --- TableTop Property ---
    let isTableTop = false;
    if (obj.properties) {
        if (Array.isArray(obj.properties)) {
            const p = obj.properties.find(prop => prop.name === 'tableTop');
            if (p) isTableTop = p.value === true || p.value === 'true';
        } else {
            if (obj.properties.tableTop) isTableTop = obj.properties.tableTop;
        }
    }
    if (!isTableTop && tileProps && tileProps.tableTop) {
        isTableTop = tileProps.tableTop === true || tileProps.tableTop === 'true';
    }
    if (isTableTop) {
        sprite.objectInfo.tableTop = true;
        if (scene.tableTopObjects) scene.tableTopObjects.push(sprite);
    }

    // --- Blocked Property (Collision) ---
    let isBlocked = true;
    let blockedProp = null;
    if (obj.properties) {
        if (Array.isArray(obj.properties)) {
            const p = obj.properties.find(prop => prop.name === 'blocked');
            if (p) blockedProp = p.value;
        } else {
            if (obj.properties.blocked !== undefined) blockedProp = obj.properties.blocked;
        }
    }
    if (blockedProp === null && tileProps && tileProps.blocked !== undefined) {
        blockedProp = tileProps.blocked;
    }
    if (blockedProp === false || blockedProp === 'false') {
        isBlocked = false;
    }

    if (!isBlocked) {
        sprite.body.enable = false;
    }
}
