/**
 * @fileoverview itemActions.js - Consumable Item Actions & Socket State Sanitization
 * 
 * @description
 * Handles item use transactions (consumption, charge tracking, empty container transformation,
 * item destruction, and remedy mechanics integration) and provides safe Data Transfer Object (DTO)
 * generation for Socket.io state emissions.
 * 
 * Triggered by:
 * - Client WebSocket `useItemClicked` events in inventoryHandlers.js
 * - Player interaction events in interactionHandlers.js
 * - Server loop state update broadcasts in server-loop.js
 */

const log = require('../logger');

/**
 * Creates a safe, non-circular DTO of the player for socket emission.
 * OPTIMIZATION: Uses object destructuring to preserve V8 hidden class shape and avoid dynamic `delete` operator overhead.
 * 
 * @param {Object} player - The player entity object
 * @returns {Object|null} Clean DTO object safe for JSON serialization
 */
const getSafePlayerState = (player) => {
    if (!player) return null;
    const { socket, inputQueue, saveTimer, ...safe } = player;
    return safe;
};

/**
 * Internal helper to broadcast player state updates safely and efficiently.
 * OPTIMIZATION: Emits directly to actor and broadcasts to observers to prevent full-server socket packet flooding.
 * 
 * @param {Object} io - Socket.io server instance
 * @param {Object} socket - Acting player's socket instance
 * @param {Object} playerTarget - Target player object to broadcast
 */
const emitPlayerState = (io, socket, playerTarget) => {
    if (!playerTarget) return;
    const targetId = playerTarget.socketId || playerTarget.socket?.id || (socket ? socket.id : null);
    const safeState = getSafePlayerState(playerTarget);
    if (!safeState) return;
    
    const payload = { [targetId || 'actor']: safeState };
    
    if (socket && targetId && socket.id === targetId) {
        socket.emit('playerStateUpdate', payload);
        socket.broadcast.emit('playerStateUpdate', payload);
    } else if (io) {
        io.emit('playerStateUpdate', payload);
    }
};

/**
 * Performs the "Use" action on an item (Consume/Drink/Etc).
 * Handles usage increment, exhaustion, transformation (returnOnEmpty), and destruction.
 * 
 * @param {Object} io - Socket.io instance
 * @param {Object} socket - The player's socket (for ID)
 * @param {Object} player - The player object
 * @param {Object} item - The item instance being used
 * @param {Object} itemData - Global item definition map
 * @param {boolean} isWorldItem - True if item is on the ground
 * @param {Array} worldItems - Global world items array
 * @param {Function} saveCharacter - Function to save player data
 * @param {Object} [preResolvedDef] - Optional: already resolved item definition to avoid lookup
 * @param {Object} [targetPlayer] - Optional: target player receiving the item effect
 * @returns {boolean} true if the item was used, false otherwise
 */
const performItemUse = (io, socket, player, item, itemData, isWorldItem, worldItems, saveCharacter, preResolvedDef = null, targetPlayer = null) => {
    try {
        const def = preResolvedDef || itemData[item.itemId] || { maxUses: 10 };
        const max = def.maxUses || 10;
        const recipient = targetPlayer || player;

        // Initialize count if missing
        if (item.timesUsed === undefined) item.timesUsed = 0;

        if (item.timesUsed < max) {
            // Apply Remedy Effect if configured on Item Definition
            if (def.remedyType) {
                const { applyRemedy } = require('../server/mechanics/remedies');
                let bodyPart = item.targetBodyPart;
                if (!bodyPart && recipient.stats && recipient.stats.bodyParts) {
                    const parts = recipient.stats.bodyParts;
                    if (def.remedyType === 'bandage' || def.remedyType === 'gauze') {
                        let worstKey = 'torso';
                        let worstHp = 100;
                        for (const k in parts) {
                            if (!Object.prototype.hasOwnProperty.call(parts, k)) continue;
                            const p = parts[k];
                            if (p && typeof p.hp === 'number' && p.hp < worstHp) {
                                worstHp = p.hp;
                                worstKey = k;
                            }
                        }
                        bodyPart = worstKey;
                    } else if (def.remedyType === 'salve' || def.remedyType === 'ointment') {
                        let worstKey = 'torso';
                        let maxBurn = -1;
                        for (const k in parts) {
                            if (!Object.prototype.hasOwnProperty.call(parts, k)) continue;
                            const p = parts[k];
                            if (p && typeof p.burn === 'number' && p.burn > maxBurn) {
                                maxBurn = p.burn;
                                worstKey = k;
                            }
                        }
                        bodyPart = worstKey;
                    } else {
                        bodyPart = 'torso';
                    }
                }

                const outcome = applyRemedy(recipient, def.remedyType, bodyPart || 'torso');
                delete item.targetBodyPart;

                // If remedy failed (no relevant injury on target body part), do NOT consume an item use charge!
                if (outcome && outcome.success === false) {
                    if (socket) {
                        socket.emit('chatMessage', { channel: 'System', text: outcome.message, timestamp: new Date() });
                    }
                    return false;
                }

                // Remedy succeeded -> consume use charge
                item.timesUsed++;
                log.info(`Player ${player.Username} used item ${item.name} on ${recipient.Username} (${bodyPart}) (Uses: ${item.timesUsed}/${max})`);

                const recipientSocketId = recipient.socketId || recipient.socket?.id || (socket ? socket.id : null);
                const healerId = socket ? socket.id : null;

                // Emit real-time anatomy stats updates & system chat to recipient
                if (io && recipientSocketId) {
                    const recipientSocket = io.sockets.sockets.get(recipientSocketId);
                    if (recipientSocket) {
                        recipientSocket.emit('anatomyStatsUpdate', { stats: recipient.stats });
                        recipientSocket.emit('chatMessage', { channel: 'System', text: outcome.message, timestamp: new Date() });
                    }
                }

                // If healer is different from recipient, emit chat message to healer as well
                if (socket && healerId && healerId !== recipientSocketId) {
                    socket.emit('chatMessage', { channel: 'System', text: outcome.message, timestamp: new Date() });
                }

                // Broadcast playerStateUpdate for recipient and persist to DB
                emitPlayerState(io, socket, recipient);
                if (saveCharacter && recipientSocketId) {
                    saveCharacter(recipientSocketId);
                }
            } else {
                item.timesUsed++;
                log.info(`Player ${player.Username} used item ${item.name} (Uses: ${item.timesUsed}/${max})`);
            }

            // Check for Exhaustion IMMEDIATELY after use
            if (item.timesUsed >= max) {
                // Check if it should return an empty container
                if (def.returnOnEmpty) {
                    const emptyId = def.returnOnEmpty;
                    const emptyDef = itemData[emptyId];

                    if (emptyDef) {
                        log.info(`Player ${player.Username} finished ${item.name}, turning it into ${emptyDef.name}`);

                        // Transform item
                        item.itemId = emptyId;
                        item.name = emptyDef.name;
                        item.texture = emptyDef.texture;
                        item.icon = emptyDef.icon;
                        item.description = emptyDef.description;

                        // Clear dynamic properties
                        delete item.maxUses;
                        delete item.timesUsed;
                        delete item.isDynamic;
                        delete item.returnOnEmpty;
                        delete item.playerUse;
                        // Keep position/uid

                        if (isWorldItem) {
                            io.emit('itemUpdated', item);
                        } else {
                            emitPlayerState(io, socket, player);
                            if (saveCharacter && socket && socket.id) saveCharacter(socket.id);
                        }
                    }
                } else {
                    // Default Behavior: Consume/Destroy
                    log.info(`Player ${player.Username} finished and consumed ${item.name}.`);

                    if (isWorldItem) {
                        const idx = worldItems.indexOf(item);
                        if (idx > -1) {
                            worldItems.splice(idx, 1);
                            io.emit('itemRemoved', item.uid);
                        }
                    } else {
                        // Remove from hands with optional chaining safety guard
                        if (player.actionHands?.leftNode === item) player.actionHands.leftNode = null;
                        if (player.actionHands?.rightNode === item) player.actionHands.rightNode = null;

                        emitPlayerState(io, socket, player);
                        if (saveCharacter && socket && socket.id) saveCharacter(socket.id);
                    }
                }
            } else {
                // Not yet exhausted - just update
                if (isWorldItem) {
                    if (io) io.emit('itemUpdated', item);
                } else {
                    emitPlayerState(io, socket, player);
                    if (saveCharacter && socket && socket.id) saveCharacter(socket.id);
                }
            }
            return true;
        } else {
            log.info(`Player ${player.Username} tried to use ${item.name} but it is empty.`);
            return false;
        }
    } catch (e) {
        log.error(`Error in performItemUse for ${player.Username}:`, e);
        return false;
    }
};

module.exports = { performItemUse, getSafePlayerState };

