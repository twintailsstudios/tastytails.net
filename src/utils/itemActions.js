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
const performItemUse = (io, socket, player, item, itemData, isWorldItem, worldItems, saveCharacter, preResolvedDef = null) => {
    try {
        const def = preResolvedDef || itemData[item.itemId] || { maxUses: 10 };
        const max = def.maxUses || 10;

        // Initialize count if missing
        if (item.timesUsed === undefined) item.timesUsed = 0;

        if (item.timesUsed < max) {
            item.timesUsed++;
            log.info(`Player ${player.Username} used item ${item.name} (Uses: ${item.timesUsed}/${max})`);

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
                            io.emit('playerStateUpdate', { [socket.id]: player });
                            saveCharacter(socket.id);
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

                        io.emit('playerStateUpdate', { [socket.id]: player });
                        saveCharacter(socket.id);
                    }
                }
            } else {
                // Not yet exhausted - just update
                if (isWorldItem) {
                    io.emit('itemUpdated', item);
                } else {
                    io.emit('playerStateUpdate', { [socket.id]: player });
                    saveCharacter(socket.id);
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

module.exports = { performItemUse };
