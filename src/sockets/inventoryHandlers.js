const log = require('../logger');
const { performItemUse, getSafePlayerState } = require('../utils/itemActions');
const { resolveHand, getHandItem, setHandItem, clearHandItem } = require('./utils/handUtils');

module.exports = function (io, socket, players, worldItems, saveCharacter, clothingData, itemData, addItemToGrid, removeItemFromGrid) {
    const logPrefix = `[Inventory:${socket.id}]`;

    // --- Equip Item Handlers ---
    socket.on('equipItemClicked', (data) => {
        try {
            const slotId = (typeof data === 'object' && data !== null) ? data.slotId : data;
            const targetHand = (typeof data === 'object' && data !== null && data.hand) ? resolveHand(data.hand) : resolveHand(player?.actionHands?.activeHand);

            log.debug(`${logPrefix} Received 'equipItemClicked' with slot ${slotId}, Hand: ${targetHand}`);
            const player = players[socket.id];
            if (!player) {
                log.debug(`${logPrefix} Player not found`);
                require('../server/monitoring').recordAction('equip', false);
                return;
            }
            if (!player.equipment) {
                log.debug(`${logPrefix} Player has no equipment object`);
                require('../server/monitoring').recordAction('equip', false);
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

            // Force immediate update to all clients
            io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });

            // Save changes to DB immediately
            saveCharacter(socket.id);
            require('../server/monitoring').recordAction('equip', true);
        } catch (e) {
            log.error(`Error handling equipItemClicked for ${socket.id}:`, e);
            require('../server/monitoring').recordAction('equip', false);
        }
    });

    // --- Dynamic Storage Logic (Pockets etc) ---

    // Move item from Specified Hand -> Pocket
    socket.on('stashItemClicked', (data) => {
        try {
            const { targetSlot, targetPocket, hand } = data;
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            const targetHand = resolveHand(hand || player.actionHands?.activeHand);
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

            io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
            saveCharacter(socket.id);
        } catch (e) {
            log.error(`Error handling stashItemClicked for ${socket.id}:`, e);
        }
    });

    // Move item from Pocket -> Specified Hand
    socket.on('retrieveItemClicked', (data) => {
        try {
            const { sourceSlot, sourcePocket, itemUid, hand } = data;
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            const targetHand = resolveHand(hand || player.actionHands?.activeHand);
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

            io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
            saveCharacter(socket.id);
        } catch (e) {
            log.error(`Error handling retrieveItemClicked for ${socket.id}:`, e);
        }
    });

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
                    // Player Center = x + 30, y
                    // Reach Radius = 48
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
                io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
                saveCharacter(socket.id);
            }
        } catch (e) {
            log.error(`Error handling dropItemClicked for ${socket.id}:`, e);
        }
    });

    socket.on('useItemClicked', (data) => {
        try {
            const { uid } = data;
            const player = players[socket.id];
            if (!player) return;
            if (player.isDead) return;

            let item = null;
            let isWorldItem = false;

            // 1. Try World Items
            const itemIndex = worldItems.findIndex(i => i.uid === uid);
            if (itemIndex > -1) {
                item = worldItems[itemIndex];
                isWorldItem = true;
                // Validation: Distance Check
                const dist = Math.sqrt(Math.pow(player.position.x - item.x, 2) + Math.pow(player.position.y - item.y, 2));
                if (dist > 150) return; // Too far
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
