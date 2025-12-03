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

// --- Game State Variables ---
const players = {};
const spells = [];
let collisionMap = [];
let hillHomeMap = [];
let mapWidth = 0;

// --- Constants ---
const TICK_RATE = 30; // 30 updates per second
const PLAYER_SPEED = 250;
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
 */
function initializeMap() {
  try {
    const mapPath = path.join(__dirname, 'client/assets/tilemaps/Demo_Map.json');
    const tilesetPath = path.join(__dirname, 'client/assets/tilemaps/Demo_tileset.json');

    const tilemapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const tilesetData = JSON.parse(fs.readFileSync(tilesetPath, 'utf8'));

    mapWidth = tilemapData.width;
    const mapHeight = tilemapData.height;

    // 1. Identify Blocked and HillHome Tile IDs from the tileset
    const blockedTileIds = new Set();
    const hillHomeTileIds = new Set();
    if (tilesetData.tiles) {
      tilesetData.tiles.forEach(tile => {
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

    // 2. Initialize Collision Map and HillHome Map with 0s
    collisionMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));
    hillHomeMap = Array(mapHeight).fill(null).map(() => Array(mapWidth).fill(0));

    // 3. Iterate Layers and Populate Collision Map
    // Assuming the first tileset in the map corresponds to our loaded tileset.
    const tilesetInfo = tilemapData.tilesets[0];
    const firstGid = tilesetInfo ? tilesetInfo.firstgid : 1;

    tilemapData.layers.forEach(layer => {
      if (layer.type === 'tilelayer' && layer.data) {
        layer.data.forEach((gid, index) => {
          if (gid === 0) return; // Empty tile

          // Calculate local ID
          const localId = gid - firstGid;

          if (blockedTileIds.has(localId)) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              collisionMap[y][x] = 1;
            }
          }
          if (hillHomeTileIds.has(localId)) {
            const x = index % mapWidth;
            const y = Math.floor(index / mapWidth);
            if (y < mapHeight && x < mapWidth) {
              hillHomeMap[y][x] = 1;
            }
          }
        });
      }
    });

    log('Collision map processed successfully based on "Blocked" tile property.');
  } catch (e) {
    log.error('Failed to load or parse tilemap data:', e);
  }
}

/**
 * Creates and places the initial set of spells in the world.
 */
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
 * Checks if a player at position (x, y) collides with any blocked tiles.
 * Uses a bounding box of size TILE_SIZE x TILE_SIZE centered at (x, y).
 */
function checkCollision(x, y) {
  if (!collisionMap || collisionMap.length === 0) return false;

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
  const speed = 250;
  Object.keys(players).forEach(id => {
    const player = players[id];
    const input = player.input;

    if (input.left || input.right || input.up || input.down) {
      // log(`Updating player ${id}. Delta: ${delta}, Pos Before: (${player.position.x}, ${player.position.y})`);
    }

    let newX = player.position.x;
    let newY = player.position.y;

    // Calculate proposed X change
    let proposedX = newX;
    if (input.left) {
      proposedX -= speed * delta;
    }
    if (input.right) {
      proposedX += speed * delta;
    }

    // Check X collision
    if (!checkCollision(proposedX, player.position.y)) {
      newX = proposedX;
    }

    // Calculate proposed Y change
    let proposedY = newY;
    if (input.up) {
      proposedY -= speed * delta;
    }
    if (input.down) {
      proposedY += speed * delta;
    }

    // Check Y collision
    if (!checkCollision(newX, proposedY)) {
      newY = proposedY;
    }

    player.position.x = newX;
    player.position.y = newY;

    if (input.left || input.right || input.up || input.down) {
      // log(`Pos After: (${player.position.x}, ${player.position.y})`);
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

    // Update rotation and moving state for animations
    if (input.left) player.rotation = 1;
    else if (input.right) player.rotation = 2;
    else if (input.up) player.rotation = 3;
    else if (input.down) player.rotation = 4;

    // --- BREAK FREE / STRUGGLE LOGIC ---
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
            player.isHeld = false;
            player.grippedFirmly = false;
            player.heldBy = null;
            player.heldBySocketId = null;
            player.grippedBy = null;
            player.struggleCount = 0;
            log(`Player ${player.Username || player.playerId} struggled free!`);
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

module.exports.start = (io) => {
  initializeGame();

  io.on('connection', async (socket) => {
    log(`Player connected with socket ID: ${socket.id}`);

    const charId = socket.handshake.query.charId;
    let characterData = null;

    if (charId) {
      try {
        const user = await User.findOne({ 'characters._id': charId });
        if (user) {
          const character = user.characters.id(charId);
          if (character) {
            characterData = character;
            log(`Loaded character ${character.firstName} ${character.lastName} for socket ${socket.id}`);
          }
        }
      } catch (err) {
        log.error(`Error loading character for socket ${socket.id}:`, err);
      }
    }

    // --- Create New Player ---
    players[socket.id] = {
      Identifier: "player",
      playerId: socket.id,
      _id: characterData ? characterData._id : null, // Store MongoDB ID
      Username: characterData ? (characterData.firstName + ' ' + characterData.lastName) : "Guest",
      firstName: characterData ? characterData.firstName : "Guest",
      lastName: characterData ? characterData.lastName : "",
      nickName: characterData ? characterData.nickName : "",
      Description: characterData ? characterData.icDescrip : "",
      icDescrip: characterData ? characterData.icDescrip : "",
      voreTypes: characterData ? characterData.voreTypes : [],

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
      spellList: [],
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
      }
    };

    // --- Socket Event Handlers for THIS player ---

    // Send initial state to the new player
    socket.emit('currentPlayers', players, spells);
    // Inform other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('disconnect', async () => {
      log(`Player disconnected: ${socket.id}`);
      const player = players[socket.id];

      // --- Save player's position if they have an ID ---
      if (player && player._id) {
        try {
          const user = await User.findOne({ 'characters._id': player._id });
          if (user) {
            const character = user.characters.id(player._id);
            if (character) {
              character.position = {
                x: player.position.x,
                y: player.position.y,
                time: new Date()
              };
              await user.save();
              log(`Saved position for character ${character.firstName} at ${player.position.x}, ${player.position.y}`);
            }
          }
        } catch (err) {
          log.error(`Error saving position for player ${player.Username}:`, err);
        }
      }

      delete players[socket.id];
      io.emit('removePlayer', socket.id);
    });

    // Handle movement input
    socket.on('playerInput', (inputData) => {
      const player = players[socket.id];
      if (player) {
        player.input = inputData;
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

    socket.on('examineClicked', (clicked) => {
      // Logic for examining players or spells
      if (clicked.Identifier === 'player' && players[clicked.playerId]) {
        const examinedPlayer = players[clicked.playerId];

        // Use in-memory data
        const info = {
          Identifier: 'player',
          firstName: examinedPlayer.firstName || 'Unknown',
          lastName: examinedPlayer.lastName || '',
          icDescrip: examinedPlayer.icDescrip || examinedPlayer.Description || 'No description available.',
        };

        socket.emit('examinedInfo', info);
      }
    });

    socket.on('pickUpClicked', (clicked) => {
      const player = players[socket.id];
      if (!player) return;

      if (clicked.Identifier === 'spell') {
        const spellIndex = spells.findIndex(spell => spell.Name === clicked.Name);
        if (spellIndex > -1) {
          const spell = spells[spellIndex];
          // Check distance
          const distance = Math.sqrt(Math.pow(player.position.x - spell.x, 2) + Math.pow(player.position.y - spell.y, 2));
          if (distance < 100) {
            player.spellList.push(spell);
            spells.splice(spellIndex, 1); // Remove from world
            socket.emit('pickedUpItem', player.spellList);
            io.emit('spellRemoved', spell.Name); // Tell everyone to remove the spell
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
          } else {
            // Normal grab
            log(`Player ${players[socket.id].firstName} has grabbed ${targetName} with ${playerIntent} intent.`);
            targetPlayer.isHeld = true;
            targetPlayer.heldBy = players[socket.id]._id;
            targetPlayer.heldBySocketId = socket.id;
            targetPlayer.grippedFirmly = false;
            targetPlayer.struggleCount = 0;
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
      }
    });


    // --- Player has examined another player ---
    socket.on('examineClicked', (data) => {
      const { playerId } = data;
      const player = players[socket.id];
      const targetPlayer = players[playerId];

      if (!player || !targetPlayer) return;

      log(`Player ${player.firstName} EXAMINED ${targetPlayer.firstName || 'Unknown Player'}.`);

      // Check if target has consumed anyone
      // If the target has consumed someone, we want to provide a hint to the examiner.
      if (targetPlayer.voreTypes && targetPlayer.voreTypes.length > 0) {
        // Find the first voreType with contents
        // In the future, we might want to check specific body parts or show all
        const activeVoreType = targetPlayer.voreTypes.find(vt => vt.contents && vt.contents.length > 0);

        if (activeVoreType && activeVoreType.examineMsgDescrip) {
          // Send the description to the examiner
          socket.emit('voreLog', activeVoreType.examineMsgDescrip);
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
          // 1. Console log for struggler (inside description)
          if (activeVoreType.struggleInsideMsgDescrip) {
            socket.emit('voreLog', activeVoreType.struggleInsideMsgDescrip);
          }

          // 2. Chat message for everyone (outside description)
          if (activeVoreType.struggleOutsideMsgDescrip) {
            const Chat = require('./model/Chat');
            const chatMsg = new Chat({
              name: 'Environment',
              message: [{
                content: activeVoreType.struggleOutsideMsgDescrip,
                style: 'italic'
              }],
              deleted: { status: false },
              spoiler: { status: 'none', votes: {} }
            });

            try {
              await chatMsg.save();
              io.emit('output', [chatMsg]);
            } catch (err) {
              console.error("Error saving struggle chat message:", err);
            }
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
            const User = require('./model/User');
            // We can try to find the user by character ID if needed, but for now let's just use the character ID 
            // or skip the DB save if it's too complex to wire up here without the request object.
            // Actually, we can just use the Chat model directly.

            const Chat = require('./model/Chat');

            const chatMsg = new Chat({
              name: 'Environment', // Use special name for styling
              message: [{
                content: messageContent,
                style: 'italic' // Optional, client handles styling via class
              }],
              deleted: { status: false },
              spoiler: { status: 'none', votes: {} }
            });

            await chatMsg.save();

            // Emit to all clients
            io.emit('output', [chatMsg]);
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
