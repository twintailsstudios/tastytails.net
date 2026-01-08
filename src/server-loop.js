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
const DatabaseResilience = require('./classes/DatabaseResilience');

const VisibilityPolygon = require('visibility-polygon'); // New: For shadowcasting

// --- Game State Variables ---
const players = {};
const spells = [];
let collisionMap = [];
let hillHomeMap = [];
let zoneMap = []; // New: Map for zone strings
let lightMap = []; // New: Map for shadowcasting (lightBlock property)
let staticSegments = []; // New: Store map wall segments for raycasting
let staticObjects = []; // New: Store static objects for collision
let worldItems = [];    // New: Store interactive items
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

function initializeGame() {
  log.info('Initializing game state...');
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
          log.info(`Tileset '${tileset.name}' parsed. Found ${Object.keys(zoneGids).length} zone tiles total.`);
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

          // Collision Map
          if (blockedGids.has(gid)) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              collisionMap[y][x] = 1;
            }
          }

          // HillHome Map
          if (hillHomeGids.has(gid) || layerIsHillHome) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              hillHomeMap[y][x] = 1;
            }
          }

          // Light Map (Shadows)
          if (lightBlockGids.has(gid)) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              lightMap[y][x] = 1;
            }
          }

          // Zone Map
          if (zoneGids[gid]) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              zoneMap[y][x] = zoneGids[gid];
            }
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

              worldDoors[doorId] = {
                id: doorId,
                x: obj.x,
                y: obj.y,
                width: obj.width,
                height: obj.height,
                rotation: obj.rotation,
                locked: isLocked,
                blocked: isBlocked,     // Physics State
                lightBlock: lightBlock, // Shadow State
                state: 'closed',        // logical state
                reqKey: combinedProps.reqKey || null
              };

              // If it blocks light, we might need to add a static segment equivalent?
              // For now, we rely on the dynamic update or static segment generation
              // PROBLEM: If we want it to be dynamic, we shouldn't bake it into 'staticSegments'.
              // So we will NOT add it to staticSegments here, but handle it separately.

              return; // SKIP adding to staticObjects (handled separately)
            }

            // --- Item System Check ---
            if (props.isItem) {
              // It's an Item! Add to worldItems and Skip collision (unless isSolid)
              worldItems.push({
                uid: `item_${obj.id}`, // Unique ID from Tiled
                x: obj.x,
                y: obj.y,
                name: props.name || obj.name || 'Unknown Item',
                itemId: props.itemId || props.itemID || 'unknown_item',
                itemType: props.itemType || 'misc',
                texture: props.texture || 'default_item',
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
        // Check bounds
        if (ty >= 0 && ty < collisionMap.length && tx >= 0 && tx < collisionMap[0].length) {
          if (collisionMap[ty][tx] === 1) {
            return true;
          }
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

  // 3. Check Doors
  if (worldDoors) {
    const pWidth = PLAYER_WIDTH;
    const pHeight = PLAYER_HEIGHT;
    const pLeft = x + 30 - pWidth / 2;
    const pRight = x + 30 + pWidth / 2;
    const pTop = y - pHeight / 2;
    const pBottom = y + pHeight / 2;

    for (const key in worldDoors) {
      const door = worldDoors[key];
      if (door.blocked) {
        // Door is blocked (Closed)
        // Use door bounds (bottom-left origin in Tiled, but typically x,y is top-left in Phaser depending on origin)
        // Tiled JSON objects: x,y is Top-Left (if rectangle) or Bottom-Left (if tile/image)?
        // "Each individual frame is 96 pixels wide and 288 pixels tall."
        // In Tiled, Insert Tile objects have origin (0,1) i.e. Bottom Left.
        // So obj.x is Left, obj.y is Bottom.

        // Re-use logic from static objects:
        // "Updated for Bottom Left Origin: obj.x is ALREADY the Left X"
        // "bodyY = obj.y - bodyHeight..."

        // Door collision box: use full width, maybe thin depth?
        // "Frame 0 displays the closed door."
        // Standard door: maybe 10px depth?
        const doorW = door.width;
        const doorH = 20; // Thin collision for door

        const dLeft = door.x;
        const dRight = door.x + doorW;
        const dBottom = door.y;
        const dTop = door.y - doorH;

        if (pLeft < dRight && pRight > dLeft && pTop < dBottom && pBottom > dTop) {
          return true;
        }
      }
    }
  }

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
      if (!checkCollision(proposedX, player.position.y)) {
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
      if (!checkCollision(newX, proposedY)) {
        newY = proposedY;
      }

      player.position.x = newX;
      player.position.y = newY;

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
    if (player.isHeld && player.heldBySocketId && players[player.heldBySocketId]) {
      const holder = players[player.heldBySocketId];
      const offset = player.grippedFirmly ? 20 : 50; // Closer if gripped firmly

      // rotation: 1=left, 2=right, 3=up, 4=down
      if (holder.rotation === 1) { // Left -> Behind is Right
        player.position.x = holder.position.x + offset;
        player.position.y = holder.position.y;
      } else if (holder.rotation === 2) { // Right -> Behind is Left
        player.position.x = holder.position.x - offset;
        player.position.y = holder.position.y;
      } else if (holder.rotation === 3) { // Up -> Behind is Down
        player.position.x = holder.position.x;
        player.position.y = holder.position.y + offset;
      } else if (holder.rotation === 4) { // Down -> Behind is Up
        player.position.x = holder.position.x;
        player.position.y = holder.position.y - offset;
      }

      // Match holder's rotation or keep own? Usually following implies facing same way or facing holder?
      // "move behind them" usually implies trailing.
      player.rotation = holder.rotation;
      player.isMoving = holder.isMoving;
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

      if (dist > 1.0) {
        const pos = [player.position.x, player.position.y];

        // Compute visibility
        // VisibilityPolygon.compute(position, segments)
        // segments: array of [[x1,y1],[x2,y2]]
        // Returns: [[x1,y1], [x2,y2], ...]
        const polygon = VisibilityPolygon.compute(pos, staticSegments);
        player.visibilityPolygon = polygon;
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
const VIEW_DISTANCE = 950; // Increased to 950 per user request
const VISIBILITY_BUFFER = 30; // Reduced to 30 to prevent early pop-in from shadows

function gameLoop(io) {
  const now = Date.now();
  const delta = (now - lastUpdateTime) / 1000; // Delta in seconds
  lastUpdateTime = now;

  updatePlayers(delta, io);

  // --- AREA OF INTEREST (AOI) SYSTEM ---
  // The AOI system is a network optimization technique.
  // Instead of broadcasting every player's position to every other player (O(N^2)),
  // we filter updates so clients only receive data about players they can actually see.
  // This significantly reduces bandwidth usage and prevents clients from "knowing" about
  // hidden players (anti-cheat).

  const connectedSocketIds = Object.keys(players);

  // Iterate over each connected player ("Observer") to determine what they should see.
  connectedSocketIds.forEach(observerId => {
    const observer = players[observerId];
    if (!observer) return;

    // Filter players for this observer
    const visiblePlayers = {};

    // Always include self so the client can reconcile its own prediction with authoritative server state.
    // OPTIMIZATION: Send full data (including polygon) ONLY for self.
    visiblePlayers[observerId] = getUpdatePacketForSelf(observer);

    // Check every other player ("Target") against this Observer
    connectedSocketIds.forEach(targetId => {
      if (observerId === targetId) return; // Already added self

      const target = players[targetId];
      if (!target) return;

      // 1. Distance Check (Euclidean Distance Squared)
      // A simple radius check. If target is too far, don't bother checking shadows.
      // distSq is faster than Math.sqrt().
      const dx = observer.position.x - target.position.x;
      const dy = observer.position.y - target.position.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < VIEW_DISTANCE * VIEW_DISTANCE) {
        // 2. Shadow/Visibility Check
        // If the observer has a computed visibility polygon (from the recursive shadowcasting),
        // we essentially check "Is the target inside the lighted area?".
        if (observer.visibilityPolygon && observer.visibilityPolygon.length > 0) {
          const tx = target.position.x;
          const ty = target.position.y;

          // Multi-Point "Fuzzy" Check
          // Instead of checking just the center point of the target, we check a "Buffer Zone".
          // This includes the Center, Top, Bottom, Left, and Right points offset by VISIBILITY_BUFFER.
          // If ANY of these points are in the light, the player is considered visible.
          // This prevents "pop-in" where a player suddenly appears only after fully stepping out of a shadow.
          // OPTIMIZATION: Unrolled loop to avoid array allocations (e.g. [[x,y], ...])

          const isVisible =
            isPointInPolygon(tx, ty, observer.visibilityPolygon) ||
            isPointInPolygon(tx + VISIBILITY_BUFFER, ty, observer.visibilityPolygon) ||
            isPointInPolygon(tx - VISIBILITY_BUFFER, ty, observer.visibilityPolygon) ||
            isPointInPolygon(tx, ty + VISIBILITY_BUFFER, observer.visibilityPolygon) ||
            isPointInPolygon(tx, ty - VISIBILITY_BUFFER, observer.visibilityPolygon);

          if (isVisible) {
            // OPTIMIZATION: Send stripped-down packet for others (No polygon, no internal flags)
            visiblePlayers[targetId] = getUpdatePacketForOther(target);
          }
        } else {
          // Fallback: If no polygon is computed (e.g. infinite visibility or error),
          // rely solely on the Distance Check.
          visiblePlayers[targetId] = getUpdatePacketForOther(target);
        }
      }
    });

    // Send the customized, filtered list of players to this specific client.
    // The client will use this list to Create, Update, or Destroy (Reconcile) player sprites.
    if (io.sockets.sockets.get(observerId)) {
      io.sockets.sockets.get(observerId).emit('playerUpdates', visiblePlayers);
    }
  });
  // io.emit('spellUpdates', spells);
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
    position: player.position,
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
    clothing: player.clothing,
    equipment: player.equipment,

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

    // Struggle / Vore States
    grippedFirmly: player.grippedFirmly,
    struggleCount: player.struggleCount,
    grippedBy: player.grippedBy,
    voreTypes: player.voreTypes,

    // Interactive State
    actionHands: player.actionHands,

    // Crafting State
    isCrafting: player.isCrafting,
    craftingStartTime: player.craftingStartTime,
    craftingDuration: player.craftingDuration
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

// --- Main Exported Start Function ---

module.exports.start = (io, _messageSystem) => {
  messageSystem = _messageSystem;
  initializeGame();

  io.on('connection', async (socket) => {
    log.info(`Player connected with socket ID: ${socket.id}`);

    // Send map segments to client for local shadow prediction
    if (staticSegments.length > 0) {
      socket.emit('mapSegments', staticSegments);
    }

    const charId = socket.handshake.query.charId;
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

    players[socket.id] = {
      Identifier: "player",
      playerId: socket.id,
      _id: characterData ? characterData._id : null,
      Username: characterData ? (characterData.firstName + ' ' + characterData.lastName) : "Guest",
      firstName: characterData ? characterData.firstName : "Guest",
      lastName: characterData ? characterData.lastName : "",
      nickName: characterData ? characterData.nickName : "",
      Description: characterData ? characterData.icDescrip : "",
      icDescrip: characterData ? characterData.icDescrip : "",
      // Semantic State Fields
      speciesName: characterData ? characterData.speciesName : "Unknown",
      pronouns: characterData ? characterData.pronouns : 0,
      stats: characterData ? characterData.ratings : {},

      voreTypes: characterData ? characterData.voreTypes : [],

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
    };

    if (players[socket.id].equipment) {
      // log.debug(`[PersistenceDebug] Initialized player.equipment:`, players[socket.id].equipment);
    } else {
      // log.warn(`[PersistenceDebug] Initialized player.equipment is MISSING/NULL`);
    }

    // --- Socket Event Handlers for THIS player ---

    // Send initial state to the new player
    // Send initial state to the new player
    socket.emit('currentPlayers', players, spells);
    socket.emit('currentItems', worldItems); // Send World Items
    // Send Map Segments (Shadows) including Doors
    socket.emit('mapSegments', getDynamicSegments());
    // Inform other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);


    // --- Helper to Save Character Data ---
    const saveCharacter = async (socketId) => {
      const p = players[socketId];
      if (!p || !p._id) return;

      // Concurrency Lock: Check if already saving
      if (p.isSaving) {
        // Mark as needing another save after current one finishes
        p.savePending = true;
        // log.debug(`[Persistence] Save for ${p.Username} queued (already saving).`);
        return;
      }

      p.isSaving = true;

      try {
        // Perform the actual save logic
        await performSaveCharacter(p);
      } catch (err) {
        log.error(`Error saving character data for ${p.Username}:`, err);
      } finally {
        p.isSaving = false;
        // Check if another save was requested during the lock
        if (p.savePending) {
          p.savePending = false;
          // Trigger next save immediately
          saveCharacter(socketId);
        }
      }
    };

    const performSaveCharacter = async (p) => {
      const user = await User.findOne({ 'characters._id': p._id });
      if (user) {
        const character = user.characters.id(p._id);
        if (character) {
          // Save Position
          character.position = {
            x: p.position.x,
            y: p.position.y,
            time: new Date()
          };
          // Save Equipment
          if (p.equipment) {
            character.equipment = p.equipment;
          }

          // --- Save Vore & Resilience Data ---
          if (p.voreTypes) character.voreTypes = p.voreTypes;
          if (p.consumedBy !== undefined) character.consumedBy = p.consumedBy;
          if (p.ratings) character.ratings = p.ratings;

          user.markModified('characters');
          await DatabaseResilience.save(user);
          // log.success(`Saved data (pos/equip/vore) for character ${character.firstName}`);
        }
      }
    };

    socket.on('disconnect', async () => {
      log.info(`Player disconnected: ${socket.id}`);
      await saveCharacter(socket.id);
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
      try {
        if (players[socket.id]) {
          // Merge new character data with existing player object
          players[socket.id] = { ...players[socket.id], ...pushedInfo };
          log.info(`Character updated for ${socket.id}`);
          // Inform other players about the visual update
          socket.broadcast.emit('avatarSelection', players[socket.id]);
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
    initInteractionHandlers(io, socket, players, messageSystem, collisionMap, 32, saveCharacter, craftingStations);

    // --- ITEM & INVENTORY HANDLERS ---
    // Extracted to src/sockets/inventoryHandlers.js
    const initInventoryHandlers = require('./sockets/inventoryHandlers');
    initInventoryHandlers(io, socket, players, worldItems, saveCharacter, clothingData, itemData);

    // --- CRAFTING HANDLERS ---
    const initCraftingHandlers = require('./sockets/craftingHandlers');
    // Initialize Handlers
    // Initialize Handlers
    initCraftingHandlers.init(io, socket, players, itemData, saveCharacter, craftingStations, worldItems, module.exports.broadcastToVisible);

    socket.on('pickUpClicked', (clicked) => {
      try {
        const player = players[socket.id];
        if (!player) return;

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
            // Check distance
            const distance = Math.sqrt(Math.pow(player.position.x - item.x, 2) + Math.pow(player.position.y - item.y, 2));

            if (distance < 100) {
              const activeHand = player.actionHands.activeHand;
              const activeNode = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

              if (!activeNode) {
                // Pickup
                if (activeHand === 'left') player.actionHands.leftNode = item;
                else player.actionHands.rightNode = item;

                worldItems.splice(itemIndex, 1);
                io.emit('itemRemoved', item.uid);
              } else {
                // Swap
                const oldItem = activeNode;
                // Determine drop position (player pos + jitter or offset)
                oldItem.x = player.position.x;
                oldItem.y = player.position.y + 20;

                // Ensure it has a UID if it was a legacy spell promoted to item
                if (!oldItem.uid) oldItem.uid = 'item_' + Date.now() + Math.floor(Math.random() * 1000);

                worldItems.push(oldItem);

                // Pickup new
                if (activeHand === 'left') player.actionHands.leftNode = item;
                else player.actionHands.rightNode = item;

                worldItems.splice(itemIndex, 1);

                io.emit('itemRemoved', item.uid);
                io.emit('itemSpawned', oldItem);
              }
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

            if (targetPlayer !== players[socket.id]) {
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
              actions.push('Craft');
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
                  actions.push('Use');
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
  setInterval(() => {
    try {
      gameLoop(io);
    } catch (e) {
      log.error('CRITICAL ERROR in Game Loop Tick:', e);
    }
  }, 1000 / TICK_RATE);

  log.success('Server game loop started.');
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
      const isVisible =
        isPointInPolygon(tx, ty, observer.visibilityPolygon) ||
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

module.exports.getAllPlayers = () => players;
module.exports.getWorldItems = () => worldItems;
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
