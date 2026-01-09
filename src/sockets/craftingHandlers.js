const log = require('../logger');
let recipes = {};

try {
    const recipesData = require('../data/recipes');
    recipes = recipesData;
} catch (e) {
    log.error('[Crafting] Failed to load recipes.js', e);
}

let stationConfigs = {};
try {
    stationConfigs = require('../data/craftingStations');
} catch (e) {
    log.warn('[Crafting] Failed to load craftingStations.js', e);
}

// Main Socket Initializer
const init = function (io, socket, players, itemData, saveCharacter, craftingStations, worldItems, broadcastToVisible, getPacket) {
    const logPrefix = `[Crafting:${socket.id}]`;
    // log.info(`${ logPrefix } Initialized crafting handlers`); // verbose but useful for debug

    // 1. Open Crafting UI Request
    socket.on('openCrafting', (data) => {
        try {
            const { stationId } = data;
            const station = craftingStations[stationId];

            if (!station) {
                log.warn(`${logPrefix} Request to open invalid station: ${stationId} `);
                return;
            }

            // Get recipes for this station type
            const availableRecipes = recipes[station.type] || [];

            // Emit to client
            socket.emit('craftingUIOpen', {
                stationId: stationId,
                stationType: station.type,
                recipes: availableRecipes,
                stationInventory: station.inventory, // Current items in this volatile station
                outputItem: station.outputItem || null, // Item in cooling rack
                craftingState: station.craftingState || null, // [NEW] Resume data
                uiConfig: stationConfigs[station.type] || {} // [NEW] Send UI config
            });

            log.info(`${logPrefix} Opened crafting station ${stationId} (${station.type})`);

        } catch (e) {
            log.error(`${logPrefix} Error opening crafting: `, e);
        }
    });

    // 2. Deposit Item into Station
    socket.on('craftingDepositItem', (data) => {
        try {
            const { stationId, sourceSlot, sourcePocket, itemUid } = data;
            const player = players[socket.id];
            const station = craftingStations[stationId];

            if (!player || !station) return;

            // [NEW] Check if station is busy (someone else is crafting)
            if (station.activeCrafterId && station.activeCrafterId !== socket.id) {
                socket.emit('craftingError', "Station is currently in use!");
                return;
            }

            let depositedItem = null;

            // Check if depositing from Inventory (Pocket)
            if (sourceSlot && sourcePocket && itemUid) {
                // Find item in equipment
                const equipmentItem = player.equipment[sourceSlot];
                if (equipmentItem && equipmentItem.contents && equipmentItem.contents[sourcePocket]) {
                    const pocketContents = equipmentItem.contents[sourcePocket];
                    const itemIndex = pocketContents.findIndex(i => i.uid === itemUid);

                    if (itemIndex > -1) {
                        depositedItem = pocketContents[itemIndex];
                        // Remove from pocket
                        pocketContents.splice(itemIndex, 1);
                        log.info(`${logPrefix} Retreived ${depositedItem.name} from ${sourceSlot}/${sourcePocket}`);
                    }
                }
            } else {
                // Default: Deposit from Active Hand
                const activeHand = player.actionHands.activeHand;
                const handItem = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

                if (handItem) {
                    depositedItem = handItem;
                    // Clear from Hand
                    if (activeHand === 'left') player.actionHands.leftNode = null;
                    else player.actionHands.rightNode = null;
                }
            }

            if (!depositedItem) {
                log.warn(`${logPrefix} No item found to deposit`);
                return;
            }

            // [NEW] Check Slot Limit
            const stationConfig = stationConfigs[station.type] || {};
            const maxSlots = stationConfig.inputSlots || 6;
            if (station.inventory.length >= maxSlots) {
                socket.emit('craftingError', "Station is full!");
                return;
            }

            // Move to Station Inventory
            station.inventory.push(depositedItem);

            // Notify Client(s)
            socket.emit('craftingUpdateStation', {
                stationId: stationId,
                stationInventory: station.inventory
            });

            // Update Player Visuals (Hands or Equipment)
            const safePlayer = getPacket ? getPacket(player) : player;
            if (broadcastToVisible) {
                broadcastToVisible(io, socket.id, 'playerStateUpdate', { [socket.id]: safePlayer });
            } else {
                io.emit('playerStateUpdate', { [socket.id]: safePlayer });
            }
            saveCharacter(socket.id);

            log.info(`${logPrefix} Deposited ${depositedItem.name} into ${stationId}`);

        } catch (e) {
            log.error(`${logPrefix} Error depositing item:`, e);
        }
    });

    // 2.5 Retrieve Item from Station
    socket.on('craftingRetrieveItem', (data) => {
        try {
            const { stationId, itemUid } = data;
            const player = players[socket.id];
            const station = craftingStations[stationId];

            if (!player || !station) return;

            // [NEW] Check if station is busy (someone else is crafting)
            if (station.activeCrafterId && station.activeCrafterId !== socket.id) {
                socket.emit('craftingError', "Station is currently in use!");
                return;
            }

            // Find item in station
            // Find item in station inventory (Input)
            let itemIndex = station.inventory.findIndex(i => i.uid === itemUid);
            let source = 'inventory';

            if (itemIndex === -1) {
                // Check Output Slot
                if (station.outputItem && station.outputItem.uid === itemUid) {
                    source = 'output';
                } else {
                    log.warn(`${logPrefix} Item ${itemUid} not found in station ${stationId}`);
                    return;
                }
            }

            let item;
            if (source === 'inventory') {
                item = station.inventory[itemIndex];
            } else {
                item = station.outputItem;
            }

            // Check if player hand is empty
            const activeHand = player.actionHands.activeHand; // 'left' or 'right'
            const handNode = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

            if (handNode) {
                socket.emit('craftingError', "Hand is full!");
                return;
            }

            // Remove from source
            if (source === 'inventory') {
                station.inventory.splice(itemIndex, 1);
            } else {
                station.outputItem = null;
            }

            // Add back to hand
            if (activeHand === 'left') player.actionHands.leftNode = item;
            else player.actionHands.rightNode = item;

            // Notify Station Update
            socket.emit('craftingUpdateStation', {
                stationId: stationId,
                stationInventory: station.inventory
            });

            // Notify Player Update
            const safePlayer = getPacket ? getPacket(player) : player;
            if (broadcastToVisible) {
                broadcastToVisible(io, socket.id, 'playerStateUpdate', { [socket.id]: safePlayer });
            } else {
                io.emit('playerStateUpdate', { [socket.id]: safePlayer });
            }
            saveCharacter(socket.id);

            log.info(`${logPrefix} Retrieved ${item.name} from ${stationId}`);

        } catch (e) {
            log.error(`${logPrefix} Error retrieving item:`, e);
        }
    });

    // 3. Start Crafting Process
    socket.on('craftingStart', (data) => {
        try {
            const { stationId, recipeId } = data;
            const station = craftingStations[stationId];
            const player = players[socket.id];
            if (!station || !player) return;

            // [NEW] Station Busy Check
            if (station.activeCrafterId && station.activeCrafterId !== socket.id) {
                // If the previous crafter is gone/disconnected, maybe we should auto-takeover?
                // For now, strict check.
                if (players[station.activeCrafterId]) {
                    socket.emit('craftingError', "Station is busy!");
                    return;
                }
                // If player missing, we can assume lock is stale.Proceed.
            }


            // --- Range Validation ---
            const dist = Math.sqrt(Math.pow(player.position.x - station.x, 2) + Math.pow(player.position.y - station.y, 2));
            if (dist > 180) { // slightly larger than client (150) to allow for latency/fuzziness
                log.warn(`${logPrefix} Crafting blocked: Too far from station (${dist.toFixed(0)}px)`);
                socket.emit('craftingError', "Too far away!");
                return;
            }

            const recipeList = recipes[station.type] || [];
            const recipe = recipeList.find(r => r.id === recipeId);

            if (!recipe) {
                log.warn(`${logPrefix} Invalid recipe ${recipeId}`);
                return;
            }

            // [NEW] Capture Custom Data (Layers/Colors for Sewing)
            const customCraftingData = data.customCraftingData || null;

            // --- Resume Logic (Check Station State) ---
            let duration = recipe.time || 3000;
            let isResuming = false;

            // [NEW] Check Station Persistence
            let savedCustomData = null;
            if (station.craftingState && station.craftingState.recipeId === recipeId) {
                duration = station.craftingState.remainingTime;
                isResuming = true;
                savedCustomData = station.craftingState.customCraftingData; // Restore custom data
                station.craftingState = null; // Clear saved state, we are consuming it now
                log.info(`${logPrefix} Resuming crafting ${recipe.name} (${duration}ms remaining)`);
            }

            // Use saved data if resuming, otherwise use new data
            const finalCustomData = isResuming ? savedCustomData : customCraftingData;

            // Validate Ingredients (Skip if resuming)
            if (!isResuming) {
                // [OPTIMIZED] Single-pass validation
                // 1. Count available items by "Key" (ItemId + Variant)
                // 2. Check requirements against counts
                // 3. Mark items for removal

                const inventoryMap = new Map(); // Key -> [Indices]
                const getKey = (item) => {
                    let key = item.itemId;
                    if (item.variant) key += `|${item.variant}`;
                    return key;
                };

                // Build Index Map
                station.inventory.forEach((item, idx) => {
                    const fullKey = getKey(item);
                    if (!inventoryMap.has(fullKey)) inventoryMap.set(fullKey, []);
                    inventoryMap.get(fullKey).push(idx);

                    // [FIX] Also index under base ItemID if variant exists
                    // This allows recipes asking for 'alpha_thread' to accept 'alpha_thread|variant'
                    if (item.variant) {
                        const baseKey = item.itemId;
                        // Avoid duplicates if variant key happened to be same as base (unlikely logic but safe)
                        if (baseKey !== fullKey) {
                            if (!inventoryMap.has(baseKey)) inventoryMap.set(baseKey, []);
                            inventoryMap.get(baseKey).push(idx);
                        }
                    }
                });

                const indicesToRemove = new Set();
                let hasIngredients = true;

                for (const ing of recipe.ingredients) {
                    // Construct required key
                    let reqKey = ing.itemId;
                    if (ing.customData && ing.customData.variant) {
                        reqKey += `|${ing.customData.variant}`;
                    }

                    const availableIndices = inventoryMap.get(reqKey) || [];

                    // Filter out already used indices
                    const unusedIndices = availableIndices.filter(idx => !indicesToRemove.has(idx));

                    if (unusedIndices.length >= ing.count) {
                        // Mark for removal
                        // Mark for removal or update uses
                        for (let i = 0; i < ing.count; i++) {
                            const idx = unusedIndices[i];
                            const item = station.inventory[idx];
                            // Check for maxUses (dynamic item)
                            // [FIX] Ensure we respect instance or definition maxUses
                            const def = itemData[item.itemId] || {};
                            const maxUses = item.maxUses || def.maxUses || 0;

                            if (maxUses > 0) {
                                // Decrement usage (Increment timesUsed)
                                item.timesUsed = (item.timesUsed || 0) + 1;

                                // Check if exhausted
                                if (item.timesUsed >= maxUses) {
                                    indicesToRemove.add(idx);
                                }
                                // Else: Item remains in inventory with updated timesUsed
                            } else {
                                // Normal item: Consume fully
                                indicesToRemove.add(idx);
                            }
                        }
                    } else {
                        log.warn(`${logPrefix} Missing ingredient: ${reqKey} (Req: ${ing.count}, Found: ${unusedIndices.length})`);
                        hasIngredients = false;
                        break;
                    }
                }

                if (!hasIngredients) {
                    socket.emit('craftingError', "Missing ingredients!");
                    return;
                }

                // Consumption: Create new inventory excluding removed indices
                // More efficient than repeated splicing which is O(N^2)
                const newInventory = station.inventory.filter((_, idx) => !indicesToRemove.has(idx));
                station.inventory = newInventory;
            }

            // --- Update State ---
            player.isCrafting = true;
            player.craftingStartTime = Date.now();
            player.craftingDuration = duration;
            player.currentCraftingRecipeId = recipeId;
            player.currentCraftingCustomData = finalCustomData; // [NEW] Store dynamic data
            player.currentStationId = stationId; // [NEW] Track station

            station.activeCrafterId = socket.id; // [NEW] Lock station

            // Notify update (inventory drained)
            socket.emit('craftingUpdateStation', {
                stationId: stationId,
                stationInventory: station.inventory
            });

            // Broadcast crafting state to visible players
            const safePlayer = getPacket ? getPacket(player) : player;
            if (broadcastToVisible) {
                broadcastToVisible(io, socket.id, 'playerStateUpdate', { [socket.id]: safePlayer });
            } else {
                io.emit('playerStateUpdate', { [socket.id]: safePlayer });
            }
            log.info(`${logPrefix} Started crafting ${recipe.name} (${duration}ms)`);

            // Timer for completion
            player.craftingTimer = setTimeout(() => {
                try {
                    // Clear Crafting State
                    let dynamicData = null; // [FIX] Hoist variable to outer scope

                    if (players[socket.id]) {
                        players[socket.id].isCrafting = false;
                        players[socket.id].craftingStartTime = null;
                        players[socket.id].craftingDuration = null;
                        players[socket.id].currentCraftingRecipeId = null;
                        dynamicData = players[socket.id].currentCraftingCustomData; // [NEW] Retrieve
                        players[socket.id].currentCraftingCustomData = null;
                        players[socket.id].currentStationId = null;
                        players[socket.id].craftingTimer = null; // Clear ref

                        // Broadcast completion state
                        const safePlayer = getPacket ? getPacket(players[socket.id]) : players[socket.id];
                        if (broadcastToVisible) {
                            broadcastToVisible(io, socket.id, 'playerStateUpdate', { [socket.id]: safePlayer });
                        } else {
                            io.emit('playerStateUpdate', { [socket.id]: safePlayer });
                        }
                    }

                    // Unlock Station
                    if (craftingStations[stationId]) {
                        craftingStations[stationId].activeCrafterId = null;
                        craftingStations[stationId].craftingState = null; // Ensure no resume state is left
                    }

                    // Spawn Result
                    // [MODIFIED] Use Universal Factory
                    const { createDynamicItem } = require('../utils/itemUtils');

                    // Merge Recipe Result Custom Data with Client Dynamic Data
                    const combinedCustomData = {
                        ...(recipe.result.customData || {}),
                        ...(dynamicData || {})
                    };

                    // [FIX] Allow Custom Data to override the Item ID (to support generic recipes producing specific items)
                    const finalItemId = combinedCustomData.itemId || recipe.result.itemId;

                    const newItem = createDynamicItem(
                        finalItemId,
                        itemData,
                        combinedCustomData,
                        { x: station.x, y: station.y + 20 }
                    );

                    // Store in Cooling Rack (Output Slot)
                    station.outputItem = newItem;

                    // Notify completion
                    socket.emit('craftingComplete', { message: `Crafted ${newItem.name}!`, item: newItem });

                    log.info(`${logPrefix} Crafted ${newItem.name} -> Cooling Rack`);
                } catch (timerErr) {
                    log.error(`${logPrefix} Error in crafting callback:`, timerErr);
                    socket.emit('craftingError', "Crafting failed internally.");
                }

            }, duration);

        } catch (e) {
            log.error(`${logPrefix} Error crafting:`, e);
        }
    });

    // 4. Pause Crafting
    // 4. Pause Crafting
    socket.on('craftingPause', () => {
        log.info(`${logPrefix} craftingPause request received`);
        const player = players[socket.id];
        if (!player) return;

        // [MODIFIED] Unconditionally clear state to prevent stuck "isCrafting" flags
        // if (!player.isCrafting) { ... } // Removed guard

        const stationId = player.currentStationId;
        const station = craftingStations[stationId];

        // Cancel Timer
        if (player.craftingTimer) {
            clearTimeout(player.craftingTimer);
            player.craftingTimer = null;
        }

        // Calculate Remaining Time
        let remaining = 0;
        if (player.craftingStartTime && player.craftingDuration) {
            const elapsed = Date.now() - player.craftingStartTime;
            remaining = Math.max(0, player.craftingDuration - elapsed);
        }

        // [NEW] Save State to Station
        if (player.currentCraftingRecipeId && station) {
            station.craftingState = {
                recipeId: player.currentCraftingRecipeId,
                customCraftingData: player.currentCraftingCustomData, // [NEW] Save custom data
                remainingTime: remaining || 0
            };
            station.activeCrafterId = null; // Release lock
            log.info(`${logPrefix} Paused crafting (Recipe: ${player.currentCraftingRecipeId}, Left: ${remaining}ms) saved to station ${stationId}`);
        } else {
            // Just release lock if we were holding it
            if (station && station.activeCrafterId === socket.id) {
                station.activeCrafterId = null;
            }
        }

        // Reset Player State
        const wasCrafting = player.isCrafting;
        player.isCrafting = false;
        player.craftingStartTime = null;
        player.craftingDuration = null;
        player.currentCraftingRecipeId = null;
        player.currentStationId = null;

        // Broadcast State
        const safePlayer = getPacket ? getPacket(player) : player;
        if (broadcastToVisible) {
            broadcastToVisible(io, socket.id, 'playerStateUpdate', { [socket.id]: safePlayer });
        } else {
            io.emit('playerStateUpdate', { [socket.id]: safePlayer });
        }

        // Explicitly notify the client to stop the UI
        socket.emit('craftingPaused', {
            remainingTime: remaining,
            recipeId: station && station.craftingState ? station.craftingState.recipeId : null
        });
    });
};

// Helper for Range Check (called from server-loop)
const checkCraftingRange = (socketId, player, io, craftingStations) => {
    if (!player.isCrafting || !player.currentStationId) return;

    const station = craftingStations[player.currentStationId];
    if (!station) return;

    // Euclidean distance check
    const dx = player.position.x - station.x;
    const dy = player.position.y - station.y;
    const distSq = dx * dx + dy * dy;
    const MAX_DIST_SQ = 180 * 180;

    if (distSq > MAX_DIST_SQ) {
        log.info(`[Server] Player ${player.firstName} moved too far from station. Auto-pausing.`);

        // 1. Cancel Timer
        if (player.craftingTimer) {
            clearTimeout(player.craftingTimer);
            player.craftingTimer = null;
        }

        // 2. Calculate Remaining
        const elapsed = Date.now() - player.craftingStartTime;
        const remaining = Math.max(0, player.craftingDuration - elapsed);

        // 3. Save to Station
        if (player.currentCraftingRecipeId) {
            station.craftingState = {
                recipeId: player.currentCraftingRecipeId,
                customCraftingData: player.currentCraftingCustomData, // [NEW] Save
                remainingTime: remaining
            };
            station.activeCrafterId = null; // Unlock
        }

        // 4. Reset Player
        player.isCrafting = false;
        player.craftingStartTime = null;
        player.craftingDuration = null;
        player.currentCraftingRecipeId = null;
        player.currentStationId = null;

        // 5. Notify Client
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            socket.emit('craftingPaused', {
                remainingTime: station.craftingState ? station.craftingState.remainingTime : 0, // Use saved remaining time
                recipeId: station.craftingState ? station.craftingState.recipeId : null
            });
            socket.emit('craftingError', "Moved too far! Crafting paused.");
        }
    }
};

module.exports = { init, checkCraftingRange };
