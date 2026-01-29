/**
 * server-loop.js
 *
 * This file is the new heart of the authoritative game server.
 * It manages all game state, player connections, physics, and socket events.
 */

const fs = require('fs');
const path = require('path');
const log = require('./logger');
const User = require('./model/User');
const Chats = require('./model/Chat');

// Handlers
const inventoryHandlers = require('./sockets/inventoryHandlers');
const craftingHandlers = require('./sockets/craftingHandlers'); // Now returns { init, checkCraftingRange }
const clothingData = require('./data/clothingData');

const itemData = require('./data/itemData');
const { resolveItemDef } = require('./utils/itemUtils');
const { getSafePlayerState } = require('./utils/itemActions');
const DatabaseResilience = require('./classes/DatabaseResilience');

const VisibilityPolygon = require('visibility-polygon'); // New: For shadowcasting
const { processDigestion, untrackVictim, trackVictim } = require('./server/mechanics/digestion'); // New: Digestion System
const monitoring = require('./server/monitoring');
const { performance } = require('perf_hooks');

// --- Game State Variables ---
const players = {};
const corpses = {}; // New: Store dead bodies
const spells = [];
let collisionMap = [];
let hillHomeMap = [];
let zoneMap = []; // New: Map for zone strings
let lightMap = []; // New: Map for shadowcasting (lightBlock property)
let staticSegments = []; // New: Store map wall segments for raycasting
let staticObjects = []; // New: Store static objects for collision
let worldItems = [];    // New: Store interactive items
// --- Item Spatial Hash ---
const ITEM_GRID_SIZE = 400;
const worldItemGrid = {}; // "cx,cy" -> [item1, item2]

function addItemToGrid(item) {
    if (!item || item.x === undefined || item.y === undefined) return;
    const k = `${Math.floor(item.x / ITEM_GRID_SIZE)},${Math.floor(item.y / ITEM_GRID_SIZE)}`;
    if (!worldItemGrid[k]) worldItemGrid[k] = [];
    worldItemGrid[k].push(item);
    item._gridKey = k;
}


function removeItemFromGrid(item) {
    if (!item) return;
    const k = item._gridKey || `${Math.floor(item.x / ITEM_GRID_SIZE)},${Math.floor(item.y / ITEM_GRID_SIZE)}`;
    if (worldItemGrid[k]) {
        const idx = worldItemGrid[k].indexOf(item);
        if (idx > -1) {
            worldItemGrid[k].splice(idx, 1);
            if (worldItemGrid[k].length === 0) delete worldItemGrid[k];
        }
    }
}

// --- Player Spatial Hash (Persistent) ---
const PLAYER_GRID_SIZE = 400; // Same as AOI but persistent
const playerGrid = {}; // "cx,cy" -> [player1, player2]

function updatePlayerGrid(player) {
    if (!player || player.position.x === undefined || player.position.y === undefined) return;

    const cx = Math.floor(player.position.x / PLAYER_GRID_SIZE);
    const cy = Math.floor(player.position.y / PLAYER_GRID_SIZE);
    const newKey = `${cx},${cy}`;

    // If player hasn't moved cells, do nothing
    if (player._gridKey === newKey) return;

    // Remove from old cell
    if (player._gridKey && playerGrid[player._gridKey]) {
        const idx = playerGrid[player._gridKey].indexOf(player);
        if (idx > -1) {
            playerGrid[player._gridKey].splice(idx, 1);
            if (playerGrid[player._gridKey].length === 0) delete playerGrid[player._gridKey];
        }
    }

    // Add to new cell
    if (!playerGrid[newKey]) playerGrid[newKey] = [];
    playerGrid[newKey].push(player);
    player._gridKey = newKey;
}

function removePlayerFromGrid(player) {
    if (!player || !player._gridKey) return;
    if (playerGrid[player._gridKey]) {
        const idx = playerGrid[player._gridKey].indexOf(player);
        if (idx > -1) {
            playerGrid[player._gridKey].splice(idx, 1);
            if (playerGrid[player._gridKey].length === 0) delete playerGrid[player._gridKey];
        }
    }
    player._gridKey = null;
}

/**
 * Efficiently finds all players within 'range' pixels of (x, y).
 */
function getPlayersInRange(x, y, range) {
    const cx = Math.floor(x / PLAYER_GRID_SIZE);
    const cy = Math.floor(y / PLAYER_GRID_SIZE);
    const rangeInCells = Math.ceil(range / PLAYER_GRID_SIZE);

    const results = [];
    const rangeSq = range * range;

    // Check neighboring cells
    for (let xx = cx - rangeInCells; xx <= cx + rangeInCells; xx++) {
        for (let yy = cy - rangeInCells; yy <= cy + rangeInCells; yy++) {
            const key = `${xx},${yy}`;
            if (playerGrid[key]) {
                for (const p of playerGrid[key]) {
                    const dx = p.position.x - x;
                    const dy = p.position.y - y;
                    if (dx * dx + dy * dy <= rangeSq) {
                        results.push(p);
                    }
                }
            }
        }
    }
    return results;
}

// Export for MessageSystem
module.exports.getWorldItemsInArea = (x, y, range) => {
    const cx = Math.floor(x / ITEM_GRID_SIZE);
    const cy = Math.floor(y / ITEM_GRID_SIZE);
    const items = [];
    // Check 3x3 neighbors (sufficient for normal vision range)
    for (let xx = cx - 1; xx <= cx + 1; xx++) {
        for (let yy = cy - 1; yy <= cy + 1; yy++) {
            const k = `${xx},${yy}`;
            if (worldItemGrid[k]) {
                for (const item of worldItemGrid[k]) {
                    const dx = item.x - x;
                    const dy = item.y - y;
                    if (dx * dx + dy * dy <= range * range) items.push(item);
                }
            }
        }
    }
    return items;
};

let worldDoors = {};    // New: Store door objects (Key: layer_id)
let craftingStations = {}; // New: Store crafting stations
// --- Spatial Partitioning (Collision Optimization) ---
// To avoid O(N) collision checks against every static object in the world,
// we divide the map into large grid cells (buckets).
// Objects are "hashed" into these cells at startup.
// Collision checks only need to query the specific cells a player is standing in.
const GRID_CELL_SIZE = 128; // Size of each grid cell (4 x 32px tiles)
let objectGrid = {};        // Hash Map: "x,y" -> [Array of objects]
let mapLayers = [];         // New: Store layers for property lookup
let globalTilesets = [];    // New: Store tilesets for property lookup

// --- Constants ---
const TICK_RATE = 30; // 30 updates per second
const PLAYER_SPEED = 100;
const TILE_SIZE = 32; // The size of your tiles in pixels
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 30;

// --- Initial Setup ---

function initializeGame(io) {
    log.info('Initializing game state...');
    monitoring.init(io); // Ensure IO is passed
    initializeSpells();
    initializeMap();
}

/**
 * Loads the Tiled map data and creates a simplified 2D array for collision detection.
 * Now checks for "Blocked" property for collision, and "lightBlock" for shadows.
 * ALSO loads static objects from the "Objects" layer for collision using "World Builder" logic.
 */
const mapConfig = require('./server/mapConfig');

function initializeMap() {
    // developer_note:
    // This function mirrors the Client's 'createMap' logic but for the Server.
    // 1. It loads the EXACT SAME .json file defined in mapConfig.js.
    // 2. It parses tile properties (like 'blocked') to build the server-side collision map.
    // 3. It iterates through Object Layers to build static collision boxes for trees, furniture, etc.
    //
    // CRITICAL: Any logic change to how collision is determined on the client (e.g. changing 'blocked' to 'solid')
    // MUST be reflected here, or the client and server will desync (ghost walking or invisible walls).
    try {
        const mapPath = path.join(__dirname, 'client/assets/tilemaps', mapConfig.mapFilename);
        const tilemapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

        mapWidth = tilemapData.width;
        const mapHeight = tilemapData.height;

        // --- 1. Tile-based Collision & Shadows ---
        // Stores Global GIDs for property lookup (Handling multiple tilesets)
        const blockedGids = new Set();
        const hillHomeGids = new Set();
        const zoneGids = {}; // Map: globalGid -> zoneString
        const lightBlockGids = new Set();

        if (tilemapData.tilesets) {
            tilemapData.tilesets.forEach(tileset => {
                const firstgid = tileset.firstgid;
                if (tileset.tiles) {
                    tileset.tiles.forEach(tile => {
                        const globalId = firstgid + tile.id;

                        if (tile.properties) {
                            // Updated to 'blocked' (lowercase) and boolean true
                            const blockedProp = tile.properties.find(p => p.name === 'blocked');
                            if (blockedProp && blockedProp.value === true) {
                                blockedGids.add(globalId);
                            }
                            const hillHomeProp = tile.properties.find(p => p.name === 'hillHome');
                            if (hillHomeProp && hillHomeProp.value === 'True') {
                                hillHomeGids.add(globalId);
                            }
                            // Check for lightBlock
                            const lightBlockProp = tile.properties.find(p => p.name === 'lightBlock');
                            if (lightBlockProp && (lightBlockProp.value === true || lightBlockProp.value === 'True')) {
                                lightBlockGids.add(globalId);
                            }
                            // Check for zone
                            const zoneProp = tile.properties.find(p => p.name === 'zone');
                            if (zoneProp) {
                                zoneGids[globalId] = zoneProp.value;
                            }
                        }
                    });
                    log.info(`Tileset '${tileset.name}' parsed. Found ${Object.keys(zoneGids).length} zone tiles total. Zones: ${Object.values(zoneGids).join(', ')}`);
                }
            });
        }

        // 2. Initialize Maps with 0s
        collisionMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));
        hillHomeMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));
        zoneMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(null));
        lightMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));

        // 3. Iterate Layers and Populate Maps
        // No need for 'mainTileset' or 'firstGid' assumption anymore.

        // Store layers globaly
        mapLayers = tilemapData.layers;

        tilemapData.layers.forEach(layer => {
            if (layer.type === 'tilelayer' && layer.data) {
                // [MODIFIED] Do NOT skip 'zones' layer entirely.
                // Instead, we mark it so we don't add collision/light from it.
                const isZoneLayer = layer.name && layer.name.toLowerCase().includes('zones');

                let layerIsHillHome = false;
                if (layer.properties) {
                    const prop = layer.properties.find(p => p.name === 'hillHome');
                    if (prop && prop.value === 'True') {
                        layerIsHillHome = true;
                    }
                }

                layer.data.forEach((gid, index) => {
                    if (gid === 0) return; // Empty tile

                    // Global ID Lookup (Correct for multiple tilesets)
                    const x = index % mapWidth;
                    const y = Math.floor(index / mapWidth);
                    if (y >= mapHeight || x >= mapWidth) return; // Safety bounds

                    // Collision Map - Exclude Zone Layer
                    if (!isZoneLayer && blockedGids.has(gid)) {
                        collisionMap[y][x] = 1;
                    }

                    // HillHome Map - Exclude Zone Layer (Safety)
                    if (!isZoneLayer && (hillHomeGids.has(gid) || layerIsHillHome)) {
                        hillHomeMap[y][x] = 1;
                    }

                    // Light Map (Shadows) - Exclude Zone Layer
                    if (!isZoneLayer && lightBlockGids.has(gid)) {
                        lightMap[y][x] = 1;
                    }

                    // Zone Map - INCLUDE Zone Layer (and others if they have zone props)
                    if (zoneGids[gid]) {
                        zoneMap[y][x] = zoneGids[gid];
                    }
                });
            }
        });

        // --- 4. Object Layer Collision (Updated: World Builder Logic and Item System) ---
        // This uses Raw GID Lookup to find properties correctly, matching client logic.
        staticObjects = [];
        // 4. Object Layer Collision & Doors (Updated: World Builder Logic and Item System)
        // This uses Raw GID Lookup to find properties correctly, matching client logic.
        staticObjects = [];
        worldItems = [];
        worldDoors = {};
        worldDoors = {};
        craftingStations = {}; // Global: { [uniqueId]: { type, x, y, inventory: [] } }

        // Index all Raw Tilesets by GID Range
        const rawTilesets = [];
        if (tilemapData.tilesets) {
            tilemapData.tilesets.forEach(rawTs => {
                const tsData = {
                    firstgid: rawTs.firstgid,
                    tilecount: rawTs.tilecount || 0,
                    tiles: {}
                };
                if (rawTs.tiles) {
                    rawTs.tiles.forEach(tile => {
                        const props = {};
                        if (tile.properties) {
                            tile.properties.forEach(p => {
                                if (p.type === 'int' || p.type === 'float' || !isNaN(p.value)) {
                                    props[p.name] = Number(p.value);
                                } else {
                                    props[p.name] = p.value;
                                }
                            });
                        }
                        tsData.tiles[tile.id] = { properties: props };
                    });
                }
                rawTilesets.push(tsData);
            });
        }

        globalTilesets = rawTilesets; // Store globally

        // Process ALL Object Layers
        // We filter for any layer of type 'objectgroup' and process its objects.
        const objectLayers = tilemapData.layers.filter(l => l.type === 'objectgroup');

        objectLayers.forEach(objectLayer => {
            if (objectLayer.objects) {
                objectLayer.objects.forEach(obj => {
                    // 1. Find Raw Tileset
                    // developer_note:
                    // Updated to match client-side logic for "Collection of Images" sparse ID support.
                    // Finds the tileset with the highest firstgid <= obj.gid.
                    const rawTs = rawTilesets
                        .slice()
                        .reverse()
                        .find(ts => obj.gid >= ts.firstgid);

                    if (rawTs) {
                        const trueLocalID = obj.gid - rawTs.firstgid;
                        const tileData = rawTs.tiles[trueLocalID];
                        const props = tileData ? tileData.properties : {};

                        // --- Door System Check ---
                        // If we are in the 'doors' layer, treat as a door
                        if (objectLayer.name.toLowerCase() === 'doors' || props.isDoor) {
                            // Initialize Door
                            const doorId = `${objectLayer.name}_${obj.id}`;

                            // Merge Props
                            let objectProps = {};
                            if (obj.properties && Array.isArray(obj.properties)) {
                                obj.properties.forEach(p => {
                                    objectProps[p.name] = p.value;
                                });
                            }
                            const combinedProps = { ...props, ...objectProps };

                            // Determine State
                            // Default: Closed (blocked: true, lightBlock: true) if not specified
                            // BUT user said: "if locked set to true then keys... if locked is true then door should not open"
                            // User said: "blocked ... if true door should not allow pass"
                            // User said: "lightBlock ... if true cast shadows"

                            // Initial State Logic:
                            // Frame 0 = Closed.
                            // We assume map places them as Frame 0 (Closed).

                            const isLocked = combinedProps.locked === true;
                            const isBlocked = combinedProps.blocked !== false; // Default true
                            const lightBlock = combinedProps.lightBlock !== false; // Default true

                            // Calculate Bounding Box for Spatial Hash
                            const doorW = obj.width;
                            // Door height for collision: user mentioned "Thin collision for door" in checkCollision logic
                            // Original check used 20px height from top of door? 
                            // "dTop = door.y - doorH" where doorH = 20.
                            // obj.y is Bottom Left? Tiled standard. 
                            // Let's use the same logic as CheckCollision had:
                            // Y is bottom. Top is Y - 20.

                            const doorCollisionHeight = 20;

                            // Construct the Door Object (Shared Reference)
                            const doorObj = {
                                id: doorId,
                                x: obj.x,
                                y: obj.y,
                                width: obj.width,
                                height: obj.height,
                                rotation: obj.rotation,
                                locked: isLocked,
                                blocked: isBlocked,     // Physics State (Mutable)
                                lightBlock: lightBlock, // Shadow State
                                state: 'closed',        // logical state
                                reqKey: combinedProps.reqKey || null,
                                isDoor: true,           // Flag for collision check
                                // Spatial Hash Props
                                minX: obj.x,
                                maxX: obj.x + doorW,
                                minY: obj.y - doorCollisionHeight,
                                maxY: obj.y,
                                layer: objectLayer.name
                            };

                            worldDoors[doorId] = doorObj; // Store reference
                            staticObjects.push(doorObj);  // Add to Spatial Hash

                            return; // SKIP adding detailed "body" static object logic below, we handled it.
                        }

                        // --- Item System Check ---
                        if (props.isItem) {
                            // Derive Item ID
                            let derivedItemId = props.itemId || props.itemID;
                            if (!derivedItemId) {
                                // Try reverse lookup by Name
                                const nameToCheck = props.name || obj.name;
                                derivedItemId = Object.keys(itemData).find(key => itemData[key].name === nameToCheck);
                            }
                            if (!derivedItemId) derivedItemId = 'unknown_item';

                            // Derive Texture
                            const derivedTexture = props.texture || (derivedItemId !== 'unknown_item' ? itemData[derivedItemId].texture : 'default_item');

                            // It's an Item! Add to worldItems and Skip collision (unless isSolid)
                            worldItems.push({
                                uid: `item_${obj.id}`, // Unique ID from Tiled
                                x: obj.x,
                                y: obj.y,
                                name: props.name || obj.name || 'Unknown Item',
                                itemId: derivedItemId,
                                itemType: props.itemType || 'misc',
                                texture: derivedTexture,
                                properties: props // Store all props just in case
                            });

                            if (!props.isSolid) {
                                return; // Skip adding to staticObjects
                            }
                        }

                        // --- Crafting Station Check ---
                        if (props.stationType) {
                            const stationId = `${objectLayer.name}_${obj.id}`;
                            craftingStations[stationId] = {
                                id: stationId,
                                type: props.stationType, // e.g. 'anvil'
                                x: obj.x,
                                y: obj.y,
                                inventory: [] // Volatile storage for deposited items
                            };
                            log.info(`[Server] Registered Crafting Station: ${stationId} (${props.stationType})`);
                        }

                        // --- Collision Box Dimensions ---
                        // Extract Object Properties to Override Tile Props
                        let objectProps = {};
                        if (obj.properties && Array.isArray(obj.properties)) {
                            obj.properties.forEach(p => {
                                objectProps[p.name] = p.value;
                            });
                        }

                        // Merge Props (Object overrides Tile)
                        const combinedProps = { ...props, ...objectProps };

                        // Check for explicit blocked: false
                        // Tiled might send boolean false or string "false"
                        if (combinedProps.blocked === false || combinedProps.blocked === 'false') {
                            // console.log(`[Server] Skipping collision for object ${obj.id} (blocked: false)`);
                            return;
                        }

                        // Prioritize custom properties (bodyWidth, bodyHeight, bodyOffsetY)
                        let width = combinedProps.bodyWidth;
                        let height = combinedProps.bodyHeight;
                        let offsetY = combinedProps.bodyOffsetY; // Can be undefined

                        // Fallback sizing
                        if (!width || !height) {
                            width = obj.width;
                            height = obj.height * 0.2; // Default to bottom 20%
                            offsetY = 0; // Default to 0 offset from bottom
                        } else {
                            if (offsetY === undefined) offsetY = 0;
                        }

                        // --- Coordinate Calculation (Client Parity) ---
                        // Client uses sprite.setOrigin(0.5, 1) -> Bottom Center

                        const spriteWidth = obj.width;
                        const bodyWidth = width;
                        const bodyHeight = height;

                        // Center the collision box horizontally within the sprite
                        const bodyOffsetX = (spriteWidth - bodyWidth) / 2;

                        // --- Vertical Offset Logic ---
                        // Formula: BodyY = SpriteBottomY - BodyHeight - BodyOffsetY

                        // Updated for Bottom Left Origin: obj.x is ALREADY the Left X
                        const spriteTopLeftX = obj.x;

                        const bodyX = spriteTopLeftX + bodyOffsetX;
                        const bodyY = obj.y - bodyHeight - offsetY;

                        staticObjects.push({
                            minX: bodyX,
                            maxX: bodyX + bodyWidth,
                            minY: bodyY,
                            maxY: bodyY + bodyHeight,
                            type: width === props.bodyWidth ? 'Custom' : 'Fallback',
                            name: obj.name || 'Unknown',
                            layer: objectLayer.name,
                            grid: `[${Math.floor(obj.x / 32)},${Math.floor(obj.y / 32)}]`
                        });
                    }
                });
            }
        });

        // --- TEST ITEM FOR VERIFICATION ---
        worldItems.push({
            uid: 'test_scroll_unique',
            x: 3350, // Near player start
            y: 4300,
            name: 'Test Scroll',
            itemId: 'scroll_01',
            itemType: 'clothing', // Changed for test
            texture: 'scroll2',
            equipSlot: 'head', // Add equip slot for testing
            properties: { isItem: true, equipSlot: 'head' }
        });
        log.success(`Loaded ${staticObjects.length} static objects and ${worldItems.length} world items from ${objectLayers.length} layers.`);

        // --- Spatial Partitioning: Populate Grid ---
        // We iterate through every static object and place it into the grid bucket(s) it occupies.
        // An object can span multiple buckets if it is large or on a boundary.
        objectGrid = {}; // Reset grid
        staticObjects.forEach(obj => {
            // Calculate the range of cells this object overlaps
            const startX = Math.floor(obj.minX / GRID_CELL_SIZE);
            const endX = Math.floor(obj.maxX / GRID_CELL_SIZE);
            const startY = Math.floor(obj.minY / GRID_CELL_SIZE);
            const endY = Math.floor(obj.maxY / GRID_CELL_SIZE);

            for (let y = startY; y <= endY; y++) {
                for (let x = startX; x <= endX; x++) {
                    const key = `${x},${y}`;
                    if (!objectGrid[key]) objectGrid[key] = [];
                    objectGrid[key].push(obj);
                }
            }
        });
        log.success('Spatial Hash Grid populated for static objects.');

        // --- 5. Generate Raycasting Segments ---
        // Perform this ONCE at startup to prepare for shadowcasting
        convertMapToSegments();

    } catch (e) {
        log.error('Failed to load or parse tilemap data:', e);
    }
}

/**
 * Converts the Grid-based Light Map into a set of optimized Line Segments.
 * This reduces the raycasting complexity from O(Tiles) to O(Edges).
 */
function convertMapToSegments() {
    log.info('Converting Light Map to Segments...');
    const segments = [];

    const height = lightMap.length;
    if (height === 0) return;
    const width = lightMap[0].length;

    // Helper to check if a tile is blocked (casting shadow)
    const isBlocked = (x, y) => {
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        return lightMap[y][x] === 1;
    };

    // Pass 1: Horizontal Edges
    for (let y = 0; y < height; y++) {
        let topStart = null;
        let bottomStart = null;

        for (let x = 0; x < width; x++) {
            const tileBlocked = isBlocked(x, y);
            const topBlocked = isBlocked(x, y - 1);
            const bottomBlocked = isBlocked(x, y + 1);

            // Top Edge: Current is blocked, Top is empty
            if (tileBlocked && !topBlocked) {
                if (topStart === null) topStart = x;
            } else {
                if (topStart !== null) {
                    segments.push([[topStart * TILE_SIZE, y * TILE_SIZE], [x * TILE_SIZE, y * TILE_SIZE]]);
                    topStart = null;
                }
            }

            // Bottom Edge: Current is blocked, Bottom is empty
            if (tileBlocked && !bottomBlocked) {
                if (bottomStart === null) bottomStart = x;
            } else {
                if (bottomStart !== null) {
                    segments.push([[bottomStart * TILE_SIZE, (y + 1) * TILE_SIZE], [x * TILE_SIZE, (y + 1) * TILE_SIZE]]);
                    bottomStart = null;
                }
            }
        }
        // End of Row cleanup
        if (topStart !== null) segments.push([[topStart * TILE_SIZE, y * TILE_SIZE], [width * TILE_SIZE, y * TILE_SIZE]]);
        if (bottomStart !== null) segments.push([[bottomStart * TILE_SIZE, (y + 1) * TILE_SIZE], [width * TILE_SIZE, (y + 1) * TILE_SIZE]]);
    }

    // Pass 2: Vertical Edges
    for (let x = 0; x < width; x++) {
        let leftStart = null;
        let rightStart = null;

        for (let y = 0; y < height; y++) {
            const tileBlocked = isBlocked(x, y);
            const leftBlocked = isBlocked(x - 1, y);
            const rightBlocked = isBlocked(x + 1, y);

            // Left Edge: Current is blocked, Left is empty
            if (tileBlocked && !leftBlocked) {
                if (leftStart === null) leftStart = y;
            } else {
                if (leftStart !== null) {
                    segments.push([[x * TILE_SIZE, leftStart * TILE_SIZE], [x * TILE_SIZE, y * TILE_SIZE]]);
                    leftStart = null;
                }
            }

            // Right Edge: Current is blocked, Right is empty
            if (tileBlocked && !rightBlocked) {
                if (rightStart === null) rightStart = y;
            } else {
                if (rightStart !== null) {
                    segments.push([[(x + 1) * TILE_SIZE, rightStart * TILE_SIZE], [(x + 1) * TILE_SIZE, y * TILE_SIZE]]);
                    rightStart = null;
                }
            }
        }
        // End of Column cleanup
        if (leftStart !== null) segments.push([[x * TILE_SIZE, leftStart * TILE_SIZE], [x * TILE_SIZE, height * TILE_SIZE]]);
        if (rightStart !== null) segments.push([[(x + 1) * TILE_SIZE, rightStart * TILE_SIZE], [(x + 1) * TILE_SIZE, height * TILE_SIZE]]);
    }

    // Add World Bounds
    segments.push([[0, 0], [width * TILE_SIZE, 0]]);
    segments.push([[width * TILE_SIZE, 0], [width * TILE_SIZE, height * TILE_SIZE]]);
    segments.push([[width * TILE_SIZE, height * TILE_SIZE], [0, height * TILE_SIZE]]);
    segments.push([[0, height * TILE_SIZE], [0, 0]]);

    staticSegments = segments;
    log.success(`Generated ${segments.length} wall segments for raycasting.`);

    // --- 6. Populate Segment Grid ---
    populateSegmentGrid(segments);
}

// --- Segment Spatial Partitioning ---
const SEGMENT_GRID_SIZE = 400; // Match AOI size for convenience
let segmentGrid = {}; // "cx,cy" -> [segment1, segment2]

function populateSegmentGrid(segments) {
    segmentGrid = {};
    let count = 0;

    segments.forEach(seg => {
        const p1 = seg[0];
        const p2 = seg[1];

        // Determine bounding box of the segment
        const minX = Math.min(p1[0], p2[0]);
        const maxX = Math.max(p1[0], p2[0]);
        const minY = Math.min(p1[1], p2[1]);
        const maxY = Math.max(p1[1], p2[1]);

        // Determine grid cells
        const startX = Math.floor(minX / SEGMENT_GRID_SIZE);
        const endX = Math.floor(maxX / SEGMENT_GRID_SIZE);
        const startY = Math.floor(minY / SEGMENT_GRID_SIZE);
        const endY = Math.floor(maxY / SEGMENT_GRID_SIZE);

        for (let y = startY; y <= endY; y++) {
            for (let x = startX; x <= endX; x++) {
                const key = `${x},${y}`;
                if (!segmentGrid[key]) segmentGrid[key] = [];
                segmentGrid[key].push(seg);
                count++;
            }
        }
    });
    log.success(`Populated Segment Grid. Indexed ${segments.length} segments into spatial hash.`);
}

/**
 * Retrieves segments relevant to the given position and range.
 * This is the core optimization for limiting raycasting scope.
 */
function getSegmentsInRange(x, y, range) {
    const cx = Math.floor(x / SEGMENT_GRID_SIZE);
    const cy = Math.floor(y / SEGMENT_GRID_SIZE);
    const rangeInCells = Math.ceil(range / SEGMENT_GRID_SIZE); // e.g. 600 / 400 = 2

    const segments = new Set(); // Use Set to avoid duplicates if segment spans multiple checked cells

    for (let xx = cx - rangeInCells; xx <= cx + rangeInCells; xx++) {
        for (let yy = cy - rangeInCells; yy <= cy + rangeInCells; yy++) {
            const key = `${xx},${yy}`;
            if (segmentGrid[key]) {
                const cellSegs = segmentGrid[key];
                for (let i = 0; i < cellSegs.length; i++) {
                    segments.add(cellSegs[i]);
                }
            }
        }
    }

    // Add World Bounds specifically if near edges? 
    // staticSegments includes bounds. They are large, so they will overlap many cells.
    // They should be picked up by the grid automatically.

    // Convert Set back to Array (VisibilityPolygon needs array)
    return Array.from(segments);
}

function initializeSpells() {
    // In a real game, you might load spawn points from the map data
    const spawnLocations = [
        { x: 5064, y: 4824 }, { x: 5112, y: 4824 }, { x: 4584, y: 4872 },
        { x: 5064, y: 4872 }, { x: 5112, y: 4872 }, { x: 4728, y: 5016 },
    ];

    spells.push({ Identifier: "spell", Name: "Spell #0", Description: "This is the zeroth spell", Icon: "scroll2", ...spawnLocations[0] });
    spells.push({ Identifier: "spell", Name: "Spell #1", Description: "This is the first spell", Icon: "scroll2", ...spawnLocations[1] });
    spells.push({ Identifier: "spell", Name: "Spell #2", Description: "This is the second spell", Icon: "scroll2", ...spawnLocations[2] });

    log.success('Spells initialized.');
}

function handlePlayerInput(playerId, inputData) {
    if (players[playerId]) {
        players[playerId].input = inputData;
    }
}


/**
 * Checks if a player at position (x, y) collides with any blocked tiles OR static objects.
 * Uses a bounding box of size TILE_SIZE x TILE_SIZE centered at (x, y).
 */
function checkCollision(x, y) {
    // 1. Check Tile Collision
    if (collisionMap && collisionMap.length > 0) {
        // Define player bounding box (assuming player is roughly tile-sized)
        // Adjust these values if the collision box needs to be smaller/larger
        const width = PLAYER_WIDTH;
        const height = PLAYER_HEIGHT;

        const left = x + 30 - width / 2;
        const right = x + 30 + width / 2;
        const top = y - height / 2;
        const bottom = y + height / 2;

        // Convert to tile coordinates
        const minTileX = Math.floor(left / TILE_SIZE);
        const maxTileX = Math.floor((right) / TILE_SIZE);
        const minTileY = Math.floor(top / TILE_SIZE);
        const maxTileY = Math.floor((bottom) / TILE_SIZE);

        // Check all overlapped tiles
        for (let ty = minTileY; ty <= maxTileY; ty++) {
            for (let tx = minTileX; tx <= maxTileX; tx++) {
                // Check bounds - If out of bounds, treat as solid wall
                if (ty < 0 || ty >= collisionMap.length || tx < 0 || tx >= collisionMap[0].length) {
                    return true;
                }

                if (collisionMap[ty][tx] === 1) {
                    return true;
                }
            }
        }
    }

    // 2. Check Static Object Collision (OPTIMIZED: Spatial Hash)
    // Instead of iterating ALL objects (O(N)), we only check the ones in the local grid cells.
    // This reduces collision detection to effectively O(1) or O(K) where K is local object count.
    if (objectGrid) {
        const pWidth = PLAYER_WIDTH;
        const pHeight = PLAYER_HEIGHT;

        // Player bounding box
        const pLeft = x + 30 - pWidth / 2;
        const pRight = x + 30 + pWidth / 2;
        const pTop = y - pHeight / 2;
        const pBottom = y + pHeight / 2;

        // Determine which grid cells the player overlaps
        const startX = Math.floor(pLeft / GRID_CELL_SIZE);
        const endX = Math.floor(pRight / GRID_CELL_SIZE);
        const startY = Math.floor(pTop / GRID_CELL_SIZE);
        const endY = Math.floor(pBottom / GRID_CELL_SIZE);

        // Iterate only relevant cells
        for (let gy = startY; gy <= endY; gy++) {
            for (let gx = startX; gx <= endX; gx++) {
                const key = `${gx},${gy}`;
                const cellObjects = objectGrid[key];

                if (cellObjects) {
                    for (const obj of cellObjects) {
                        // Check Dynamic Blocked State (For Doors)
                        if (obj.blocked === false) continue;

                        // Standard AABB Overlap Check
                        if (pLeft < obj.maxX &&
                            pRight > obj.minX &&
                            pTop < obj.maxY &&
                            pBottom > obj.minY) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    // 3. (REMOVED) Check Doors - Now handled by Spatial Hash (Step 2)
    // Optimization: Doors are now in objectGrid with 'isDoor' and dynamic 'blocked' checking.


    return false;
}

/**
 * Checks if a player at position (x, y) collides with any hillHome tiles.
 */
function checkHillHomeCollision(x, y) {
    if (!hillHomeMap || hillHomeMap.length === 0) return false;

    const width = PLAYER_WIDTH;
    const height = PLAYER_HEIGHT;

    const left = x + 30 - width / 2;
    const right = x + 30 + width / 2;
    const top = y - height / 2;
    const bottom = y + height / 2;

    const minTileX = Math.floor(left / TILE_SIZE);
    const maxTileX = Math.floor((right) / TILE_SIZE);
    const minTileY = Math.floor(top / TILE_SIZE);
    const maxTileY = Math.floor((bottom) / TILE_SIZE);

    for (let ty = minTileY; ty <= maxTileY; ty++) {
        for (let tx = minTileX; tx <= maxTileX; tx++) {
            if (ty >= 0 && ty < hillHomeMap.length && tx >= 0 && tx < hillHomeMap[0].length) {
                if (hillHomeMap[ty][tx] === 1) {
                    return true;
                }
            }
        }
    }
    return false;
}

// --- MODIFICATION ---
// This function will now process the stored inputs to move the players.
function updatePlayers(delta, io) {
    const speed = 100;
    Object.keys(players).forEach(id => {
        const player = players[id];

        // Process all pending inputs in the queue
        while (player.inputQueue && player.inputQueue.length > 0) {
            const input = player.inputQueue.shift();

            const inputDelta = input.delta || 0.016; // Default to ~60fps if missing

            let newX = player.position.x;
            let newY = player.position.y;

            // Calculate proposed X change
            let proposedX = newX;
            if (input.left) {
                proposedX -= speed * inputDelta;
            }
            if (input.right) {
                proposedX += speed * inputDelta;
            }

            // Check X collision
            // Check X collision
            if (player.isDead || !checkCollision(proposedX, player.position.y)) {
                newX = proposedX;
            }

            // Calculate proposed Y change
            let proposedY = newY;
            if (input.up) {
                proposedY -= speed * inputDelta;
            }
            if (input.down) {
                proposedY += speed * inputDelta;
            }

            // Check Y collision
            if (player.isDead || !checkCollision(newX, proposedY)) {
                newY = proposedY;
            }

            player.position.x = newX;
            player.position.y = newY;

            // Update Spatial Grid
            updatePlayerGrid(player);

            // Update rotation based on this input step
            if (input.left) player.rotation = 1;
            else if (input.right) player.rotation = 2;
            else if (input.up) player.rotation = 3;
            else if (input.down) player.rotation = 4;

            player.isMoving = input.left || input.right || input.up || input.down;

            // Keep track of the last processed input for reconciliation
            if (input.sequence) {
                player.lastProcessedInputSequence = input.sequence;
            }
        }

        // Check for zone changes
        // Only check if position is valid
        const gridX = Math.floor(player.position.x / TILE_SIZE);
        const gridY = Math.floor(player.position.y / TILE_SIZE);

        let currentZone = null;
        if (gridY >= 0 && gridY < zoneMap.length && gridX >= 0 && gridX < zoneMap[0].length) {
            currentZone = zoneMap[gridY][gridX];
        }

        if (currentZone !== player.lastZone) {
            player.lastZone = currentZone;
            // Emit event to the socket
            if (io.sockets.sockets.get(id)) {
                // console.log(`[Zone] Player entered zone: ${currentZone}`);
                io.sockets.sockets.get(id).emit('zoneUpdate', { zone: currentZone });
            }
        }

        // --- BREAK FREE / STRUGGLE LOGIC ---
        // Use the *latest* input state for actions like struggling
        const input = player.input || {};
        const isInputting = input.left || input.right || input.up || input.down;

        // --- BREAK FREE / STRUGGLE LOGIC ---
        // This logic handles players trying to break free from being held.
        // We explicitly check !player.consumedBy to ensure that consumed players cannot
        // use the arrow keys to struggle free. Their struggle mechanic is handled via the UI button.
        if (player.isHeld && !player.consumedBy) {
            if (player.grippedFirmly) {
                // Struggle logic: require distinct key presses
                const prevInput = player.prevInput || {};
                const pressedKey = (input.left && !prevInput.left) ||
                    (input.right && !prevInput.right) ||
                    (input.up && !prevInput.up) ||
                    (input.down && !prevInput.down);

                if (pressedKey) {
                    player.struggleCount = (player.struggleCount || 0) + 1;
                    if (player.struggleCount >= 3) {
                        const holderId = player.heldBySocketId;
                        const holderName = (holderId && players[holderId]) ? (players[holderId].firstName || 'Unknown') : 'Unknown';

                        player.isHeld = false;
                        player.grippedFirmly = false;
                        player.heldBy = null;
                        player.heldBySocketId = null;
                        player.grippedBy = null;
                        player.struggleCount = 0;
                        log.info(`Player ${player.Username || player.playerId} struggled free!`);


                        // Broadcast Interactional Message
                        if (messageSystem) {
                            messageSystem.sendSystemMessage('Interactional', `${player.firstName} pulls away from ${holderName}.`);
                        }
                    }
                }
            } else {
                // Normal break free
                if (isInputting) {
                    player.isHeld = false;
                    player.heldBy = null;
                    player.heldBySocketId = null;
                    log.info(`Player ${player.Username || player.playerId} broken free from hold. Input was:`, input);
                }
            }
        }

        // Store input for next frame's edge detection
        player.prevInput = { ...input };

        player.isMoving = input.left || input.right || input.up || input.down;

        // --- HELD PLAYER LOGIC ---
        // --- HELD PLAYER LOGIC ---
        if (player.isHeld && player.heldBySocketId && players[player.heldBySocketId]) {
            const holder = players[player.heldBySocketId];
            // Gripped firmly is tighter range
            const holdDist = player.grippedFirmly ? 20 : 64;

            // Calculate distance to holder center
            const dx = player.position.x - holder.position.x;
            const dy = player.position.y - holder.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (holder.isMoving) {
                // If holder is moving, drag the player behind them ("Fall in line")
                let targetX = holder.position.x;
                let targetY = holder.position.y;
                const behindOffset = 50; // Distance to trail behind

                if (holder.rotation === 1) targetX += behindOffset; // Left -> Behind is Right
                else if (holder.rotation === 2) targetX -= behindOffset; // Right -> Behind is Left
                else if (holder.rotation === 3) targetY += behindOffset; // Up -> Behind is Down
                else if (holder.rotation === 4) targetY -= behindOffset; // Down -> Behind is Up

                // Move towards target position smoothly ("Leash" effect)
                // Use a lerp factor to drag them along.
                const lerpFactor = 0.15;
                player.position.x += (targetX - player.position.x) * lerpFactor;
                player.position.y += (targetY - player.position.y) * lerpFactor;

                // "Fall in line" - match rotation and movement state
                player.rotation = holder.rotation;
                player.isMoving = true;

            } else {
                // Holder is stationary.
                // Enforce "Leash": If outside holdDist, pull them in.
                // If inside, leave them be (maintain relative side).

                if (dist > holdDist) {
                    // Too far, pull in to max distance
                    const angle = Math.atan2(dy, dx);
                    player.position.x = holder.position.x + Math.cos(angle) * holdDist;
                    player.position.y = holder.position.y + Math.sin(angle) * holdDist;
                }

                // If stationary, held player stops moving too
                player.isMoving = false;
            }
        }

        // --- CONSUMED PLAYER LOGIC ---
        // If a player is consumed, their position is strictly tied to the predator.
        // We override their position every frame to match the predator's position.
        // This ensures they "move with" the predator and cannot desync.
        if (player.consumedBy && players[player.consumedBy]) {
            const predator = players[player.consumedBy];
            player.position.x = predator.position.x;
            player.position.y = predator.position.y;
            player.isMoving = predator.isMoving;
        }

        // --- VISIBILITY CALCULATION ---
        // Compute the visibility polygon for this player.
        // Optimization: Only update if moved significantly (> 1px).
        if (staticSegments.length > 0) {
            const lastPos = player.lastShadowCalcPosition || { x: -9999, y: -9999 };
            // Simple Manhattan distance check is sufficient and faster
            const dist = Math.abs(player.position.x - lastPos.x) + Math.abs(player.position.y - lastPos.y);

            // OPTIMIZATION: Increased threshold from 1.0 to 16.0 (half tile)
            // Recalculating raycast shadows every pixel is overkill.
            if (dist > 16.0) {
                const pos = [player.position.x, player.position.y];

                // Compute visibility
                // VisibilityPolygon.compute(position, segments)
                // segments: array of [[x1,y1],[x2,y2]]
                // Returns: [[x1,y1], [x2,y2], ...]

                // [OPTIMIZED] Use Spatial Partitioning to get only relevant segments
                const relevantSegments = getSegmentsInRange(player.position.x, player.position.y, VIEW_DISTANCE);

                // [FIX] Add Dynamic Bounding Box Limit
                // Prevents infinite rays / jagged edges at view limit
                const boxSize = VIEW_DISTANCE; // e.g. 600
                const px = player.position.x;
                const py = player.position.y;

                relevantSegments.push(
                    [[px - boxSize, py - boxSize], [px + boxSize, py - boxSize]], // Top
                    [[px + boxSize, py - boxSize], [px + boxSize, py + boxSize]], // Right
                    [[px + boxSize, py + boxSize], [px - boxSize, py + boxSize]], // Bottom
                    [[px - boxSize, py + boxSize], [px - boxSize, py - boxSize]]  // Left
                );

                const polygon = VisibilityPolygon.compute(pos, relevantSegments);
                player.visibilityPolygon = polygon;
                // player.visibilityPolygon = []; // Empty polygon (See everyone / no shadows)
                player.lastShadowCalcPosition = { x: player.position.x, y: player.position.y };
            }
        }

        // --- CRAFTING RANGE CHECK & AUTO-PAUSE ---
        // Delegated to handler for server authority
        if (player.isCrafting) {
            craftingHandlers.checkCraftingRange(id, player, io, craftingStations);
        }
    });
}

//  * The main game loop, running at a fixed tick rate.
//  * @param { SocketIO.Server } io - The main socket.io instance.
//  */
/**
 * Checks if a point (x, y) is inside a polygon (array of [x, y]).
 * Ray-casting algorithm.
 * OPTIMIZED: Takes x, y arguments instead of point array to unnecessary avoid allocation.
 */
function isPointInPolygon(x, y, vs) {
    // ray-casting algorithm based on
    // https://github.com/substack/point-in-polygon
    // vs = [[x1, y1], [x2, y2], ...]
    // x, y = coordinates

    if (!vs || vs.length === 0) return false;

    // --- AABB OPTIMIZATION ---
    // Fast fail if point is outside the bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
    }
    // Check bounding box
    if (x < minX || x > maxX || y < minY || y > maxY) return false;
    // -------------------------

    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];

        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

//  * The main game loop, running at a fixed tick rate.
//  * @param { SocketIO.Server } io - The main socket.io instance.
//  */
let lastUpdateTime = Date.now();
let lastDigestionTime = Date.now();
let serverTickCount = 0; // [OPTIMIZED] For temporal staggering
const VIEW_DISTANCE = 600; // [OPTIMIZED] Reduced from 950 to 600 (Bandwidth/CPU Tradeoff)
const VISIBILITY_BUFFER = 30; // Reduced to 30 to prevent early pop-in from shadows

function gameLoop(io) {
    const tStart = performance.now();
    let tLogic = 0;
    let tPhysics = 0;
    let packetsSent = 0;

    const now = Date.now();
    const delta = (now - lastUpdateTime) / 1000; // Delta in seconds
    lastUpdateTime = now;

    // --- DIGESTION SYSTEM ---
    // Run once per second (approx)
    if (now - lastDigestionTime > 1000) {
        processDigestion(players, User, io, (corpseData) => {
            const id = 'corpse_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            corpses[id] = { ...corpseData, id };
            return id;
        }, messageSystem);
        lastDigestionTime = now;
    }

    // --- PHYSICS & MOVEMENT ---
    tLogic = performance.now() - tStart;
    const tPhysicsStart = performance.now();

    // [FIX] Ensure players move before we calculate visibility
    updatePlayers(delta, io);
    tPhysics = performance.now() - tPhysicsStart;

    // --- GLOBAL PACKET CACHING (O(N) Optimization) ---
    // Pre-calculate the "Public" packet and "Public Delta" for every player ONCE.
    // This allows us to reuse the same object for all 500+ observers, avoiding O(N^2) object creation.

    const connectedSocketIds = Object.keys(players);

    connectedSocketIds.forEach(pid => {
        const p = players[pid];
        if (!p) return;

        // 1. Generate Current Public State
        // This is what ANY observer sees (excluding private data like visibilityPolygon for self)
        const currentPublicState = getUpdatePacketForOther(p);

        // 2. Compare with Last Tick's Public State to generate a "Global Delta"
        let globalDelta = null;
        if (p._lastPublicState) {
            globalDelta = getPacketDelta(p._lastPublicState, currentPublicState);
        } else {
            // No previous state, so no delta (first tick or just reset)
            // But for caching purposes, the "delta" vs "full" logic is handled by the observer's knowledge
        }

        if (globalDelta) {
            // Ensure ID is present for client routing
            globalDelta.playerId = pid;
        }

        // 3. Cache it on the player object
        p._cache = {
            publicState: currentPublicState, // Full Object from THIS tick
            publicDelta: globalDelta         // Diff from LAST tick
        };

        // 4. Update History for NEXT tick
        // We clone it because currentPublicState might be referenced/modified (unlikely but safe)
        // Actually, getUpdatePacketForOther creates a new object structure (shallow helpers), 
        // but we need to ensure we don't mutate `_lastPublicState` later.
        // Since we are replacing `_lastPublicState` entirely, it's fine.
        p._lastPublicState = currentPublicState;
    });

    // --- AREA OF INTEREST (AOI) SYSTEM ---
    // The AOI system is a network optimization technique.
    // Instead of broadcasting every player's position to every other player (O(N^2)),
    // we filter updates so clients only receive data about players they can actually see.
    // This significantly reduces bandwidth usage and prevents clients from "knowing" about
    // hidden players (anti-cheat).

    // const connectedSocketIds = Object.keys(players); // Already declared above for Global Caching

    // --- 1. Build Spatial Hash for Players ---
    const AOI_CELL_SIZE = 400; // Size of grid cell
    const playerGrid = {};

    connectedSocketIds.forEach(pid => {
        const p = players[pid];
        if (p) {
            const cx = Math.floor(p.position.x / AOI_CELL_SIZE);
            const cy = Math.floor(p.position.y / AOI_CELL_SIZE);
            const key = `${cx},${cy}`;
            if (!playerGrid[key]) playerGrid[key] = [];
            playerGrid[key].push(pid);

            // DEBUG AOI
            if (p.firstName === 'Tester' || p.firstName === 'Remote') {
                // console.log(`[AOI DEBUG] ${p.firstName} (${pid}) GridKey: ${key} Pos: ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}`);
            }
        }
    });

    // Iterate over each connected player ("Observer") to determine what they should see.
    connectedSocketIds.forEach((observerId, index) => {
        const observer = players[observerId];
        if (!observer) return;

        // [OPTIMIZATION] Temporal Staggering (Tick Skipping)
        // Only Re-Calculate Visibility for 1/3rd of players per tick.
        // For the others, we reuse the cached visibility set from the last calculation.
        // This keeps the O(N^2) complexity manageable (effectively 10Hz updates for vis changes).
        const shouldRecalculate = (index % 3 === serverTickCount % 3);

        // Ensure we have a set to work with
        if (!observer._visibleSet) {
            observer._visibleSet = new Set();
            observer._visibleSet.add(observerId); // Always see self
        }

        if (shouldRecalculate) {
            const newVisibleSet = new Set();
            newVisibleSet.add(observerId); // Always include self

            // --- Spatial Hash Lookup for Targets ---
            const oX = observer.position.x;
            const oY = observer.position.y;
            const cellX = Math.floor(oX / AOI_CELL_SIZE);
            const cellY = Math.floor(oY / AOI_CELL_SIZE);

            // Check 5x5 Grid around observer (covers ~1000px radius with 400px cells)
            for (let cx = cellX - 3; cx <= cellX + 3; cx++) {
                for (let cy = cellY - 3; cy <= cellY + 3; cy++) {
                    const cellKey = `${cx},${cy}`;
                    const cellPlayers = playerGrid[cellKey];

                    if (cellPlayers) {
                        for (const targetId of cellPlayers) {
                            if (observerId === targetId) continue; // Already added self

                            const target = players[targetId];
                            if (!target) continue;

                            // 1. Distance Check
                            const dx = oX - target.position.x;
                            const dy = oY - target.position.y;
                            const distSq = dx * dx + dy * dy;

                            if (distSq < VIEW_DISTANCE * VIEW_DISTANCE) {
                                // 2. Shadow/Visibility Check
                                let isVisible = false;

                                // OPTIMIZATION: Proximity Short-Circuit
                                if (distSq < 22500) { // 150 * 150
                                    isVisible = true;
                                } else if (observer.visibilityPolygon && observer.visibilityPolygon.length > 0) {
                                    // [OPTIMIZED] Center First Raycast
                                    const tx = target.position.x;
                                    const ty = target.position.y;

                                    if (isPointInPolygon(tx, ty, observer.visibilityPolygon)) {
                                        isVisible = true;
                                    } else {
                                        // Check edges only if center is blocked
                                        isVisible =
                                            isPointInPolygon(tx + VISIBILITY_BUFFER, ty, observer.visibilityPolygon) ||
                                            isPointInPolygon(tx - VISIBILITY_BUFFER, ty, observer.visibilityPolygon) ||
                                            isPointInPolygon(tx, ty + VISIBILITY_BUFFER, observer.visibilityPolygon) ||
                                            isPointInPolygon(tx, ty - VISIBILITY_BUFFER, observer.visibilityPolygon);
                                    }
                                } else {
                                    isVisible = true; // Fallback
                                }

                                if (isVisible && target.isInGame) {
                                    // VISIBILITY FILTER FOR SPIRITS
                                    const observerIsDead = observer.isDead;
                                    const targetIsDead = target.isDead;

                                    if (!observerIsDead && targetIsDead) {
                                        // Alive observer cannot see Spirit target
                                    } else {
                                        newVisibleSet.add(targetId);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Update Cache
            observer._visibleSet = newVisibleSet;
        }

        // --- SEND UPDATES (Every Tick) ---
        // Send the customized, filtered list of players to this specific client.
        const socket = io.sockets.sockets.get(observerId);
        if (socket) {
            if (!socket._knownPlayers) socket._knownPlayers = new Set();
            const currentVisibleIds = new Set();
            const updatesToSend = {};

            // Iterate the (potentially cached) set of visible players
            observer._visibleSet.forEach(targetId => {
                // 1. Self Update (Always Full Rate)
                if (targetId === observerId) {
                    const selfState = getUpdatePacketForSelf(observer);
                    let selfDelta = null;
                    if (socket._lastSelfState) {
                        selfDelta = getPacketDelta(socket._lastSelfState, selfState);
                    } else {
                        selfDelta = selfState;
                    }
                    socket._lastSelfState = selfState;

                    if (selfDelta) {
                        selfDelta.playerId = observerId;
                        updatesToSend[observerId] = selfDelta;
                    }
                    currentVisibleIds.add(observerId);
                    return;
                }

                // 2. Others Update
                const target = players[targetId];
                if (!target || !target._cache) return; // Should not happen

                // [LOD OPTIMIZATION] Distance-Based Throttling
                // Calculate distance to determine update frequency
                // We use Manhattan distance for speed, it's roughly accurate enough for LOD classification
                const distX = Math.abs(observer.position.x - target.position.x);
                const distY = Math.abs(observer.position.y - target.position.y);
                const isFar = (distX + distY) > 400; // Approx 300px Euclidean

                // If Far, only update every 3rd tick (10Hz)
                // Use targetID char code sum or specific char for deterministic hashing
                // We use the last char code to distribute load evenly across ticks
                if (isFar) {
                    const idHash = targetId.charCodeAt(targetId.length - 1);

                    // [LOD PRIORITY] Force update if critical state changed (Animation/Rotation fix)
                    let forceUpdate = false;
                    if (target._cache && target._cache.publicDelta) {
                        const d = target._cache.publicDelta;
                        // Check for visual state changes that need immediate feedback
                        if (d.rotation !== undefined || d.action !== undefined || d.isMoving !== undefined || d.isDead !== undefined) {
                            forceUpdate = true;
                        }
                    }

                    if (!forceUpdate && (serverTickCount + idHash) % 3 !== 0) {
                        // SKIP UPDATE this tick
                        // We still mark as visible so they aren't pruned (from _knownPlayers)
                        currentVisibleIds.add(targetId);
                        // [OPTIMIZATION] Send NOTHING. Client will persist the player until explicit removal.
                        return;
                    }
                }

                currentVisibleIds.add(targetId);

                if (socket._knownPlayers.has(targetId)) {
                    // Send Global Delta (if any)
                    if (target._cache.publicDelta) {
                        updatesToSend[targetId] = target._cache.publicDelta;
                    } else {
                        // Keep-Alive
                        updatesToSend[targetId] = { playerId: targetId };
                    }
                } else {
                    // Send Full State
                    updatesToSend[targetId] = target._cache.publicState;
                    socket._knownPlayers.add(targetId);
                }
            });

            // 3. Prune Stale Players (Explicit Removal)
            const removedIds = [];
            socket._knownPlayers.forEach(knownId => {
                if (!currentVisibleIds.has(knownId)) {
                    socket._knownPlayers.delete(knownId);
                    removedIds.push(knownId);
                }
            });

            // Emit if there is ANY data (Update OR Removal)
            if (Object.keys(updatesToSend).length > 0 || removedIds.length > 0) {
                // Send updates map AND removed list
                socket.emit('playerUpdates', updatesToSend, removedIds);
                packetsSent++;
            }
        }
    });
    // io.emit('spellUpdates', spells);

    const tEnd = performance.now();
    serverTickCount++; // [FIX] Increment tick for temporal staggering

    return {
        breakdown: {
            logic: tLogic,
            physics: tPhysics,
            serialize: tEnd - tStart - tLogic - tPhysics
        },
        entities: {
            clients: Object.keys(players).length,
            items: worldItems.length,
            corpses: Object.keys(corpses).length
        },
        network: {
            packets: packetsSent,
            bytes: 0
        }
    };
}


// --- Network Packet Helpers ---

/**
 * Returns the common state fields shared by both Self and Other packets.
 * Centralizes duplicate logic to prevent desync bugs.
 */
function getCommonPlayerState(player) {
    return {
        Identifier: player.Identifier,
        playerId: player.playerId,
        socketId: player.socketId,
        // [FIX] Clone position to prevent reference mutation breaking delta compression
        position: { x: player.position.x, y: player.position.y },
        rotation: player.rotation,
        isMoving: player.isMoving,

        // Identity & Visuals
        Username: player.Username,
        firstName: player.firstName,
        lastName: player.lastName,
        skin: player.skin,
        hair: player.hair,
        face: player.face,

        // Visual Gear
        clothing: { ...player.clothing },
        equipment: { ...player.equipment },

        // Detailed Visuals
        head: player.head,
        body: player.body,
        hands: player.hands,
        feet: player.feet,
        tail: player.tail,
        eyes: player.eyes,
        ear: player.ear,
        genitles: player.genitles,
        beak: player.beak,
        headAccessories: player.headAccessories,

        // Visible States
        isHeld: player.isHeld,
        heldBySocketId: player.heldBySocketId,
        consumedBy: player.consumedBy,
        action: player.action,

        // Death & Spirit
        isDead: player.isDead,
        spiritSprite: player.spiritSprite,

        // Struggle / Vore States
        grippedFirmly: player.grippedFirmly,
        struggleCount: player.struggleCount,
        grippedBy: player.grippedBy,
        voreTypes: player.voreTypes,

        // Interactive State
        actionHands: { ...player.actionHands },

        // Crafting State
        isCrafting: player.isCrafting,
        craftingStartTime: player.craftingStartTime,
        craftingDuration: player.craftingDuration,

        // Stats (Health, Stamina, Mana)
        stats: { ...player.stats }
    };
}

/**
 * Creates the update packet for YOUR OWN player.
 * Includes sensitive/local-only data like visibilityPolygon and reconciliation stats.
 */
function getUpdatePacketForSelf(player) {
    const common = getCommonPlayerState(player);
    return {
        ...common,
        visibilityPolygon: player.visibilityPolygon, // Only self needs this for shadow calc
        lastProcessedInputSequence: player.lastProcessedInputSequence,
        lastClientTimestamp: player.lastClientTimestamp
    };
}

/**
 * Creates a highly optimized player object for OTHER players.
 * STRICTLY EXCLUDES 'visibilityPolygon' to save massive bandwidth.
 */
function getUpdatePacketForOther(player) {
    // Currently identical to common state, but wrapper kept for future specificity
    return getCommonPlayerState(player);
}
// --- Snapshot & Delta Helpers ---

function clonePacketForSnapshot(p) {
    // OPTIMIZATION: Manual Shallow Clone + One-Level Deep for Mutable Props
    // Much faster than JSON.parse(JSON.stringify)
    const clone = { ...p };

    // Clone known mutable nested objects to prevent reference sharing
    if (p.position) clone.position = { ...p.position };
    if (p.stats) clone.stats = { ...p.stats };
    if (p.input) clone.input = { ...p.input };
    if (p.actionHands) clone.actionHands = { ...p.actionHands };

    // These might differ, but often standard arrays/objects. 
    // JSON parse/stringify is still safest/easiest for deep structures like equipment 
    // without writing a full deepClone function, but we only do it for specific fields.
    if (p.equipment) clone.equipment = { ...p.equipment };
    // Note: If Equipment has nested objects, Spread is shallow. 
    // But currently equipment is mostly flat key-val (head: 'sprite', etc).

    if (p.voreTypes) clone.voreTypes = [...p.voreTypes]; // Array shallow copy

    return clone;
}

function getPacketDelta(oldObj, newObj) {
    const delta = {};
    let hasChanges = false;

    // Iterate over new keys
    for (const key in newObj) {
        const oldVal = oldObj[key];
        const newVal = newObj[key];

        // 1. Position Special Check (Float Precision & Ignore minor jitters)
        if (key === 'position') {
            if (!oldVal || !newVal || Math.abs(oldVal.x - newVal.x) > 0.01 || Math.abs(oldVal.y - newVal.y) > 0.01) {
                delta[key] = newVal;
                hasChanges = true;
            }
            continue;
        }

        // 2. Strict Reference Check (Fastest)
        if (oldVal === newVal) continue;

        // 3. Known Nested Objects (Manual Optimization)
        // Avoid generic JSON.stringify for everything.
        if (key === 'input' || key === 'action' || key === 'actionHands') {
            // Shallow compare 1-level deep
            if (hasShallowChanged(oldVal, newVal)) {
                delta[key] = newVal;
                hasChanges = true;
            }
        }
        else if (key === 'stats' || key === 'equipment' || key === 'clothing' || key === 'voreTypes') {
            // These change rarely (relative to position) or are complex. 
            // If reference mismatch, perform check.
            // Using JSON here is acceptable as these updates are rare compared to position.
            const oldStr = JSON.stringify(oldVal);
            const newStr = JSON.stringify(newVal);
            if (oldStr !== newStr) {
                if (key === 'stats') {
                    // log.debug(`[StatsDiff] Old: ${oldStr} | New: ${newStr}`);
                    // Temporary log to console to inspect
                    console.log(`[StatsDiff] Old: ${oldStr}`);
                    console.log(`[StatsDiff] New: ${newStr}`);
                }
                delta[key] = newVal;
                hasChanges = true;
            }
        }
        else {
            // Primitives or Arrays treating as atomic replacement
            delta[key] = newVal;
            hasChanges = true;
        }
    }

    return hasChanges ? delta : null;
}

// Helper for fast shallow comparison
function hasShallowChanged(a, b) {
    if (a === b) return false;
    if (!a || !b) return true;

    // Check keys
    for (const key in b) {
        if (a[key] !== b[key]) return true;
    }
    // Check if 'a' had keys 'b' lacks (deletion) - rare for stats but possible
    for (const key in a) {
        if (b[key] === undefined) return true;
    }
    return false;
}

// --- Main Exported Start Function ---

module.exports.start = (io, _messageSystem) => {
    messageSystem = _messageSystem;
    initializeGame(io);

    io.on('connection', (socket) => {
        log.info(`Player connected with socket ID: ${socket.id}`);

        // Send map segments to client for local shadow prediction
        if (staticSegments.length > 0) {
            socket.emit('mapSegments', staticSegments);
        }

        // Latency Test Listener
        socket.on('pingTest', (clientTime, callback) => {
            if (typeof callback === 'function') {
                callback(Date.now());
            }
        });

        const charId = socket.handshake.query.charId;

        // [SYNC INIT] Initialize minimal player object immediately so listeners don't fail
        players[socket.id] = {
            socketId: socket.id,
            playerId: socket.id, // [CRITICAL] Added for client identity check during sync
            inputQueue: [],
            actionHands: { activeHand: 'right', leftNode: null, rightNode: null },
            equipment: {},
            headers: {},
            isDead: false,
            isCrafting: false,
            isInGame: false,
            // [CRITICAL] Initialize position to avoid crash in gameLoop before DB load check
            // Use query params if provided (for bots/load tests), otherwise default
            position: {
                x: socket.handshake.query.startX ? parseInt(socket.handshake.query.startX) : 3291,
                y: socket.handshake.query.startY ? parseInt(socket.handshake.query.startY) : 4287
            },
            // [CRITICAL] Initialize cosmetic structure to prevent client crash during sync gap
            head: { sprite: 'head_01', color: '0xe0e0e0', secondarySprite: 'empty', secondaryColor: '0xffffff', accentSprite: 'empty', accentColor: '0x636363' },
            body: { sprite: 'body_01', color: '0xe0e0e0', secondarySprite: 'empty', secondaryColor: '0xffffff', accentSprite: 'empty', accentColor: '0x636363' },
            hands: { sprite: 'empty', color: '0xe0e0e0' },
            feet: { sprite: 'empty', color: '0xe0e0e0' },
            tail: { sprite: 'tail_01', color: '0xe0e0e0', secondarySprite: 'empty', secondaryColor: '0xffffff', accentSprite: 'empty', accentColor: '0x636363' },
            eyes: { outer: 'eyes_01', iris: 'eyes_02', color: '0xfcf2f2' },
            hair: { sprite: 'empty', color: '0x636363' },
            ear: { outerSprite: 'empty', innerSprite: 'empty', outerColor: '0xe0e0e0', innerColor: '0x636363' },
            genitles: { sprite: 'empty', secondarySprite: 'empty' },
            beak: { sprite: 'empty', color: '0xe0e0e0' },
            headAccessories: { sprite: 'empty', color: '0xe0e0e0' },
            spiritSprite: {},
            voreTypes: []
        };

        // Perform async loading without blocking listener registration
        (async () => {
            let characterData = null;
            let loadedEquipment = null;

            if (charId) {
                try {
                    const user = await User.findOne({ 'characters._id': charId });
                    if (user) {
                        const character = user.characters.id(charId);
                        if (character) {
                            characterData = character.toObject();
                            if (character.equipment) {
                                loadedEquipment = JSON.parse(JSON.stringify(character.equipment));
                                // log.debug(`[PersistenceDebug] Loaded Equipment into Variable:`, loadedEquipment);
                            }
                            log.success(`Loaded character ${character.firstName} ${character.lastName} for socket ${socket.id}`);
                        }
                    }
                } catch (err) {
                    log.error(`Error loading character for socket ${socket.id}:`, err);
                }
            }

            const dbData = {
                Identifier: "player",
                playerId: socket.id,
                _id: characterData ? characterData._id : null,
                Username: characterData ? (characterData.firstName + ' ' + characterData.lastName) : "Guest",
                firstName: characterData ? characterData.firstName : "Guest",
                lastName: characterData ? characterData.lastName : "",
                nickName: characterData ? characterData.nickName : "",
                Description: characterData ? characterData.icDescrip : "",
                icDescrip: characterData ? characterData.icDescrip : "",
                // New flag to filter visibility
                isInGame: !!characterData || (socket.handshake.query.isBot === 'true'),
                // Semantic State Fields
                speciesName: characterData ? characterData.speciesName : "Unknown",
                pronouns: characterData ? characterData.pronouns : 0,
                stats: characterData ? (characterData.stats || characterData.ratings || { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, mana: 100, maxMana: 100 }) : { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, mana: 100, maxMana: 100 },

                voreTypes: characterData ? characterData.voreTypes : [],

                isDead: characterData ? (characterData.isDead || false) : false,
                spiritSprite: characterData ? (characterData.spiritSprite || {}) : {},

                equipment: loadedEquipment ? loadedEquipment : {
                    hair: null,
                    leftEar: null,
                    rightEar: null,
                    head: null,
                    neck: null,
                    back: null,
                    torsoOuter: null,
                    torsoInner: null,
                    leftWrist: null,
                    rightWrist: null,
                    leftHand: null,
                    rightHand: null,
                    belt: null,
                    legs: null,
                    underwear: null,
                    feet: null,
                    tailBase: null,
                    tailTip: null
                },
                head: characterData ? characterData.head : {
                    sprite: 'head_01',
                    color: '0xe0e0e0',
                    secondarySprite: 'empty',
                    secondaryColor: '0xffffff',
                    accentSprite: 'empty',
                    accentColor: '0x636363'
                },
                body: characterData ? characterData.body : {
                    sprite: 'body_01',
                    color: '0xe0e0e0',
                    secondarySprite: 'empty',
                    secondaryColor: '0xffffff',
                    accentSprite: 'empty',
                    accentColor: '0x636363'
                },
                hands: characterData ? characterData.hands : {
                    sprite: 'empty',
                    color: '0xe0e0e0',
                },
                feet: characterData ? characterData.feet : {
                    sprite: 'empty',
                    color: '0xe0e0e0',
                },
                tail: characterData ? characterData.tail : {
                    sprite: 'tail_01',
                    color: '0xe0e0e0',
                    secondarySprite: 'empty',
                    secondaryColor: '0xffffff',
                    accentSprite: 'empty',
                    accentColor: '0x636363'
                },
                eyes: characterData ? characterData.eyes : {
                    outer: 'eyes_01',
                    iris: 'eyes_02',
                    color: '0xfcf2f2'
                },
                hair: characterData ? characterData.hair : {
                    sprite: 'empty',
                    color: '0x636363'
                },
                ear: characterData ? characterData.ear : {
                    outerSprite: 'empty',
                    innerSprite: 'empty',
                    outerColor: '0xe0e0e0',
                    innerColor: '0x636363'
                },
                genitles: characterData ? characterData.genitles : {
                    sprite: 'empty',
                    secondarySprite: 'empty'
                },
                beak: characterData ? characterData.beak : {
                    sprite: 'empty',
                    color: '0xe0e0e0'
                },
                headAccessories: characterData ? characterData.headAccessories : {
                    sprite: 'empty',
                    color: '0xe0e0e0'
                },

                voreTypes: characterData ? characterData.voreTypes : [],
                anatomyData: characterData ? characterData.anatomyData : "",

                actionHands: {
                    leftNode: null,
                    rightNode: null,
                    activeHand: 'right'
                },

                consumedBy: null,
                position: characterData && characterData.position ? characterData.position : {
                    x: 3291,
                    y: 4287,
                    time: null
                },
                enteredBuilding: false,
                input: {
                    left: false,
                    right: false,
                    up: false,
                    down: false
                },
                rotation: characterData ? characterData.rotation : 0,
                isMoving: false,
                locationHistory: [],
                debug: {
                    x: null,
                    y: null,
                    width: null,
                    height: null
                },
                collisionBox: {
                    width: PLAYER_WIDTH,
                    height: PLAYER_HEIGHT
                },
                collisionBox: {
                    width: PLAYER_WIDTH,
                    height: PLAYER_HEIGHT
                },
                lastProcessedInputSequence: 0,
                lastClientTimestamp: 0,
                lastInputTime: 0,
                inputQueue: [] // Initialize input queue
            }; // End of dbData

            // Merge DB data into the existing player object
            // Use assign to preserve the object reference if possible, 
            // OR specifically, to preserve any updates (like x,y) that happened during the wait?
            // Actually, Object.assign(target, source) overwrites target properties with source.
            // Be careful not to overwrite x,y if source doesn't have them.
            // dbData does NOT have x,y (it uses head, body, etc). 
            // So this merge is safe for position.
            // [FIX] Preserve client-side cosmetic updates if they arrived before DB load finished
            // [FIX] Check if player still exists (might have disconnected during await)
            if (!players[socket.id]) return;

            const clientUpdated = players[socket.id] && players[socket.id].clientUpdated;
            const clientSnapshot = clientUpdated ? { ...players[socket.id] } : null;

            Object.assign(players[socket.id], dbData);

            if (clientUpdated && clientSnapshot) {
                // Restore cosmetic fields from client snapshot
                const cosmeticFields = ['head', 'body', 'hands', 'feet', 'tail', 'eyes', 'hair', 'ear', 'genitles', 'beak', 'headAccessories'];
                cosmeticFields.forEach(field => {
                    if (clientSnapshot[field]) {
                        players[socket.id][field] = clientSnapshot[field];
                    }
                });
                // Preserve 'clientUpdated' flag? Not strictly necessary unless further updates need it.
            }

            // Re-assert isInGame logic based on DB data
            if (dbData.isInGame) players[socket.id].isInGame = true;

        })(); // End of Async Block
        // log.debug(`[PersistenceDebug] Initialized player.equipment:`, players[socket.id].equipment);


        // --- Socket Event Handlers for THIS player ---

        // Send initial state to the new player
        // Send initial state to the new player
        socket.emit('currentItems', worldItems); // Send World Items
        socket.emit('currentCorpses', corpses); // Send Corpses

        // [FIX] Send Door States (Only non-closed doors to save bandwidth)
        const activeDoors = [];
        if (worldDoors) {
            for (const key in worldDoors) {
                const d = worldDoors[key];
                // If door is NOT in default state (Closed), send it.
                // Default: state='closed', blocked=true, lightBlock=true
                if (d.state !== 'closed') {
                    activeDoors.push({
                        id: key,
                        state: d.state,
                        blocked: d.blocked,
                        lightBlock: d.lightBlock
                    });
                }
            }
        }
        if (activeDoors.length > 0) {
            socket.emit('doorStates', activeDoors);
        }

        // Send current players to the new connection
        // FILTER: Only send players who are actually in-game
        const visiblePlayers = {};
        Object.keys(players).forEach(id => {
            if (players[id].isInGame || id === socket.id) {
                visiblePlayers[id] = getUpdatePacketForOther(players[id]);
            }
        });
        socket.emit('currentPlayers', visiblePlayers);

        // Send Map Segments (Shadows) including Doors
        socket.emit('mapSegments', getDynamicSegments());
        // Inform other players of the new player
        // Broadcast new player to others
        // FILTER: Only broadcast if this socket has a valid character
        if (players[socket.id].isInGame) {
            socket.broadcast.emit('newPlayer', getUpdatePacketForOther(players[socket.id]));
        }


        // --- Helper to Save Character Data ---
        const SAVE_COOLDOWN = 5000; // 5 seconds

        const saveCharacter = async (socketId, force = false) => {
            const p = players[socketId];
            if (!p || !p._id) return;

            // --- Throttling / Debounce Logic ---
            const now = Date.now();
            if (!p.lastSaveTime) p.lastSaveTime = 0;

            if (!force && (now - p.lastSaveTime < SAVE_COOLDOWN)) {
                // Cooldown active. Schedule a delayed save if not already scheduled.
                if (!p.saveTimer) {
                    p.saveTimer = setTimeout(() => {
                        p.saveTimer = null;
                        saveCharacter(socketId, true); // Force save after delay
                    }, SAVE_COOLDOWN);
                }
                return; // Skip immediate save
            }

            // Clear timer if we are proceeding
            if (p.saveTimer) {
                clearTimeout(p.saveTimer);
                p.saveTimer = null;
            }

            // --- Concurrency Lock ---
            if (p.isSaving) {
                p.savePending = true;
                return;
            }

            p.isSaving = true;
            p.lastSaveTime = Date.now();

            try {
                await performSaveCharacter(p);
            } catch (err) {
                log.error(`Error saving character data for ${p.Username}:`, err);
            } finally {
                p.isSaving = false;
                if (p.savePending) {
                    p.savePending = false;
                    saveCharacter(socketId, false);
                }
            }
        };

        const performSaveCharacter = async (p) => {
            // OPTIMIZED: Use Atomic updateOne instead of findOne + save
            // This bypasses full document validation but drastically reduces IOPS and CPU.
            const updateFields = {
                'characters.$.position': {
                    x: p.position.x,
                    y: p.position.y,
                    time: new Date()
                },
                'characters.$.voreTypes': p.voreTypes || [],
                'characters.$.consumedBy': p.consumedBy,
                'characters.$.voreTypes': p.voreTypes || [],
                'characters.$.consumedBy': p.consumedBy,
                'characters.$.ratings': p.ratings || {},
                'characters.$.isDead': p.isDead || false,
                'characters.$.spiritSprite': p.spiritSprite || {}
            };

            if (p.equipment) {
                updateFields['characters.$.equipment'] = p.equipment;
            }

            try {
                // [RESILIENCE] Queue Update instead of Direct Write
                await DatabaseResilience.queueUpdate(
                    User,
                    { 'characters._id': p._id },
                    { $set: updateFields }
                );
            } catch (e) {
                log.error(`[DB] Atomic Save Failed for ${p.Username}`, e);
            }
        };

        socket.on('disconnect', async () => {
            log.info(`Player disconnected: ${socket.id}`);
            await saveCharacter(socket.id);
            removePlayerFromGrid(players[socket.id]); // Clean up spatial grid
            untrackVictim(socket.id); // Optimization: Remove from digestion list
            delete players[socket.id];
            io.emit('removePlayer', socket.id);
        });

        // --- Player Input Handling ---
        socket.on('playerInput', (inputData) => {
            try {
                const player = players[socket.id];
                if (!player) return;

                // Block movement if crafting
                if (player.isCrafting) {
                    return;
                }

                // Handle input normally
                if (player) {
                    // Push to queue instead of overwriting
                    if (!player.inputQueue) player.inputQueue = [];
                    player.inputQueue.push(inputData);

                    // Update latest input state for other logic (like animations/intent)
                    player.input = inputData;

                    if (inputData.sequence) {
                        player.lastProcessedInputSequence = inputData.sequence;
                    }
                    if (inputData.clientTimestamp) {
                        const now = Date.now();
                        player.lastInputTime = now;
                        player.lastClientTimestamp = inputData.clientTimestamp;
                    }
                }
            } catch (e) {
                log.error(`Error handling playerInput for ${socket.id}:`, e);
            }
        });

        // Handle character updates from creation screen
        socket.on('characterUpdate', (pushedInfo) => {
            log.info(`[Server] Received characterUpdate for ${socket.id} with pos: ${pushedInfo.x},${pushedInfo.y}`);
            try {
                if (players[socket.id]) {
                    // Merge new character data with existing player object
                    players[socket.id] = { ...players[socket.id], ...pushedInfo };
                    // [FIX] Flag that client has sent authoritative visual data (to prevent DB overwrite during race condition)
                    players[socket.id].clientUpdated = true;

                    // [FIX] Ensure nested position object is updated from flat x,y in pushedInfo
                    if (pushedInfo.x !== undefined && pushedInfo.y !== undefined) {
                        if (!players[socket.id].position) players[socket.id].position = {};
                        players[socket.id].position.x = pushedInfo.x;
                        players[socket.id].position.y = pushedInfo.y;
                    }

                    // If this update provides character credentials (effectively logging in/creating), set isInGame
                    if (!players[socket.id].isInGame && pushedInfo.firstName && pushedInfo.firstName !== "Guest") {
                        players[socket.id].isInGame = true;
                        // Robustness: If logging in while consumed, add to active digestion list
                        if (players[socket.id].consumedBy) {
                            trackVictim(socket.id);
                        }
                    }

                    log.info(`Character updated for ${socket.id}`);
                    // Inform other players about the visual update
                    if (players[socket.id].isInGame) {
                        socket.broadcast.emit('newPlayer', getUpdatePacketForOther(players[socket.id]));
                    }
                    socket.broadcast.emit('avatarSelection', getUpdatePacketForOther(players[socket.id]));
                }
            } catch (e) {
                log.error(`Error handling characterUpdate for ${socket.id}:`, e);
            }
        });

        // --- Re-implementing other game actions ---



        // --- Action Hands Handlers ---

        socket.on('toggleActiveHand', () => {
            try {
                const player = players[socket.id];
                if (!player) return;
                log.debug(`[Server] Toggling hands for ${player.Username}. Current: ${player.actionHands.activeHand}`);
                player.actionHands.activeHand = player.actionHands.activeHand === 'left' ? 'right' : 'left';
                log.debug(`[Server] New active hand: ${player.actionHands.activeHand}`);
            } catch (e) {
                log.error(`Error toggling hands for ${socket.id}:`, e);
            }
        });

        socket.on('swapHandItems', () => {
            try {
                const player = players[socket.id];
                if (!player) return;
                const temp = player.actionHands.leftNode;
                player.actionHands.leftNode = player.actionHands.rightNode;
                player.actionHands.rightNode = temp;
            } catch (e) {
                log.error(`Error swapping hands for ${socket.id}:`, e);
            }
        });

        // --- INTERACTION & MOVEMENT HANDLERS ---
        // Extracted to src/sockets/interactionHandlers.js
        const initInteractionHandlers = require('./sockets/interactionHandlers');
        // Note: We pass TILE_SIZE (32) and craftingStations
        initInteractionHandlers(io, socket, players, messageSystem, collisionMap, 32, saveCharacter, craftingStations, getPlayersInRange);

        // --- ITEM & INVENTORY HANDLERS ---
        // Extracted to src/sockets/inventoryHandlers.js
        const initInventoryHandlers = require('./sockets/inventoryHandlers');
        // Pass sync helpers to inventory handlers
        initInventoryHandlers(io, socket, players, worldItems, saveCharacter, clothingData, itemData, addItemToGrid, removeItemFromGrid);

        // --- CRAFTING HANDLERS ---
        const initCraftingHandlers = require('./sockets/craftingHandlers');
        // Initialize Handlers
        // Initialize Handlers
        initCraftingHandlers.init(io, socket, players, itemData, saveCharacter, craftingStations, worldItems, module.exports.broadcastToVisible, getUpdatePacketForSelf);

        socket.on('pickUpClicked', (clicked) => {
            try {
                const player = players[socket.id];
                if (!player) return;

                // [RESTRICTION] Dead players cannot pick up items
                if (player.isDead) return;

                let handled = false;

                // 1. Check Legacy Spells (Priority)
                if (clicked.Identifier === 'spell') {
                    const spellIndex = spells.findIndex(spell => spell.Name === clicked.Name);
                    if (spellIndex > -1) {
                        const spell = spells[spellIndex];
                        const distance = Math.sqrt(Math.pow(player.position.x - spell.x, 2) + Math.pow(player.position.y - spell.y, 2));
                        if (distance < 100) {
                            const activeHand = player.actionHands.activeHand;
                            const activeNode = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

                            if (!activeNode) {
                                // Pickup
                                if (activeHand === 'left') player.actionHands.leftNode = spell;
                                else player.actionHands.rightNode = spell;

                                spells.splice(spellIndex, 1);
                                io.emit('spellRemoved', spell.Name);
                            } else {
                                // Swap
                                const oldItem = activeNode;
                                oldItem.x = player.position.x;
                                oldItem.y = player.position.y + 20;
                                spells.push(oldItem);

                                if (activeHand === 'left') player.actionHands.leftNode = spell;
                                else player.actionHands.rightNode = spell;

                                spells.splice(spellIndex, 1);
                                io.emit('spellRemoved', spell.Name);
                                io.emit('spellSpawned', oldItem);
                            }
                            handled = true;
                        }
                    }
                }

                // 2. Check World Items (New System)
                if (!handled && clicked.Identifier === 'item') {
                    // Note: Client should send the item's UID as 'Name' or we find by UID
                    const itemIndex = worldItems.findIndex(item => item.uid === clicked.Name);
                    if (itemIndex > -1) {
                        const item = worldItems[itemIndex];
                        // Check distance (AABB Overlap)
                        // Player Box (Center +/- 48)
                        const pCenterX = player.position.x + 30;
                        const pCenterY = player.position.y;
                        const rRadius = 48;
                        const rLeft = pCenterX - rRadius;
                        const rRight = pCenterX + rRadius;
                        const rTop = pCenterY - rRadius;
                        const rBottom = pCenterY + rRadius;

                        // Item Box (Assume 32x32, origin 0.5, 1.0 same as client default)
                        // This is an approximation as server doesn't know exact sprite dimensions usually.
                        const iW = 32;
                        const iH = 32;
                        const iX = item.x;
                        const iY = item.y;

                        const iLeft = iX - (iW * 0.5);   // x - 16
                        const iRight = iX + (iW * 0.5);  // x + 16
                        const iTop = iY - iH;            // y - 32
                        const iBottom = iY;              // y

                        // Intersection
                        const inReach = !(rLeft > iRight || rRight < iLeft || rTop > iBottom || rBottom < iTop);

                        if (inReach) {
                            const activeHand = player.actionHands.activeHand;
                            const activeNode = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

                            if (!activeNode) {
                                // Pickup

                                // [FIX] Hydrate item with definition properties (icon, name, etc) if missing
                                const def = resolveItemDef(item, itemData);
                                if (def) {
                                    if (!item.icon && def.icon) item.icon = def.icon;
                                    if (!item.name && def.name) item.name = def.name;
                                }

                                if (activeHand === 'left') player.actionHands.leftNode = item;
                                else player.actionHands.rightNode = item;

                                worldItems.splice(itemIndex, 1);
                                removeItemFromGrid(item);
                                io.emit('itemRemoved', item.uid);

                                // Sync Player State (Hands)
                                io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
                                saveCharacter(socket.id);
                            } else {
                                // Swap
                                const oldItem = activeNode;
                                // Determine drop position (player feet)
                                oldItem.x = player.position.x;
                                oldItem.y = player.position.y + 20;

                                // Ensure it has a UID if it was a legacy spell promoted to item
                                if (!oldItem.uid) oldItem.uid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);

                                worldItems.push(oldItem);
                                addItemToGrid(oldItem);

                                // Pickup new
                                // [FIX] Hydrate item with definition properties (icon, name, etc) if missing
                                const def = resolveItemDef(item, itemData);
                                if (def) {
                                    if (!item.icon && def.icon) item.icon = def.icon;
                                    if (!item.name && def.name) item.name = def.name;
                                }

                                if (activeHand === 'left') player.actionHands.leftNode = item;
                                else player.actionHands.rightNode = item;

                                worldItems.splice(itemIndex, 1);
                                removeItemFromGrid(item);
                                io.emit('itemRemoved', item.uid);
                                io.emit('itemSpawned', oldItem);

                                // Sync Player State (Hands)
                                io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
                                saveCharacter(socket.id);
                            }
                        } else {
                            // Too far
                            log.info(`Player ${player.firstName} tried to pickup item out of reach.`);
                            socket.emit('pickupFailed', { reason: 'out of reach' });
                        }
                    }
                }
            } catch (e) {
                log.error(`Error handling pickUpClicked for ${socket.id}:`, e);
            }
        });

        // --- On Right Click get list of all targets clicked and player intent ---
        socket.on('playerRightClicked', (data) => {
            try {
                const { rightClickedList, playerIntent, pointerX, pointerY } = data;

                // RAW DEBUG LOG
                log.debug(`[RightClick] Received list: ${JSON.stringify(rightClickedList)}`);

                const responseInfo = [];
                const requestingPlayer = players[socket.id];
                if (!requestingPlayer) return;

                // --- Process each clicked item ---
                for (const clickedItem of rightClickedList) {
                    // --- Check if the clicked item is a player ---
                    if (clickedItem.Identifier === 'player' && players[clickedItem.playerId]) {
                        const targetPlayer = players[clickedItem.playerId];

                        // Use in-memory data which is already populated on connection/update
                        // This avoids a DB call for every click
                        let playerDetails = {
                            name: targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName) || 'Unknown Player',
                            heldBy: targetPlayer.heldBy,
                            grippedBy: targetPlayer.grippedBy,
                            description: targetPlayer.icDescrip || targetPlayer.Description || '',
                            playerId: targetPlayer.playerId,
                            Identifier: targetPlayer.Identifier
                        };

                        // Calculate distance between player and the clicked target
                        const distance = Math.sqrt(Math.pow(requestingPlayer.position.x - targetPlayer.position.x, 2) + Math.pow(requestingPlayer.position.y - targetPlayer.position.y, 2));

                        // --- Determine available actions based on distance and held status ---
                        const availableActions = ['Examine'];

                        if (requestingPlayer.isDead) {
                            // Dead players can only examine... AND HAUNT
                            availableActions.push('Haunt');
                        } else if (targetPlayer !== players[socket.id]) {
                            if (targetPlayer.grippedBy === socket.id) {
                                availableActions.push('Release');
                                availableActions.push('Vore');
                            } else if (targetPlayer.heldBySocketId === socket.id) {
                                availableActions.push('Release');
                                availableActions.push('Grip Firmly');
                            } else if (distance <= 100) {
                                availableActions.push('Hold');
                            }
                        }

                        // --- Add player details to response ---
                        responseInfo.push({
                            ...playerDetails,
                            availableActions
                        });
                    }

                    // --- Check if the clicked item is a map object (or Item reused as mapObject) ---
                    else if (clickedItem.Identifier === 'mapObject') {
                        const actions = ['Examine'];
                        // Check if it's a known crafting station
                        if (craftingStations[clickedItem.uniqueId]) {
                            if (!requestingPlayer.isDead) {
                                actions.push('Craft');
                            }
                        }
                        // Dead players can Haunt objects
                        if (requestingPlayer.isDead) {
                            actions.push('Haunt');
                        }

                        // --- Check for Dynamic Item (World Item) ---
                        const worldItem = worldItems.find(i => i.uid === clickedItem.uniqueId);

                        // Log matching attempt
                        log.debug(`[RightClick] Checking MapObject ${clickedItem.uniqueId}. isWorldItem? ${!!worldItem}`);

                        let name = clickedItem.name;
                        let description = clickedItem.description;

                        if (worldItem) {
                            const def = resolveItemDef(worldItem, itemData);
                            // Log definition
                            log.debug(`[RightClick] WorldItemDef: ${JSON.stringify(def)}`);

                            // [FIXED] Use Instance Properties -> Def Properties -> Client Data
                            name = worldItem.name || def.name || name;
                            description = worldItem.description || def.description || description;
                        }

                        responseInfo.push({
                            name: name,
                            Identifier: 'mapObject',
                            uniqueId: clickedItem.uniqueId,
                            description: description,
                            availableActions: actions
                        });
                    }

                    // --- Check if the clicked item is a HELD ITEM (Inventory Slot) ---
                    else if (clickedItem.Identifier === 'heldItem') {
                        const actions = ['Examine'];

                        // Verify the player is actually holding this item
                        let heldNode = null;
                        if (clickedItem.slot === 'left') heldNode = requestingPlayer.actionHands.leftNode;
                        else if (clickedItem.slot === 'right') heldNode = requestingPlayer.actionHands.rightNode;

                        // Fallback: search both if slot missing or mismatch (e.g. race condition)
                        if (!heldNode || heldNode.uid !== clickedItem.uniqueId) {
                            if (requestingPlayer.actionHands.leftNode && requestingPlayer.actionHands.leftNode.uid === clickedItem.uniqueId) heldNode = requestingPlayer.actionHands.leftNode;
                            else if (requestingPlayer.actionHands.rightNode && requestingPlayer.actionHands.rightNode.uid === clickedItem.uniqueId) heldNode = requestingPlayer.actionHands.rightNode;
                        }

                        let def = {};
                        let name = clickedItem.name;
                        let description = clickedItem.description;
                        let flavor = '';
                        let verb = '';

                        if (heldNode) {
                            // Check definition
                            def = resolveItemDef(heldNode, itemData);
                            if (def.isDynamic || (heldNode.properties && heldNode.properties.isDynamic)) {

                                // Get Max Uses
                                const maxUses = def.maxUses || 10;
                                const currentUses = heldNode.timesUsed || 0;

                                if (currentUses < maxUses) {
                                    // [NEW] Check if player is allowed to use it directly
                                    if (def.playerUse !== false && !requestingPlayer.isDead) {
                                        actions.push('Use');
                                    }
                                }
                            }

                            // [FIXED] Use Instance Properties -> Def Properties -> Client Data
                            name = heldNode.name || def.name || name;
                            description = heldNode.description || def.description || description;
                            flavor = heldNode.flavor || def.flavor || '';
                            verb = def.verb; // Verbs usually static, but instance override possible
                        }

                        responseInfo.push({
                            name: name,
                            Identifier: 'heldItem',
                            uniqueId: clickedItem.uniqueId,
                            description: description,
                            verb: verb,
                            flavor: flavor,
                            availableActions: actions
                        });
                    }
                }

                // --- Send response to player to be picked up in play.ejs ---
                // --- anatomyData Integration ---
                let voreOptions = requestingPlayer.voreTypes || [];
                if (requestingPlayer.anatomyData) {
                    try {
                        const graph = JSON.parse(requestingPlayer.anatomyData);
                        if (graph.nodes) {
                            const entrances = graph.nodes.filter(n => n.type === 'entrance');
                            if (entrances.length > 0) {
                                voreOptions = entrances.map(e => ({
                                    destination: e.properties.name || 'Unknown Entrance', // Client label
                                    id: e.id,
                                    graphNodeId: String(e.id),
                                    isEntrance: true,
                                    verb: e.properties.verb
                                    // We don't send the full graph here, just the entry points
                                }));
                            }
                        }
                    } catch (err) {
                        log.warn(`Failed to parse anatomyData for ${requestingPlayer.Username}`);
                    }
                }

                const predatorInfo = {
                    name: requestingPlayer.Username || (requestingPlayer.firstName + ' ' + requestingPlayer.lastName) || 'Unknown Predator',
                    voreTypes: voreOptions
                };
                socket.emit('playerRightClickedResponse', { responseInfo, predatorInfo, pointerX, pointerY });
            } catch (e) {
                log.error(`Error handling playerRightClicked for ${socket.id}:`, e);
            }
        });

        // --- On Left Click get list of all targets clicked and player intent ---
        socket.on('playerLeftClicked', (data) => {
            try {
                const { clickedList, playerIntent, pointerX, pointerY } = data;
                const player = players[socket.id];
                if (!player) return;

                const responseInfo = [];

                // --- Process each clicked item ---
                for (const clickedItem of clickedList) {
                    // --- Check if the clicked item is a player ---
                    if (clickedItem.Identifier === 'player' && players[clickedItem.playerId]) {
                        const targetPlayer = players[clickedItem.playerId];

                        // --- SELF-CLICK CHECK removed (Moved to interactionHandlers) --

                        // Use in-memory data
                        const targetName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName) || 'Unknown Player';

                        // Add enriched data to response
                        responseInfo.push({
                            ...clickedItem,
                            name: targetName
                        });
                    }
                }

                socket.emit('playerLeftClickedResponse', { responseInfo, playerIntent, pointerX, pointerY });
            } catch (e) {
                log.error(`Error handling playerLeftClicked for ${socket.id}:`, e);
            }
        });

        // --- Player has selected an action from the right click context menu ---





        // --- Door Interaction ---
        socket.on('doorInteract', (doorId) => {
            const door = worldDoors[doorId];
            if (door) {
                // Validation: Distance Check
                const player = players[socket.id];
                if (player) {
                    const dist = Math.abs(player.position.x - door.x) + Math.abs(player.position.y - door.y); // Approx
                    if (dist > 150) return; // Too far

                    if (door.locked) {
                        log.info(`Player ${player.firstName} tried to open locked door ${doorId}`);
                        socket.emit('doorLocked', doorId);
                    } else {
                        // Toggle
                        if (door.state === 'closed') {
                            door.state = 'open';
                            door.blocked = false;
                            door.lightBlock = false;
                        } else {
                            door.state = 'closed';
                            door.blocked = true;
                            door.lightBlock = true;
                        }

                        // Broadcast Update
                        io.emit('doorUpdate', {
                            id: doorId,
                            state: door.state,
                            blocked: door.blocked,
                            lightBlock: door.lightBlock
                        });

                        // Shadow Update
                        updateDynamicSegments(io);
                    }
                }
            }
        });

        // --- Settings Update Listener ---
        // --- VORE SETTINGS HANDLERS ---
        // Extracted to src/sockets/voreHandlers.js
        const initVoreHandlers = require('./sockets/voreHandlers');
        initVoreHandlers(io, socket, players, User, saveCharacter);

    });

    // --- Start the Loop ---
    // --- Start the Loop ---
    setInterval(() => {
        try {
            const start = performance.now();
            const stats = gameLoop(io);
            const end = performance.now();

            // Get Queue Size safely
            let queueSize = 0;
            if (DatabaseResilience.isOnline) {
                queueSize = DatabaseResilience.writeBuffer ? DatabaseResilience.writeBuffer.size : 0;
            } else {
                queueSize = DatabaseResilience.offlineQueue ? DatabaseResilience.offlineQueue.length : 0;
            }

            if (stats) {
                monitoring.recordTick(end - start, stats.breakdown, stats.entities, stats.network, queueSize);
            } else {
                monitoring.recordTick(end - start, {}, {}, {}, queueSize);
            }
        } catch (e) {
            log.error('CRITICAL ERROR in Game Loop Tick:', e);
        }
    }, 1000 / TICK_RATE);

    log.success('Server game loop started.');

    // --- Digestion Loop (Every 1 Second) ---
    setInterval(async () => {
        try {
            await processDigestion(players, User, io, module.exports.addCorpse, messageSystem, 1.0);
        } catch (e) {
            log.error('Error in Digestion Loop:', e);
        }
    }, 1000);
};

module.exports.findPlayerByName = (name) => {
    // Case-insensitive search for online players
    const player = Object.values(players).find(p => {
        const pName = p.Username || (p.firstName + ' ' + p.lastName);
        return pName.toLowerCase() === name.toLowerCase();
    });
    return player;
};

module.exports.getSocketIdByCharId = (charId) => {
    // Search for player where _id matches the provided charId
    const player = Object.values(players).find(p => p._id && p._id.toString() === charId.toString());
    // Return playerId which holds the socket ID
    return player ? player.playerId : null;
};

module.exports.getCharIdBySocketId = (socketId) => {
    const player = players[socketId];
    // Return _id which holds the Character ID
    return player ? player._id : null;
};

/**
 * Checks if a target player is visible to an observer player.
 * Uses the same logic as the AOI system (Distance + Shadowcasting).
 * @param {string} observerSocketId - The socket ID of the player "looking".
 * @param {string} targetSocketId - The socket ID of the player being looked at.
 * @returns {boolean} True if visible, false otherwise.
 */
module.exports.checkVisibility = (observerSocketId, targetSocketId) => {
    const observer = players[observerSocketId];
    const target = players[targetSocketId];

    if (!observer || !target) return false;
    if (observerSocketId === targetSocketId) return true; // Always see self

    // 1. Distance Check
    const dx = observer.position.x - target.position.x;
    const dy = observer.position.y - target.position.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < VIEW_DISTANCE * VIEW_DISTANCE) {
        // 2. Shadow/Visibility Check
        if (observer.visibilityPolygon && observer.visibilityPolygon.length > 0) {
            const tx = target.position.x;
            const ty = target.position.y;

            // Multi-Point "Fuzzy" Check (Center, Top, Bottom, Left, Right)
            // [OPTIMIZED] Check Center First
            if (isPointInPolygon(tx, ty, observer.visibilityPolygon)) {
                return true;
            }

            // Only check edges if center is obscured
            const isVisible =
                isPointInPolygon(tx + VISIBILITY_BUFFER, ty, observer.visibilityPolygon) ||
                isPointInPolygon(tx - VISIBILITY_BUFFER, ty, observer.visibilityPolygon) ||
                isPointInPolygon(tx, ty + VISIBILITY_BUFFER, observer.visibilityPolygon) ||
                isPointInPolygon(tx, ty - VISIBILITY_BUFFER, observer.visibilityPolygon);

            return isVisible;
        } else {
            // Fallback: If no polygon, rely on distance
            return true;
        }
    }

    return false;
};

/**
 * Broadcasts an event to all players who can see the source player.
 * @param {object} io - The Socket.io instance (or we can use global if available/passed).
 * @param {string} sourceSocketId - The socket ID of the source player.
 * @param {string} eventName - The event to emit.
 * @param {any} data - The data to send.
 */
module.exports.broadcastToVisible = (io, sourceSocketId, eventName, data) => {
    const sourcePlayer = players[sourceSocketId];
    if (!sourcePlayer) return;

    Object.keys(players).forEach(targetSocketId => {

        // if (targetSocketId === sourceSocketId) return; // Allow echo for typing indicator

        if (module.exports.checkVisibility(targetSocketId, sourceSocketId)) {
            // target sees source
            // We need the actual socket object to emit? 
            // Or io.to(targetSocketId).emit(...)
            if (io && io.to) {
                io.to(targetSocketId).emit(eventName, data);
            }
        }
    });
};
module.exports.getMapDataAt = (x, y) => {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);
    const data = {};

    if (tileX < 0 || tileY < 0 || tileX >= mapWidth || !mapLayers) return data;

    mapLayers.forEach(layer => {
        if (layer.type === 'tilelayer' && layer.data) {
            const idx = tileY * mapWidth + tileX;
            if (idx < layer.data.length) {
                const gid = layer.data[idx];
                if (gid > 0) {
                    // Find tileset
                    const ts = globalTilesets.find(t => gid >= t.firstgid && gid < (t.firstgid + t.tilecount));
                    if (ts) {
                        const localId = gid - ts.firstgid;
                        if (ts.tiles[localId] && ts.tiles[localId].properties) {
                            Object.assign(data, ts.tiles[localId].properties);
                        }
                    }
                }
            }
        }
    });

    return data;
};

/**
 * Returns the zone string at the given pixel coordinates.
 */
function getZoneAt(x, y) {
    if (!zoneMap || zoneMap.length === 0) return null;
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);

    if (ty < 0 || ty >= zoneMap.length || tx < 0 || tx >= zoneMap[0].length) {
        return null;
    }
    return zoneMap[ty][tx];
}

/**
 * Returns a list of all unique zones found in the map.
 */
function getAvailableZones() {
    const zones = new Set();
    if (!zoneMap) return [];

    for (let y = 0; y < zoneMap.length; y++) {
        for (let x = 0; x < zoneMap[y].length; x++) {
            if (zoneMap[y][x]) {
                zones.add(zoneMap[y][x]);
            }
        }
    }
    const list = Array.from(zones).sort();
    log.debug(`[Server] getAvailableZones found: ${list.join(', ')}`);
    return list;
}

module.exports.getAllPlayers = () => players;
module.exports.getWorldItems = () => worldItems;
module.exports.getCorpses = () => corpses;
module.exports.addCorpse = (corpseData) => {
    const corpseId = `corpse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    corpses[corpseId] = {
        ...corpseData,
        id: corpseId,
        timestamp: Date.now()
    };
    return corpseId;
};
module.exports.updateDynamicSegments = updateDynamicSegments; // Export if needed

/**
 * Updates and broadcasts the visibility segments including dynamic doors.
 */

/**
 * Generates the full list of visibility segments (Static + Dynamic Doors).
 */
function getDynamicSegments() {
    if (!staticSegments) return [];

    let allSegments = [...staticSegments];

    // Add Door Segments
    if (worldDoors) {
        for (const key in worldDoors) {
            const door = worldDoors[key];
            if (door.lightBlock) {
                const w = door.width;
                const h = 20; // Match collision height

                const x1 = door.x;
                const x2 = door.x + w;
                const y1 = door.y;
                const y2 = door.y - h;

                // 4 Segments (Top, Bottom, Left, Right)
                allSegments.push([[x1, y1], [x2, y1]]); // Bottom
                allSegments.push([[x2, y1], [x2, y2]]); // Right
                allSegments.push([[x2, y2], [x1, y2]]); // Top
                allSegments.push([[x1, y2], [x1, y1]]); // Left
            }
        }
    }
    return allSegments;
}

/**
 * Updates and broadcasts the visibility segments including dynamic doors.
 */
function updateDynamicSegments(io) {
    const segments = getDynamicSegments();
    if (io) {
        io.emit('mapSegments', segments);
    }
}


module.exports.getZoneAt = getZoneAt;
module.exports.getAvailableZones = getAvailableZones;
