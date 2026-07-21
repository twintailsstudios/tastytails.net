const log = require('../logger');
const itemData = require('../data/itemData');
const resourceNodeDefs = require('../data/resourceNodeData');
const { performItemUse } = require('../utils/itemActions');
const { resolveItemDef } = require('../utils/itemUtils');
const { trackVictim, untrackVictim } = require('../server/mechanics/digestion');

/**
 * Interaction Handlers
 * 
 * This module handles:
 * 1. Player Input (Movement) and Updates
 * 2. Interaction Events (Clicking other players, examining)
 * 3. Vore Mechanics (Eating, Struggling, Digesting, Releasing)
 * 
 * Reorganized for readability.
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
        log.info(`${logPrefix} Received playerPerformAction from ${socket.id} with intent: ${data.intent}`);
        try {
            const { targetId, intent } = data;
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
                handleFriendlyAction(io, socket, player, targetPlayer, itemData, saveCharacter, messageSystem);
            } else if (sanitizedIntent === 'grabbing') {
                handleGrabbingAction(socket, player, targetPlayer, messageSystem);
            } else if (sanitizedIntent === 'hostile') {
                handleHostileAction(socket, player, targetPlayer);
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
                const animal = activeAnimals[id];
                if (!animal) return;

                // Distance Check (Server Side specific for Animals)
                // Animals have x/y. Player has position.x/y
                const dist = Math.sqrt(Math.pow(player.position.x - animal.x, 2) + Math.pow(player.position.y - animal.y, 2));
                if (dist > 120) { // Slight buffer over client 100
                    return;
                }

                // Interaction Logic
                if (action === 'gather') {
                    // Check if already sheared
                    if (animal.isSheared) {
                        sendSystemMsg(socket, messageSystem, `The ${animal.properties.name || 'sheep'} has no wool left.`);
                        return;
                    }

                    // [NEW] Check for Sheers
                    const currentActiveHand = data.hand || player.actionHands.activeHand || 'right'; // 'left' or 'right'
                    let hasSheers = false;

                    if (currentActiveHand === 'left') {
                        if (player.actionHands.leftNode && player.actionHands.leftNode.itemId === 'tool_sheers') {
                            hasSheers = true;
                        }
                    } else if (currentActiveHand === 'right') {
                        if (player.actionHands.rightNode && player.actionHands.rightNode.itemId === 'tool_sheers') {
                            hasSheers = true;
                        }
                    }

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
                        icon: 'fa-apple-whole', // Match itemData (or update if needed)
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
                        // Fallback should not happen if wired correctly
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
                    // Replace Name with You
                    // We need to be careful with verb conjugation: "eats" -> "eat"
                    // Simple heuristic: "s" suffix removal? 
                    // Let's replace "PredName verb" with "You verb-s"
                    const nameRegex = new RegExp(`\\b${predName}\\b`, 'gi');
                    processed = processed.replace(nameRegex, 'You');

                    // Attempt verb fix: "You eats" -> "You eat"
                    // This is brittle but requested.
                    // Replace "You [word]s" with "You [word]"
                    // Or specifically target the known verb
                    const verbRegex = new RegExp(`\\bYou ${verb}\\b`, 'gi');
                    // if verb ends in 's', remove it.
                    if (verb.endsWith('s')) {
                        const baseVerb = verb.slice(0, -1);
                        processed = processed.replace(verbRegex, `You ${baseVerb}`);
                    }

                    // Fix "into their" -> "into your"
                    processed = processed.replace(/\btheir\b/gi, 'your');
                }

                // If isPrey, "Vorny eats Jacky" -> "Vorny eats you"
                if (isPrey) {
                    const nameRegex = new RegExp(`\\b${preyName}\\b`, 'gi');
                    processed = processed.replace(nameRegex, 'you');
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

            // Log to Global Vore Log (History) - Keeps original 3rd person
            // OPTIMIZED: Spatial Broadcast for Vore Log (1000px range)
            if (getPlayersInRange) {
                const observers = getPlayersInRange(predator.position.x, predator.position.y, 1000);
                observers.forEach(obs => {
                    const obsSocket = io.sockets.sockets.get(obs.playerId);
                    if (obsSocket) obsSocket.emit('voreLog', externalMsg);
                });
            } else {
                io.emit('voreLog', externalMsg);
            }

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
                        const nameRegex = new RegExp(`\\b${preyName}\\b`, 'gi');
                        processed = processed.replace(nameRegex, 'you');
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

                    // OPTIMIZED: Spatial Broadcast for Vore Log
                    if (getPlayersInRange) {
                        const observers = getPlayersInRange(predator.position.x, predator.position.y, 1000);
                        observers.forEach(obs => {
                            const obsSocket = io.sockets.sockets.get(obs.playerId);
                            if (obsSocket) obsSocket.emit('voreLog', externalMsg);
                        });
                    } else {
                        io.emit('voreLog', externalMsg);
                    }
                }

                broadcastVoreStageUpdate(io, prey, predator, nextStage, nextNode.properties.name);
                saveState(saveCharacter, socket.id, prey.socketId);
            }

        } catch (e) {
            log.error(`${logPrefix} Error handling advanceVoreStage:`, e);
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
                    const nameRegex = new RegExp(`\\b${predName}\\b`, 'gi');
                    processed = processed.replace(nameRegex, 'You');
                    processed = processed.replace(/\btheir\b/gi, 'your');
                    // "Your gut churns" logic is handled by standard tag replacement usually
                    // but if the user writes "<pred>'s gut", it becomes "You's gut".
                    // Fix "You's" -> "Your"
                    processed = processed.replace(/\bYou's\b/gi, 'Your');
                }
                if (isPrey) {
                    const nameRegex = new RegExp(`\\b${preyName}\\b`, 'gi');
                    processed = processed.replace(nameRegex, 'you');
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

                // OPTIMIZED: Spatial Broadcast for Vore Log
                if (getPlayersInRange) {
                    const observers = getPlayersInRange(predator.position.x, predator.position.y, 1000);
                    observers.forEach(obs => {
                        const obsSocket = io.sockets.sockets.get(obs.playerId);
                        if (obsSocket) obsSocket.emit('voreLog', externalMsg);
                    });
                } else {
                    io.emit('voreLog', externalMsg);
                }
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

            const preySocket = socket;
            const predSocket = io.sockets.sockets.get(predSocketId);

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

            if (prey) {
                untrackVictim(prey.playerId); // Stop digestion
                resetVoreState(prey);
                if (predator.holding === prey.socketId) predator.holding = null;

                const msg = `${getFullName(predator)} released ${targetName} from their ${voreTypeEntry ? voreTypeEntry.destination : 'body'}.`;
                log.info(msg);

                // OPTIMIZED: Spatial Broadcast for Vore Log
                if (getPlayersInRange) {
                    const observers = getPlayersInRange(predator.position.x, predator.position.y, 1000);
                    observers.forEach(obs => {
                        const obsSocket = io.sockets.sockets.get(obs.playerId);
                        if (obsSocket) obsSocket.emit('voreLog', msg);
                    });
                } else {
                    io.emit('voreLog', msg);
                }
                sendSystemMsg(socket, messageSystem, msg);

                // [FIX] Broadcast Immediate Update (removed from contents)
                io.emit('playerStateUpdate', {
                    [predator.playerId]: {
                        playerId: predator.playerId,
                        voreTypes: predator.voreTypes
                    }
                });

                saveState(saveCharacter, socket.id, prey.socketId);
            }

        } catch (e) {
            log.error(`${logPrefix} Error handling releaseVoreTarget:`, e);
        }
    });

}; // End Export


// =========================================================================
// HELPERS
// =========================================================================

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

function handleFriendlyAction(io, socket, player, target, itemData, saveCharacter, messageSystem) {
    const activeHand = player.actionHands.activeHand;
    const heldItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
    let itemUsed = false;

    if (heldItem) {
        // Try to use item
        const def = resolveItemDef(heldItem, itemData);
        if ((def.isDynamic || (heldItem.properties && heldItem.properties.isDynamic)) && def.playerUse !== false) {
            log.info(`[Interaction] ${player.firstName} used ${heldItem.name} on ${getFullName(target)}.`);
            const result = performItemUse(io, socket, player, heldItem, itemData, false, null, saveCharacter, def);
            if (result) itemUsed = true;
        }
    }

    if (!itemUsed) {
        log.info(`Player ${player.firstName} hugged ${getFullName(target)}.`);
        // Note: No system message for hugs? Original code didn't have one, just log. 
        // Adding one for feedback might be nice, but sticking to legacy behavior:
    }
}

function handleGrabbingAction(socket, player, target, messageSystem) {
    if (target.isHeld && target.heldBySocketId === socket.id) {
        // Upgrade to firm grip
        target.grippedFirmly = true;
        target.struggleCount = 0;
        log.info(`Player ${player.firstName} gripped firmly ${getFullName(target)}.`);
        sendSystemMsg(socket, messageSystem, `${player.firstName} is gripping ${getFullName(target)} tightly.`);
    } else {
        // First grab
        target.isHeld = true;
        target.heldBy = player._id;
        target.heldBySocketId = socket.id;
        target.grippedFirmly = false;
        target.struggleCount = 0;

        log.info(`Player ${player.firstName} grabbed ${getFullName(target)}.`);
        sendSystemMsg(socket, messageSystem, `${player.firstName} has taken hold of ${getFullName(target)}.`);
    }
}

function handleHostileAction(socket, player, target) {
    log.info(`Player ${player.firstName} punched ${getFullName(target)}.`);
    // TODO: Add damage logic here or system message? Original code just logged.
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

function broadcastVoreStageUpdate(io, prey, predator, stage, nodeName) {
    io.emit('voreStageUpdate', {
        playerId: prey.playerId,
        predatorId: predator.playerId,
        stage: stage,
        nodeName: nodeName
    });
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
