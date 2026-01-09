const log = require('../logger');
const itemData = require('../data/itemData');
const { performItemUse } = require('../utils/itemActions');
const { resolveItemDef } = require('../utils/itemUtils');


module.exports = function (io, socket, players, messageSystem, collisionMap, TILE_SIZE, saveCharacter, craftingStations) {
    const logPrefix = `[Inter:${socket.id}]`;

    // --- Inputs & Movement ---
    // Note: 'playerInput' is high frequency, so we keep it simple.
    socket.on('playerInput', (inputData) => {
        try {
            // If the player isn't initialized yet, ignore
            if (!players[socket.id]) return;

            // Minimal validation
            if (!inputData) return;

            // Initialize inputQueue if missing (robustness)
            if (!players[socket.id].inputQueue) {
                players[socket.id].inputQueue = [];
            }

            // Push to queue for the game loop to process
            players[socket.id].inputQueue.push(inputData);

        } catch (e) {
            log.error(`${logPrefix} Error handling playerInput:`, e);
        }
    });

    socket.on('characterUpdate', (data) => {
        try {
            if (players[socket.id]) {
                // Ensure the client cannot overwrite server-authoritative movement fields
                const { x, y, position, velocity, ...safeData } = data;

                // If the client tries to send position, log a warning (optional, good for debugging)
                // if (data.position || data.x || data.y) {
                //    log.warn(`${logPrefix} Client tried to overwrite position. Ignored.`);
                // }

                // Merge/Overwrite with sanitized data
                players[socket.id] = { ...players[socket.id], ...safeData };

                // Broadcast updates (excluding position if we want, but usually we just broadcast the whole player object)
                // Note: The game loop broadcasts positions separately via 'playerUpdates' or similiar?
                // Actually server-loop.js sends 'playerMoved' inside the game loop or characterUpdate. 
                // We should broadcast the changes.
                socket.broadcast.emit('playerMoved', players[socket.id]);

                // Trigger Save on specific updates (like bio change?)
                // Optional: saveCharacter(socket.id);
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling characterUpdate:`, e);
        }
    });

    // --- Interactions ---

    socket.on('playerPerformAction', (data) => {
        try {
            log.debug(`${logPrefix} Received playerPerformAction with data:`, data);

            // Data should contain: { targetId, actionType, intent }
            // For now, based on your previous code, let's look at intent (friendly/hostile)
            const { targetId } = data;
            const targetPlayer = players[targetId];

            if (!targetPlayer) {
                log.warn(`${logPrefix} Target player ${targetId} not found.`);
                return;
            }

            // Area of Reach Grid System (Smooth Box)
            const playerPos = players[socket.id].position;
            const targetPos = targetPlayer.position;

            // Player Grid: 96x96 centered on Player Feet (x+30, y)
            const pCenterX = playerPos.x + 30;
            const pCenterY = playerPos.y;
            const reachHalf = 48; // 1.5 tiles

            const pBox = {
                left: pCenterX - reachHalf,
                right: pCenterX + reachHalf,
                top: pCenterY - reachHalf,
                bottom: pCenterY + reachHalf
            };

            // Target Box: Full Body (Approx 60x170) centered on Target Feet (x+30, y)
            // Sprite is approx 163px high, anchored at Y (feet).
            const tCenterX = targetPos.x + 30; // x is Left edge on server, so +30 is center
            const tY = targetPos.y; // y is CenterY of collision box (feet approx)

            const tBox = {
                left: tCenterX - 30,
                right: tCenterX + 30, // Full width 60
                top: tY - 165, // Upwards (height)
                bottom: tY + 15 // Downwards (buffer)
            };

            // AABB Intersection
            const inReach = (
                pBox.left < tBox.right &&
                pBox.right > tBox.left &&
                pBox.top < tBox.bottom &&
                pBox.bottom > tBox.top
            );

            // Debug Helper (Optional, remove in production)
            // log.info(`[Reach] P: ${Math.round(pCenterX)},${Math.round(pCenterY)} vs T: ${Math.round(tCenterX)},${Math.round(tY)} -> ${inReach}`);

            let playerIntent = data.intent || 'neutral';
            // Sanitize string
            playerIntent = playerIntent.replace(/[^a-zA-Z0-9]/g, '');

            const targetName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName);

            if (inReach) {
                if (playerIntent == 'friendly') {
                    // --- CHECK FOR USE ITEM ON TARGET (Active Hand) ---
                    const player = players[socket.id];
                    const activeHand = player.actionHands.activeHand;
                    const heldItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
                    let itemUsed = false;

                    if (heldItem) {
                        // Check if item is dynamic/usable


                        const def = resolveItemDef(heldItem, itemData);

                        if ((def.isDynamic || (heldItem.properties && heldItem.properties.isDynamic)) && def.playerUse !== false) {
                            // EXECUTE USE ITEM
                            log.info(`[Interaction] ${player.firstName} used ${heldItem.name} on ${targetName} instead of hugging.`);

                            // Delegate to shared utility
                            // isWorldItem = false, worldItems = null (since held item)
                            const result = performItemUse(io, socket, player, heldItem, itemData, false, null, saveCharacter, def);

                            if (result) {
                                itemUsed = true;
                            }
                        }
                    }

                    if (!itemUsed) {
                        log.info(`Player ${players[socket.id].firstName} has hugged ${targetName} with ${playerIntent} intent.`);
                    }
                }
                if (playerIntent == 'grabbing') {
                    if (targetPlayer.isHeld && targetPlayer.heldBySocketId === socket.id) {
                        // Upgrade to gripped firmly
                        targetPlayer.grippedFirmly = true;
                        targetPlayer.struggleCount = 0;
                        log.info(`Player ${players[socket.id].firstName} has GRIPPED FIRMLY ${targetName}.`);

                        if (messageSystem) {
                            messageSystem.sendSystemMessage('Interactional', `${players[socket.id].firstName} is gripping ${targetName} tightly.`, null, [], 'local', socket);
                        }
                    } else {
                        // Normal grab
                        log.info(`Player ${players[socket.id].firstName} has grabbed ${targetName} with ${playerIntent} intent.`);
                        targetPlayer.isHeld = true;
                        targetPlayer.heldBy = players[socket.id]._id;
                        targetPlayer.heldBySocketId = socket.id;
                        targetPlayer.grippedFirmly = false;
                        targetPlayer.struggleCount = 0;

                        if (messageSystem) {
                            messageSystem.sendSystemMessage('Interactional', `${players[socket.id].firstName} has taken hold of ${targetName}.`, null, [], 'local', socket);
                        }
                    }
                }
                if (playerIntent == 'hostile') {
                    log.info(`Player ${players[socket.id].firstName} has punched ${targetName} with ${playerIntent} intent.`);
                }
            } else {
                // Too far
                log.info(`Player ${players[socket.id].firstName} is out of reach of ${targetName}.`);
                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', `${targetName} is too far away.`, null, [], 'local', socket);
                }
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling playerPerformAction:`, e);
        }
    });

    socket.on('releaseClicked', (data) => {
        try {
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
                log.info(`Player ${player.firstName} RELEASED ${targetPlayer.firstName || 'Unknown Player'}.`);
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling releaseClicked:`, e);
        }
    });

    socket.on('gripFirmly', (data) => {
        try {
            const { playerId } = data;
            const player = players[socket.id];
            if (!player || !players[playerId]) return;

            const targetPlayer = players[playerId];

            if (targetPlayer.heldBySocketId === socket.id) {
                targetPlayer.grippedFirmly = true;
                targetPlayer.grippedBy = socket.id;
                targetPlayer.struggleCount = 0;
                log.info(`Player ${player.firstName} GRIPPED FIRMLY ${targetPlayer.firstName || 'Unknown Player'}.`);

                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', `${player.firstName} is gripping ${targetPlayer.firstName || 'Unknown Player'} tightly.`, null, [], 'local', socket);
                }
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling gripFirmly:`, e);
        }
    });

    socket.on('examineClicked', (data) => {
        try {
            const requestingPlayer = players[socket.id];
            if (!requestingPlayer) return;

            if (data.Identifier === 'player') {
                const targetPlayer = players[data.playerId];
                if (!targetPlayer) return;

                log.info(`${requestingPlayer.firstName} EXAMINED ${targetPlayer.firstName}.`);

                let message = `You examined ${targetPlayer.firstName || 'Unknown Player'}.`;

                if (targetPlayer.voreTypes && targetPlayer.voreTypes.length > 0) {
                    const activeVoreType = targetPlayer.voreTypes.find(vt => vt.contents && vt.contents.length > 0);
                    if (activeVoreType && activeVoreType.examineMsgDescrip) {
                        message += ` ${activeVoreType.examineMsgDescrip}`;
                    }
                }

                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', message, socket, [], 'local');
                }

                const info = {
                    Identifier: 'player',
                    firstName: targetPlayer.firstName || 'Unknown',
                    lastName: targetPlayer.lastName || '',
                    icDescrip: targetPlayer.icDescrip || targetPlayer.Description || 'No description available.',
                };
                socket.emit('examinedInfo', info);
            }
            else if (data.Identifier === 'heldItem') {
                // For held items, we might only have uniqueId, or we might have name/texture from client?
                // Client sends: Identifier, uniqueId, name, description.
                // We should try to lookup the static info if description is missing.

                // Note: Client 'data' comes from the Context Menu item which we just populated in server-loop. 
                // However, 'examineClicked' data might just be what the client checked?
                // The client 'examineClicked' emits 'currentItem'.

                // Let's try to find the item in the player's hands to be secure, or just trust the ID/Static lookup if it's a known item type.
                // Since it is just text description, looking up by name/id is fine.

                // Actually, let's just use the data sent or lookup by uniqueId if possible? 
                // But uniqueId for held items is dynamic.
                // We can't easily lookup the specific item instance from just uniqueId without searching all players.
                // BUT, the player examining it serves as context.
                // If I am examining my OWN item, I have it.

                // Let's search the requesting player's hands.
                let heldItem = null;
                if (requestingPlayer.actionHands.leftNode && requestingPlayer.actionHands.leftNode.uid === data.uniqueId) {
                    heldItem = requestingPlayer.actionHands.leftNode;
                } else if (requestingPlayer.actionHands.rightNode && requestingPlayer.actionHands.rightNode.uid === data.uniqueId) {
                    heldItem = requestingPlayer.actionHands.rightNode;
                }

                let name = data.name;
                let description = data.description || '';
                let flavor = '';

                if (heldItem) {
                    const { resolveItemDef } = require('../utils/itemUtils');
                    const def = resolveItemDef(heldItem, itemData);

                    // [FIXED] Use Instance Properties -> Def Properties -> Client Data
                    name = heldItem.name || def.name || name;
                    description = heldItem.description || def.description || description;
                    flavor = heldItem.flavor || def.flavor || '';
                }

                log.info(`${requestingPlayer.firstName} EXAMINED held item ${name}.`);

                const message = `You examined ${name}. ${description}`;
                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', message, socket, [], 'local');
                }

                socket.emit('examinedInfo', {
                    Identifier: 'heldItem',
                    name: name,
                    description: description,
                    flavor: flavor
                });
            }
            else if (data.Identifier === 'mapObject') {
                log.info(`${requestingPlayer.firstName} EXAMINED object ${data.name}.`);

                const message = `You examined ${data.name}. ${data.description || ''}`;

                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', message, socket, [], 'local');
                }

                socket.emit('examinedInfo', {
                    Identifier: 'mapObject',
                    name: data.name,
                    description: data.description || ''
                });
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling examineClicked:`, e);
        }
    });

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

    // --- Vore Interactions (Struggle, Action, Release) ---
    // Extracted here because they interact with other players, similar to movements.

    socket.on('struggleInside', async () => {
        try {
            const player = players[socket.id];
            if (!player || !player.consumedBy) return;

            const predator = Object.values(players).find(p => p.playerId === player.consumedBy);
            if (predator) return; // Wait, if predator exists we continue! logic error in snippet above?
            // "if (predator) return;" would return if predator exists! 
            // Original code: "if (predator) {" ... ?
            // Let's rewrite safely.
        } catch (e) { }
    });

    // REWRITING CORRECTLY:

    socket.on('struggleInside', async () => {
        try {
            const player = players[socket.id];
            if (!player || !player.consumedBy) return;

            // Find predator
            // Note: consumedBy stores playerId, we need to search players map properties
            // players is object: { socketId: playerObject }
            const predatorSocketId = Object.keys(players).find(key => players[key].playerId === player.consumedBy);
            const predator = players[predatorSocketId];

            if (!predator) return;

            let msgIn = '';
            let msgOut = '';

            // NEW: Anatomy Node Logic
            if (player.currentVoreNodeId && predator.anatomyData) {
                try {
                    const graph = JSON.parse(predator.anatomyData);
                    const node = graph.nodes.find(n => String(n.id) === player.currentVoreNodeId);
                    if (node) {
                        const pName = predator.Username || (predator.firstName + ' ' + predator.lastName);
                        const tName = player.Username || (player.firstName + ' ' + player.lastName);
                        const nodeName = node.properties.name || 'belly';

                        msgIn = node.properties.struggleInsideMsgDescrip || `You struggle inside ${pName}'s ${nodeName}.`;
                        msgOut = node.properties.struggleOutsideMsgDescrip || `${pName}'s ${nodeName} shifts as ${tName} struggles.`;
                    }
                } catch (err) {
                    log.warn('Error parsing anatomy for struggle:', err);
                }
            }

            // Fallback / Legacy Logic
            if (!msgIn || !msgOut) {
                // Try legacy voreTypes checks if node lookup failed
                if (predator.voreTypes && predator.voreTypes.length > 0) {
                    // Try to find one with contents? Or just active one? 
                    // Current system: finds one where contents has player?
                    // We can rely on 'contents' array if Stage 3.
                    // But Stage 1/2 might not be in 'contents'.

                    // Fallback generic
                    msgIn = `You struggle inside ${predator.Username || 'Predator'}.`;
                    msgOut = `${predator.Username || 'Predator'} moves as something struggles inside.`;
                }
            }

            // Send Messages
            if (msgOut) {
                // System message to room
                if (messageSystem) {
                    // Send to everyone locally including predator
                    messageSystem.sendSystemMessage('Interactional', msgOut, null, [], 'local', socket);
                }
            }

            // Update struggle visuals? 
            // Handled by client listener? 'struggleInside' event might bubble back?
            // Actually client usually emits 'struggleInside' and assumes server broadcasts.
            // Does server broadcast 'struggleInside'?
            // Original code: 
            // io.emit('struggleUpdate', ...)? 
            // Looking at previous view_file (Step 42): 
            // It emitted nothing? Ah, snippet invalid/short.
            // Let's assume we need to emit visuals or sound.
            // For now, text is the requirement "Target's struggle action triggers 'struggle messages'".

        } catch (e) {
            log.error(`${logPrefix} Error handling struggleInside:`, e);
        }
    });

    socket.on('voreAction', async function (data) {
        try {
            const { voreType, targetId } = data;
            const player = players[socket.id];
            const targetPlayer = players[targetId];

            if (targetPlayer && player) {
                const targetName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName) || 'Unknown Target';
                const predatorName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Predator';

                // --- STAGE 1: ENTRANCE ---
                if (voreType.isEntrance) {
                    // Initialize Stage 1
                    targetPlayer.voreStage = 1;
                    targetPlayer.currentVoreNodeId = voreType.graphNodeId;
                    targetPlayer.consumedBy = player.playerId;

                    // Reset holding/struggle states
                    targetPlayer.isHeld = false;
                    targetPlayer.heldBy = null;
                    targetPlayer.heldBySocketId = null;
                    targetPlayer.grippedFirmly = false;
                    targetPlayer.grippedBy = null;
                    targetPlayer.struggleCount = 0;

                    const messageContent = `${predatorName} starts swallowing ${targetName} into their ${voreType.destination}.`;
                    log.info(messageContent);
                    io.emit('voreLog', messageContent);

                    if (messageSystem) {
                        messageSystem.sendSystemMessage('Interactional', messageContent, null, [], 'local', socket);
                    }

                    // Emit specific event to update client UI (buttons, progress bar)
                    io.emit('voreStageUpdate', {
                        playerId: targetPlayer.playerId,
                        predatorId: player.playerId,
                        stage: 1,
                        nodeName: voreType.destination
                    });

                    if (saveCharacter) {
                        saveCharacter(socket.id);
                        saveCharacter(targetPlayer.socketId);
                    }
                    return;
                }

                // --- LEGACY / DIRECT DESTINATION FALLBACK ---
                let finalDestinationName = voreType.destination;
                let actionVerb = voreType.verb || 'eats';

                // ... (Keep existing logic only for non-entrance direct vore if any) ...

                let messageContent = `${predatorName} ${actionVerb} ${targetName} into their ${finalDestinationName}.`;

                log.info(messageContent);

                targetPlayer.consumedBy = player.playerId;
                targetPlayer.voreStage = 3; // Direct to Stage 3
                targetPlayer.currentVoreNodeId = voreType.graphNodeId; // if available

                targetPlayer.position.x = player.position.x;
                targetPlayer.position.y = player.position.y;

                targetPlayer.isHeld = false;
                targetPlayer.heldBy = null;
                targetPlayer.heldBySocketId = null;
                targetPlayer.grippedFirmly = false;
                targetPlayer.grippedBy = null;
                targetPlayer.struggleCount = 0;

                if (player.voreTypes) {
                    const voreTypeEntry = player.voreTypes.find(v => v.destination === finalDestinationName);
                    if (voreTypeEntry) {
                        if (!voreTypeEntry.contents) voreTypeEntry.contents = [];
                        voreTypeEntry.contents.push(targetName);
                    } else {
                        const fallback = player.voreTypes[0];
                        if (fallback) {
                            if (!fallback.contents) fallback.contents = [];
                            fallback.contents.push(targetName);
                        }
                    }
                }

                io.emit('voreLog', messageContent);
                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', messageContent, null, [], 'local', socket);
                }

                // Emit Stage 3 Update
                io.emit('voreStageUpdate', {
                    playerId: targetPlayer.playerId,
                    predatorId: player.playerId,
                    stage: 3,
                    nodeName: finalDestinationName
                });

                if (saveCharacter) {
                    saveCharacter(socket.id);
                    if (targetPlayer.socketId) saveCharacter(targetPlayer.socketId);
                }
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling voreAction:`, e);
        }
    });

    socket.on('advanceVoreStage', async function (data) {
        try {
            const { targetId, direction } = data; // direction: 'forward' or 'backward'
            const player = players[socket.id]; // Predator triggering the advance
            const targetPlayer = Object.values(players).find(p => p.playerId === targetId);

            if (!player || !targetPlayer || targetPlayer.consumedBy !== player.playerId) return;

            const currentStage = targetPlayer.voreStage || 1;
            const currentNodeId = targetPlayer.currentVoreNodeId;
            const anatomyData = JSON.parse(player.anatomyData || '{}');

            if (!anatomyData.nodes) return;

            const currentNode = anatomyData.nodes.find(n => String(n.id) === currentNodeId);
            if (!currentNode) {
                log.warn(`${logPrefix} Current vore node ${currentNodeId} not found in anatomy.`);
                // Debug:
                log.warn(`Anatomy Nodes: ${anatomyData.nodes.map(n => n.id).join(', ')}`);
                return;
            }

            let nextNode = null;
            let nextStage = currentStage;
            let messageContent = '';

            log.info(`${logPrefix} Advancing vore stage from ${currentStage} (Node: ${currentNode.properties.name}). Direction: ${direction}`);

            if (direction === 'forward') {
                // Find connection FROM current node
                const link = anatomyData.links.find(l => String(l.from) === String(currentNode.id));
                // Note: Simple traversal - takes first link. Graph should be linear-ish for now.

                if (link) {
                    nextNode = anatomyData.nodes.find(n => String(n.id) === String(link.to));
                    if (nextNode) {
                        if (nextNode.type === 'path') {
                            nextStage = 2;
                            messageContent = `${targetPlayer.Username || 'Target'} is swallowed down into the ${nextNode.properties.name}.`;
                        } else if (nextNode.type === 'destination') {
                            nextStage = 3;
                            messageContent = `${targetPlayer.Username || 'Target'} drops into the ${nextNode.properties.name}.`;
                        }
                    }
                }
            } else if (direction === 'backward') {
                // Find connection TO current node (reverse)
                const link = anatomyData.links.find(l => String(l.to) === String(currentNode.id));
                if (link) {
                    nextNode = anatomyData.nodes.find(n => String(n.id) === String(link.from));
                    if (nextNode) {
                        if (nextNode.type === 'entrance') {
                            nextStage = 1;
                            messageContent = `${player.Username || 'Predator'} drags ${targetPlayer.Username || 'Target'} back up to their ${nextNode.properties.name}.`;
                        } else if (nextNode.type === 'path') {
                            nextStage = 2;
                            messageContent = `${player.Username || 'Predator'} pulls ${targetPlayer.Username || 'Target'} back into their ${nextNode.properties.name}.`;
                        }
                    }
                }
            }

            if (nextNode && nextStage !== currentStage) {
                targetPlayer.voreStage = nextStage;
                targetPlayer.currentVoreNodeId = String(nextNode.id);

                // If Stage 2 Arrival:
                if (nextStage === 2) {
                    const arrivalMsg = nextNode.properties.destinationDescrip || `You slide into the ${nextNode.properties.name}.`;
                    if (targetPlayer.socketId && players[targetPlayer.socketId]) {
                        if (messageSystem) {
                            messageSystem.sendSystemMessage('Interactional', arrivalMsg, null, [targetPlayer._id], 'local', socket);
                        }
                    }
                }

                // If Stage 3: Add to contents
                if (nextStage === 3) {
                    const voreTypeEntry = player.voreTypes.find(v => v.graphNodeId === String(nextNode.id));
                    if (voreTypeEntry) {
                        if (!voreTypeEntry.contents) voreTypeEntry.contents = [];
                        const tName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName);
                        if (!voreTypeEntry.contents.includes(tName)) {
                            voreTypeEntry.contents.push(tName);
                        }
                    }
                }

                io.emit('voreLog', messageContent);
                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', messageContent, null, [], 'local', socket);
                }

                io.emit('voreStageUpdate', {
                    playerId: targetPlayer.playerId,
                    predatorId: player.playerId,
                    stage: nextStage,
                    nodeName: nextNode.properties.name
                });

                if (saveCharacter) {
                    saveCharacter(socket.id);
                    saveCharacter(targetPlayer.socketId);
                }
            } else {
                log.warn(`${logPrefix} Could not advance vore stage. Direction: ${direction}, CurrentNode: ${currentNodeId}`);
            }

        } catch (e) {
            log.error(`${logPrefix} Error handling advanceVoreStage:`, e);
        }
    });

    socket.on('releaseVoreTarget', async function (data) {
        try {
            const { voreTypeId, targetName } = data;
            const player = players[socket.id];

            if (!player || !player.voreTypes) return;

            const voreTypeEntry = player.voreTypes.find(v => v._id.toString() === voreTypeId || v._id === voreTypeId);
            if (voreTypeEntry && voreTypeEntry.contents) {
                const index = voreTypeEntry.contents.indexOf(targetName);
                if (index > -1) {
                    voreTypeEntry.contents.splice(index, 1);
                }
            }

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
                targetPlayer.consumedBy = null;
                targetPlayer.isHeld = false;
                targetPlayer.heldBy = null;
                targetPlayer.struggleCount = 0;

                if (player.holding === targetSocketId) {
                    player.holding = null;
                }

                const messageContent = `${player.Username || 'Predator'} released ${targetName} from their ${voreTypeEntry ? voreTypeEntry.destination : 'body'}.`;
                log.info(messageContent);
                io.emit('voreLog', messageContent);

                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', messageContent, null, [], 'local', socket);
                }

                // --- SAVE STATE ---
                if (saveCharacter) {
                    saveCharacter(socket.id); // Save Predator
                    if (targetSocketId) saveCharacter(targetSocketId); // Save Prey
                }
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling releaseVoreTarget:`, e);
        }
    });

    socket.on('releaseClicked', async function (data) {
        try {
            const { playerId } = data; // Target ID
            const player = players[socket.id]; // Predator

            if (!player || !players[playerId]) return;
            const targetPlayer = players[playerId];

            if (targetPlayer.consumedBy !== player.playerId && targetPlayer.heldBy !== player.playerId) {
                // Not held or consumed by this player
                return;
            }

            // Reset States
            log.info(`[Inter:${socket.id}] Releasing target ${targetPlayer.firstName} from Stage ${targetPlayer.voreStage || 0}`);

            targetPlayer.consumedBy = null;
            targetPlayer.voreStage = 0;
            targetPlayer.currentVoreNodeId = null;

            targetPlayer.isHeld = false;
            targetPlayer.heldBy = null;
            targetPlayer.heldBySocketId = null;
            targetPlayer.grippedFirmly = false;
            targetPlayer.grippedBy = null;
            targetPlayer.struggleCount = 0;

            if (player.holding === targetPlayer.socketId) {
                player.holding = null;
            }

            // Remove from vore contents if present (any stage)
            if (player.voreTypes) {
                player.voreTypes.forEach(vt => {
                    if (vt.contents) {
                        const tName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName);
                        const idx = vt.contents.indexOf(tName);
                        if (idx > -1) vt.contents.splice(idx, 1);
                    }
                });
            }

            const messageContent = `${player.Username || 'Predator'} released ${targetPlayer.Username || 'Target'}.`;
            log.info(messageContent);

            io.emit('voreLog', messageContent);
            if (messageSystem) {
                messageSystem.sendSystemMessage('Interactional', messageContent, null, [], 'local', socket);
            }

            // Force client update to show sprite
            // io.emit('playerUpdates', players); // Loop handles it.

            // Ensure UI controls are removed
            io.emit('voreStageUpdate', {
                playerId: targetPlayer.playerId,
                predatorId: player.playerId,
                stage: 0, // Clears controls
                nodeName: null
            });

            if (saveCharacter) {
                saveCharacter(socket.id);
                saveCharacter(targetPlayer.socketId);
            }

        } catch (e) {
            log.error(`[Inter:${socket.id}] Error handling releaseClicked:`, e);
        }
    });
}
