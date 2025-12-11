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
const clothingData = require('./data/clothingData');
const itemData = require('./data/itemData');

// --- Game State Variables ---
const players = {};
const spells = [];
let collisionMap = [];
let hillHomeMap = [];
let staticObjects = []; // New: Store static objects for collision
let worldItems = [];    // New: Store interactive items
let mapWidth = 0;
let messageSystem = null;

// --- Constants ---
const TICK_RATE = 30; // 30 updates per second
const PLAYER_SPEED = 200;
const TILE_SIZE = 32; // The size of your tiles in pixels
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 30;

// --- Initial Setup ---

function initializeGame() {
  log('Initializing game state...');
  initializeSpells();
  initializeMap();
}

/**
 * Loads the Tiled map data and creates a simplified 2D array for collision detection.
 * Now checks for "Blocked" property on tiles instead of a specific layer.
 * ALSO loads static objects from the "Objects" layer for collision using "World Builder" logic.
 */
function initializeMap() {
  try {
    const mapPath = path.join(__dirname, 'client/assets/tilemaps/Demo_Map.json');
    const tilemapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

    mapWidth = tilemapData.width;
    const mapHeight = tilemapData.height;

    // --- 1. Tile-based Collision (Blocked & HillHome) ---
    const blockedTileIds = new Set();
    const hillHomeTileIds = new Set();

    if (tilemapData.tilesets) {
      tilemapData.tilesets.forEach(tileset => {
        if (tileset.tiles) {
          tileset.tiles.forEach(tile => {
            if (tile.properties) {
              const blockedProp = tile.properties.find(p => p.name === 'Blocked');
              if (blockedProp && blockedProp.value === 'True') {
                blockedTileIds.add(tile.id);
              }
              const hillHomeProp = tile.properties.find(p => p.name === 'hillHome');
              if (hillHomeProp && hillHomeProp.value === 'True') {
                hillHomeTileIds.add(tile.id);
              }
            }
          });
        }
      });
    }

    // 2. Initialize Collision Map and HillHome Map with 0s
    collisionMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));
    hillHomeMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));

    // 3. Iterate Layers and Populate Collision Map
    const mainTileset = tilemapData.tilesets[0];
    const firstGid = mainTileset ? mainTileset.firstgid : 1;

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

          const localId = gid - firstGid;

          if (blockedTileIds.has(localId)) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              collisionMap[y][x] = 1;
            }
          }

          if (hillHomeTileIds.has(localId) || layerIsHillHome) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              hillHomeMap[y][x] = 1;
            }
          }
        });
      }
    });

    // --- 4. Object Layer Collision (Updated: World Builder Logic and Item System) ---
    // This uses Raw GID Lookup to find properties correctly, matching client logic.
    staticObjects = [];
    worldItems = [];

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

    // Process ALL Object Layers
    // We filter for any layer of type 'objectgroup' and process its objects.
    const objectLayers = tilemapData.layers.filter(l => l.type === 'objectgroup');

    objectLayers.forEach(objectLayer => {
      if (objectLayer.objects) {
        objectLayer.objects.forEach(obj => {
          // 1. Find Raw Tileset
          const rawTs = rawTilesets.find(ts => obj.gid >= ts.firstgid && obj.gid < (ts.firstgid + ts.tilecount));

          if (rawTs) {
            const trueLocalID = obj.gid - rawTs.firstgid;
            const tileData = rawTs.tiles[trueLocalID];
            const props = tileData ? tileData.properties : {};

            // --- Item System Check ---
            if (props.isItem) {
              // It's an Item! Add to worldItems and Skip collision (unless isSolid)
              worldItems.push({
                uid: `item_${obj.id}`, // Unique ID from Tiled
                x: obj.x,
                y: obj.y,
                name: props.name || obj.name || 'Unknown Item',
                itemId: props.itemId || 'unknown_item',
                itemType: props.itemType || 'misc',
                texture: props.texture || 'default_item',
                properties: props // Store all props just in case
              });

              if (!props.isSolid) {
                return; // Skip adding to staticObjects
              }
            }

            // --- Collision Box Dimensions ---
            // Prioritize custom properties (bodyWidth, bodyHeight, bodyOffsetY)
            let width = props.bodyWidth;
            let height = props.bodyHeight;
            let offsetY = props.bodyOffsetY; // Can be undefined

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

            const spriteTopLeftX = obj.x - (spriteWidth / 2); // Convert Center-X to Left-X

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

    log(`Loaded ${staticObjects.length} static objects and ${worldItems.length} world items from ${objectLayers.length} layers.`);

  } catch (e) {
    log.error('Failed to load or parse tilemap data:', e);
  }
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

  log('Spells initialized.');
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

  // 2. Check Static Object Collision
  // Iterates through the pre-calculated staticObjects list.
  // Performs a simple Axis-Aligned Bounding Box (AABB) overlap check.
  if (staticObjects && staticObjects.length > 0) {
    const pWidth = PLAYER_WIDTH;
    const pHeight = PLAYER_HEIGHT;

    // Player bounds calculation
    // Note: 'x' and 'y' passed here are the player's position.
    // We assume 'x' is the horizontal center and 'y' is the vertical center of the player's collider.
    const pLeft = x + 30 - pWidth / 2;
    const pRight = x + 30 + pWidth / 2;
    const pTop = y - pHeight / 2;
    const pBottom = y + pHeight / 2;

    for (const obj of staticObjects) {
      // AABB Collision Check
      // Returns true if the player's box overlaps with the object's box
      if (pLeft < obj.maxX &&
        pRight > obj.minX &&
        pTop < obj.maxY &&
        pBottom > obj.minY) {
        return true;
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
  const speed = 200;
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

    // Check for hillHome collision
    if (checkHillHomeCollision(player.position.x, player.position.y)) {
      if (!player.enteredBuilding) {
        player.enteredBuilding = true;
        log(`Player ${player.Username || player.playerId} entered hillHome!`);
        // Emit event to the specific client
        if (io.sockets.sockets.get(id)) {
          io.sockets.sockets.get(id).emit('enterHillHome');
        }
      }
    } else {
      if (player.enteredBuilding) {
        log(`Player ${player.Username || player.playerId} exited hillHome!`);
        // Emit event to the specific client
        if (io.sockets.sockets.get(id)) {
          io.sockets.sockets.get(id).emit('exitHillHome');
        }
      }
      player.enteredBuilding = false;
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
            log(`Player ${player.Username || player.playerId} struggled free!`);

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
          log(`Player ${player.Username || player.playerId} broken free from hold.`);
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
  });
}

//  * The main game loop, running at a fixed tick rate.
//  * @param { SocketIO.Server } io - The main socket.io instance.
//  */
let lastUpdateTime = Date.now();
function gameLoop(io) {
  const now = Date.now();
  const delta = (now - lastUpdateTime) / 1000; // Delta in seconds
  lastUpdateTime = now;

  updatePlayers(delta, io);
  // Broadcast the entire game state to all clients
  io.emit('playerUpdates', players);
  // Note: You might want separate updates for spells if they don't change often
  // io.emit('spellUpdates', spells);
}


// --- Main Exported Start Function ---

module.exports.start = (io, _messageSystem) => {
  messageSystem = _messageSystem;
  initializeGame();

  io.on('connection', async (socket) => {
    log(`Player connected with socket ID: ${socket.id}`);

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
              log(`[PersistenceDebug] Loaded Equipment into Variable: ${JSON.stringify(loadedEquipment)}`);
            }
            log(`Loaded character ${character.firstName} ${character.lastName} for socket ${socket.id}`);
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
      log(`[PersistenceDebug] Initialized player.equipment: ${JSON.stringify(players[socket.id].equipment)}`);
    } else {
      log(`[PersistenceDebug] Initialized player.equipment is MISSING/NULL`);
    }

    // --- Socket Event Handlers for THIS player ---

    // Send initial state to the new player
    // Send initial state to the new player
    socket.emit('currentPlayers', players, spells);
    socket.emit('currentItems', worldItems); // Send World Items
    // Inform other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);


    // --- Helper to Save Character Data ---
    const saveCharacter = async (socketId) => {
      const p = players[socketId];
      if (p && p._id) {
        try {
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

              user.markModified('characters'); // Explicitly mark array/subdocs modified
              await user.save();
              log(`Saved data (pos/equip) for character ${character.firstName}`);
            }
          }
        } catch (err) {
          log.error(`Error saving character data for ${p.Username}:`, err);
        }
      }
    };

    socket.on('disconnect', async () => {
      log(`Player disconnected: ${socket.id}`);
      await saveCharacter(socket.id);
      delete players[socket.id];
      io.emit('removePlayer', socket.id);
    });

    // Handle movement input
    socket.on('playerInput', (inputData) => {
      const player = players[socket.id];
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
          if (player.lastInputTime) {
            const jitter = now - player.lastInputTime;
            if (jitter > 50) { // Log if > 50ms variance (expected ~33ms)
              // log(`[Lag Debug] Input Jitter for ${player.Username}: ${jitter}ms`);
            }
          }
          player.lastInputTime = now;
          player.lastClientTimestamp = inputData.clientTimestamp;
        }
        // log(`Input received from ${socket.id}:`, inputData);
      }
    });

    // Handle character updates from creation screen
    socket.on('characterUpdate', (pushedInfo) => {
      if (players[socket.id]) {
        // Merge new character data with existing player object
        players[socket.id] = { ...players[socket.id], ...pushedInfo };
        log(`Character updated for ${socket.id}`);
        // Inform other players about the visual update
        socket.broadcast.emit('avatarSelection', players[socket.id]);
      }
    });

    // --- Re-implementing other game actions ---



    // --- Action Hands Handlers ---

    socket.on('toggleActiveHand', () => {
      const player = players[socket.id];
      if (!player) return;
      log(`[Server] Toggling hands for ${player.Username}. Current: ${player.actionHands.activeHand}`);
      player.actionHands.activeHand = player.actionHands.activeHand === 'left' ? 'right' : 'left';
      log(`[Server] New active hand: ${player.actionHands.activeHand}`);
    });

    socket.on('swapHandItems', () => {
      const player = players[socket.id];
      if (!player) return;
      const temp = player.actionHands.leftNode;
      player.actionHands.leftNode = player.actionHands.rightNode;
      player.actionHands.rightNode = temp;
    });

    socket.on('equipItemClicked', (slotId) => {
      log(`[EquipDebug] Received 'equipItemClicked' for socket ${socket.id} with slot ${slotId}`);
      const player = players[socket.id];
      if (!player) {
        log(`[EquipDebug] Player not found for socket ${socket.id}`);
        return;
      }
      if (!player.equipment) {
        log(`[EquipDebug] Player ${player.Username} has no equipment object`);
        return;
      }

      const activeHand = player.actionHands.activeHand;
      // Get item in active hand
      const handItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
      const slotItem = player.equipment[slotId];

      log(`[EquipDebug] Slot: ${slotId}, Hand: ${activeHand}, HandItem: ${handItem ? 'YES' : 'NO'}, SlotItem: ${slotItem ? 'YES' : 'NO'}`);

      // Logic:
      // 1. If hand has item: Try to Equip
      // 2. If hand is empty: Unequip from slot to hand

      if (handItem) {
        log(`[EquipDebug] Hand not empty (${handItem.name}). Attempting to EQIUP/SWAP to ${slotId}.`);
        // --- EQUIP ATTEMPT ---
        // Validate if item can go in this slot (if it has equipSlot property)
        // If undefined, maybe allow for testing? Or restrict? 
        // For now, let's assume if it has `equipSlot` it must match.
        // If it doesn't have `equipSlot`, maybe generic items can't be equipped? or fallback?
        // Let's enforce: MUST have equipSlot property matching slotId (or special logic)

        let canEquip = false;
        if (handItem.properties && handItem.properties.equipSlot === slotId) {
          canEquip = true;
        } else if (handItem.equipSlot === slotId) { // Direct property support
          canEquip = true;
        }

        // Special handling for legacy/test items?
        // For Verification, we modified the Test Scroll to have isItem: true.
        // We should add `equipSlot` to it if we want to test equipping.

        // Debug Bypass: Allow ANY item with `equipSlot` to be equipped anywhere for now? NO.
        // Strict check.

        if (canEquip) {
          // Swap logic
          // Move Hand -> Slot
          // Move Slot -> Hand (if exists) target

          player.equipment[slotId] = handItem;

          if (activeHand === 'left') player.actionHands.leftNode = slotItem;
          else player.actionHands.rightNode = slotItem;

          log(`Player ${player.Username} equipped ${handItem.name} to ${slotId}`);
        } else {
          // Maybe notify user? "Cannot equip this here"
          log(`Player ${player.Username} failed to equip ${handItem.name} to ${slotId} (Wrong Slot)`);
        }

      } else {
        log(`[EquipDebug] Hand empty. Attempting to UNEQUIP from ${slotId}.`);
        // --- UNEQUIP ATTEMPT (Hand Empty) ---
        if (slotItem) {
          // Move Slot -> Hand
          if (activeHand === 'left') player.actionHands.leftNode = slotItem;
          else player.actionHands.rightNode = slotItem;

          player.equipment[slotId] = null;
          log(`Player ${player.Username} unequipped ${slotItem.name} from ${slotId}`);
        }
      }

      // Force immediate update to all clients
      io.emit('playerUpdates', { [socket.id]: player });

      // Save changes to DB immediately
      saveCharacter(socket.id);
    });

    // --- Dynamic Storage Logic ---

    // Move item from Hand -> Pocket
    socket.on('stashItemClicked', (data) => {
      const { targetSlot, targetPocket } = data;
      const player = players[socket.id];
      if (!player) return;

      const activeHand = player.actionHands.activeHand;
      const handItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
      const clothingItem = player.equipment[targetSlot];

      if (!handItem) {
        log(`[StorageDebug] Hand empty, cannot stash. ActiveHand: ${activeHand}`);
        return;
      }
      if (!clothingItem) {
        log(`[StorageDebug] No clothing in slot ${targetSlot}`);
        return;
      }

      // Get clothing definition
      // We need to look up by texture (e.g. 'pants_01')
      const textureKey = clothingItem.texture;
      const clothingDef = clothingData[textureKey];

      if (!clothingDef) {
        log(`[StorageDebug] No clothing definition found for ${textureKey} in slot ${targetSlot}`);
        return;
      }

      const pocketDef = clothingDef.pockets.find(p => p.id === targetPocket);
      if (!pocketDef) {
        log(`[StorageDebug] No pocket ${targetPocket} found in ${textureKey}`);
        return;
      }

      // Initialize contents if null
      if (!clothingItem.contents) clothingItem.contents = {};
      if (!clothingItem.contents[targetPocket]) clothingItem.contents[targetPocket] = [];

      // Validate Size & Capacity
      let currentLoad = 0;
      clothingItem.contents[targetPocket].forEach(item => {
        // lookup size
        const iDef = itemData[item.itemId] || { size: 1 };
        currentLoad += (iDef.size || 1);
      });

      // Determine item size
      // If the item in hand has a specific property, use it, else lookup
      const handItemDef = itemData[handItem.itemId] || itemData.default;
      const itemSize = handItem.size || handItemDef.size || 1;

      if (currentLoad + itemSize > pocketDef.capacity) {
        log(`[StorageDebug] Capacity Exceeded! Current: ${currentLoad}, Item: ${itemSize}, Max: ${pocketDef.capacity}`);
        // Provide feedback?
        return;
      }

      // --- SUCCESS: Move Item ---

      // Add to pocket
      clothingItem.contents[targetPocket].push(handItem);

      // Remove from Hand
      if (activeHand === 'left') player.actionHands.leftNode = null;
      else player.actionHands.rightNode = null;

      log(`[Storage] Stashed ${handItem.name} into ${clothingDef.name}'s ${pocketDef.name}.`);

      // Emit updates
      io.emit('playerUpdates', { [socket.id]: player });
      saveCharacter(socket.id);
    });

    // Move item from Pocket -> Hand
    socket.on('retrieveItemClicked', (data) => {
      const { sourceSlot, sourcePocket, itemUid } = data;
      const player = players[socket.id];
      if (!player) return;

      const activeHand = player.actionHands.activeHand;
      const clothingItem = player.equipment[sourceSlot];

      // Check if hand is empty
      if (activeHand === 'left' && player.actionHands.leftNode) return; // Hand full
      if (activeHand === 'right' && player.actionHands.rightNode) return; // Hand full

      if (!clothingItem || !clothingItem.contents || !clothingItem.contents[sourcePocket]) return;

      // Find item
      const itemIndex = clothingItem.contents[sourcePocket].findIndex(i => i.uid === itemUid);
      if (itemIndex === -1) return;

      const item = clothingItem.contents[sourcePocket][itemIndex];

      // Move to Hand
      if (activeHand === 'left') player.actionHands.leftNode = item;
      else player.actionHands.rightNode = item;

      // Remove from Pocket
      clothingItem.contents[sourcePocket].splice(itemIndex, 1);

      log(`[Storage] Retrieved ${item.name} from ${sourcePocket}.`);

      io.emit('playerUpdates', { [socket.id]: player });
      saveCharacter(socket.id);
    });


    socket.on('dropItemClicked', () => {
      const player = players[socket.id];
      if (!player) return;

      const activeHand = player.actionHands.activeHand;
      let droppedItem = null;

      if (activeHand === 'left' && player.actionHands.leftNode) {
        droppedItem = player.actionHands.leftNode;
        player.actionHands.leftNode = null;
      } else if (activeHand === 'right' && player.actionHands.rightNode) {
        droppedItem = player.actionHands.rightNode;
        player.actionHands.rightNode = null;
      }

      if (droppedItem) {
        // Position at feet
        droppedItem.x = player.position.x;
        droppedItem.y = player.position.y + 20;

        // Ensure UID
        if (!droppedItem.uid) droppedItem.uid = 'item_' + Date.now() + Math.random().toString(36).substr(2, 5);

        // Add to World Items
        worldItems.push(droppedItem);

        // Notify Clients
        io.emit('itemSpawned', droppedItem);

        log(`[DropDebug] Dropped Item: ${JSON.stringify(droppedItem, null, 2)}`); // VERBOSE LOGGING

        log(`Player ${player.Username} dropped item: ${droppedItem.name || droppedItem.uid}`);
      }
    });

    socket.on('pickUpClicked', (clicked) => {
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
    });

    // --- On Right Click get list of all targets clicked and player intent ---
    socket.on('playerRightClicked', (data) => {
      const { rightClickedList, playerIntent, pointerX, pointerY } = data;
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

        // --- Check if the clicked item is a map object ---
        else if (clickedItem.Identifier === 'mapObject') {
          responseInfo.push({
            name: clickedItem.name,
            Identifier: 'mapObject',
            uniqueId: clickedItem.uniqueId,
            description: clickedItem.description, // Pass through description
            availableActions: ['Examine']
          });
        }
      }

      // --- Send response to player to be picked up in play.ejs ---
      const predatorInfo = {
        name: requestingPlayer.Username || (requestingPlayer.firstName + ' ' + requestingPlayer.lastName) || 'Unknown Predator',
        voreTypes: requestingPlayer.voreTypes || []
      };
      socket.emit('playerRightClickedResponse', { responseInfo, predatorInfo, pointerX, pointerY });
    });

    // --- On Left Click get list of all targets clicked and player intent ---
    socket.on('playerLeftClicked', (data) => {
      const { clickedList, playerIntent, pointerX, pointerY } = data;
      const player = players[socket.id];
      if (!player) return;

      const responseInfo = [];

      // --- Process each clicked item ---
      for (const clickedItem of clickedList) {
        // --- Check if the clicked item is a player ---
        if (clickedItem.Identifier === 'player' && players[clickedItem.playerId]) {
          const targetPlayer = players[clickedItem.playerId];
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
    });

    // --- Player has selected an action from the right click context menu ---
    socket.on('playerPerformAction', async (data) => {
      const { targetPlayerId, playerIntent } = data;
      const player = players[socket.id];
      if (!player || !players[targetPlayerId]) return;

      const targetPlayer = players[targetPlayerId];
      let targetName = targetPlayer.Username || 'Unknown Player';

      // --- If the player has a MongoDB _id, fetch full details ---
      if (targetPlayer._id) {
        try {
          const user = await User.findOne({ 'characters._id': targetPlayer._id });
          if (user) {
            const character = user.characters.id(targetPlayer._id);
            if (character) {
              targetName = character.firstName + ' ' + character.lastName;
            }
          }
        } catch (err) {
          log.error(`Error fetching character details for ${targetPlayer._id}:`, err);
        }
      }

      // Calculate distance between player and target player
      const distance = Math.sqrt(Math.pow(player.position.x - targetPlayer.position.x, 2) + Math.pow(player.position.y - targetPlayer.position.y, 2));
      log(`Distance to ${targetName} (ID: ${targetPlayer.playerId}): ${distance.toFixed(2)}`);

      // Prevent self-holding
      if (socket.id === targetPlayerId && playerIntent === 'grabbing') {
        log(`Player ${player.firstName} tried to grab themselves. Ignoring.`);
        return;
      }

      // --- Check if the player is close enough to perform the action ---
      if (distance < 100) {
        // --- Check if the player is friendly or grabbing ---
        if (playerIntent == 'friendly') {
          log(`Player ${players[socket.id].firstName} has hugged ${targetName} with ${playerIntent} intent.`);
        }
        if (playerIntent == 'grabbing') {
          if (targetPlayer.isHeld && targetPlayer.heldBySocketId === socket.id) {
            // Upgrade to gripped firmly
            targetPlayer.grippedFirmly = true;
            targetPlayer.struggleCount = 0;
            log(`Player ${players[socket.id].firstName} has GRIPPED FIRMLY ${targetName}.`);

            // Broadcast Interactional Message
            if (messageSystem) {
              messageSystem.sendSystemMessage('Interactional', `${players[socket.id].firstName} is gripping ${targetName} tightly.`);
            }
          } else {
            // Normal grab
            log(`Player ${players[socket.id].firstName} has grabbed ${targetName} with ${playerIntent} intent.`);
            targetPlayer.isHeld = true;
            targetPlayer.heldBy = players[socket.id]._id;
            targetPlayer.heldBySocketId = socket.id;
            targetPlayer.grippedFirmly = false;
            targetPlayer.struggleCount = 0;

            // Broadcast Interactional Message
            if (messageSystem) {
              messageSystem.sendSystemMessage('Interactional', `${players[socket.id].firstName} has taken hold of ${targetName}.`);
            }
          }
        }
        if (playerIntent == 'hostile') {
          log(`Player ${players[socket.id].firstName} has punched ${targetName} with ${playerIntent} intent.`);
        }
      } else {
        // --- Player is too far away so action outcomes are different ---
        if (playerIntent == 'friendly') {
          log(`Player ${players[socket.id].firstName} has waved to ${targetName} with ${playerIntent} intent.`)
        }
        if (playerIntent == 'grabbing') {
          log(`Player ${players[socket.id].firstName} is too far away to grab ${targetName} with ${playerIntent} intent.`)
        }
        if (playerIntent == 'hostile') {
          log(`Player ${players[socket.id].firstName} has gestured rudely to ${targetName} with ${playerIntent} intent.`)
        }
      }

      log(`Player ${players[socket.id].Username} performed action on ${targetName} with intent ${playerIntent}`);
    });

    // --- Player has released a held player ---
    socket.on('releaseClicked', (data) => {
      const { playerId } = data;
      const player = players[socket.id];
      if (!player || !players[playerId]) return;

      const targetPlayer = players[playerId];

      if (targetPlayer.heldBySocketId === socket.id) {
        targetPlayer.isHeld = false;
        targetPlayer.heldBy = null;
        targetPlayer.heldBySocketId = null;
        targetPlayer.grippedFirmly = false;
        targetPlayer.grippedBy = null;
        targetPlayer.struggleCount = 0;
        log(`Player ${player.firstName} RELEASED ${targetPlayer.firstName || 'Unknown Player'}.`);
      }
    });

    // --- Player has gripped firmly ---
    socket.on('gripFirmly', (data) => {
      const { playerId } = data;
      const player = players[socket.id];
      if (!player || !players[playerId]) return;

      const targetPlayer = players[playerId];


      if (targetPlayer.heldBySocketId === socket.id) {
        targetPlayer.grippedFirmly = true;
        targetPlayer.grippedBy = socket.id;
        targetPlayer.struggleCount = 0;
        log(`Player ${player.firstName} GRIPPED FIRMLY ${targetPlayer.firstName || 'Unknown Player'}.`);

        // Broadcast Interactional Message
        if (messageSystem) {
          messageSystem.sendSystemMessage('Interactional', `${player.firstName} is gripping ${targetPlayer.firstName || 'Unknown Player'} tightly.`);
        }
      }
    });


    // --- Player has examined another player ---
    // --- Player has examined another player or object ---
    socket.on('examineClicked', (data) => {
      // Data: { Identifier, playerId, name, description, ... }

      const requestingPlayer = players[socket.id];
      if (!requestingPlayer) return;

      if (data.Identifier === 'player') {
        const targetPlayer = players[data.playerId];
        if (!targetPlayer) return;

        log(`Player ${requestingPlayer.firstName} EXAMINED ${targetPlayer.firstName || 'Unknown Player'}.`);

        let message = `You examined ${targetPlayer.firstName || 'Unknown Player'}.`;

        // Check if target has consumed anyone
        // If the target has consumed someone, we want to provide a hint to the examiner.
        if (targetPlayer.voreTypes && targetPlayer.voreTypes.length > 0) {
          // Find the first voreType with contents
          const activeVoreType = targetPlayer.voreTypes.find(vt => vt.contents && vt.contents.length > 0);

          if (activeVoreType && activeVoreType.examineMsgDescrip) {
            // Append the description to the message
            message += ` ${activeVoreType.examineMsgDescrip}`;
          }
        }

        // Send private interactional message to the examiner
        if (messageSystem) {
          messageSystem.sendSystemMessage('Interactional', message, socket);
        }

        // Restore UI Update for Players
        const info = {
          Identifier: 'player',
          firstName: targetPlayer.firstName || 'Unknown',
          lastName: targetPlayer.lastName || '',
          icDescrip: targetPlayer.icDescrip || targetPlayer.Description || 'No description available.',
        };
        socket.emit('examinedInfo', info);
      }

      else if (data.Identifier === 'mapObject') {
        // Logic for Map Objects (Signs, Furniture, etc)
        log(`Player ${requestingPlayer.firstName} EXAMINED object ${data.name}.`);

        const message = `You examined ${data.name}. ${data.description || ''}`;

        if (messageSystem) {
          messageSystem.sendSystemMessage('Interactional', message, socket);
        }

        // Send UI Update for Map Objects
        socket.emit('examinedInfo', {
          Identifier: 'mapObject',
          name: data.name,
          description: data.description || ''
        });
      }

      else if (data.Identifier === 'spell') {
        // Logic for legacy spells (if still needed)
        log(`Player ${requestingPlayer.firstName} EXAMINED spell ${data.Name}.`);
        // Assuming 'spell' items are handled similarly or just logged for now
        if (messageSystem) {
          messageSystem.sendSystemMessage('Interactional', `You examined a ${data.Name}.`, socket);
        }
      }
    });


    // --- Debug: Send collision map data ---
    socket.on('requestCollisionData', () => {
      const blockedTiles = [];
      if (collisionMap && collisionMap.length > 0) {
        for (let y = 0; y < collisionMap.length; y++) {
          for (let x = 0; x < collisionMap[y].length; x++) {
            if (collisionMap[y][x] === 1) {
              blockedTiles.push({ x: x * TILE_SIZE, y: y * TILE_SIZE });
            }
          }
        }
      }
      socket.emit('collisionDataSent', blockedTiles);
    });

    // --- Struggle Inside Listener ---
    // This event is triggered when a consumed player clicks the "Struggle" button in the UI.
    // It provides specific feedback based on the predator's vore settings.
    socket.on('struggleInside', async () => {
      const player = players[socket.id];
      if (!player || !player.consumedBy) return;

      const predator = Object.values(players).find(p => p.playerId === player.consumedBy);
      if (predator) {
        const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';
        const predatorName = predator.Username || (predator.firstName + ' ' + predator.lastName) || 'Unknown Predator';

        // Find the vore type containing the player
        let activeVoreType = null;
        if (predator.voreTypes) {
          // Try to find specific vore type by name in contents
          activeVoreType = predator.voreTypes.find(vt => vt.contents && vt.contents.includes(playerName));

          // Fallback to first vore type if not found (or if contents empty but consumedBy set)
          if (!activeVoreType && predator.voreTypes.length > 0) {
            activeVoreType = predator.voreTypes[0];
          }
        }

        if (activeVoreType) {
          // 1. Private message for struggler (inside description)
          if (activeVoreType.struggleInsideMsgDescrip && messageSystem) {
            // Send ONLY to the struggler
            messageSystem.sendSystemMessage('Interactional', activeVoreType.struggleInsideMsgDescrip, socket);
          }

          // 2. Public message for everyone (outside description)
          if (activeVoreType.struggleOutsideMsgDescrip && messageSystem) {
            // Broadcast to everyone EXCEPT the struggler
            // We pass the struggler's Character ID in the excludedPlayers array
            messageSystem.sendSystemMessage('Interactional', activeVoreType.struggleOutsideMsgDescrip, null, [player._id.toString()]);
          }
        } else {
          // Fallback if no vore type found
          const msg = `${playerName} struggles inside ${predatorName}!`;
          log(msg);
          io.emit('voreLog', msg);
        }
      }
    });

    // --- Vore Action Listener ---
    // This handles the actual act of consuming a player.
    // It updates state, syncs positions, manages the roster, and broadcasts messages.
    socket.on('voreAction', async function (data) {
      const { voreType, targetId } = data;
      const player = players[socket.id];
      const targetPlayer = players[targetId];

      if (targetPlayer && player) {
        const targetName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName) || 'Unknown Target';
        const predatorName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Predator';

        const messageContent = `${predatorName} ${voreType.verb} ${targetName} into their ${voreType.destination}.`;

        log(messageContent);

        // Update target player state
        targetPlayer.consumedBy = player.playerId;
        targetPlayer.position.x = player.position.x;
        targetPlayer.position.y = player.position.y;

        // Clear held status so struggle bar disappears
        // The struggle bar is only for "held" players. Consumed players have a different UI.
        // Clearing these flags ensures the client knows to hide the struggle bar.
        targetPlayer.isHeld = false;
        targetPlayer.heldBy = null;
        targetPlayer.heldBySocketId = null;
        targetPlayer.grippedFirmly = false;
        targetPlayer.grippedBy = null;
        targetPlayer.struggleCount = 0;

        // Update predator's voreTypes contents
        if (player.voreTypes) {
          const voreTypeEntry = player.voreTypes.find(v => v.destination === voreType.destination);
          if (voreTypeEntry) {
            if (!voreTypeEntry.contents) {
              voreTypeEntry.contents = [];
            }
            voreTypeEntry.contents.push(targetName);
            console.log(`[VoreAction] Updated contents for ${player.Username}:`, voreTypeEntry.contents);
          } else {
            console.log(`[VoreAction] Could not find voreType entry for ${voreType.destination}`);
          }
        } else {
          console.log(`[VoreAction] Player has no voreTypes defined.`);
        }

        // --- 1. Emit to Console Log (Client Side) ---
        io.emit('voreLog', messageContent);

        // --- 2. Add to Chat ---
        try {
          // We need a valid user ID for the chat message. 
          // If the player is a guest, this might fail if the schema requires an ObjectId.
          // However, based on the player object, we might have _id.
          // If not, we might need a fallback or skip saving to DB (just emit).

          // Let's assume for now we want to save it if possible, or just emit a "system" style message.
          // But the requirement says "emit a socket event back to all players... include a message added to the chat".
          // The best way is to mimic 'addMessage' from index.js but from the server side.

          let accountId = player._id;
          // Note: player._id in server-loop seems to be the CHARACTER ID, not the USER/ACCOUNT ID.
          // We need to find the User document to get the account ID if needed, OR just use a placeholder.
          // The Chat schema requires 'name' and 'message'.

          if (accountId) {
            // Broadcast Interactional Message
            if (messageSystem) {
              messageSystem.sendSystemMessage('Interactional', messageContent);
            }
          }

        } catch (err) {
          console.error("Error saving vore chat message:", err);
        }
      }
    });


    // --- Release Vore Target Listener ---
    // This handles releasing a player from a specific vore destination.
    // It removes them from the roster, resets their state, and notifies everyone.
    socket.on('releaseVoreTarget', async function (data) {
      const { voreTypeId, targetName } = data;
      const player = players[socket.id];

      if (!player || !player.voreTypes) return;

      // 1. Find the vore type and remove target from contents
      const voreTypeEntry = player.voreTypes.find(v => v._id.toString() === voreTypeId || v._id === voreTypeId);
      if (voreTypeEntry && voreTypeEntry.contents) {
        const index = voreTypeEntry.contents.indexOf(targetName);
        if (index > -1) {
          voreTypeEntry.contents.splice(index, 1);
          console.log(`[Release] Removed ${targetName} from ${player.Username}'s ${voreTypeEntry.destination}`);
        }
      }

      // 2. Find the target player by name (inefficient but works for now)
      let targetPlayer = null;
      let targetSocketId = null;
      for (const [sid, p] of Object.entries(players)) {
        const pName = p.Username || (p.firstName + ' ' + p.lastName);
        if (pName === targetName) {
          targetPlayer = p;
          targetSocketId = sid;
          break;
        }
      }

      if (targetPlayer) {
        // 3. Reset target state
        targetPlayer.consumedBy = null;
        targetPlayer.isHeld = false;
        targetPlayer.heldBy = null;
        targetPlayer.struggleCount = 0;

        // Reset predator state related to holding this target
        if (player.holding === targetSocketId) {
          player.holding = null;
        }

        // 4. Emit Updates
        const messageContent = `${player.Username || 'Predator'} released ${targetName} from their ${voreTypeEntry ? voreTypeEntry.destination : 'body'}.`;
        log(messageContent);
        io.emit('voreLog', messageContent);

        // Broadcast chat message
        try {
          const Chat = require('./model/Chat');
          const chatMsg = new Chat({
            name: 'Environment',
            message: [{ content: messageContent }],
            deleted: { status: false },
            spoiler: { status: 'none', votes: {} }
          });
          await chatMsg.save();
          io.emit('output', [chatMsg]);
        } catch (err) {
          console.error("Error saving release chat message:", err);
        }
      } else {
        console.log(`[Release] Target player ${targetName} not found online.`);
      }
    });



    // --- Settings Update Listener ---
    socket.on('updateVoreType', async function (data) {
      const player = players[socket.id];
      if (player && player._id) {
        const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';
        log(`${playerName} edited the settings for ${data.destination}.`);

        // Update in-memory
        const voreIndex = player.voreTypes.findIndex(v => v._id.toString() === data.id);
        if (voreIndex > -1) {
          // Merge updates
          player.voreTypes[voreIndex] = { ...player.voreTypes[voreIndex], ...data };
          // Ensure _id is preserved and not overwritten by data.id string if it was an object
          // actually data.id is passed from client, likely string.
        }

        // Update Database
        try {
          const user = await User.findOne({ 'characters._id': player._id });
          if (user) {
            const character = user.characters.id(player._id);
            if (character) {
              const voreType = character.voreTypes.id(data.id);
              if (voreType) {
                voreType.destination = data.destination;
                voreType.verb = data.verb;
                voreType.digestionTimer = data.digestionTimer;
                voreType.animation = data.animation;
                voreType.mode = data.mode;
                voreType.destinationDescrip = data.destinationDescrip;
                voreType.examineMsgDescrip = data.examineMsgDescrip;
                voreType.struggleInsideMsgDescrip = data.struggleInsideMsgDescrip;
                voreType.struggleOutsideMsgDescrip = data.struggleOutsideMsgDescrip;
                voreType.digestionInsideMsgDescrip = data.digestionInsideMsgDescrip;
                voreType.digestionOutsideMsgDescrip = data.digestionOutsideMsgDescrip;
                voreType.audioEntry = data.audioEntry;
                voreType.audioAmbient = data.audioAmbient;
                voreType.audioStruggle = data.audioStruggle;
                voreType.audioExit = data.audioExit;

                await user.save();
                log(`Saved updated vore settings for ${playerName} to DB.`);

                // Broadcast update to all clients
                io.emit('voreSettingsUpdated', {
                  playerId: player.playerId,
                  voreTypes: player.voreTypes
                });
              }
            }
          }
        } catch (err) {
          log.error(`Error saving vore settings for ${playerName}:`, err);
        }
      }
    });

    // --- Add New Vore Type Listener ---
    socket.on('addVoreType', async function (data) {
      const player = players[socket.id];
      if (player && player._id) {
        const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';
        log(`${playerName} added a new vore destination: ${data.destination}.`);

        try {
          const user = await User.findOne({ 'characters._id': player._id });
          if (user) {
            const character = user.characters.id(player._id);
            if (character) {
              // Create new vore object
              const newVore = {
                destination: data.destination,
                verb: data.verb,
                digestionTimer: data.digestionTimer,
                animation: data.animation,
                mode: data.mode,
                destinationDescrip: data.destinationDescrip,
                examineMsgDescrip: data.examineMsgDescrip,
                struggleInsideMsgDescrip: data.struggleInsideMsgDescrip,
                struggleOutsideMsgDescrip: data.struggleOutsideMsgDescrip,
                digestionInsideMsgDescrip: data.digestionInsideMsgDescrip,
                digestionOutsideMsgDescrip: data.digestionOutsideMsgDescrip,
                audioEntry: data.audioEntry,
                audioAmbient: data.audioAmbient,
                audioStruggle: data.audioStruggle,
                audioExit: data.audioExit
              };

              character.voreTypes.push(newVore);
              await user.save();

              // Get the newly created item with _id
              const savedVore = character.voreTypes[character.voreTypes.length - 1];

              // Update in-memory
              player.voreTypes.push(savedVore);

              log(`Saved new vore destination for ${playerName} to DB.`);

              // Optional: Emit back to client to update UI immediately with real ID?
              // The client might need a full refresh or we can send a specific event.
              // For now, the playerUpdates loop will eventually sync it, but might miss the ID if not handled carefully.
              // But since we pushed to player.voreTypes, the next tick will send it.
            }
          }
        } catch (err) {
          log.error(`Error adding vore settings for ${playerName}:`, err);
        }
      }
    });

  });

  // --- Start the Loop ---
  setInterval(() => {
    gameLoop(io);
  }, 1000 / TICK_RATE);

  log('Server game loop started.');
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
