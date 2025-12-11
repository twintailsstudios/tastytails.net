export function createMap(scene) {
    //----- Loads the json  file and also the map tileset -----//
    const map = scene.make.tilemap({ key: 'demo_map' });

    // 1. Identify Object Layers
    // Phaser puts all layers with type="objectgroup" into the 'objects' array.
    console.log("--- Object Layers Found ---");
    if (map.objects) {
        map.objects.forEach(layerData => {
            console.log(`Name: ${layerData.name}, Object Count: ${layerData.objects.length}`);
        });
    }

    // 2. Identify Tilesets (Embedded or External)
    console.log("--- Tilesets Found ---");
    map.tilesets.forEach(tileset => {
        const hasCustomProps = tileset.tileProperties && Object.keys(tileset.tileProperties).length > 0;

        let type = 'Single Image Tileset';
        // Peek at raw data to verify type (Collection of Images tilesets in Tiled JSON lack a top-level 'image' property)
        const rawData = scene.cache.tilemap.get('demo_map').data;
        if (rawData && rawData.tilesets) {
            const rawTileset = rawData.tilesets.find(t => t.name === tileset.name);
            if (rawTileset) {
                if (!rawTileset.image) {
                    type = 'Collection of Images';
                }
            }
        }

        console.log(`Name: ${tileset.name}`);
        console.log(`- Type: ${type}`);
        console.log(`- First GID: ${tileset.firstgid}`);
        console.log(`- Total Tiles: ${tileset.total}`);
        console.log(`- Contains Custom Data: ${hasCustomProps ? 'Yes' : 'No'}`);
    });

    const tileset = map.addTilesetImage('Demo_tileset', 'tileset');

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
    const testTile = scene.add.sprite(3291, 4287, 'tilesetSprite', 8);
    testTile.depth = testTile.y - 92;
    // console.log('testTile = ', testTile);

    //----- Creates "layers" of different map tiles to be placed on top of one another -----//
    const grass = map.createLayer('grass', tileset, 0, 0);
    const inside = map.createLayer('inside', tileset, 0, 0);
    const objects = map.createLayer('objects', tileset, 0, 0);
    const objects2 = map.createLayer('objects2', tileset, 0, 0);
    const outsideWallLayer = map.createLayer('outsideWallLayer', tileset, 0, 0);
    const bushes = map.createLayer('bushes', tileset, 0, 0);
    const trees = map.createLayer('trees', tileset, 0, 0);

    // Store layers for collision handling
    scene.mapLayers = [grass, inside, objects, objects2, outsideWallLayer, bushes, trees];

    // Enable collision for tiles with 'Blocked' property set to 'True'
    scene.mapLayers.forEach(layer => {
        if (layer) {
            layer.setCollisionByProperty({ Blocked: 'True' });
        }
    });

    // Set depths
    grass.depth = -6;
    // Other layers depth defaults to 0 or based on Y if needed, but here they seem to be 0 except grass.

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
    const rawMapData = scene.cache.tilemap.get('demo_map').data;

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

        // 1. Find Raw Tileset by GID Range
        // This is the robust link between Object GID and Original Tiled Data
        const rawTs = rawTilesets.find(ts => obj.gid >= ts.firstgid && obj.gid < (ts.firstgid + ts.tilecount));

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

        // 4. Apply "Smart" Configuration

        // Default Origin/Depth
        sprite.setOrigin(0.5, 1);
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
    });
}
