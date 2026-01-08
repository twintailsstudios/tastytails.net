export function createMap(scene) {
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
        console.log(`[createMap] Found ${map.tilesets.length} tilesets in map.`);
    }

    // 1. Identify Object Layers
    // Phaser puts all layers with type="objectgroup" into the 'objects' array.
    console.log("--- Object Layers Found ---");
    if (map.objects) {
        map.objects.forEach(layerData => {
            console.log(`Name: ${layerData.name}, Object Count: ${layerData.objects.length}`);
        });
    }

    // 2. Identify Tilesets and Load Images Dynamically
    // developer_note:
    // This loop iterates through every tileset defined in the map JSON.
    // It attempts to finding a matching image key in Phaser's texture manager.
    // If you see a "black screen" or missing tiles, it usually means the key in preload.js
    // does not match the tileset name in Tiled.
    console.log("--- Tilesets Found ---");
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

        console.log(`Name: ${tileset.name}`);
        console.log(`- Type: ${type}`);
        console.log(`- First GID: ${tileset.firstgid}`);
        console.log(`- Total Tiles: ${tileset.total}`);

        // --- Dynamic Image Binding ---
        const tilesetName = tileset.name;
        // We assume the image key in Phaser cache matches the tileset name from Tiled 
        // SKIPPING Collection of Images (they don't use a single master image)
        if (type === 'Collection of Images') {
            console.log(`[createMap] Skipping addTilesetImage for '${tilesetName}' (Collection of Images)`);
        } else if (scene.textures.exists(tilesetName)) {
            console.log(`[createMap] Matched tileset '${tilesetName}' to image key '${tilesetName}'`);
            map.addTilesetImage(tilesetName, tilesetName);
        } else {
            console.warn(`[createMap] WARNING: Could not find image key for tileset '${tilesetName}'. Checking for fallbacks...`);

            // Legacy Fallback
            if (tilesetName === 'Demo_tileset' && scene.textures.exists('tileset')) {
                console.log(`[createMap] ...Found legacy 'tileset' image for '${tilesetName}'`);
                map.addTilesetImage(tilesetName, 'tileset');
            } else {
                console.error(`[createMap] FAILED to load image for tileset: ${tilesetName}. Rendering might be incomplete.`);
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

    // Loop through every Object Layer defined in the JSON
    if (map.objects) {
        map.objects.forEach(layerData => {
            buildObjectLayer(scene, map, layerData.name);
        });
    }

    // Add collision for the player against ALL these objects at once
    if (scene.players) {
        scene.physics.add.collider(scene.players, scene.objectGroup);
    } else {
        console.warn('[createMap] scene.players not found during map creation');
    }

    //----- Loads a Dynamic Tilemap Layer -----//
    // This seems to be a debug test sprite? Leaving it for now.
    const testTile = scene.add.sprite(3291, 4287, 'tilesetSprite', 8);
    testTile.depth = testTile.y - 92;
    // console.log('testTile = ', testTile);

    //----- Creates "layers" of different map tiles to be placed on top of one another -----//
    // DYNAMIC LAYER LOADING REFACTOR
    scene.mapLayers = [];

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
            if (layerData.name === 'grass') {
                layer.depth = -6;
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

    scene.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

    return map;
}


/**
 * Automatically builds game objects from a Tiled Object Layer.
 * Determines the correct tileset, texture, and physics properties for every object.
 */
function buildObjectLayer(scene, map, layerName) {
    const layerData = map.getObjectLayer(layerName);

    // Skip if layer is empty or undefined
    if (!layerData || !layerData.objects) return;

    console.log(`[World Builder] Building layer: ${layerName}`);

    // Pre-fetch raw data for all tilesets.
    // We store them as an array of ranges to perform GID-based lookups.
    // This bypasses the issue where Phaser splits "Collection of Images" into multiple tilesets, breaking name/ID matching.
    const rawTilesets = [];
    const rawMapData = scene.cache.tilemap.get('dynamic_map').data;

    if (rawMapData && rawMapData.tilesets) {
        rawMapData.tilesets.forEach(rawTs => {
            const tsData = {
                name: rawTs.name,
                firstgid: rawTs.firstgid,
                tilecount: rawTs.tilecount || 0,
                tiles: {}
            };

            if (rawTs.tiles) {
                rawTs.tiles.forEach(tile => {
                    const tileData = { properties: {} };

                    // Capture Properties
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

                    // Capture Image
                    if (tile.image) {
                        tileData.image = tile.image;
                    }

                    // Index by Local ID
                    tsData.tiles[tile.id] = tileData;
                });
            }
            rawTilesets.push(tsData);
        });
    }

    layerData.objects.forEach(obj => {
        let textureKey;
        let frame = null;
        let tileProps = {};
        let usedLocalID = -1;
        let rawImage = null;
        // 1. Find Raw Tileset
        // developer_note:
        // We find the tileset with the highest firstgid that is <= obj.gid.
        // This is CRITICAL for "Collection of Images" tilesets (like 'alpha_objects') because:
        // 1. Tiled assigns IDs sparsely (e.g., skips from ID 5 to ID 30).
        // 2. The 'tilecount' property might be smaller than the ID range (e.g., 27 items, but highest ID is 30).
        // 3. Standard 'ranges' (firstGid to firstGid + count) fail for these sparse IDs.
        // By finding the nearest 'start point' (firstGid) below the object's GID, we correctly identify the parent tileset.
        const rawTs = rawTilesets
            .slice()
            .reverse()
            .find(ts => obj.gid >= ts.firstgid);

        if (rawTs) {
            // Calculate TRUE local ID relative to the original collection
            const trueLocalID = obj.gid - rawTs.firstgid;
            usedLocalID = trueLocalID;

            if (rawTs.tiles[trueLocalID]) {
                tileProps = rawTs.tiles[trueLocalID].properties;
                rawImage = rawTs.tiles[trueLocalID].image;
                console.log(`[World Builder] Found Raw Props for GID ${obj.gid} (True ID ${trueLocalID} via ${rawTs.name}):`, tileProps);

                // SKIP items (managed by server events)
                if (tileProps.isItem) {
                    // console.log(`[World Builder] Skipping Item (Server Managed): ${obj.gid}`);
                    return;
                }

                if (rawImage) console.log(`[World Builder] Found Raw Image: ${rawImage}`);
            }
        } else {
            // Fallback: This usually shouldn't happen unless the object GID is very strange or outside ranges
            console.warn(`[World Builder] Could not find Raw Tileset for GID ${obj.gid}`);
        }

        // 2. Determine Texture Key
        // Priority 1: Custom 'texture' property
        // Priority 2: Extracted filename from 'image' property (for Collection of Images)
        // Priority 3: Fallback to Phaser's Runtime Tileset (Standard Tilesets)

        if (tileProps && tileProps.texture) {
            textureKey = tileProps.texture;
            console.log(`[World Builder] Using custom texture property: ${textureKey}`);
        } else if (rawImage) {
            // Extract filename without extension from path
            // Handle both forward and backslashes (Windows paths in Tiled JSON)
            const normalizedPath = rawImage.replace(/\\/g, '/');
            const parts = normalizedPath.split('/');
            const filename = parts[parts.length - 1];
            textureKey = filename.split('.')[0];
            console.log(`[World Builder] Auto-detected texture: ${textureKey} from ${rawImage}`);
        } else {
            // Priority 3: Runtime Fallback
            // If we couldn't resolve a texture from Raw Data, ask Phaser.
            // This handles standard tilesets where 'texture' might not be explicitly defined but implies the tileset image.

            const phaserTileset = map.tilesets.find(ts => obj.gid >= ts.firstgid && obj.gid < (ts.firstgid + ts.total));
            if (phaserTileset) {
                // For standard tilesets, determine the frame
                const localID = obj.gid - phaserTileset.firstgid;
                usedLocalID = localID; // Update for logging if we fell back

                // If it's a known Single Image Tileset (like 'tileset' for the map), use its key
                // We added 'Demo_tileset' as 'tileset' in createMap.
                // But wait, obj.gid might point to 'tileset'.
                // If the tileset source image is NOT in 'tiles', we assume it's the main image.

                // Ideally, we assigned a key when loading. 
                // Here we default to 'tilesetSprite' if we assume it's the main sheet.
                // But 'tree_01' etc are NOT on the main sheet.

                // If we are here, it means Raw Lookup failed to give us a texture or image.
                // This is a safety net.
                textureKey = 'tilesetSprite';
                frame = localID;
                console.log(`[World Builder] Fallback to tilesetSprite: frame ${frame} for GID ${obj.gid}`);

                // Attempt to get properties from Phaser's runtime data
                if (phaserTileset.tileProperties && phaserTileset.tileProperties[localID]) {
                    tileProps = phaserTileset.tileProperties[localID];
                }
            } else {
                console.warn(`[World Builder] Critical: Could not resolve tileset for GID ${obj.gid}`);
                return; // Abort spawning this object
            }
        }

        console.log(`[World Builder] Spawning Object: ${textureKey} (GID: ${obj.gid}, LocalID: ${usedLocalID}) at ${obj.x},${obj.y}`);

        // 3. Create the Sprite
        const sprite = scene.objectGroup.create(obj.x, obj.y, textureKey, frame);
        if (!sprite) {
            console.error(`[World Builder] Failed to create sprite for ${textureKey}`);
            return;
        }

        // --- Door System Special Handling ---
        if (textureKey === 'alpha_door') {
            // Create Animations (Once)
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

            // Set Initial State (Closed)
            // If the server sends initial state later, we'll update. 
            // For now, assume closed.
            sprite.setFrame(0);

            // Interaction
            sprite.setInteractive({ cursor: 'pointer' });
            sprite.on('pointerdown', (pointer) => {
                // Check distance to player
                const player = scene.playerContainer;
                if (player) {
                    const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y);
                    if (dist < 150) {
                        console.log(`[Door] Interacting with ${sprite.objectInfo.uniqueId}`);
                        if (scene.socket) {
                            scene.socket.emit('doorInteract', sprite.objectInfo.uniqueId);
                        }
                    } else {
                        console.log('[Door] Too far to interact');
                    }
                }
            });
        }

        // 4. Apply "Smart" Configuration

        // Default Origin/Depth
        // Updated to Bottom Left (0, 1) to match Tiled default
        sprite.setOrigin(0, 1);
        sprite.setDepth(sprite.y);

        let customCollisionApplied = false;

        if (tileProps) {
            // Apply Custom Hitbox Size
            if (tileProps.bodyWidth && tileProps.bodyHeight) {
                sprite.body.setSize(tileProps.bodyWidth, tileProps.bodyHeight);
                customCollisionApplied = true;
            }

            // Apply Custom Offset (centered horizontally, specific offset from bottom)
            if (tileProps.bodyOffsetY !== undefined) {
                const widthDiff = sprite.width - (tileProps.bodyWidth || sprite.width);
                const offsetX = widthDiff / 2;
                // Phaser setOffset is from top-left.
                // We want bodyOffsetY to be distance from BOTTOM of sprite.
                const offsetY = sprite.height - (tileProps.bodyHeight || sprite.height) - tileProps.bodyOffsetY;

                sprite.body.setOffset(offsetX, offsetY);
                customCollisionApplied = true;
            } else if (customCollisionApplied) {
                // Center bottom if only size was set
                const widthDiff = sprite.width - (tileProps.bodyWidth || sprite.width);
                const heightDiff = sprite.height - (tileProps.bodyHeight || sprite.height);
                sprite.body.setOffset(widthDiff / 2, heightDiff);
            }
        }

        if (!customCollisionApplied) {
            // Default Fallback Collision (small box at feet)
            sprite.body.setSize(sprite.width, sprite.height * 0.2);
            sprite.body.setOffset(0, sprite.height * 0.8);
        }

        // 5. Enable Interaction & Metadata (For Context Menu)
        sprite.setInteractive();
        sprite.objectInfo = {
            Identifier: 'mapObject',
            uniqueId: `${layerName}_${obj.id}`, // specific to this instance
            name: tileProps.name || obj.name || textureKey, // Use Tiled object name, tile property name, or texture
            description: tileProps.description || tileProps.desc || tileProps.icDescrip || 'It is a ' + (obj.type || 'object') + '.'
        };

        // --- Zone Transparency Prop ---
        // Store 'clearZone' on the sprite for the zoneUpdate listener
        // Priority: Object Property > Tile Property
        // Note: Tiled Object properties are in 'obj.properties' (array of objects {name, value}).
        // Depending on Phaser version/loader, obj.properties might be normalized. 
        // Let's check obj.properties if it exists.

        let clearZone = null;
        if (obj.properties) {
            // Check object-level custom properties
            if (Array.isArray(obj.properties)) {
                const p = obj.properties.find(prop => prop.name === 'clearZone');
                if (p) clearZone = p.value;
            } else {
                // Format might be object if Phaser normalized it
                if (obj.properties.clearZone) clearZone = obj.properties.clearZone;
            }
        }

        // Fallback to Tile Property if not on Object
        if (!clearZone && tileProps && tileProps.clearZone) {
            clearZone = tileProps.clearZone;
        }

        if (clearZone) {
            sprite.clearZone = clearZone;
            // console.log(`[World Builder] Object ${sprite.objectInfo.name} assigned clearZone: ${clearZone}`);
        }

        // --- Blocked Property (Collision) ---
        // Priority: Object Property > Tile Property
        let isBlocked = true; // Default to blocked (collidable)

        let blockedProp = null;
        if (obj.properties) {
            if (Array.isArray(obj.properties)) {
                const p = obj.properties.find(prop => prop.name === 'blocked');
                if (p) blockedProp = p.value;
            } else {
                if (obj.properties.blocked !== undefined) blockedProp = obj.properties.blocked;
            }
        }

        // If not found on object, check tile
        if (blockedProp === null && tileProps && tileProps.blocked !== undefined) {
            blockedProp = tileProps.blocked;
        }

        // Interpret value (handle string "false" from Tiled sometimes)
        if (blockedProp === false || blockedProp === 'false') {
            isBlocked = false;
        }

        if (!isBlocked) {
            sprite.body.enable = false;
            // console.log(`[World Builder] Disabled collision for ${sprite.objectInfo.name}`);
        }
    });
}
