const log = require('../logger');

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
                        for (const [k, p] of Object.entries(parts)) {
                            if (p.hp < worstHp) {
                                worstHp = p.hp;
                                worstKey = k;
                            }
                        }
                        bodyPart = worstKey;
                    } else if (def.remedyType === 'salve' || def.remedyType === 'ointment') {
                        let worstKey = 'torso';
                        let maxBurn = -1;
                        for (const [k, p] of Object.entries(parts)) {
                            if ((p.burn || 0) > maxBurn) {
                                maxBurn = p.burn || 0;
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

                const recipientId = recipient.playerId || recipient.socketId || (socket ? socket.id : null);
                const healerId = socket ? socket.id : null;

                // Emit real-time anatomy stats updates & system chat to recipient
                if (io && recipientId && io.sockets.sockets.get(recipientId)) {
                    io.sockets.sockets.get(recipientId).emit('anatomyStatsUpdate', { stats: recipient.stats });
                    io.sockets.sockets.get(recipientId).emit('chatMessage', { channel: 'System', text: outcome.message, timestamp: new Date() });
                }

                // If healer is different from recipient, emit chat message to healer as well
                if (socket && healerId && healerId !== recipientId) {
                    socket.emit('chatMessage', { channel: 'System', text: outcome.message, timestamp: new Date() });
                }

                // Broadcast playerStateUpdate for recipient and persist to DB
                if (io && recipientId) {
                    io.emit('playerStateUpdate', { [recipientId]: getSafePlayerState(recipient) });
                }
                if (saveCharacter && recipientId) {
                    saveCharacter(recipientId);
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
                            if (io && socket && socket.id) io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
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
                        // Remove from hands
                        if (player.actionHands.leftNode === item) player.actionHands.leftNode = null;
                        if (player.actionHands.rightNode === item) player.actionHands.rightNode = null;

                        if (io && socket && socket.id) io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
                        if (saveCharacter && socket && socket.id) saveCharacter(socket.id);
                    }
                }
            } else {
                // Not yet exhausted - just update
                if (isWorldItem) {
                    if (io) io.emit('itemUpdated', item);
                } else {
                    if (io && socket && socket.id) io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
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

/**
 * Creates a safe, non-circular DTO of the player for socket emission.
 */
const getSafePlayerState = (player) => {
    // 1. Shallow copy
    const safe = { ...player };

    // 2. Remove dangerous/circular fields
    delete safe.socket; // The socket instance (huge circular structure)
    delete safe.inputQueue; // High frequency queue
    delete safe.saveTimer; // Timeout object

    // 3. Remove server-only fields if necessary
    // delete safe.lastSaveTime;

    return safe;
};

module.exports = { performItemUse, getSafePlayerState };
