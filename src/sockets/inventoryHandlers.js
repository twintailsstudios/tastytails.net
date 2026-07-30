/**
 * @fileoverview inventoryHandlers.js - Server-side inventory and equipment socket event handlers.
 * 
 * @description
 * Manages real-time equipment changes, pocket stash/retrieval operations, ground item dropping,
 * undressing, and item consumption logic for player entities. Encapsulates state mutations,
 * spatial grid synchronization, action telemetry recording, database persistence, and client broadcasts.
 * 
 * Triggered by client socket events:
 * - 'equipItemClicked'
 * - 'undressClicked'
 * - 'stashItemClicked'
 * - 'retrieveItemClicked'
 * - 'dropItemClicked'
 * - 'useItemClicked'
 */

const log = require('../logger');
const monitoring = require('../server/monitoring');
const { performItemUse, getSafePlayerState } = require('../utils/itemActions');
const { resolveHand, getHandItem, setHandItem, clearHandItem } = require('./utils/handUtils');

/**
 * Initializes inventory socket event listeners for a newly connected player client socket.
 * 
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} socket - Active player client socket connection instance.
 * @param {Object} players - In-memory map of active player entities keyed by socket ID.
 * @param {Array<Object>} worldItems - Global array of items currently present in the world.
 * @param {Function} saveCharacter - Function to persist player character state to database.
 * @param {Object} itemData - Global item definition directory keyed by item template ID.
 * @param {Function} [addItemToGrid] - Optional helper to register an item in the spatial grid.
 * @param {Function} [removeItemFromGrid] - Optional helper to remove an item from the spatial grid.
 */
module.exports = function (io, socket, players, worldItems, saveCharacter, itemData, addItemToGrid, removeItemFromGrid) {
    const logPrefix = `[Inventory:${socket.id}]`;

    /**
     * OPTIMIZATION: Broadcasts sanitized player state payload directly to the acting player socket
     * and broadcasts to other connected client sockets, ensuring instant local feedback while
     * avoiding server-wide io.emit overhead where appropriate.
     * 
     * @param {Object} player - The acting player entity.
     */
    const broadcastPlayerState = (player) => {
        const safeState = getSafePlayerState(player);
        const payload = { [socket.id]: safeState };
        socket.emit('playerStateUpdate', payload);
        socket.broadcast.emit('playerStateUpdate', payload);
    };

    // --- Equip Item Handlers ---

    /**
     * Handles equipping, swapping, or un-equipping items between player hand nodes and equipment slots.
     * 
     * @event equipItemClicked
     * @param {Object|string} data - Equipment slot ID or payload object containing { slotId, hand }.
     */
    socket.on('equipItemClicked', (data) => {
        try {
            const player = players[socket.id];
            const slotId = (typeof data === 'object' && data !== null) ? data.slotId : data;
            const handArg = (typeof data === 'object' && data !== null) ? data.hand : null;
            const targetHand = resolveHand(handArg, player);

            log.debug(`${logPrefix} Received 'equipItemClicked' with slot ${slotId}, Hand: ${targetHand}`);
            if (!player) {
                log.debug(`${logPrefix} Player not found`);
                monitoring.recordAction('equip', false);
                return;
            }
            if (!player.equipment) {
                log.debug(`${logPrefix} Player has no equipment object`);
                monitoring.recordAction('equip', false);
                return;
            }
            if (player.isDead) return;

            const handItem = getHandItem(player, targetHand);
            const slotItem = player.equipment[slotId];

            // Logic:
            // 1. If target hand has item: Try to Equip/Swap
            // 2. If target hand is empty: Unequip from slot to target hand

            if (handItem) {
                log.debug(`${logPrefix} Hand (${targetHand}) not empty (${handItem.name}). Attempting to EQUIP/SWAP to ${slotId}.`);

                let canEquip = false;
                if (handItem.properties && handItem.properties.equipSlot === slotId) {
                    canEquip = true;
                } else if (handItem.equipSlot === slotId) { // Direct property support
                    canEquip = true;
                }

                if (canEquip) {
                    // Swap logic
                    player.equipment[slotId] = handItem;
                    setHandItem(player, targetHand, slotItem);

                    log.info(`Player ${player.Username} equipped ${handItem.name} to ${slotId} with ${targetHand} hand`);
                } else {
                    log.warn(`Player ${player.Username} failed to equip ${handItem.name} to ${slotId} (Wrong Slot)`);
                }

            } else {
                log.debug(`${logPrefix} Hand (${targetHand}) empty. Attempting to UNEQUIP from ${slotId}.`);
                // --- UNEQUIP ATTEMPT (Target Hand Empty) ---
                if (slotItem) {
                    // Move Slot -> Target Hand
                    setHandItem(player, targetHand, slotItem);
                    player.equipment[slotId] = null;
                    log.info(`Player ${player.Username} unequipped ${slotItem.name} from ${slotId} to ${targetHand} hand`);
                }
            }

            // OPTIMIZATION: Send state update directly to acting socket & broadcast to surrounding clients
            broadcastPlayerState(player);

            // Save changes to DB immediately
            saveCharacter(socket.id);
            monitoring.recordAction('equip', true);
        } catch (e) {
            log.error(`Error handling equipItemClicked for ${socket.id}:`, e);
            monitoring.recordAction('equip', false);
        }
    });

    // --- Undress Action Handler (Drop all equipped items at feet) ---

    /**
     * Handles un-equipping all items from equipment slots and dropping them onto the ground.
     * 
     * @event undressClicked
     */
    socket.on('undressClicked', () => {
        try {
            const player = players[socket.id];
            if (!player || !player.equipment || player.isDead) return;

            // OPTIMIZATION: Collect undressed items in an array to complete all in-memory grid
            // and array state mutations atomically BEFORE emitting network socket notifications.
            const droppedItems = [];
            Object.keys(player.equipment).forEach((slotId) => {
                const item = player.equipment[slotId];
                if (item) {
                    player.equipment[slotId] = null;

                    const jitterX = (Math.random() - 0.5) * 24;
                    const jitterY = (Math.random() - 0.5) * 16;
                    item.x = player.position.x + jitterX;
                    item.y = player.position.y + 20 + jitterY;
                    delete item.onTable;
                    delete item.surfaceDepth;

                    if (!item.uid) item.uid = 'item_' + Date.now() + Math.random().toString(36).substr(2, 5);

                    worldItems.push(item);
                    if (addItemToGrid) addItemToGrid(item);
                    droppedItems.push(item);
                }
            });

            if (droppedItems.length > 0) {
                log.info(`Player ${player.Username} undressed, dropping ${droppedItems.length} items.`);
                // Emit itemSpawned for each dropped item after atomic mutation
                for (let i = 0; i < droppedItems.length; i++) {
                    io.emit('itemSpawned', droppedItems[i]);
                }
                broadcastPlayerState(player);
                saveCharacter(socket.id);
            }
        } catch (e) {
            log.error(`Error handling undressClicked for ${socket.id}:`, e);
        }
    });

    // --- Dynamic Storage Logic (Pockets etc) ---

    /**
     * Moves an item held in a designated player hand node into a clothing item's pocket.
     * 
     * @event stashItemClicked
     * @param {Object} data - Payload containing { targetSlot, targetPocket, hand }.
     */
    socket.on('stashItemClicked', (data) => {
        try {
            const { targetSlot, targetPocket, hand } = data;
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            const targetHand = resolveHand(hand, player);
            const handItem = getHandItem(player, targetHand);
            const clothingItem = player.equipment[targetSlot];

            if (!handItem) {
                log.debug(`${logPrefix} Hand (${targetHand}) empty, cannot stash.`);
                return;
            }
            if (!clothingItem) {
                log.debug(`${logPrefix} No clothing in slot ${targetSlot}`);
                return;
            }

            // Get clothing definition strictly from itemData using itemId
            const itemId = clothingItem.itemId;
            const clothingDef = itemId ? itemData[itemId] : null;

            if (!clothingDef || !clothingDef.pockets) {
                log.debug(`${logPrefix} No clothing definition or pockets found for itemId: ${itemId}`);
                return;
            }

            const pocketDef = clothingDef.pockets.find(p => p.id === targetPocket);
            if (!pocketDef) {
                log.debug(`${logPrefix} No pocket ${targetPocket} found`);
                return;
            }

            // Initialize contents if null
            if (!clothingItem.contents) clothingItem.contents = {};
            if (!clothingItem.contents[targetPocket]) clothingItem.contents[targetPocket] = [];

            // Validate Size & Capacity
            let currentLoad = 0;
            clothingItem.contents[targetPocket].forEach(item => {
                const iDef = itemData[item.itemId] || { size: 1 };
                currentLoad += (iDef.size || 1);
            });

            // Determine item size
            const handItemDef = itemData[handItem.itemId] || itemData.default;
            const itemSize = handItem.size || handItemDef.size || 1;

            if (currentLoad + itemSize > pocketDef.capacity) {
                log.warn(`${logPrefix} Capacity Exceeded!`);
                return;
            }

            // --- SUCCESS: Move Item ---
            clothingItem.contents[targetPocket].push(handItem);

            // Remove from Target Hand
            clearHandItem(player, targetHand);

            log.info(`[Storage] Stashed ${handItem.name} from ${targetHand} hand into ${clothingDef.name}'s ${pocketDef.name}.`);

            broadcastPlayerState(player);
            saveCharacter(socket.id);
        } catch (e) {
            log.error(`Error handling stashItemClicked for ${socket.id}:`, e);
        }
    });

    /**
     * Retrieves an item from a clothing item's pocket into an empty designated player hand node.
     * 
     * @event retrieveItemClicked
     * @param {Object} data - Payload containing { sourceSlot, sourcePocket, itemUid, hand }.
     */
    socket.on('retrieveItemClicked', (data) => {
        try {
            const { sourceSlot, sourcePocket, itemUid, hand } = data;
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            const targetHand = resolveHand(hand, player);
            const clothingItem = player.equipment[sourceSlot];

            // Check if target hand is empty
            if (getHandItem(player, targetHand)) {
                log.debug(`${logPrefix} Hand (${targetHand}) full, cannot retrieve item.`);
                return;
            }

            if (!clothingItem || !clothingItem.contents || !clothingItem.contents[sourcePocket]) return;

            // Find item
            const itemIndex = clothingItem.contents[sourcePocket].findIndex(i => i.uid === itemUid);
            if (itemIndex === -1) return;

            const item = clothingItem.contents[sourcePocket][itemIndex];

            // Move to Target Hand
            setHandItem(player, targetHand, item);

            // Remove from Pocket
            clothingItem.contents[sourcePocket].splice(itemIndex, 1);

            log.info(`[Storage] Retrieved ${item.name} into ${targetHand} hand from ${sourcePocket}.`);

            broadcastPlayerState(player);
            saveCharacter(socket.id);
        } catch (e) {
            log.error(`Error handling retrieveItemClicked for ${socket.id}:`, e);
        }
    });

    /**
     * Drops an item held in the active hand node onto the ground or surface.
     * Enforces a server-side 60px reach check relative to player center.
     * 
     * @event dropItemClicked
     * @param {Object} data - Payload containing { hand, x, y, onTable, surfaceDepth }.
     */
    socket.on('dropItemClicked', (data) => {
        try {
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            const activeHand = (data && data.hand) ? data.hand : player.actionHands.activeHand;
            let droppedItem = null;

            if (activeHand === 'left' && player.actionHands.leftNode) {
                droppedItem = player.actionHands.leftNode;
                player.actionHands.leftNode = null;
            } else if (activeHand === 'right' && player.actionHands.rightNode) {
                droppedItem = player.actionHands.rightNode;
                player.actionHands.rightNode = null;
            }

            if (droppedItem) {
                // Default Position (Feet)
                let targetX = player.position.x;
                let targetY = player.position.y + 20;

                // Validate requested coordinates
                if (data && typeof data.x === 'number' && typeof data.y === 'number') {
                    // Reach Check: 96x96 box around player center (+30 offset)
                    const pCenterX = player.position.x + 30;
                    const pCenterY = player.position.y;
                    const REACH = 60; // Slightly larger than client 48 to allow for latency/float diffs

                    const dx = Math.abs(data.x - pCenterX);
                    const dy = Math.abs(data.y - pCenterY);

                    if (dx <= REACH && dy <= REACH) {
                        targetX = data.x;
                        targetY = data.y;
                    } else {
                        log.warn(`[Inventory] Drop out of range for ${player.Username}. Dist: ${dx}, ${dy}`);
                    }
                }

                droppedItem.x = targetX;
                droppedItem.y = targetY;

                // Handle elevation (e.g. TableTop)
                if (data && data.onTable) {
                    droppedItem.onTable = true;
                    if (data.surfaceDepth !== undefined) {
                        droppedItem.surfaceDepth = data.surfaceDepth;
                    }
                } else {
                    delete droppedItem.onTable; // Ensure clean state if re-dropping
                    delete droppedItem.surfaceDepth;
                }

                // Ensure UID
                if (!droppedItem.uid) droppedItem.uid = 'item_' + Date.now() + Math.random().toString(36).substr(2, 5);

                // Add to World Items
                worldItems.push(droppedItem);
                if (addItemToGrid) addItemToGrid(droppedItem);

                // Notify Clients
                io.emit('itemSpawned', droppedItem);

                log.info(`Player ${player.Username} dropped item: ${droppedItem.name || droppedItem.uid}`);

                // Update Hand state
                broadcastPlayerState(player);
                saveCharacter(socket.id);
            }
        } catch (e) {
            log.error(`Error handling dropItemClicked for ${socket.id}:`, e);
        }
    });

    /**
     * Handles consuming or using an item from ground or hand nodes.
     * Validates distance (<= 150px) and delegates usage logic to performItemUse.
     * 
     * @event useItemClicked
     * @param {Object} data - Payload containing { uid }.
     */
    socket.on('useItemClicked', (data) => {
        try {
            const { uid } = data;
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            let item = null;
            let isWorldItem = false;

            // OPTIMIZATION: Fast zero-allocation search over worldItems without closure allocations per element.
            const wLen = worldItems.length;
            for (let i = 0; i < wLen; i++) {
                const wItem = worldItems[i];
                if (wItem && wItem.uid === uid) {
                    const dist = Math.hypot(player.position.x - wItem.x, player.position.y - wItem.y);
                    if (dist <= 150) {
                        item = wItem;
                        isWorldItem = true;
                    }
                    break;
                }
            }

            // 2. Try Hands (if not found in world)
            if (!item) {
                if (player.actionHands.leftNode && player.actionHands.leftNode.uid === uid) {
                    item = player.actionHands.leftNode;
                } else if (player.actionHands.rightNode && player.actionHands.rightNode.uid === uid) {
                    item = player.actionHands.rightNode;
                }
            }

            if (!item) {
                log.warn(`${logPrefix} 'useItemClicked': Item ${uid} not found in world or hands.`);
                return;
            }

            // Logic: Increment usage
            // Initialize count if missing
            if (item.timesUsed === undefined) item.timesUsed = 0;

            const def = itemData[item.itemId] || { maxUses: 10 };
            const max = def.maxUses || 10;

            if (item.timesUsed < max) {
                // Delegate to shared utility
                performItemUse(io, socket, player, item, itemData, isWorldItem, worldItems, saveCharacter, def);
            } else {
                // Should not happen theoretically if we handle it above, but safe fallback
                log.info(`Player ${player.Username} tried to use ${item.name} but it is empty.`);
            }

        } catch (e) {
            log.error(`Error handling useItemClicked for ${socket.id}:`, e);
        }
    });
};
