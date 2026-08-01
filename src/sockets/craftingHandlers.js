/**
 * @fileoverview craftingHandlers.js - Server-Side Crafting Station Socket Handlers & Range Guard
 * 
 * @description
 * Manages player interactions with world crafting stations over WebSockets, including:
 * - Recipe compilation (merging recipes.js and inline itemData.js recipe definitions)
 * - Station inventory management (depositing from pockets/hands, retrieving to hands)
 * - Resumable crafting timers, exclusive station locks (activeCrafterId), and dynamic item creation into output cooling racks
 * - Distance-based auto-pausing (checkCraftingRange) called per tick from server-loop.js
 * - Socket disconnect safeguards to prevent dangling timers and station lock stalls
 */

const log = require('../logger');
const { resolveHand, getHandItem, setHandItem, clearHandItem } = require('./utils/handUtils');
const itemData = require('../data/itemData');
// OPTIMIZATION: Hoisted to top-level module scope to avoid per-craft dynamic require overhead
const { createDynamicItem } = require('../utils/itemUtils');
let recipes = {};

try {
    // Compile recipes directly from itemData
    Object.entries(itemData).forEach(([itemId, def]) => {
        if (def.recipe) {
            const station = def.recipe.station;
            if (!recipes[station]) recipes[station] = [];

            // Check if recipe already exists (by ID)
            const recipeId = def.recipe.id || itemId;
            const exists = recipes[station].some(r => r.id === recipeId);

            if (!exists) {
                recipes[station].push({
                    id: recipeId,
                    name: def.name,
                    description: def.description || def.flavor || '',
                    ingredients: def.recipe.ingredients,
                    result: def.recipe.result || { itemId: itemId, count: def.recipe.count || 1 },
                    time: def.recipe.time || 3000,
                    icon: def.recipe.icon || def.icon || 'fa-solid fa-box-open',
                    validateOnly: def.recipe.validateOnly || false,
                    customData: def.recipe.customData || undefined
                });
            }
        }
    });
} catch (e) {
    log.error('[Crafting] Failed to load recipes from itemData', e);
}

let stationConfigs = {};
try {
    stationConfigs = require('../data/craftingStations');
} catch (e) {
    log.warn('[Crafting] Failed to load craftingStations.js', e);
}

/**
 * Initializes crafting socket event listeners for a connected client socket.
 * 
 * @param {Object} io - SocketIO server instance
 * @param {Object} socket - Active client socket instance
 * @param {Object} players - Global players dictionary keyed by socket ID
 * @param {Object} itemData - Item definitions data object
 * @param {Function} saveCharacter - Function to persist player character state to DB
 * @param {Object} craftingStations - Global active crafting stations object
 * @param {Object} worldItems - Global world items object
 * @param {Function} [broadcastToVisible] - Helper function to broadcast events to visible spatial grid observers
 * @param {Function} [getPacket] - Helper function to extract sanitized player state payload
 */
const init = function (io, socket, players, itemData, saveCharacter, craftingStations, worldItems, broadcastToVisible, getPacket) {
    const logPrefix = `[Crafting:${socket.id}]`;
    // log.info(`${ logPrefix } Initialized crafting handlers`); // verbose but useful for debug

    // Centralized player state sync helper
    const syncPlayerState = () => {
        const player = players[socket.id];
        if (!player) return;
        const safePlayer = getPacket ? getPacket(player) : player;
        if (broadcastToVisible) {
            broadcastToVisible(io, socket.id, 'playerStateUpdate', { [socket.id]: safePlayer });
        } else {
            io.emit('playerStateUpdate', { [socket.id]: safePlayer });
        }
    };

    // 1. Open Crafting UI Request
    socket.on('openCrafting', (data) => {
        try {
            if (players[socket.id] && players[socket.id].isDead) return;
            const { stationId, hand } = data;
            const player = players[socket.id];
            const station = craftingStations[stationId];

            if (!station) {
                log.warn(`${logPrefix} Request to open invalid station: ${stationId} `);
                return;
            }

            // Get recipes for this station type
            const availableRecipes = recipes[station.type] || [];

            // Auto-deposit check (if hand is provided, e.g. from radial menu)
            if (hand && player) {
                const activeHand = hand;
                const activeNode = activeHand === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;

                if (activeNode) {
                    const stationConfig = stationConfigs[station.type] || {};
                    const maxSlots = stationConfig.inputSlots || 6;
                    const isIngredient = availableRecipes.some(r => r.ingredients && r.ingredients.some(ing => ing.itemId === activeNode.itemId));
                    
                    if (isIngredient && station.inventory.length < maxSlots) {
                        const depositedItem = activeNode;
                        if (activeHand === 'left') player.actionHands.leftNode = null;
                        else player.actionHands.rightNode = null;

                        station.inventory.push(depositedItem);

                        log.info(`${logPrefix} Auto-deposited ${depositedItem.name} into station ${stationId} during openCrafting`);

                        // Update Player Visuals (Hands)
                        syncPlayerState();
                        saveCharacter(socket.id);
                    }
                }
            }

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
            const { stationId, sourceSlot, sourcePocket, itemUid, hand } = data;
            const player = players[socket.id];
            const station = craftingStations[stationId];

            if (!player || !station) return;
            if (player.isDead) return;

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
                // Default: Deposit from specified Hand
                const targetHand = resolveHand(hand, player);
                const handItem = getHandItem(player, targetHand);

                if (handItem) {
                    depositedItem = handItem;
                    // Clear from Target Hand
                    clearHandItem(player, targetHand);
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
            syncPlayerState();
            saveCharacter(socket.id);

            log.info(`${logPrefix} Deposited ${depositedItem.name} into ${stationId}`);

        } catch (e) {
            log.error(`${logPrefix} Error depositing item:`, e);
        }
    });

    // 2.5 Retrieve Item from Station
    socket.on('craftingRetrieveItem', (data) => {
        try {
            const { stationId, itemUid, hand } = data;
            const player = players[socket.id];
            const station = craftingStations[stationId];

            if (!player || !station) return;
            if (player.isDead) return;

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

            // Check if target hand is empty
            const targetHand = resolveHand(hand, player);
            const handNode = getHandItem(player, targetHand);

            if (handNode) {
                socket.emit('craftingError', `${targetHand === 'left' ? 'Left' : 'Right'} hand is full!`);
                return;
            }

            // Remove from source
            if (source === 'inventory') {
                station.inventory.splice(itemIndex, 1);
            } else {
                station.outputItem = null;
            }

            // Add back to target hand
            setHandItem(player, targetHand, item);

            // Notify Station Update
            socket.emit('craftingUpdateStation', {
                stationId: stationId,
                stationInventory: station.inventory
            });

            // Notify Player Update
            syncPlayerState();
            saveCharacter(socket.id);

            log.info(`${logPrefix} Retrieved ${item.name} into ${targetHand} hand from ${stationId}`);

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
            if (player.isDead) return;

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
                const indicesToRemove = new Set();
                let hasIngredients = true;

                for (const ing of recipe.ingredients) {
                    const reqKey = ing.itemId;
                    
                    // Find all matching item indices in station inventory
                    const availableIndices = [];
                    station.inventory.forEach((item, idx) => {
                        let isMatch = item.itemId === reqKey;
                        // Thread fallback for sewing machine
                        if (!isMatch && reqKey.startsWith('thread_wool_')) {
                            if (item.itemId.startsWith('thread_wool_') || (item.name && item.name.toLowerCase().includes('thread'))) {
                                isMatch = true;
                            }
                        }
                        if (isMatch) {
                            availableIndices.push(idx);
                        }
                    });

                    // Filter out already used indices
                    const unusedIndices = availableIndices.filter(idx => !indicesToRemove.has(idx));

                    // Check if this is a sewing machine recipe
                    const isSewing = recipe.station === 'sewing_machine' || (finalCustomData && finalCustomData.itemId);
                    let baseUses = 1;
                    if (isSewing && finalCustomData && finalCustomData.itemId) {
                        const targetItemDef = itemData[finalCustomData.itemId];
                        if (targetItemDef && targetItemDef.recipe && targetItemDef.recipe.ingredients) {
                            const targetIng = targetItemDef.recipe.ingredients.find(i => 
                                i.itemId === reqKey || (reqKey.startsWith('thread_wool_') && i.itemId.startsWith('thread_wool_'))
                            );
                            if (targetIng && targetIng.usesConsumed) {
                                baseUses = targetIng.usesConsumed;
                            }
                        }
                    } else if (ing.usesConsumed) {
                        baseUses = ing.usesConsumed;
                    }

                    const ingCount = (ing.count !== undefined && ing.count !== null) ? ing.count : 1;
                    const totalUsesNeeded = isSewing 
                        ? baseUses + Math.max(0, ingCount - 1)
                        : baseUses * ingCount;
                        
                    let usesNeeded = totalUsesNeeded;

                    for (let i = 0; i < unusedIndices.length && usesNeeded > 0; i++) {
                        const idx = unusedIndices[i];
                        const item = station.inventory[idx];
                        const def = itemData[item.itemId] || {};
                        const maxUses = item.maxUses || def.maxUses || 0;

                        // Required uses for this item: 1st spool needs baseUses, secondary spools need 1 use
                        const requiredForThisItem = (isSewing && i > 0) ? 1 : baseUses;

                        if (maxUses > 0) {
                            const currentUsed = item.timesUsed || 0;
                            const remaining = Math.max(0, maxUses - currentUsed);
                            if (remaining <= 0) {
                                indicesToRemove.add(idx);
                                continue;
                            }

                            const consume = Math.min(requiredForThisItem, remaining);
                            item.timesUsed = currentUsed + consume;
                            usesNeeded -= consume;

                            if (item.timesUsed >= maxUses) {
                                indicesToRemove.add(idx);
                            }
                        } else {
                            // Standard item (consumed per item)
                            indicesToRemove.add(idx);
                            usesNeeded -= 1;
                        }
                    }

                    if (usesNeeded > 0) {
                        log.warn(`${logPrefix} Missing ingredient uses: ${reqKey} (Needed: ${totalUsesNeeded}, Deficit: ${usesNeeded})`);
                        hasIngredients = false;
                        break;
                    }
                }

                if (!hasIngredients) {
                    socket.emit('craftingError', "Missing ingredients!");
                    return;
                }

                // Consumption: Create new inventory excluding removed indices
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
            syncPlayerState();
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
                        syncPlayerState();
                    }

                    // Unlock Station
                    if (craftingStations[stationId]) {
                        craftingStations[stationId].activeCrafterId = null;
                        craftingStations[stationId].craftingState = null; // Ensure no resume state is left
                    }

                    // Spawn Result

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
        syncPlayerState();

        // Explicitly notify the client to stop the UI
        socket.emit('craftingPaused', {
            remainingTime: remaining,
            recipeId: station && station.craftingState ? station.craftingState.recipeId : null
        });
    });

    // 5. Disconnect Cleanup Safeguard
    socket.on('disconnect', () => {
        try {
            const player = players[socket.id];
            if (!player) return;

            // Cancel active crafting timer
            if (player.craftingTimer) {
                clearTimeout(player.craftingTimer);
                player.craftingTimer = null;
            }

            const stationId = player.currentStationId;
            if (stationId && craftingStations[stationId]) {
                const station = craftingStations[stationId];
                if (station.activeCrafterId === socket.id) {
                    // Release station lock
                    station.activeCrafterId = null;

                    // Save remaining progress to station if player was crafting
                    if (player.isCrafting && player.currentCraftingRecipeId && player.craftingStartTime) {
                        const elapsed = Date.now() - player.craftingStartTime;
                        const remaining = Math.max(0, (player.craftingDuration || 0) - elapsed);
                        station.craftingState = {
                            recipeId: player.currentCraftingRecipeId,
                            customCraftingData: player.currentCraftingCustomData,
                            remainingTime: remaining
                        };
                        log.info(`${logPrefix} Disconnected mid-crafting. Saved paused progress (${remaining}ms) to station ${stationId}`);
                    }
                }
            }

            player.isCrafting = false;
            player.craftingStartTime = null;
            player.craftingDuration = null;
            player.currentCraftingRecipeId = null;
            player.currentStationId = null;
        } catch (disconnectErr) {
            log.error(`${logPrefix} Error cleaning up crafting state on disconnect:`, disconnectErr);
        }
    });
};

/**
 * Server-loop tick helper that validates player proximity to their active crafting station.
 * Invoked per-player on every server tick loop iteration in server-loop.js.
 * Automatically pauses crafting and persists progress if player moves > 180px away.
 * 
 * @param {string} socketId - Socket ID of the player
 * @param {Object} player - Active player entity object
 * @param {Object} io - SocketIO server instance
 * @param {Object} craftingStations - Global active crafting stations dictionary
 */
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

module.exports = { init, checkCraftingRange, recipes };
