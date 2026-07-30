const log = require('../logger');
const itemData = require('../data/itemData');
const resourceNodeDefs = require('../data/resourceNodeData');
const { performItemUse } = require('../utils/itemActions');
const { resolveItemDef } = require('../utils/itemUtils');
const { trackVictim, untrackVictim } = require('../server/mechanics/digestion');

/**
 * @fileoverview interactionHandlers.js - Player Interaction & Combat Socket Event Router
 * 
 * @description
 * Manages WebSocket client interaction events for the TastyTails game server.
 * Handles movement input queuing, non-physics updates, reach/distance verification,
 * friendly/grabbing/hostile player actions, map object harvesting, entity examination,
 * and multi-stage vore mechanics (entrance, path progression, clenching, struggling, digestion, and release).
 * 
 * OPTIMIZATIONS & SAFEGUARDS:
 * - Uses Shadow & Line-of-Sight raycasting (checkVisibility / _visibleSet) for observer socket broadcasts.
 * - Emits voreStageUpdate directly to prey and predator sockets to guarantee UI delivery without server-wide payload flooding.
 * - Safely escapes player usernames via escapeRegExp during dynamic perspective tag processing.
 * - Enforces optional chaining on body parts in resolveTargetLimb to prevent unexpected TypeErrors.
 * 
 * Triggered by: Socket.io client events (`playerInput`, `playerPerformAction`, `objectInteract`, `voreAction`, `advanceVoreStage`, etc.).
 */
module.exports = function (io, socket, players, messageSystem, collisionMap, TILE_SIZE, saveCharacter, craftingStations, getPlayersInRange, activeAnimals, worldItems, addItemToGrid, activeResourceNodes, removeItemFromGrid) {
    const logPrefix = `[Inter:${socket.id}]`;

    // =========================================================================
    // 1. INPUT & MOVEMENT
    // =========================================================================

    /**
     * Handles high-frequency player input (movement keys).
     * Pushes input to a queue processed by the server game loop.
     */
    socket.on('playerInput', (inputData) => {
        try {
            if (!players[socket.id] || !inputData) return;

            // Initialize inputQueue if missing
            if (!players[socket.id].inputQueue) {
                players[socket.id].inputQueue = [];
            }

            players[socket.id].inputQueue.push(inputData);
        } catch (e) {
            log.error(`${logPrefix} Error handling playerInput:`, e);
        }
    });

    /**
     * Handles updates to character state (bio, customization, non-physics props).
     * Prevents overwriting server-authoritative physics (position, velocity).
     */
    socket.on('characterUpdate', (data) => {
        try {
            if (players[socket.id]) {
                // Destructure to exclude physics props
                const { x, y, position, velocity, ...safeData } = data;

                // Merge safe updates
                players[socket.id] = { ...players[socket.id], ...safeData };

                // Broadcast non-physics changes to other clients
                socket.broadcast.emit('playerMoved', {
                    playerId: socket.id,
                    ...safeData
                });
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling characterUpdate:`, e);
        }
    });

    /**
     * Sends collision map data to client upon request.
     */
    socket.on('requestCollisionData', () => {
        try {
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
        } catch (e) {
            log.error(`${logPrefix} Error handling requestCollisionData:`, e);
        }
    });

    // =========================================================================
    // 2. INTERACTIONS (Actions, Grabbing, Releasing)
    // =========================================================================

    /**
     * Handles the 'Haunt' action from dead players.
     */
    socket.on('hauntClicked', (target) => {
        try {
            const player = players[socket.id];

            if (!player || !player.isDead) return;

            // Determine Target Name
            let targetName = "Unknown";
            if (target.Identifier === 'player' && players[target.playerId]) {
                const p = players[target.playerId];
                targetName = p.Username || (p.firstName + " " + p.lastName);
            } else if (target.name) {
                targetName = target.name;
            }

            // 1. Private Message to Haunter
            const privateMsg = `You haunt ${targetName}`;
            if (messageSystem) {
                // type, content, targetSocket, excluded, scope
                messageSystem.sendSystemMessage('Interactional', privateMsg, socket, [], 'local');
            }

            // 2. Public Message to Nearby Players (excluding haunter)
            const publicMsg = `spooky actions on ${targetName}`;

            const range = 800; // Large visible range

            // OPTIMIZED: Use Spatial Hash if available
            let nearbyPlayers = [];
            if (getPlayersInRange) {
                nearbyPlayers = getPlayersInRange(player.position.x, player.position.y, range);
            } else {
                // Fallback to O(N) if not provided
                nearbyPlayers = Object.values(players);
            }

            nearbyPlayers.forEach(other => {
                if (other.playerId === socket.id) return; // Skip self

                // Double check distance (Circle vs Square/Grid accuracy)
                const dist = Math.sqrt(Math.pow(player.position.x - other.position.x, 2) + Math.pow(player.position.y - other.position.y, 2));

                if (dist <= range) {
                    const otherSocket = io.sockets.sockets.get(other.playerId);
                    if (otherSocket && messageSystem) {
                        // type, content, targetSocket, excluded, scope
                        messageSystem.sendSystemMessage('Interactional', publicMsg, otherSocket, [], 'local');
                    }
                }
            });

        } catch (e) {
            log.error(`${logPrefix} Error handling hauntClicked:`, e);
        }
    });

    /**
     * Main handler for clicking on another player/target.
     * Evaluates reach, intent (Friendly, Grabbing, Hostile), and triggers effects.
     */
    socket.on('playerPerformAction', (data) => {
        log.info(`${logPrefix} Received playerPerformAction from ${socket.id} with intent: ${data.intent}, targetZone: ${data.targetZone}`);
        try {
            const { targetId, intent, targetZone } = data;
            const player = players[socket.id];
            const targetPlayer = players[targetId];

            if (!player || !targetPlayer) {
                log.warn(`${logPrefix} Action failed: Player or Target not found.`);
                require('../server/monitoring').recordAction('grapple', false);
                return;
            }

            if (player.isDead) {
                require('../server/monitoring').recordAction('grapple', false);
                return;
            }

            // 1. Check Reach (AABB Collision)
            if (!checkReach(player, targetPlayer)) {
                sendSystemMsg(socket, messageSystem, `${targetPlayer.firstName} is too far away.`);
                require('../server/monitoring').recordAction('grapple', false);
                return;
            }

            const targetName = getFullName(targetPlayer);
            const sanitizedIntent = (intent || 'neutral').replace(/[^a-zA-Z0-9]/g, '');

            // 2. Handle Intents
            if (sanitizedIntent === 'friendly') {
                handleFriendlyAction(io, socket, player, targetPlayer, itemData, saveCharacter, messageSystem, targetZone || 'torso');
            } else if (sanitizedIntent === 'grabbing') {
                if (player.playerId === targetPlayer.playerId || (player._id && targetPlayer._id && player._id.toString() === targetPlayer._id.toString())) {
                    sendSystemMsg(socket, messageSystem, "You cannot grab yourself.");
                    require('../server/monitoring').recordAction('grapple', false);
                    return;
                }
                handleGrabbingAction(socket, player, targetPlayer, messageSystem, targetZone || 'torso');
            } else if (sanitizedIntent === 'hostile') {
                handleHostileAction(io, socket, player, targetPlayer, messageSystem, targetZone || 'torso');
            }

            require('../server/monitoring').recordAction('grapple', true);
        } catch (e) {
            log.error(`${logPrefix} Error handling playerPerformAction:`, e);
            require('../server/monitoring').recordAction('grapple', false);
        }
    });

    socket.on('gripFirmly', (data) => {
        try {
            const { playerId } = data;
            const player = players[socket.id];
            const targetPlayer = players[playerId];

            if (!player || !targetPlayer) return;
            if (player.isDead) return;

            if (targetPlayer.playerId === socket.id || player.playerId === targetPlayer.playerId || (player._id && targetPlayer._id && player._id.toString() === targetPlayer._id.toString())) {
                sendSystemMsg(socket, messageSystem, "You cannot grip yourself firmly.");
                return;
            }

            // Only allow if actually holding them
            if (targetPlayer.heldBySocketId === socket.id) {
                targetPlayer.grippedFirmly = true;
                targetPlayer.grippedBy = socket.id;
                targetPlayer.struggleCount = 0;

                const msg = `${player.firstName} is gripping ${targetPlayer.firstName} tightly.`;
                log.info(`${logPrefix} ${msg}`);
                sendSystemMsg(socket, messageSystem, msg);
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling gripFirmly:`, e);
        }
    });

    socket.on('releaseClicked', (data) => {
        handleRelease(io, socket, players, messageSystem, saveCharacter, data);
    });

    // =========================================================================
    // 3. EXAMINATION
    // =========================================================================

    socket.on('examineClicked', (data) => {
        try {
            const user = players[socket.id];
            if (!user) return;

            if (data.Identifier === 'player') {
                handleExaminePlayer(socket, user, players[data.playerId], messageSystem);
            } else if (data.Identifier === 'heldItem') {
                handleExamineHeldItem(socket, user, data, messageSystem);
            } else if (data.Identifier === 'mapObject') {
                handleExamineMapObject(socket, user, data, messageSystem);
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling examineClicked:`, e);
        }
    });

    // =========================================================================
    // 3.5 OBJECT INTERACTIONS (Items, Animals, etc)
    // =========================================================================

    /**
     * Generic Map Object Interaction.
     * Handles specific logic for animals (like gathering wool).
     */
    socket.on('objectInteract', (data) => {
        try {
            const { type, id, action } = data;
            const player = players[socket.id];
            if (!player || player.isDead) return;

            // 1. Animal Interaction
            if (type === 'animal') {
                // Robust Animal ID Lookup (Handles case mismatches & numeric IDs)
                const animal = activeAnimals[id] || 
                               activeAnimals[id?.toLowerCase()] || 
                               Object.values(activeAnimals).find(a => 
                                   a.id === id || 
                                   a.id.toLowerCase() === (id || '').toLowerCase() || 
                                   a.id.endsWith(`_${id}`)
                               );

                if (!animal) {
                    log.warn(`[AnimalInteract] Could not find active animal for id: ${id}`);
                    sendSystemMsg(socket, messageSystem, `Target animal not found.`);
                    return;
                }

                // Distance Check (Server Side specific for Animals)
                const dist = Math.sqrt(Math.pow(player.position.x - animal.x, 2) + Math.pow(player.position.y - animal.y, 2));
                if (dist > 120) { // Slight buffer over client 100
                    sendSystemMsg(socket, messageSystem, `You are too far away from the ${animal.properties.name || 'animal'}.`);
                    return;
                }

                // Interaction Logic
                if (action === 'gather') {
                    // Check if already sheared
                    if (animal.isSheared) {
                        sendSystemMsg(socket, messageSystem, `The ${animal.properties.name || 'sheep'} has no wool left.`);
                        return;
                    }

                    // Check for Sheers in EITHER hand (left or right)
                    const leftNode = player.actionHands?.leftNode;
                    const rightNode = player.actionHands?.rightNode;
                    const hasSheers = (leftNode && leftNode.itemId === 'tool_sheers') || 
                                     (rightNode && rightNode.itemId === 'tool_sheers');

                    if (!hasSheers) {
                        sendSystemMsg(socket, messageSystem, `You need to hold sheers to harvest wool.`);
                        return;
                    }

                    // Logic for Gathering Wool - SPAWN ON GROUND
                    const woolItem = {
                        uid: `wool_${Date.now()}_${Math.random()}`,
                        itemId: 'fiber_wool',
                        name: 'Wool Fiber',
                        texture: 'fiber_wool',
                        icon: 'fa-apple-whole',
                        size: 1,
                        properties: {},
                        x: animal.x,
                        y: animal.y + 20 // Slight offset to be visible
                    };

                    // Add to World
                    if (worldItems && addItemToGrid) {
                        worldItems.push(woolItem);
                        addItemToGrid(woolItem);
                        io.emit('itemSpawned', woolItem);

                        animal.markSheared();
                        sendSystemMsg(socket, messageSystem, `You shear the ${animal.properties.name || 'sheep'} and wool falls to the ground.`);
                    } else {
                        log.error('Missing worldItems or addItemToGrid in interactionHandlers');
                    }

                }
            }
            
            // 2. Resource Node Interaction
            else if (type === 'resourceNode') {
                let node = activeResourceNodes[id];
                let isCrop = false;
                let cropItem = null;

                if (!node) {
                    // Fallback to check if it's a gatherable crop world item
                    cropItem = worldItems.find(item => item.uid === id);
                    if (cropItem) {
                        const def = resolveItemDef(cropItem, itemData);
                        if (def && def.gatherable && action === 'gather') {
                            isCrop = true;
                        }
                    }
                }

                if (!node && !isCrop) {
                    log.warn(`${logPrefix} Resource node not found: ${id}`);
                    return;
                }

                if (isCrop) {
                    const def = resolveItemDef(cropItem, itemData);
                    // Distance Check
                    const dist = Math.sqrt(Math.pow(player.position.x - cropItem.x, 2) + Math.pow(player.position.y - cropItem.y, 2));
                    if (dist > 120) {
                        log.warn(`${logPrefix} Player too far from crop (${dist.toFixed(1)}px)`);
                        return;
                    }

                    // Perform harvesting
                    const materialId = def.gatherItem;
                    const seedId = def.gatherSeed;

                    // Spawn gathered material on the ground
                    const spawnedMaterial = {
                        uid: `${materialId}_item_${Date.now()}_${Math.random()}`,
                        itemId: materialId,
                        name: itemData[materialId] ? itemData[materialId].name : 'Resource',
                        texture: itemData[materialId] ? itemData[materialId].texture : 'default_item',
                        icon: itemData[materialId] ? itemData[materialId].icon : 'fa-gem',
                        size: itemData[materialId] ? itemData[materialId].size : 1,
                        properties: {},
                        x: cropItem.x + (Math.random() * 20 - 10), // slight random offset
                        y: cropItem.y + 15
                    };

                    // Spawn seed on the ground
                    const spawnedSeed = {
                        uid: `${seedId}_item_${Date.now()}_${Math.random()}`,
                        itemId: seedId,
                        name: itemData[seedId] ? itemData[seedId].name : 'Seed',
                        texture: itemData[seedId] ? itemData[seedId].texture : 'default_item',
                        icon: itemData[seedId] ? itemData[seedId].icon : 'fa-seedling',
                        size: itemData[seedId] ? itemData[seedId].size : 1,
                        properties: {},
                        x: cropItem.x + (Math.random() * 20 - 10),
                        y: cropItem.y + 15
                    };

                    if (worldItems && addItemToGrid) {
                        worldItems.push(spawnedMaterial);
                        addItemToGrid(spawnedMaterial);
                        io.emit('itemSpawned', spawnedMaterial);

                        worldItems.push(spawnedSeed);
                        addItemToGrid(spawnedSeed);
                        io.emit('itemSpawned', spawnedSeed);

                        // Remove the crop world item
                        const itemIndex = worldItems.indexOf(cropItem);
                        if (itemIndex > -1) {
                            worldItems.splice(itemIndex, 1);
                            if (typeof removeItemFromGrid === 'function') {
                                removeItemFromGrid(cropItem);
                            }
                            io.emit('itemRemoved', cropItem.uid);
                        }

                        sendSystemMsg(socket, messageSystem, `You harvest a ${spawnedMaterial.name} and a seed from the plant.`);
                    }
                    return;
                }

                const nodeDef = resourceNodeDefs[node.type];
                if (!nodeDef) {
                    log.warn(`${logPrefix} Resource node definition not found for: ${node.type}`);
                    return;
                }

                // Distance Check
                const dist = Math.sqrt(Math.pow(player.position.x - node.x, 2) + Math.pow(player.position.y - node.y, 2));
                if (dist > 120) { // Same buffer as animal
                    log.warn(`${logPrefix} Player too far from resource node (${dist.toFixed(1)}px)`);
                    return;
                }

                // Action Check
                if (action !== nodeDef.interactType) {
                    log.warn(`${logPrefix} Invalid action '${action}' for resource node '${node.type}' (expected '${nodeDef.interactType}')`);
                    return;
                }

                // Capacity Check
                if (node.capacity <= 0) {
                    sendSystemMsg(socket, messageSystem, `The ${nodeDef.name} is depleted. Please wait for it to replenish.`);
                    return;
                }

                // Tool Check
                if (nodeDef.gatherTool && nodeDef.gatherTool !== 'none') {
                    const currentActiveHand = data.hand || player.actionHands.activeHand || 'right'; // 'left' or 'right'
                    let hasTool = false;

                    if (currentActiveHand === 'left') {
                        if (player.actionHands.leftNode && player.actionHands.leftNode.itemId === nodeDef.gatherTool) {
                            hasTool = true;
                        }
                    } else if (currentActiveHand === 'right') {
                        if (player.actionHands.rightNode && player.actionHands.rightNode.itemId === nodeDef.gatherTool) {
                            hasTool = true;
                        }
                    }

                    if (!hasTool) {
                        const toolName = itemData[nodeDef.gatherTool] ? itemData[nodeDef.gatherTool].name : 'appropriate tool';
                        sendSystemMsg(socket, messageSystem, `You need to hold a ${toolName} to harvest this.`);
                        return;
                    }
                }

                // Perform gathering
                node.capacity -= 1;
                node.regrowTimer = 0; // Reset regrowth timer on gather

                // Spawn item on ground
                const spawnedItem = {
                    uid: `${node.type}_item_${Date.now()}_${Math.random()}`,
                    itemId: nodeDef.gatherItem,
                    name: itemData[nodeDef.gatherItem] ? itemData[nodeDef.gatherItem].name : 'Resource',
                    texture: itemData[nodeDef.gatherItem] ? itemData[nodeDef.gatherItem].texture : 'default_item',
                    icon: itemData[nodeDef.gatherItem] ? itemData[nodeDef.gatherItem].icon : 'fa-gem',
                    size: itemData[nodeDef.gatherItem] ? itemData[nodeDef.gatherItem].size : 1,
                    properties: {},
                    x: node.x + (Math.random() * 20 - 10), // slight random offset
                    y: node.y + 15
                };

                if (worldItems && addItemToGrid) {
                    worldItems.push(spawnedItem);
                    addItemToGrid(spawnedItem);
                    io.emit('itemSpawned', spawnedItem);

                    // Broadcast node update
                    io.emit('resourceNodeUpdate', {
                        id: node.uid,
                        capacity: node.capacity,
                        frame: nodeDef.capacityFrames[node.capacity]
                    });

                    sendSystemMsg(socket, messageSystem, `You harvest a ${spawnedItem.name} from the ${nodeDef.name}.`);
                } else {
                    log.error('Missing worldItems or addItemToGrid in interactionHandlers');
                }
            }

        } catch (e) {
            log.error(`${logPrefix} Error handling objectInteract:`, e);
        }
    });

    // =========================================================================
    // 4. VORE MECHANICS
    // =========================================================================

    /**
     * Triggered when a Predator selects an option from the Vore Menu.
     * Initiates the vore process (Entrance or Direct).
     */
    socket.on('voreAction', (data) => {
        try {
            const { voreType, targetId } = data;

            // Find Predator Socket ID
            // We search keys to get the reliable active Socket ID
            const predSocketId = Object.keys(players).find(key => players[key].playerId === socket.id);
            // Wait, socket.id is the predator here (initiator). 
            // In voreAction, 'socket' IS the predator because they clicked the menu.
            // So we don't strictly need the lookup for the predator, we HAVE 'socket'.
            // BUT, for consistency with 'struggleInside', and to ensure we have the correct *Character ID* for exclusions...
            // Actually, in voreAction, the predator is the one emitting the event.
            // So 'socket' is the predator's socket.
            // 'predator' is players[socket.id].

            const predator = players[socket.id];

            // For prey, we need to find them by targetId (which is likely playerId)
            // targetId comes from the client Vore Menu.
            // We should ensure we find the prey's socket too.
            const preySocketId = Object.keys(players).find(key => players[key].playerId === targetId);
            const prey = players[preySocketId];

            if (!predator || !prey) {
                require('../server/monitoring').recordAction('vore', false);
                return;
            }

            if (predator.playerId === prey.playerId || (predator._id && prey._id && predator._id.toString() === prey._id.toString()) || socket.id === preySocketId) {
                sendSystemMsg(socket, messageSystem, "You cannot perform a vore action on yourself.");
                require('../server/monitoring').recordAction('vore', false);
                return;
            }

            const predSocket = socket;
            const preySocket = io.sockets.sockets.get(preySocketId);

            if (predator.isDead) return;

            const predName = getFullName(predator);
            const preyName = getFullName(prey);

            // Fetch Anatomy Node to get the correct verb
            const anatomy = getParsedAnatomy(predator);
            let verb = voreType.verb || 'eats';
            if (anatomy && anatomy.nodes) {
                const node = anatomy.nodes.find(n => String(n.id) === String(voreType.graphNodeId));
                if (node && node.properties && node.properties.verb) {
                    verb = node.properties.verb;
                }
            }

            const destinationName = voreType.destination;

            // Base Message Template
            // We can unify Stage 1 and Stage 3 message logic here.
            // "Vorny consumes Jacky into their Stomach."
            let rawMsg = `${predName} ${verb} ${preyName} into their ${destinationName}.`;

            // Helper for replacements (Shared logic)
            // We can inline it here or reuse if we extracted it. Inlining for safety now.
            const processTags = (text, isPrey, isPred) => {
                let processed = text;

                // 1. Simple Replacements if tags existed (future proofing)
                processed = processed
                    .replace(/<pred>/gi, isPred ? 'You' : predName)
                    .replace(/<prey>/gi, isPrey ? 'you' : preyName)
                    .replace(/<node>/gi, destinationName);

                // 2. Grammar/Perspective Adjustments on raw string
                // If isPredator, "Vorny eats" -> "You eat"
                if (isPred) {
                    const safePred = escapeRegExp(predName);
                    if (safePred) {
                        processed = processed.replace(new RegExp(`\\b${safePred}\\b`, 'gi'), 'You');
                    }

                    if (verb && verb.endsWith('s')) {
                        const baseVerb = verb.slice(0, -1);
                        const verbRegex = new RegExp(`\\bYou ${escapeRegExp(verb)}\\b`, 'gi');
                        processed = processed.replace(verbRegex, `You ${baseVerb}`);
                    }

                    // Fix "into their" -> "into your"
                    processed = processed.replace(/\btheir\b/gi, 'your');
                }

                // If isPrey, "Vorny eats Jacky" -> "Vorny eats you"
                if (isPrey) {
                    const safePrey = escapeRegExp(preyName);
                    if (safePrey) {
                        processed = processed.replace(new RegExp(`\\b${safePrey}\\b`, 'gi'), 'you');
                    }
                }

                return processed;
            };

            // Generate 3 Messages
            const preyMsg = processTags(rawMsg, true, false);
            const predMsg = processTags(rawMsg, false, true);
            const externalMsg = rawMsg; // 3rd person is default

            // Send Messages
            // 1. To Prey (Local)
            if (preySocket && messageSystem) {
                messageSystem.sendSystemMessage('Interactional', preyMsg, preySocket, [], 'local', predSocket);
            }

            // 2. To Predator (Local)
            if (messageSystem) {
                messageSystem.sendSystemMessage('Interactional', predMsg, predSocket, [], 'local', predSocket);
            }

            // 3. To External (Local, exclude Protagonists)
            if (messageSystem) {
                const excluded = [String(prey._id), String(predator._id)];
                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excluded, 'local', predSocket);
            }

            // Log to Vore Log - Shadow & Line-of-Sight Broadcast
            let voreLogObservers = [];
            if (getPlayersInRange && predator.position) {
                voreLogObservers = getPlayersInRange(predator.position.x, predator.position.y, 800);
            } else {
                voreLogObservers = Object.values(players);
            }
            voreLogObservers.forEach(obs => {
                if (isObserverVisible(obs.playerId, predator.playerId, players)) {
                    const obsSocket = io.sockets.sockets.get(obs.playerId);
                    if (obsSocket) obsSocket.emit('voreLog', externalMsg);
                }
            });

            // STATE UPDATES

            if (voreType.isEntrance) {
                // A. ENTRANCE (Stage 1)
                prey.voreStage = 1;
                prey.currentVoreNodeId = voreType.graphNodeId;
                prey.consumedBy = predator.playerId;
                resetGrappleState(prey);

                trackVictim(prey.playerId); // Track for digestion

                broadcastVoreStageUpdate(io, prey, predator, 1, voreType.destination);
                saveState(saveCharacter, socket.id, prey.socketId);
            } else {
                // B. DIRECT (Stage 3)
                prey.consumedBy = predator.playerId;
                prey.voreStage = 3;
                prey.currentVoreNodeId = voreType.graphNodeId;
                prey.position = { ...predator.position };
                resetGrappleState(prey);

                trackVictim(prey.playerId); // Track for digestion

                addPlayerToVoreContents(predator, destinationName, preyName, voreType.graphNodeId);

                // [FIX] Broadcast Immediate Update for Predator's Vore List (UI)
                io.emit('playerStateUpdate', {
                    [predator.playerId]: {
                        playerId: predator.playerId,
                        voreTypes: predator.voreTypes
                    }
                });

                broadcastVoreStageUpdate(io, prey, predator, 3, destinationName);
                saveState(saveCharacter, socket.id, prey.socketId);
            }

            require('../server/monitoring').recordAction('vore', true);
        } catch (e) {
            log.error(`${logPrefix} Error handling voreAction:`, e);
            require('../server/monitoring').recordAction('vore', false);
        }
    });

    /**
     * Triggered by UI arrows to move prey between vore stages.
     * Directions: 'forward' (deeper), 'backward' (regurgitate/pull out)
     */
    socket.on('advanceVoreStage', (data) => {
        try {
            const { targetId, direction } = data;
            const predator = players[socket.id];

            // Robust Prey Lookup
            const preySocketId = Object.keys(players).find(key => players[key].playerId === targetId);
            const prey = players[preySocketId];

            if (!predator || !prey || prey.consumedBy !== predator.playerId) return;

            const predSocket = socket;
            const preySocket = io.sockets.sockets.get(preySocketId);

            const currentStage = prey.voreStage || 1;
            const currentNodeId = prey.currentVoreNodeId;
            const anatomy = getParsedAnatomy(predator);

            if (!anatomy.nodes) return;

            const currentNode = anatomy.nodes.find(n => String(n.id) === currentNodeId);
            if (!currentNode) {
                log.warn(`${logPrefix} Vore Node ${currentNodeId} not found.`);
                return;
            }

            // Determine Next Node
            let nextNode = null;
            let nextStage = currentStage;

            // Messages
            let rawPreyMsg = '';
            let rawPredMsg = '';
            let rawExternalMsg = '';

            const predName = getFullName(predator);
            const preyName = getFullName(prey);

            // Forward
            if (direction === 'forward') {
                const link = anatomy.links.find(l => String(l.from) === String(currentNode.id));
                if (link) {
                    nextNode = anatomy.nodes.find(n => String(n.id) === String(link.to));
                    if (nextNode) {
                        const nodeName = nextNode.properties.name;
                        if (nextNode.type === 'path') {
                            nextStage = 2;
                            // Use node property or fallback
                            rawPreyMsg = nextNode.properties.destinationDescrip || `You slide into the ${nodeName}.`;
                            rawPredMsg = `You feel <prey> working into your <node>.`;
                            rawExternalMsg = `You can barely make out the shape of <prey> slipping into <pred>'s <node>.`;
                        } else if (nextNode.type === 'destination') {
                            nextStage = 3;
                            rawPreyMsg = nextNode.properties.destinationDescrip || `You drop into the ${nodeName}.`;
                            rawPredMsg = `You feel <prey> finally sliding into your <node>.`;
                            rawExternalMsg = `<pred>'s <node> swells slightly as the weight of <prey> settles there.`;
                        }
                    }
                }
            }
            // Backward
            else if (direction === 'backward') {
                const link = anatomy.links.find(l => String(l.to) === String(currentNode.id));
                if (link) {
                    nextNode = anatomy.nodes.find(n => String(n.id) === String(link.from));
                    if (nextNode) {
                        const nodeName = nextNode.properties.name;
                        // Checking types for stage logic
                        if (nextNode.type === 'entrance') {
                            nextStage = 1;
                        } else if (nextNode.type === 'path') {
                            nextStage = 2;
                        }

                        // Standardized Backward Messages
                        rawPreyMsg = `<pred> drags you back into their <node>.`;
                        rawPredMsg = `You drag <prey> back into your <node>.`;
                        rawExternalMsg = `<pred> drags <prey> back into their <node>.`;
                    }
                }
            }

            // Apply Transition
            if (nextNode && nextStage !== currentStage) {
                prey.voreStage = nextStage;
                prey.currentVoreNodeId = String(nextNode.id);

                trackVictim(prey.playerId); // Ensure tracked (idempotent set add)

                // PROCESS TAGS HELPER (Inlined)
                const nodeName = nextNode.properties.name;
                const processTags = (text, isPrey, isPred) => {
                    let processed = text || '';
                    processed = processed
                        .replace(/<pred>/gi, isPred ? 'You' : predName)
                        .replace(/<prey>/gi, isPrey ? 'you' : preyName)
                        .replace(/<node>/gi, nodeName);

                    if (isPred) {
                        processed = processed.replace(/\btheir\b/gi, 'your');
                    }
                    if (isPrey) {
                        const safePrey = escapeRegExp(preyName);
                        if (safePrey) {
                            processed = processed.replace(new RegExp(`\\b${safePrey}\\b`, 'gi'), 'you');
                        }
                    }
                    return processed;
                };

                const preyMsg = processTags(rawPreyMsg, true, false);
                const predMsg = processTags(rawPredMsg, false, true);
                const externalMsg = processTags(rawExternalMsg, false, false);

                // Stage 3 Content Update
                if (nextStage === 3) {
                    addPlayerToVoreContents(predator, nextNode.properties.name, getFullName(prey), String(nextNode.id));
                    // [FIX] Broadcast Immediate Update
                    io.emit('playerStateUpdate', {
                        [predator.playerId]: {
                            playerId: predator.playerId,
                            voreTypes: predator.voreTypes
                        }
                    });
                }

                // Delivery

                // 1. Prey
                if (preySocket && messageSystem && preyMsg) {
                    messageSystem.sendSystemMessage('Interactional', preyMsg, preySocket, [], 'local', predSocket);
                }

                // 2. Predator
                if (messageSystem && predMsg) {
                    messageSystem.sendSystemMessage('Interactional', predMsg, socket, [], 'local', predSocket);
                }

                // 3. External (Fixing Exclusions)
                if (messageSystem && externalMsg) {
                    const excluded = [String(prey._id), String(predator._id)];
                    messageSystem.sendSystemMessage('Interactional', externalMsg, null, excluded, 'local', predSocket);

                    // OPTIMIZED: Shadow & Line-of-Sight Broadcast for Vore Log
                    let observers = [];
                    if (getPlayersInRange && predator.position) {
                        observers = getPlayersInRange(predator.position.x, predator.position.y, 800);
                    } else {
                        observers = Object.values(players);
                    }
                    observers.forEach(obs => {
                        if (isObserverVisible(obs.playerId, predator.playerId, players)) {
                            const obsSocket = io.sockets.sockets.get(obs.playerId);
                            if (obsSocket) obsSocket.emit('voreLog', externalMsg);
                        }
                    });
                }

                broadcastVoreStageUpdate(io, prey, predator, nextStage, nextNode.properties.name);
                saveState(saveCharacter, socket.id, prey.socketId);
            }

        } catch (e) {
            log.error(`${logPrefix} Error handling advanceVoreStage:`, e);
        }
    });

    /**
     * Triggered when predator toggles "Clench" in Stage 3 Vore Controls.
     * Flexes destination node muscles, consuming predator's stamina per second.
     */
    socket.on('clenchVoreStage', (data) => {
        try {
            const { targetId } = data;
            const predator = players[socket.id];
            if (!predator) return;

            // Robust Prey Lookup
            const preySocketId = Object.keys(players).find(key => players[key].playerId === targetId);
            const prey = players[preySocketId];

            if (!prey || prey.consumedBy !== predator.playerId) return;

            const isTurningOn = !predator.isClenching;

            if (isTurningOn) {
                // Check Stamina Availability
                const currentStamina = predator.stats ? (predator.stats.stamina || 0) : 100;
                if (currentStamina <= 0) {
                    if (messageSystem) {
                        messageSystem.sendSystemMessage('Interactional', 'You are too exhausted to clench!', socket, [], 'local', null);
                    }
                    return;
                }
                predator.isClenching = true;
                prey.isClenchSuppressed = true;

                // Pause active struggle cooldown if prey is on cooldown
                const now = Date.now();
                if (prey.struggleCooldownUntil && now < prey.struggleCooldownUntil) {
                    prey.struggleCooldownRemaining = prey.struggleCooldownUntil - now;
                    prey.struggleCooldownUntil = null;
                }
            } else {
                predator.isClenching = false;
                prey.isClenchSuppressed = false;

                // Resume struggle cooldown if prey had paused cooldown
                const now = Date.now();
                if (prey.struggleCooldownRemaining && prey.struggleCooldownRemaining > 0) {
                    prey.struggleCooldownUntil = now + prey.struggleCooldownRemaining;
                    prey.struggleCooldownRemaining = null;
                }
            }

            const predName = getFullName(predator);
            const preyName = getFullName(prey);

            const predMsg = isTurningOn 
                ? `You flex your internal muscles tightly around ${preyName}, pressing against them from all sides.`
                : `You relax your internal muscles around ${preyName}.`;

            const preyMsg = isTurningOn 
                ? `${predName}'s body is squeezing too tightly to move!`
                : `${predName}'s muscles relax, giving you room to move.`;

            const externalMsg = isTurningOn
                ? `${predName}'s body twitches and squeezes inward around ${preyName}.`
                : `${predName}'s body relaxes around ${preyName}.`;

            const predSocket = socket;
            const preySocket = io.sockets.sockets.get(preySocketId);

            if (preySocket && messageSystem) {
                messageSystem.sendSystemMessage('Interactional', preyMsg, preySocket, [], 'local', predSocket);
            }
            if (predSocket && messageSystem) {
                messageSystem.sendSystemMessage('Interactional', predMsg, predSocket, [], 'local', predSocket);
            }
            if (messageSystem && externalMsg) {
                const excluded = [String(prey._id), String(predator._id)];
                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excluded, 'local', predSocket);
                io.emit('voreLog', externalMsg);
            }

            let nodeName = 'Stomach';
            if (prey.currentVoreNodeId && predator.anatomyData) {
                const graph = getParsedAnatomy(predator);
                const node = graph.nodes ? graph.nodes.find(n => String(n.id) === prey.currentVoreNodeId) : null;
                if (node) nodeName = node.properties.name || 'Stomach';
            }

            broadcastVoreStageUpdate(io, prey, predator, prey.voreStage || 3, nodeName);
            saveState(saveCharacter, socket.id, preySocketId);

        } catch (e) {
            log.error(`${logPrefix} Error handling clenchVoreStage:`, e);
        }
    });

    /**
     * Triggered when a prey player dies from digestion (Health <= 0).
     */
    socket.on('preyDigested', (data) => {
        try {
            const prey = players[socket.id];
            if (!prey || !prey.consumedBy) return;

            // Find predator
            const predSocketId = Object.keys(players).find(key => players[key].playerId === prey.consumedBy);
            const predator = players[predSocketId];
            if (!predator) return;

            const predSocket = io.sockets.sockets.get(predSocketId);
            const preySocket = socket;

            const predName = getFullName(predator);
            const preyName = getFullName(prey);

            // Fetch Anatomy Node to get descriptions
            const anatomy = getParsedAnatomy(predator);
            let insideDesc = '';
            let outsideDesc = '';
            let nodeName = 'Stomach';

            if (anatomy && anatomy.nodes) {
                const node = anatomy.nodes.find(n => String(n.id) === String(prey.currentVoreNodeId));
                if (node && node.properties) {
                    insideDesc = node.properties.digestionInsideMsgDescrip || '';
                    outsideDesc = node.properties.digestionOutsideMsgDescrip || '';
                    nodeName = node.properties.name || 'Stomach';
                }
            }

            // Defaults if missing
            if (!insideDesc) insideDesc = "You dissolve away into nothingness...";
            if (!outsideDesc) outsideDesc = `<pred>'s ${nodeName} churns as <prey> is fully digested.`;

            // Process Tags Helper (Inlined)
            const processTags = (text, isPrey, isPred) => {
                let processed = text || '';
                processed = processed
                    .replace(/<pred>/gi, isPred ? 'You' : predName)
                    .replace(/<prey>/gi, isPrey ? 'you' : preyName)
                    .replace(/<node>/gi, nodeName);

                if (isPred) {
                    const safePred = escapeRegExp(predName);
                    if (safePred) {
                        processed = processed.replace(new RegExp(`\\b${safePred}\\b`, 'gi'), 'You');
                    }
                    processed = processed.replace(/\btheir\b/gi, 'your');
                    processed = processed.replace(/\bYou's\b/gi, 'Your');
                }
                if (isPrey) {
                    const safePrey = escapeRegExp(preyName);
                    if (safePrey) {
                        processed = processed.replace(new RegExp(`\\b${safePrey}\\b`, 'gi'), 'you');
                    }
                }
                return processed;
            };

            const preyMsg = processTags(insideDesc, true, false);
            const predMsg = processTags(outsideDesc, false, true);
            const externalMsg = processTags(outsideDesc, false, false);

            // Delivery

            // 1. Prey (Internal Fate)
            if (preySocket && messageSystem && preyMsg) {
                messageSystem.sendSystemMessage('Interactional', preyMsg, preySocket, [], 'local', predSocket);
            }

            // 2. Predator (External Outcome)
            if (predSocket && messageSystem && predMsg) {
                messageSystem.sendSystemMessage('Interactional', predMsg, predSocket, [], 'local', predSocket);
            }

            // 3. External (Observers)
            if (messageSystem && externalMsg) {
                const excluded = [String(prey._id), String(predator._id)];
                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excluded, 'local', predSocket);

                    // OPTIMIZED: Shadow & Line-of-Sight Broadcast for Vore Log
                    let observers = [];
                    if (getPlayersInRange && predator.position) {
                        observers = getPlayersInRange(predator.position.x, predator.position.y, 800);
                    } else {
                        observers = Object.values(players);
                    }
                    observers.forEach(obs => {
                        if (isObserverVisible(obs.playerId, predator.playerId, players)) {
                            const obsSocket = io.sockets.sockets.get(obs.playerId);
                            if (obsSocket) obsSocket.emit('voreLog', externalMsg);
                        }
                    });
            }

        } catch (e) {
            log.error(`${logPrefix} Error handling preyDigested:`, e);
        }
    });

    /**
     * Prey struggling inside.
     */
    socket.on('struggleInside', () => {
        try {
            const prey = players[socket.id];
            if (!prey || !prey.consumedBy) return;

            // Find predator by playerId
            // We search keys to get the reliable active Socket ID
            const predSocketId = Object.keys(players).find(key => players[key].playerId === prey.consumedBy);
            const predator = players[predSocketId];

            if (!predator) return;

            const now = Date.now();

            // Check Authoritative Clench Suppression
            if (predator.isClenching || prey.isClenchSuppressed) {
                const preySocket = socket;
                const pName = getFullName(predator);
                if (messageSystem && preySocket) {
                    messageSystem.sendSystemMessage('Interactional', `${pName}'s body is squeezing too tightly to move!`, preySocket, [], 'local', null);
                }
                return;
            }

            // Check Authoritative Struggle Cooldown (10 Seconds)
            if (prey.struggleCooldownUntil && now < prey.struggleCooldownUntil) {
                log.info(`${logPrefix} Struggle action on cooldown for prey ${prey.playerId}`);
                return;
            }

            // Check Stamina Availability (20 Stamina Cost)
            const currentStamina = prey.stats ? (prey.stats.stamina || 0) : 100;
            if (currentStamina < 20) {
                const preySocket = socket;
                if (messageSystem && preySocket) {
                    messageSystem.sendSystemMessage('Interactional', 'You are too exhausted to struggle!', preySocket, [], 'local', null);
                }
                return;
            }

            // Deduct 20 Stamina and Apply 10s Cooldown
            prey.stats.stamina = Math.max(0, currentStamina - 20);
            prey.struggleCooldownUntil = now + 10000;

            const preySocket = socket;
            if (preySocket) {
                preySocket.emit('anatomyStatsUpdate', {
                    stats: prey.stats,
                    isDead: prey.isDead
                });
            }

            const predSocket = io.sockets.sockets.get(predSocketId);

            // Notify predator client of target struggle activity for pulse monitor
            if (predSocket) {
                predSocket.emit('targetStruggleActivity', { targetId: prey.playerId });
            }

            // Get Anatomy Info
            let pName = getFullName(predator);
            let tName = getFullName(prey);
            let nodeName = 'belly';

            // Default raw strings
            let rawIn = `You struggle inside ${pName}'s ${nodeName}.`;
            let rawOut = `${pName}'s ${nodeName} shifts as ${tName} struggles.`;

            if (prey.currentVoreNodeId && predator.anatomyData) {
                const graph = getParsedAnatomy(predator);
                const node = graph.nodes ? graph.nodes.find(n => String(n.id) === prey.currentVoreNodeId) : null;

                if (node) {
                    nodeName = node.properties.name || 'belly';
                    if (node.properties.struggleInsideMsgDescrip) rawIn = node.properties.struggleInsideMsgDescrip;
                    if (node.properties.struggleOutsideMsgDescrip) rawOut = node.properties.struggleOutsideMsgDescrip;
                }
            }

            // Helper for replacements
            const processTags = (text, isInternal) => {
                let processed = text
                    .replace(/<pred>/gi, pName)
                    .replace(/<prey>/gi, isInternal ? 'you' : tName) // <prey> is 'you' inside, Name outside
                    .replace(/<player>/gi, tName)
                    .replace(/<node>/gi, nodeName);

                // Fix "you" for external messages
                if (!isInternal) {
                    processed = processed.replace(/\byou\b/gi, tName);
                }
                return processed;
            };

            // 1. Prey Message (Internal)
            const preyMsg = processTags(rawIn, true);

            // 2. External Message (External View)
            const externalMsg = processTags(rawOut, false);

            // 3. Predator Message (Predator View)
            // Attempt to grammar-fix "PredName" -> "Your" if possible, or just use externalMsg
            // Simple replace of Name with "Your" might be risky if Name is common, but let's try strict start match?
            // Actually, safest is to just use externalMsg for now unless we are confident. 
            // BUT, strictly speaking, the user said "predMsg" should be unique.
            // Let's create a variant that replaces <pred> with "Your" directly from rawOut.
            let predMsg = rawOut
                .replace(/<pred>'s/gi, "Your") // Handle possessive first
                .replace(/<pred>/gi, "Your")   // Handle direct
                .replace(/<prey>/gi, tName)
                .replace(/<player>/gi, tName)
                .replace(/<node>/gi, nodeName)
                .replace(/\byou\b/gi, tName);  // Fix "you" -> Name

            // If rawOut didn't have tags and relied on defaults, predMsg might still have pName. 
            // We can try to replace pName? 
            if (predMsg.includes(pName)) {
                predMsg = predMsg.split(pName).join('Your'); // Simple replace all
            }
            // Fix double possessive "Your's" -> "Your" just in case
            predMsg = predMsg.replace(/\bYour's\b/gi, "Your");




            // SEND MESSAGES

            // 1. To Prey (Private, Local Scope)
            if (preySocket && messageSystem) {
                messageSystem.sendSystemMessage('Interactional', preyMsg, preySocket, [], 'local');
            }

            // 2. To Predator (Private, Local Scope)
            if (predSocket && messageSystem) {
                messageSystem.sendSystemMessage('Interactional', predMsg, predSocket, [], 'local');
            }

            // 3. To External (Local around Predator, excluding Pred & Prey)
            if (predSocket && messageSystem) {
                // MessageSystem uses Character IDs (_id) for exclusions, not socket IDs (playerId)
                const excluded = [String(prey._id), String(predator._id)];
                // Use Predator socket as source to determine locality
                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excluded, 'local', predSocket);
            }

            broadcastVoreStageUpdate(io, prey, predator, prey.voreStage || 3, nodeName);

        } catch (e) {
            log.error(`${logPrefix} Error handling struggleInside:`, e);
        }
    });

    /**
     * Specific release from Vore Menu (usually via 'Release' button on destination)
     */
    socket.on('releaseVoreTarget', (data) => {
        try {
            const { voreTypeId, targetName } = data;
            const predator = players[socket.id];
            if (!predator || !predator.voreTypes) return;

            // Remove from contents
            const voreTypeEntry = predator.voreTypes.find(v => v._id.toString() === voreTypeId || v._id === voreTypeId);
            if (voreTypeEntry && voreTypeEntry.contents) {
                const index = voreTypeEntry.contents.indexOf(targetName);
                if (index > -1) voreTypeEntry.contents.splice(index, 1);
            }

            // Find Victim
            const prey = Object.values(players).find(p => getFullName(p) === targetName);

            const msg = `${getFullName(predator)} released ${targetName} from their ${voreTypeEntry ? voreTypeEntry.destination : 'body'}.`;

            if (prey) {
                untrackVictim(prey.playerId); // Stop digestion
                resetVoreState(prey);
                if (predator.holding === prey.socketId) predator.holding = null;
                log.info(msg);
                saveState(saveCharacter, socket.id, prey.socketId);
            } else {
                log.warn(`${logPrefix} Released offline target '${targetName}' from predator contents.`);
                if (saveCharacter) saveCharacter(socket.id);
            }

            // OPTIMIZED: Shadow & Line-of-Sight Broadcast for Vore Log
            let observers = [];
            if (getPlayersInRange && predator.position) {
                observers = getPlayersInRange(predator.position.x, predator.position.y, 800);
            } else {
                observers = Object.values(players);
            }
            observers.forEach(obs => {
                if (isObserverVisible(obs.playerId, socket.id, players)) {
                    const obsSocket = io.sockets.sockets.get(obs.playerId);
                    if (obsSocket) obsSocket.emit('voreLog', msg);
                }
            });
            sendSystemMsg(socket, messageSystem, msg);

            // [FIX] Broadcast Immediate Update (removed from contents)
            io.emit('playerStateUpdate', {
                [predator.playerId]: {
                    playerId: predator.playerId,
                    voreTypes: predator.voreTypes
                }
            });

        } catch (e) {
            log.error(`${logPrefix} Error handling releaseVoreTarget:`, e);
        }
    });

}; // End Export


// =========================================================================
// HELPERS
// =========================================================================

/**
 * Safely escapes special regular expression characters in a string.
 * @param {string} string - Input string to escape
 * @returns {string} Escaped regex pattern string
 */
function escapeRegExp(string) {
    return string ? string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

/**
 * Checks if an observer socket can see a target socket using Line-of-Sight & Shadow Raycasting.
 * Uses observer._visibleSet or delegates to serverLoop.checkVisibility.
 * @param {string} observerSocketId - Socket ID of the observer player
 * @param {string} targetSocketId - Socket ID of the target player being observed
 * @param {Object} [playersDict] - In-memory active players dictionary
 * @returns {boolean} True if the observer has line-of-sight visibility
 */
function isObserverVisible(observerSocketId, targetSocketId, playersDict) {
    if (!observerSocketId || !targetSocketId) return false;
    if (observerSocketId === targetSocketId) return true;

    if (playersDict && playersDict[observerSocketId]) {
        const observer = playersDict[observerSocketId];
        if (observer._visibleSet) {
            return observer._visibleSet.has(targetSocketId);
        }
    }

    try {
        const serverLoop = require('../server-loop');
        if (serverLoop && typeof serverLoop.checkVisibility === 'function') {
            return serverLoop.checkVisibility(observerSocketId, targetSocketId);
        }
    } catch {
        // Ignored
    }

    return true;
}

/**
 * Verifies physical reach (AABB bounding box) between two players.
 * @param {Object} p1 - Initiating player object
 * @param {Object} p2 - Target player object
 * @returns {boolean} True if within interaction reach
 */
function checkReach(p1, p2) {
    const p1X = p1.position.x + 30; // Center X
    const p1Y = p1.position.y;
    const reach = 48; // 1.5 tiles

    const pBox = { left: p1X - reach, right: p1X + reach, top: p1Y - reach, bottom: p1Y + reach };

    // Target Box (Approximate feet center)
    const tX = p2.position.x + 30;
    const tY = p2.position.y;
    // Simple Box intersection
    const tBox = { left: tX - 30, right: tX + 30, top: tY - 165, bottom: tY + 15 };

    return (pBox.left < tBox.right && pBox.right > tBox.left && pBox.top < tBox.bottom && pBox.bottom > tBox.top);
}

/**
 * Resolves a unified target zone ('arms', 'hands', 'legs', 'feet', 'groin', 'head', 'torso', 'tail')
 * to a concrete server BODY_PARTS anatomical limb ('leftArm' | 'rightArm', etc.).
 * @param {Object} targetPlayer - Target player object
 * @param {string} [targetZone='torso'] - Target anatomical area
 * @returns {string} Server body part string
 */
function resolveTargetLimb(targetPlayer, targetZone = 'torso') {
    const parts = (targetPlayer && targetPlayer.stats && targetPlayer.stats.bodyParts) ? targetPlayer.stats.bodyParts : null;

    switch (targetZone) {
        case 'arms': {
            const leftHp = parts?.leftArm?.hp ?? 100;
            const rightHp = parts?.rightArm?.hp ?? 100;
            if (!parts || leftHp === rightHp) {
                return Math.random() < 0.5 ? 'leftArm' : 'rightArm';
            }
            if (leftHp <= 0) return 'rightArm';
            if (rightHp <= 0) return 'leftArm';
            return Math.random() < 0.5 ? 'leftArm' : 'rightArm';
        }
        case 'hands': {
            const leftHp = parts?.leftHand?.hp ?? 100;
            const rightHp = parts?.rightHand?.hp ?? 100;
            if (!parts || leftHp === rightHp) {
                return Math.random() < 0.5 ? 'leftHand' : 'rightHand';
            }
            if (leftHp <= 0) return 'rightHand';
            if (rightHp <= 0) return 'leftHand';
            return Math.random() < 0.5 ? 'leftHand' : 'rightHand';
        }
        case 'legs': {
            const leftHp = parts?.leftLeg?.hp ?? 100;
            const rightHp = parts?.rightLeg?.hp ?? 100;
            if (!parts || leftHp === rightHp) {
                return Math.random() < 0.5 ? 'leftLeg' : 'rightLeg';
            }
            if (leftHp <= 0) return 'rightLeg';
            if (rightHp <= 0) return 'leftLeg';
            return Math.random() < 0.5 ? 'leftLeg' : 'rightLeg';
        }
        case 'feet': {
            const leftHp = parts?.leftFoot?.hp ?? 100;
            const rightHp = parts?.rightFoot?.hp ?? 100;
            if (!parts || leftHp === rightHp) {
                return Math.random() < 0.5 ? 'leftFoot' : 'rightFoot';
            }
            if (leftHp <= 0) return 'rightFoot';
            if (rightHp <= 0) return 'leftFoot';
            return Math.random() < 0.5 ? 'leftFoot' : 'rightFoot';
        }
        case 'groin':
            return 'torso'; // Groin maps to torso for damage tracking with stamina drain
        case 'head':
        case 'torso':
        case 'tail':
        default:
            return targetZone || 'torso';
    }
}


function handleFriendlyAction(io, socket, player, target, itemData, saveCharacter, messageSystem, targetZone = 'torso') {
    const activeHand = player.actionHands.activeHand || 'left';
    let heldItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

    // Fallback: If active hand item cannot be used or is empty, check the other hand if it holds a usable remedy item
    if (!heldItem || !heldItem.itemId) {
        const otherHand = activeHand === 'left' ? 'right' : 'left';
        const otherItem = otherHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
        if (otherItem && otherItem.itemId) {
            const otherDef = resolveItemDef(otherItem, itemData);
            if (otherDef && (otherDef.remedyType || otherDef.isDynamic || (otherItem.properties && otherItem.properties.isDynamic))) {
                heldItem = otherItem;
            }
        }
    }

    let itemUsed = false;

    if (heldItem) {
        // Try to use item
        const def = resolveItemDef(heldItem, itemData);
        if (def && (def.remedyType || def.isDynamic || (heldItem.properties && heldItem.properties.isDynamic)) && def.playerUse !== false) {
            log.info(`[Interaction] ${player.firstName} used ${heldItem.name || def.name} on ${getFullName(target)}.`);
            heldItem.targetBodyPart = resolveTargetLimb(target, targetZone);
            const result = performItemUse(io, socket, player, heldItem, itemData, false, null, saveCharacter, def, target);
            if (result) itemUsed = true;
        }
    }

    if (!itemUsed) {
        let msg = `${player.firstName} embraced ${getFullName(target)} in a warm embrace.`;
        switch (targetZone) {
            case 'head':
                msg = `${player.firstName} patted ${getFullName(target)}'s head and ruffled their hair.`;
                break;
            case 'hands':
                msg = `${player.firstName} shook ${getFullName(target)}'s hand warmly.`;
                break;
            case 'arms':
                msg = `${player.firstName} linked arms with ${getFullName(target)}.`;
                break;
            case 'tail':
                msg = `${player.firstName} gently petted and fluffed ${getFullName(target)}'s tail.`;
                break;
            case 'feet':
                msg = `${player.firstName} playfully tapped ${getFullName(target)}'s foot.`;
                break;
            case 'groin':
                msg = `${player.firstName} performed friendly intimate contact with ${getFullName(target)}.`;
                break;
            case 'torso':
            default:
                msg = `${player.firstName} embraced ${getFullName(target)} in a warm embrace.`;
                break;
        }

        log.info(`[FriendlyAction] ${player.firstName} -> ${getFullName(target)} (${targetZone}): ${msg}`);
        sendSystemMsg(socket, messageSystem, msg);
    }
}

function handleGrabbingAction(socket, player, target, messageSystem, targetZone = 'torso') {
    if (target.playerId === socket.id || player.playerId === target.playerId || (player._id && target._id && player._id.toString() === target._id.toString())) {
        sendSystemMsg(socket, messageSystem, "You cannot grab yourself.");
        return;
    }

    const resolvedLimb = resolveTargetLimb(target, targetZone);
    target.grabbedZone = targetZone;
    target.grabbedLimb = resolvedLimb;

    if (target.isHeld && target.heldBySocketId === socket.id) {
        // Upgrade to firm grip
        target.grippedFirmly = true;
        target.grippedBy = socket.id;
        target.struggleCount = 0;
        const msg = `${player.firstName} is gripping ${getFullName(target)} tightly by their ${targetZone}.`;
        log.info(`Player ${player.firstName} gripped firmly ${getFullName(target)} (${targetZone}).`);
        sendSystemMsg(socket, messageSystem, msg);
    } else {
        // First grab
        target.isHeld = true;
        target.heldBy = player._id;
        target.heldBySocketId = socket.id;
        target.grippedFirmly = false;
        target.struggleCount = 0;

        let msg = `${player.firstName} has taken hold of ${getFullName(target)}.`;
        switch (targetZone) {
            case 'head':
                msg = `${player.firstName} grabbed ${getFullName(target)} by the head and scruff!`;
                break;
            case 'arms':
                msg = `${player.firstName} grabbed ${getFullName(target)} firmly by their arm.`;
                break;
            case 'hands':
                msg = `${player.firstName} grabbed ${getFullName(target)} by the wrist and hand!`;
                break;
            case 'legs':
                msg = `${player.firstName} grabbed ${getFullName(target)} by their leg!`;
                break;
            case 'feet':
                msg = `${player.firstName} grabbed ${getFullName(target)} by their ankle!`;
                break;
            case 'tail':
                msg = `${player.firstName} caught and held ${getFullName(target)} by their tail!`;
                break;
            case 'groin':
                msg = `${player.firstName} grabbed hold of ${getFullName(target)} in a restraint hold!`;
                break;
            case 'torso':
            default:
                msg = `${player.firstName} took hold of ${getFullName(target)} around their waist and torso.`;
                break;
        }

        log.info(`Player ${player.firstName} grabbed ${getFullName(target)} (${targetZone}).`);
        sendSystemMsg(socket, messageSystem, msg);
    }
}

function handleHostileAction(io, socket, player, target, messageSystem, targetZone = 'torso', players = null) {
    const resolvedLimb = resolveTargetLimb(target, targetZone);
    let amount = 15;
    let msg = `${player.firstName || player.Username} struck ${getFullName(target)}'s ${targetZone}!`;

    const { applyDamage } = require('../server/mechanics/damage');
    const User = require('../model/User');

    switch (targetZone) {
        case 'head':
            amount = 20;
            msg = `${player.firstName || player.Username} struck ${getFullName(target)} directly in the head!`;
            break;
        case 'torso':
            amount = 15;
            msg = `${player.firstName || player.Username} punched ${getFullName(target)} in the chest and ribs!`;
            break;
        case 'arms':
            amount = 15;
            msg = `${player.firstName || player.Username} struck ${getFullName(target)}'s arm!`;
            break;
        case 'hands':
            amount = 15;
            msg = `${player.firstName || player.Username} crushed ${getFullName(target)}'s hand!`;
            break;
        case 'legs':
            amount = 15;
            msg = `${player.firstName || player.Username} kicked ${getFullName(target)}'s leg!`;
            break;
        case 'feet':
            amount = 15;
            msg = `${player.firstName || player.Username} stomped ${getFullName(target)}'s foot!`;
            break;
        case 'tail':
            amount = 15;
            msg = `${player.firstName || player.Username} yanked ${getFullName(target)}'s tail hard!`;
            break;
        case 'groin':
            amount = 15;
            msg = `${player.firstName || player.Username} delivered a low blow to ${getFullName(target)}!`;
            if (target.stats) {
                target.stats.stamina = Math.max(0, (target.stats.stamina || 100) - 35);
            }
            break;
        default:
            msg = `${player.firstName || player.Username} struck ${getFullName(target)} in the ${targetZone}!`;
            break;
    }

    const playersDict = players || { [target.playerId]: target, [player.playerId]: player };

    // Apply blunt/brute damage directly to the targeted anatomical area
    const outcome = applyDamage(playersDict, User, target.playerId, amount, player.playerId, 'brute', null, io, resolvedLimb);

    log.info(`[HostileAction] ${player.firstName} -> ${getFullName(target)} (${targetZone} -> ${resolvedLimb}). Damage: ${amount} brute. New Health: ${outcome.newHealth}`);
    sendSystemMsg(socket, messageSystem, msg);

    // Broadcast Real-Time Anatomy Stats Updates to both attacker & victim sockets
    if (socket) {
        socket.emit('anatomyStatsUpdate', { stats: player.stats });
    }
    if (io.sockets.sockets.get(target.playerId)) {
        io.sockets.sockets.get(target.playerId).emit('anatomyStatsUpdate', { stats: target.stats });
    }
}

function handleRelease(io, socket, players, messageSystem, saveCharacter, data) {
    // Release event can come from clicking 'Release' button or specific logic
    const { playerId } = data;
    const player = players[socket.id];
    // Find target (could be by ID in data)
    const targetPlayer = players[playerId];

    if (!player || !targetPlayer) return;

    // Only release if we are the ones holding or consuming them
    const isHolder = targetPlayer.heldBySocketId === socket.id;
    const isPredator = targetPlayer.consumedBy === player.playerId;

    if (isHolder || isPredator) {
        resetGrappleState(targetPlayer);
        untrackVictim(targetPlayer.playerId);
        resetVoreState(targetPlayer);

        if (player.holding === targetPlayer.socketId) player.holding = null;
        if (player.voreTypes) {
            // Remove from ANY vore content list
            const tName = getFullName(targetPlayer);
            player.voreTypes.forEach(vt => {
                if (vt.contents) {
                    const idx = vt.contents.indexOf(tName);
                    if (idx > -1) vt.contents.splice(idx, 1);
                }
            });
        }

        const msg = `${getFullName(player)} released ${getFullName(targetPlayer)}.`;
        log.info(`${player.firstName} RELEASED ${targetPlayer.firstName}`);
        io.emit('voreLog', msg);
        sendSystemMsg(socket, messageSystem, msg);

        // Update UI
        broadcastVoreStageUpdate(io, targetPlayer, player, 0, null);

        // [FIX] Broadcast Immediate Update (removed from contents)
        io.emit('playerStateUpdate', {
            [player.playerId]: {
                playerId: player.playerId,
                voreTypes: player.voreTypes
            }
        });

        saveState(saveCharacter, socket.id, targetPlayer.socketId);
    }
}

function handleExaminePlayer(socket, observer, target, messageSystem) {
    if (!target) return;

    log.info(`${observer.firstName} EXAMINED ${target.firstName}.`);

    let message = `You examined ${target.firstName}.`;

    // Check for Vore Description (if they contain someone?)
    if (target.voreTypes && target.voreTypes.length > 0) {
        const activeVoreType = target.voreTypes.find(vt => vt.contents && vt.contents.length > 0);
        if (activeVoreType && activeVoreType.examineMsgDescrip) {
            message += ` ${activeVoreType.examineMsgDescrip}`;
        }
    }

    sendSystemMsg(socket, messageSystem, message);

    // Send UI Data
    socket.emit('examinedInfo', {
        Identifier: 'player',
        firstName: target.firstName || 'Unknown',
        lastName: target.lastName || '',
        icDescrip: target.icDescrip || target.Description || 'No description available.',
    });
}

function handleExamineHeldItem(socket, observer, data, messageSystem) {
    // Find Item in Observer's hands
    let heldItem = null;
    if (observer.actionHands.leftNode && observer.actionHands.leftNode.uid === data.uniqueId) {
        heldItem = observer.actionHands.leftNode;
    } else if (observer.actionHands.rightNode && observer.actionHands.rightNode.uid === data.uniqueId) {
        heldItem = observer.actionHands.rightNode;
    }

    let name = data.name;
    let description = data.description || '';
    let flavor = '';

    if (heldItem) {
        const def = resolveItemDef(heldItem, itemData);
        name = heldItem.name || def.name || name;
        description = heldItem.description || def.description || description;
        flavor = heldItem.flavor || def.flavor || '';
    }

    const msg = `You examined ${name}. ${description}`;
    sendSystemMsg(socket, messageSystem, msg);

    socket.emit('examinedInfo', {
        Identifier: 'heldItem',
        name: name,
        description: description,
        flavor: flavor
    });
}

function handleExamineMapObject(socket, observer, data, messageSystem) {
    const msg = `You examined ${data.name}. ${data.description || ''}`;
    sendSystemMsg(socket, messageSystem, msg);

    socket.emit('examinedInfo', {
        Identifier: 'mapObject',
        name: data.name,
        description: data.description || ''
    });
}

// --- Utils ---

function getFullName(p) {
    return p.Username || (p.firstName + ' ' + p.lastName) || 'Unknown';
}

function sendSystemMsg(socket, messageSystem, text, targetRecipients = [], scope = 'local') {
    if (messageSystem) {
        messageSystem.sendSystemMessage('Interactional', text, null, targetRecipients, scope, socket);
    }
}

function resetGrappleState(p) {
    p.isHeld = false;
    p.heldBy = null;
    p.heldBySocketId = null;
    p.grippedFirmly = false;
    p.grippedBy = null;
    p.struggleCount = 0;
    p.holderPositionHistory = null;
}

function resetVoreState(p) {
    p.consumedBy = null;
    p.voreStage = 0;
    p.currentVoreNodeId = null;
    resetGrappleState(p);
}

/**
 * Broadcasts vore stage updates directly to prey/predator sockets, and to observers via Line-of-Sight.
 * @param {Object} io - Socket.io server instance
 * @param {Object} prey - Prey player object
 * @param {Object} predator - Predator player object
 * @param {number} stage - Current vore stage (0: Released, 1: Entrance, 2: Path, 3: Destination)
 * @param {string} nodeName - Name of current internal node (e.g. 'Stomach')
 */
function broadcastVoreStageUpdate(io, prey, predator, stage, nodeName) {
    let destinationMode = 'Hold';
    let nodeVoreTypeId = null;

    if (predator && predator.voreTypes && prey && prey.currentVoreNodeId) {
        const vt = predator.voreTypes.find(v => String(v.graphNodeId) === String(prey.currentVoreNodeId) || String(v._id) === String(prey.currentVoreNodeId) || String(v.id) === String(prey.currentVoreNodeId));
        if (vt) {
            destinationMode = vt.mode || 'Hold';
            nodeVoreTypeId = vt._id ? String(vt._id) : (vt.id ? String(vt.id) : String(vt.graphNodeId));
        }
    }

    const targetName = getFullName(prey);
    const predatorName = getFullName(predator);

    const payload = {
        playerId: prey ? prey.playerId : null,
        predatorId: predator ? predator.playerId : null,
        predatorName: predatorName,
        stage: stage,
        nodeName: nodeName,
        targetName: targetName,
        targetHp: (prey && prey.stats) ? Math.round(prey.stats.health) : 100,
        targetMaxHp: (prey && prey.stats) ? Math.round(prey.stats.maxHealth) : 100,
        targetStamina: (prey && prey.stats) ? Math.round(prey.stats.stamina) : 100,
        predatorStamina: (predator && predator.stats) ? Math.round(predator.stats.stamina) : 100,
        destinationMode: destinationMode,
        nodeVoreTypeId: nodeVoreTypeId,
        isClenching: predator ? (predator.isClenching || false) : false,
        isClenchSuppressed: prey ? (prey.isClenchSuppressed || false) : false,
        struggleCooldownUntil: prey ? (prey.struggleCooldownUntil || 0) : 0,
        struggleCooldownRemaining: prey ? (prey.struggleCooldownRemaining || 0) : 0
    };

    // 1. Guaranteed Direct Delivery to Protagonists (Prey & Predator)
    const preySocketId = prey ? (prey.socketId || prey.playerId) : null;
    const predSocketId = predator ? (predator.socketId || predator.playerId) : null;

    if (preySocketId && io.sockets.sockets.get(preySocketId)) {
        io.sockets.sockets.get(preySocketId).emit('voreStageUpdate', payload);
    }
    if (predSocketId && predSocketId !== preySocketId && io.sockets.sockets.get(predSocketId)) {
        io.sockets.sockets.get(predSocketId).emit('voreStageUpdate', payload);
    }

    // 2. Line-of-Sight / Shadow System Broadcast for Observers
    const predatorTargetId = predator ? (predator.socketId || predator.playerId) : null;
    if (predatorTargetId) {
        io.sockets.sockets.forEach((obsSocket, obsId) => {
            if (obsId === preySocketId || obsId === predSocketId) return;
            if (isObserverVisible(obsId, predatorTargetId)) {
                obsSocket.emit('voreStageUpdate', payload);
            }
        });
    }
}

function addPlayerToVoreContents(predator, destName, preyName, nodeId) {
    if (predator.voreTypes) {
        // Try by ID first, then destination name
        let voreTypeEntry = predator.voreTypes.find(v => v.graphNodeId === String(nodeId));
        if (!voreTypeEntry) {
            voreTypeEntry = predator.voreTypes.find(v => v.destination === destName);
        }

        if (voreTypeEntry) {
            if (!voreTypeEntry.contents) voreTypeEntry.contents = [];
            if (!voreTypeEntry.contents.includes(preyName)) {
                voreTypeEntry.contents.push(preyName);
            }
        } else {
            // Fallback (e.g. legacy save)
            const fallback = predator.voreTypes[0];
            if (fallback) {
                if (!fallback.contents) fallback.contents = [];
                if (!fallback.contents.includes(preyName)) {
                    fallback.contents.push(preyName);
                }
            }
        }
    }
}

function saveState(saveFunc, predSocketId, preySocketId) {
    if (saveFunc) {
        saveFunc(predSocketId);
        if (preySocketId) saveFunc(preySocketId);
    }
}

function getParsedAnatomy(player) {
    if (!player.anatomyData) return {};

    // Check Cache
    if (player._anatomyCache && player._anatomyCacheString === player.anatomyData) {
        return player._anatomyCache;
    }

    // Parse & Cache
    try {
        const parsed = JSON.parse(player.anatomyData);
        player._anatomyCache = parsed;
        player._anatomyCacheString = player.anatomyData; // Store source string to detect changes
        return parsed;
    } catch {
        return {};
    }
}

module.exports.handleFriendlyAction = handleFriendlyAction;
module.exports.handleGrabbingAction = handleGrabbingAction;
module.exports.handleHostileAction = handleHostileAction;
module.exports.resolveTargetLimb = resolveTargetLimb;
module.exports.broadcastVoreStageUpdate = broadcastVoreStageUpdate;
