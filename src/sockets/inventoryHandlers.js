const log = require('../logger');
const { performItemUse, getSafePlayerState } = require('../utils/itemActions');

module.exports = function (io, socket, players, worldItems, saveCharacter, clothingData, itemData, addItemToGrid, removeItemFromGrid) {
    const logPrefix = `[Inventory:${socket.id}]`;

    // --- Equip Item Handlers ---
    socket.on('equipItemClicked', (slotId) => {
        try {
            log.debug(`${logPrefix} Received 'equipItemClicked' with slot ${slotId}`);
            const player = players[socket.id];
            if (!player) {
                log.debug(`${logPrefix} Player not found`);
                return;
            }
            if (!player.equipment) {
                log.debug(`${logPrefix} Player has no equipment object`);
                return;
            }

            const activeHand = player.actionHands.activeHand;
            // Get item in active hand
            const handItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
            const slotItem = player.equipment[slotId];

            // log.debug(`${logPrefix} Slot: ${slotId}, Hand: ${activeHand}, HandItem: ${handItem ? 'YES' : 'NO'}, SlotItem: ${slotItem ? 'YES' : 'NO'}`);

            // Logic:
            // 1. If hand has item: Try to Equip
            // 2. If hand is empty: Unequip from slot to hand

            if (handItem) {
                log.debug(`${logPrefix} Hand not empty (${handItem.name}). Attempting to EQIUP/SWAP to ${slotId}.`);

                let canEquip = false;
                if (handItem.properties && handItem.properties.equipSlot === slotId) {
                    canEquip = true;
                } else if (handItem.equipSlot === slotId) { // Direct property support
                    canEquip = true;
                }

                if (canEquip) {
                    // Swap logic
                    player.equipment[slotId] = handItem;

                    if (activeHand === 'left') player.actionHands.leftNode = slotItem;
                    else player.actionHands.rightNode = slotItem;

                    log.info(`Player ${player.Username} equipped ${handItem.name} to ${slotId}`);
                } else {
                    log.warn(`Player ${player.Username} failed to equip ${handItem.name} to ${slotId} (Wrong Slot)`);
                }

            } else {
                log.debug(`${logPrefix} Hand empty. Attempting to UNEQUIP from ${slotId}.`);
                // --- UNEQUIP ATTEMPT (Hand Empty) ---
                if (slotItem) {
                    // Move Slot -> Hand
                    if (activeHand === 'left') player.actionHands.leftNode = slotItem;
                    else player.actionHands.rightNode = slotItem;

                    player.equipment[slotId] = null;
                    log.info(`Player ${player.Username} unequipped ${slotItem.name} from ${slotId}`);
                }
            }

            // Force immediate update to all clients
            io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });

            // Save changes to DB immediately
            saveCharacter(socket.id);
        } catch (e) {
            log.error(`Error handling equipItemClicked for ${socket.id}:`, e);
        }
    });

    // --- Dynamic Storage Logic (Pockets etc) ---

    // Move item from Hand -> Pocket
    socket.on('stashItemClicked', (data) => {
        try {
            const { targetSlot, targetPocket } = data;
            const player = players[socket.id];
            if (!player) return;

            const activeHand = player.actionHands.activeHand;
            const handItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
            const clothingItem = player.equipment[targetSlot];

            if (!handItem) {
                log.debug(`${logPrefix} Hand empty, cannot stash.`);
                return;
            }
            if (!clothingItem) {
                log.debug(`${logPrefix} No clothing in slot ${targetSlot}`);
                return;
            }

            // Get clothing definition
            const textureKey = clothingItem.texture;
            const clothingDef = clothingData[textureKey];

            if (!clothingDef) {
                log.debug(`${logPrefix} No clothing definition found for ${textureKey}`);
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

            // Remove from Hand
            if (activeHand === 'left') player.actionHands.leftNode = null;
            else player.actionHands.rightNode = null;

            log.info(`[Storage] Stashed ${handItem.name} into ${clothingDef.name}'s ${pocketDef.name}.`);

            io.emit('playerStateUpdate', { [socket.id]: getSafePlayerState(player) });
            saveCharacter(socket.id);
        } catch (e) {
            log.error(`Error handling stashItemClicked for ${socket.id}:`, e);
        }
    });

    // Move item from Pocket -> Hand
    socket.on('retrieveItemClicked', (data) => {
        try {
            const { sourceSlot, sourcePocket, itemUid } = data;
            const player = players[socket.id];
            if (!player) return;

            const activeHand = player.actionHands.activeHand;
            const clothingItem = player.equipment[sourceSlot];

            // Check if hand is empty
            if (activeHand === 'left' && player.actionHands.leftNode) return; // Hand full
            if (activeHand === 'right' && player.actionHands.rightNode) return; // Hand full

            if (!clothingItem || !clothingItem.contents || !clothingItem.contents[sourcePocket]) return;

            // Find item
            const itemIndex = clothingItem.contents[sourcePocket].findIndex(i => i.uid === itemUid);
            if (itemIndex === -1) return;

            const item = clothingItem.contents[sourcePocket][itemIndex];

            // Move to Hand
            if (activeHand === 'left') player.actionHands.leftNode = item;
            else player.actionHands.rightNode = item;

            // Remove from Pocket
            clothingItem.contents[sourcePocket].splice(itemIndex, 1);

            log.info(`[Storage] Retrieved ${item.name} from ${sourcePocket}.`);

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

            const activeHand = player.actionHands.activeHand;
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
