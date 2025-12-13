const log = require('../logger');

module.exports = function (io, socket, players, messageSystem, collisionMap, TILE_SIZE) {
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

            // Simple distance check
            const dx = players[socket.id].position.x - targetPlayer.position.x;
            const dy = players[socket.id].position.y - targetPlayer.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            let playerIntent = data.intent || 'neutral';
            // Sanitize string
            playerIntent = playerIntent.replace(/[^a-zA-Z0-9]/g, '');

            const targetName = targetPlayer.Username || (targetPlayer.firstName + ' ' + targetPlayer.lastName);

            if (distance < 100) {
                if (playerIntent == 'friendly') {
                    log.info(`Player ${players[socket.id].firstName} has hugged ${targetName} with ${playerIntent} intent.`);
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
                if (playerIntent == 'grabbing') {
                    log.info(`Player ${players[socket.id].firstName} is too far away to grab ${targetName}.`);
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
            if (predator) {
                const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';
                const predatorName = predator.Username || (predator.firstName + ' ' + predator.lastName) || 'Unknown Predator';

                let activeVoreType = null;
                if (predator.voreTypes) {
                    activeVoreType = predator.voreTypes.find(vt => vt.contents && vt.contents.includes(playerName));
                    if (!activeVoreType && predator.voreTypes.length > 0) {
                        activeVoreType = predator.voreTypes[0];
                    }
                }

                if (activeVoreType) {
                    if (activeVoreType.struggleInsideMsgDescrip && messageSystem) {
                        messageSystem.sendSystemMessage('Interactional', activeVoreType.struggleInsideMsgDescrip, socket, [], 'local');
                    }

                    if (activeVoreType.struggleOutsideMsgDescrip && messageSystem) {
                        messageSystem.sendSystemMessage('Interactional', activeVoreType.struggleOutsideMsgDescrip, null, [player._id ? player._id.toString() : ''], 'local', socket);
                    }
                } else {
                    const msg = `${playerName} struggles inside ${predatorName}!`;
                    log.info(msg);
                    io.emit('voreLog', msg);
                }
            }
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

                const messageContent = `${predatorName} ${voreType.verb} ${targetName} into their ${voreType.destination}.`;

                log.info(messageContent);

                targetPlayer.consumedBy = player.playerId;
                targetPlayer.position.x = player.position.x;
                targetPlayer.position.y = player.position.y;

                targetPlayer.isHeld = false;
                targetPlayer.heldBy = null;
                targetPlayer.heldBySocketId = null;
                targetPlayer.grippedFirmly = false;
                targetPlayer.grippedBy = null;
                targetPlayer.struggleCount = 0;

                if (player.voreTypes) {
                    const voreTypeEntry = player.voreTypes.find(v => v.destination === voreType.destination);
                    if (voreTypeEntry) {
                        if (!voreTypeEntry.contents) voreTypeEntry.contents = [];
                        voreTypeEntry.contents.push(targetName);
                    }
                }

                io.emit('voreLog', messageContent);

                if (messageSystem) {
                    messageSystem.sendSystemMessage('Interactional', messageContent, null, [], 'local', socket);
                }
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling voreAction:`, e);
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
            }
        } catch (e) {
            log.error(`${logPrefix} Error handling releaseVoreTarget:`, e);
        }
    });
}
