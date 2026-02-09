import { windowSize, drawDebug } from './utils.js';
import { createAnimations, updatePlayerAnimations, createEmoteAnimations } from './animations.js';
import { displayPlayers, displayOtherPlayers, getPlayerSprite, updateStruggleBar, updatePlayerEquipmentVisuals, updateTypingIndicator, updateCraftingBar, updatePlayerCosmetics } from './player.js';
import { reconcile } from './reconcile.js';
import { createMap } from './map.js';
import { initializeTabs } from './tabs.js';
import { createVoreList, createStruggleButton, createPredatorVoreControls, removePredatorVoreControls } from './ui.js';
import { initDebugGraph } from './debugGraph.js';
import { actionHands } from './hands.js';

import { ShadowSystem } from './shadows.js';  // New Import

import { itemManager } from './items.js';
import { equipmentManager } from './equipment.js';
import { inventoryUI } from './inventory.js';
import { CraftingUI } from './crafting.js'; // NEW
import { initCorpses } from './corpses.js';
import { Animal } from './entity/Animal.js'; // NEW

let debugGraphics;
let playerDebugGraphics;
let showDebug = false;
let shadowSystem = null; // New Variable

export function create() {
    const self = this;
    window.gameScene = self; // Expose globally for UI interactions
    initDebugGraph(); // Initialize HTML debug graph

    // --- LOADING SCREEN HANDOVER ---
    // FIX: Retrieve from window and attach to scene
    // --- DOM LOADING LOGIC ---
    // Initialize Loading State
    this.loadingFlags = {
        player: false,
        items: false,
        segments: false,
        mapObjects: false
    };

    // [FIX] Store initial door states to handle race condition (Packet vs Map Build)
    this.startDoorStates = null;

    this.isFadingOut = false;

    // Helper: Update Progress (DOM)
    this.updateLoadingProgress = function (percent, message) {
        const barFill = document.getElementById('loading-bar-fill');
        const percentText = document.getElementById('loading-percent');
        const statusText = document.getElementById('loading-text');

        if (barFill) barFill.style.width = `${Math.floor(percent * 100)}%`;
        if (percentText) percentText.innerText = `${Math.floor(percent * 100)}%`;
        if (message && statusText) statusText.innerText = message;
    };

    // Helper: Check Completion
    this.checkLoadingComplete = function () {
        // console.log('[Loading] Checking flags:', self.loadingFlags);

        // Need all flags to proceed
        if (self.loadingFlags.player && self.loadingFlags.items && self.loadingFlags.segments && self.loadingFlags.mapObjects) {

            // [FIX] Apply cached door states now that map objects are built
            if (self.startDoorStates && self.objectGroup) {
                console.log('[Client] Applying cached door states after map build.');
                self.startDoorStates.forEach(d => {
                    const doorSprite = self.objectGroup.getChildren().find(obj => obj.objectInfo && obj.objectInfo.uniqueId === d.id);
                    if (doorSprite) {
                        if (d.state === 'open') {
                            doorSprite.play('door_open');
                            doorSprite.body.enable = false;
                        } else {
                            doorSprite.play('door_close');
                            doorSprite.body.enable = true;
                        }
                        doorSprite.objectInfo.state = d.state;
                    }
                });
            }

            if (!self.isFadingOut) {
                console.log('[Loading] All flags ready. Starting Fade...');
                self.updateLoadingProgress(1.0, "Ready!");
                self.isFadingOut = true;

                // Force a camera update
                if (self.cameras && self.cameras.main) {
                    self.cameras.main.dirty = true;
                }

                // 0.5s buffer to let everything settle visible behind the screen
                self.time.delayedCall(100, () => {
                    console.log('[Loading] Fading out overlay...');
                    const overlay = document.getElementById('loading-overlay');
                    if (overlay) {
                        // Trigger CSS transition (opacity: 0)
                        overlay.style.opacity = '0';

                        // Remove from flow after transition (1.5s matches CSS)
                        setTimeout(() => {
                            overlay.style.display = 'none';
                            console.log('[Client] Loading Complete. Overlay Halted.');
                        }, 600);
                    }
                });
            }
        }
    };

    this.updateLoadingProgress(0.6, "Building Map...");


    const localPlayerInfo = window.localPlayerInfo;
    this.playerInfo = localPlayerInfo; // Ensure it's attached to the scene so self.playerInfo works
    this.input.topOnly = false;
    self.showDebug = false;

    //----- Window Resize -----//


    var test = 'receiving on socket connection?';

    this.players = this.add.group();
    this.physics.add.collider(this.players);
    this.otherPlayersGroup = this.physics.add.group();
    this.otherPlayersMap = new Map(); // Optimization: O(1) Lookup
    this.playerContainer = null;
    const charId = document.location.href.split('play/')[1];

    // Socket.io is global
    // Socket.io is global
    if (this.loadingScreen) this.updateLoadingProgress(0.7, "Connecting to Server...");
    this.socket = io({ query: { charId: charId } });
    window.gameSocket = this.socket; // Expose globally for UI interactions
    console.log('this.socket = ', this.socket);

    this.socket.emit('getAllChats', {
        token: document.cookie.replace('TastyTails=', ''),
        charId: document.location.href.split('play/')[1]
    });

    // --- DOM Cache for Debugging ---
    // Avoids querying the DOM every frame
    this.debugUI = {
        coords: document.getElementById('debug-coords'),
        bandwidth: document.getElementById('debug-bandwidth'),
        renderStats: document.getElementById('debug-render-stats'),
        graph: document.getElementById('debug-graph'),
        options: document.getElementById('optionsDisplay')
    };

    // --- Bandwidth Tracking ---
    self.bandwidthStats = {
        bytesIn: 0,
        bytesOut: 0,
        lastCheck: Date.now()
    };

    // Helper: Only calculate size if debug stats are actually visible
    // accessing offsetParent is a cheap way to check if an element (or its parent) has display:none
    // OPTIMIZATION: Do NOT check DOM (offsetParent) on every packet. It causes Reflow.
    // Use a boolean flag controlled by the toggle listener.
    const isDebugVisible = () => {
        return self.showDebug; // Simple boolean check
    };

    // 1. Outgoing (Monkey-patch emit)
    const originalEmit = this.socket.emit;
    this.socket.emit = function (eventName, data, ...args) {
        if (data && isDebugVisible()) {
            // Rough estimation of payload size
            const str = JSON.stringify(data);
            if (str) self.bandwidthStats.bytesOut += str.length + 20; // +20 overhead
        }
        return originalEmit.apply(this, [eventName, data, ...args]);
    };

    // 2. Incoming (Wildcard listener)
    this.socket.onAny((event, ...args) => {
        if (isDebugVisible()) {
            // args is an array of arguments.
            const str = JSON.stringify(args);
            if (str) self.bandwidthStats.bytesIn += str.length + 20;
        }
    });

    // Initialize Action Hands
    if (actionHands) {
        actionHands.init(this.socket);
    }

    // Initialize Item Manager
    if (itemManager) {
        itemManager.init(this, this.socket);
    }

    // Reset interaction flag on pointer up to prevent blocking future clicks
    this.input.on('pointerup', (pointer) => {
        pointer.interactionHandled = false;
    });

    // Handle Pickup Failure (e.g. Server rejected range)
    this.socket.on('pickupFailed', (data) => {
        console.log('[Game] Pickup Failed:', data.reason);
        const { reason } = data;

        if (reason === 'out of reach') {
            // Debounce Feedback (limit to once every 500ms)
            const now = Date.now();
            if (self.lastReachFeedbackTime && now - self.lastReachFeedbackTime < 500) {
                return;
            }
            self.lastReachFeedbackTime = now;

            if (window.showWorldToast && self.playerContainer && self.cameras && self.cameras.main) {
                // Convert World Position to Screen Position
                // showWorldToast expects ClientX/Y (Screen coordinates relative to viewport)
                const worldX = self.playerContainer.x;
                const worldY = self.playerContainer.y - 100; // Above head

                // Project to screen
                const camera = self.cameras.main;
                const screenX = (worldX - camera.worldView.x) * camera.zoom;
                const screenY = (worldY - camera.worldView.y) * camera.zoom;

                // Add canvas offset if any? Usually canvas is top-left 0,0 but let's assume relative to viewport.
                // Phaser input pointer uses event.clientX which is viewport.
                // We might need to add the canvas offset if the canvas isn't full screen 0,0.
                // But for now, assuming full screen app or standard projection:

                // Check if on screen
                if (screenX >= 0 && screenX <= camera.width && screenY >= 0 && screenY <= camera.height) {
                    window.showWorldToast(screenX, screenY, "Out of Reach");
                }
            }
            if (window.addLocalSystemMessage) {
                window.addLocalSystemMessage(`Item is too far away.`);
            }
        }
    });

    // Initialize Equipment Manager
    if (equipmentManager) {
        equipmentManager.init(this.socket);
    }

    // Initialize Items
    // itemManager.init is checked above, but let's consolidate or leave if fine.
    // Actually, line 73 checks 'if (itemManager)' which is safe.
    // Line 82 calls it blindly. I will remove the blind one as it's redundant.

    inventoryUI.init(this.socket);
    this.craftingUI = new CraftingUI(this.socket, this); // Initialize Crafting UI (Socket first, Scene/Player second)
    window.craftingUI = this.craftingUI; // Expose globally for Inventory integration

    // These are assumed to be global functions defined in play.ejs or other included scripts
    if (typeof initializeChat === 'function') initializeChat(this.socket);
    if (typeof initializeContextMenu === 'function') initializeContextMenu(this, this.socket);

    // Sync initial character data (including MongoDB _id) with the server
    this.socket.emit('characterUpdate', localPlayerInfo);

    // --- DEBUG GRAPHICS INIT ---
    this.debugGraphics = this.add.graphics();
    debugGraphics = this.debugGraphics; // Assign to module-level variable if needed
    playerDebugGraphics = this.add.graphics(); // Initialize player debug graphics

    // --- DEBUG TOGGLE LISTENER ---
    // --- DEBUG TOGGLE LISTENER ---
    const debugToggle = document.getElementById('debugToggle');
    if (debugToggle) {
        debugToggle.addEventListener('change', function (event) {
            self.showDebug = event.target.checked;
            // self.showDebug is used in update.js to draw hitboxes

            if (self.showDebug) {
                self.socket.emit('requestCollisionData');

                // Show zones layer transparently
                if (self.mapLayers) {
                    self.mapLayers.forEach(layer => {
                        if (layer.layer.name.toLowerCase().includes('zones')) {
                            layer.alpha = 0.5;
                        }
                    });
                }
            } else {
                // Clear debug graphics
                if (self.debugGraphics) {
                    self.debugGraphics.clear();
                }
                if (playerDebugGraphics) {
                    playerDebugGraphics.clear();
                }

                // key logic change: we no longer toggle a separate 'debug-overlay' check here
                // as the stats are permanently embedded in the options menu (visible when menu is open).

                // Hide zones layer
                if (self.mapLayers) {
                    self.mapLayers.forEach(layer => {
                        if (layer.layer.name.toLowerCase().includes('zones')) {
                            layer.alpha = 0;
                        }
                    });
                }
            }
        });
    }

    // Create Map
    const onMapProgress = (percent) => {
        // Map Building Phase: 50% -> 80%
        const base = 0.50;
        const range = 0.30;
        const total = base + (percent * range);
        self.updateLoadingProgress(total, `Building Map... ${Math.floor(percent * 100)}%`);
    };
    this.map = createMap(this, onMapProgress);

    // --- Initialize Shadow System ---
    this.shadowSystem = new ShadowSystem(this);

    // --- Initialize Corpse System ---
    initCorpses(this, this.socket);

    // Listen for Map Segments (for client-side prediction)
    // Listen for Map Segments (for client-side prediction)
    this.socket.on('mapSegments', (segments) => {
        if (self.shadowSystem) {
            self.shadowSystem.setSegments(segments);
        }

        // [MODIFIED] Terrain/Segments Loaded
        self.loadingFlags.segments = true;
        self.updateLoadingProgress(0.90, "Loading Terrain...");
        self.checkLoadingComplete();
    });

    // Add collision with map objects
    if (this.objectGroup) {
        this.physics.add.collider(this.players, this.objectGroup);
    } else {
        console.warn('objectGroup not created in createMap');
    }

    // Socket Listeners
    this.socket.on('currentPlayers', function (players) {
        console.log('players = ', players);
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                displayPlayers(self, players[id]);
                // Sync Equipment on Load
                if (equipmentManager) {
                    console.log('[Client] Syncing initial equipment:', players[id].equipment);
                    equipmentManager.update(players[id]);
                }
                // Initial Shadow Update
                if (shadowSystem) {
                    shadowSystem.update(players[id]);
                }

                // Force Inventory UI Update to ensure pockets are visible immediately
                if (inventoryUI) {
                    inventoryUI.update(players[id]);
                }

                // [MODIFIED] Player Ready Stage
                self.loadingFlags.player = true;
                self.updateLoadingProgress(0.85, "Loading Inventory...");
                self.checkLoadingComplete();
            } else {
                const otherPlayer = displayOtherPlayers(self, players[id]);
                if (otherPlayer) {
                    self.otherPlayersMap.set(players[id].playerId, otherPlayer);
                }
            }
        });
    });

    // --- Animal Updates ---
    this.socket.on('animalUpdates', (updates) => {
        // Debug: Log once to confirm receipt
        if (!window._recAnimalUpdates) {
            console.log('[Client] Received animalUpdates:', Object.keys(updates));
            window._recAnimalUpdates = true;
        }

        if (!this.animals) return;

        Object.keys(updates).forEach(id => {
            const data = updates[id];
            // Match ID
            // Server ID Format: animals_323
            // Client ID Format (map.js): animals_323
            const animal = this.animals.getChildren().find(a => a.objectInfo && a.objectInfo.uniqueId === id);

            if (animal) {
                animal.serverUpdate(data);
            } else {
                // Warn once per missing ID
                if (!window[`_missing_${id}`]) {
                    console.warn(`[Client] Update for unknown animal: ${id}`);
                    // debug list available
                    const existing = this.animals.getChildren().map(a => a.objectInfo ? a.objectInfo.uniqueId : 'none');
                    console.log('Available IDs:', existing);
                    window[`_missing_${id}`] = true;
                }
            }
        });
    });

    this.socket.on('newPlayer', function (playerInfo) {
        console.log('newPlayer = ', playerInfo);
        const otherPlayer = displayOtherPlayers(self, playerInfo);
        if (otherPlayer) {
            self.otherPlayersMap.set(playerInfo.playerId, otherPlayer);
        }
    });

    this.socket.on('removePlayer', function (playerId) {
        console.log('removePlayer = ', playerId);
        const otherPlayer = self.otherPlayersMap.get(playerId);
        if (otherPlayer) {
            otherPlayer.destroy();
            self.otherPlayersMap.delete(playerId);
        } else {
            // Fallback for safety
            self.otherPlayersGroup.getChildren().forEach(function (otherPlayer) {
                if (playerId === otherPlayer.playerId) {
                    otherPlayer.destroy();
                }
            });
        }
    });

    this.socket.on('playerUpdates', function (players, removedIds) {
        // console.log('[Client] Received playerUpdates', Object.keys(players).length);
        const receivedPlayerIds = Object.keys(players);

        // 1. Update received players
        receivedPlayerIds.forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                if (self.playerContainer) {
                    // console.log('[Client] Calling reconcile for local player');

                    // 1. Merge incoming delta into local authoritative state first
                    // Object.assign is shallow, but sufficient because server sends full component objects (pos, equipment) if they change.
                    if (players[id].stats) {
                        console.log('[Client] Received stats update:', players[id].stats);
                    }

                    // CHECK FOR DEATH STATE CHANGE (Compare with current state)
                    const deathStateChanged = players[id].hasOwnProperty('isDead') && players[id].isDead !== self.playerContainer.playerInfo.isDead;

                    Object.assign(self.playerContainer.playerInfo, players[id]);

                    // 2. Use the Fully Merged State for logic
                    const fullState = self.playerContainer.playerInfo;

                    // [FIX] Re-render if death state changed (Alive <-> Spirit)
                    if (deathStateChanged) {
                        console.log('[Client] Death state changed for self. Re-rendering.');
                        if (self.playerContainer) self.playerContainer.destroy();
                        displayPlayers(self, fullState);
                        return;
                    }

                    reconcile(fullState, self);

                    if (actionHands) actionHands.update(fullState);
                    if (equipmentManager) equipmentManager.update(fullState);
                    if (inventoryUI) inventoryUI.update(fullState);

                    // For functions that took specific properties, verify they use the merged state or pass the property from fullState
                    updatePlayerEquipmentVisuals(self.playerContainer, fullState.equipment);
                    updateCraftingBar(self.playerContainer, fullState, self);

                    // Update Shadows
                    if (shadowSystem) {
                        shadowSystem.update(fullState);
                    }

                    // [FIX] Update Cosmetics (Tints/Textures)
                    updatePlayerCosmetics(self.playerContainer, fullState);


                    // --- Vore List Update ---
                    if (players[id].voreTypes) {
                        const currentVoreTypesStr = JSON.stringify(window.localPlayerInfo.voreTypes);
                        const newVoreTypesStr = JSON.stringify(fullState.voreTypes);

                        if (currentVoreTypesStr !== newVoreTypesStr) {
                            console.log('[Client] VoreTypes changed, updating UI:', fullState.voreTypes);
                            window.localPlayerInfo.voreTypes = fullState.voreTypes;
                            createVoreList(window.localPlayerInfo.voreTypes, self);
                        }
                    }

                    // --- Consumed State & Camera Logic ---
                    createStruggleButton(!!fullState.consumedBy, self.socket);

                    if (fullState.consumedBy) {
                        // Player is consumed
                        self.playerContainer.setVisible(false);

                        // Find the predator
                        let predator = null;
                        self.otherPlayersGroup.getChildren().forEach(other => {
                            if (other.playerId === fullState.consumedBy) {
                                predator = other;
                            }
                        });

                        // If predator found, follow them
                        if (predator) {
                            self.cameras.main.startFollow(predator);
                            if (window.cam1) window.cam1.startFollow(predator);
                        }
                    } else {
                        self.playerContainer.setVisible(true);
                        self.cameras.main.startFollow(self.playerContainer);
                        if (window.cam1) window.cam1.startFollow(self.playerContainer);
                    }
                }
            } else {
                // OTHER PLAYERS
                let otherPlayer = self.otherPlayersMap.get(players[id].playerId);

                if (!otherPlayer) {
                    // New player entered AOI or connected
                    // [FIX] Ensure we have a FULL packet (with position AND visuals) before creating
                    if (players[id].position && players[id].tail && players[id].body) {
                        otherPlayer = displayOtherPlayers(self, players[id]);
                        if (otherPlayer) {
                            self.otherPlayersMap.set(players[id].playerId, otherPlayer);
                        }
                    } else {
                        // Received delta for unknown player. Ignore it.
                    }
                }

                if (otherPlayer) {
                    // CHECK FOR DEATH STATE CHANGE (Other Player)
                    if (players[id].hasOwnProperty('isDead') && players[id].isDead !== otherPlayer.playerInfo.isDead) { // [FIX] Only re-render if CHANGED
                        console.log(`[Client] Death state changed for ${players[id].playerId}. Re-rendering.`);

                        // Update info first so displayOtherPlayers has latest isDead status
                        Object.assign(otherPlayer.playerInfo, players[id]);
                        const fullState = otherPlayer.playerInfo;

                        // [FIX] Destroy old sprite explicitely
                        if (otherPlayer.destroy) otherPlayer.destroy();

                        const newSprite = displayOtherPlayers(self, fullState);
                        self.otherPlayersMap.set(players[id].playerId, newSprite);
                        return; // Sprite recreated, skip update logic
                    }

                    // Update position and state
                    let isPredicted = false;
                    if (players[id].isHeld && players[id].heldBySocketId) {
                        const holderId = players[id].heldBySocketId;
                        if (self.socket && self.socket.id === holderId) {
                            isPredicted = true;
                        }
                        else {
                            const holder = self.otherPlayersGroup.getChildren().find(p => p.playerId === holderId);
                            if (holder) isPredicted = true;
                        }
                    }

                    if (!isPredicted) {
                        // --- GLOBAL INTERPOLATION ---
                        if (typeof otherPlayer.targetX === 'undefined') {
                            if (players[id].position) {
                                otherPlayer.setPosition(players[id].position.x, players[id].position.y);
                                otherPlayer.targetX = players[id].position.x;
                                otherPlayer.targetY = players[id].position.y;
                            }
                        } else {
                            if (players[id].position) {
                                otherPlayer.targetX = players[id].position.x;
                                otherPlayer.targetY = players[id].position.y;
                            }
                        }
                    }
                    // Update playerInfo with latest server state (Merge Delta)
                    Object.assign(otherPlayer.playerInfo, players[id]);
                    const fullState = otherPlayer.playerInfo;

                    // Use Full State for updates
                    updatePlayerAnimations(otherPlayer, fullState);
                    updateStruggleBar(otherPlayer, fullState, self);
                    updatePlayerEquipmentVisuals(otherPlayer, fullState.equipment);
                    updateCraftingBar(otherPlayer, fullState, self);
                    // [FIX] Update Cosmetics
                    updatePlayerCosmetics(otherPlayer, fullState);

                    // Hide other players if they are consumed
                    if (fullState.consumedBy) {
                        otherPlayer.setVisible(false);
                    } else {
                        otherPlayer.setVisible(true);
                    }
                }
            }
        });

        // 2. Reconciliation: Explicit Removal via 'removedIds' list
        // We NO LONGER auto-remove missing players. We only remove if server says so.
        if (removedIds && Array.isArray(removedIds)) {
            removedIds.forEach(id => {
                const entity = self.otherPlayersMap.get(id);
                if (entity) {
                    console.log(`[AOI] Explicitly removing player ${id}`);
                    entity.destroy();
                    self.otherPlayersMap.delete(id);
                }
            });
        }
    });

    // [FIX] Partial updates for events (Crafting, Interactions)
    // Same as playerUpdates but skips AOI culling. Used when server emits single-player changes.
    this.socket.on('playerStateUpdate', function (players) {
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                // Update Self
                Object.assign(self.playerInfo, players[id]);

                // [FIX] Trigger UI updates so the HUD reflects the new state immediately
                if (actionHands) actionHands.update(self.playerInfo);
                if (inventoryUI) inventoryUI.update(self.playerInfo);
                if (equipmentManager) equipmentManager.update(self.playerInfo);

                // [FIX] Update Cosmetics for Self
                updatePlayerCosmetics(self.playerContainer, self.playerInfo);

                // [FIX] Update Vore UI
                if (players[id].voreTypes) {
                    window.localPlayerInfo.voreTypes = players[id].voreTypes;
                    createVoreList(window.localPlayerInfo.voreTypes, self);
                }

                // Check visuals/equipment updates
                if (players[id].equipment) {
                    // trigger equipment update if valid
                }
            } else {
                // Update Other Player
                let otherPlayer = self.otherPlayersMap.get(players[id].playerId);
                if (otherPlayer) {
                    Object.assign(otherPlayer.playerInfo, players[id]);
                    const fullState = otherPlayer.playerInfo;

                    updatePlayerAnimations(otherPlayer, fullState);
                    updateStruggleBar(otherPlayer, fullState, self);
                    updatePlayerEquipmentVisuals(otherPlayer, fullState.equipment);
                    updateCraftingBar(otherPlayer, fullState, self);
                    // [FIX] Update Cosmetics
                    updatePlayerCosmetics(otherPlayer, fullState);

                    if (players[id].position) {
                        otherPlayer.targetX = players[id].position.x;
                        otherPlayer.targetY = players[id].position.y;
                    }

                    if (fullState.consumedBy) {
                        otherPlayer.setVisible(false);
                    } else {
                        otherPlayer.setVisible(true);
                    }
                }
            }
        });
    });


    // --- Vore Stage Update (Predator Controls) ---
    this.socket.on('voreStageUpdate', function (data) {
        console.log('[Client] voreStageUpdate:', data);
        if (data.predatorId === self.socket.id) {
            // We are the predator
            createPredatorVoreControls(data, self.socket);
        }
        // If we are the target (or anyone else), ensure no controls are shown? 
        // controls are specific to predator client.
    });

    // Listener to clear controls if released
    this.socket.on('voreLog', function (msg) {
        // Simple heuristic: if we have controls open, and log says "released", maybe close?
        // Better: InteractionHandlers should emit specific 'clearVoreControls' or we infer from updates.
        // If we receive playerUpdate and target is no longer consumed/stage 0, we can clear.
        // But playerUpdate is frequent. 
        // For now, relies on explicit handling in createPredatorVoreControls (it clears existing).
        // If Action Ends, we need to clear. 
        // The release button inside the controls clears itself.
    });

    this.socket.on('collisionData', (blockedTiles) => {
        // blockedTiles is an array of {x, y} objects from the server
        // console.log('Received collision data:', blockedTiles);
        window.serverBlockedTiles = blockedTiles; // Store globally or on scene
    });

    this.socket.on('voreUpdate', function (voreUpdate) {
        console.log('voreUpdate = ', voreUpdate);
        // Update local player info if needed
        // This logic was not explicitly in the read code but implied by event handling
    });

    this.socket.on('voreSettingsUpdated', function (data) {
        console.log('voreSettingsUpdated = ', data);
        // data = { playerId, voreTypes }

        // 1. Update local player info if it's us
        if (data.playerId === self.socket.id) {
            window.localPlayerInfo.voreTypes = data.voreTypes;

            // Re-render the Vore List if the UI function is available
            // We need to import createVoreList or assume it's global?
            // It is exported from ui.js. We need to check if it's imported here or available globally.
            // create.js imports nothing from ui.js currently? No, it doesn't.
            // But ui.js is likely loaded.
            // Wait, create.js is a module.
            // I need to import createVoreList in create.js or make it global.
            // ui.js exports it.

            // Dynamic import or assume it's attached to window?
            // ui.js seems to be a module.
            // I'll check imports in create.js.
            // It imports from animations, player, reconcile, map, tabs.
            // I should add import { createVoreList } from './ui.js'; to create.js

            // For now, I'll assume I can call it if I import it.
            // But I can't add import easily in the middle of file.
            // I'll check if I can add it to the top.

            // Actually, I'll just use the global function if it exists, or dispatch an event?
            // Better: I'll add the import to the top of create.js in a separate step.
            // For this step, I'll just put the logic here assuming createVoreList is available or I'll use a custom event.

            // Let's try to call createVoreList directly if imported.
            // I will add the import in the next step.
            if (typeof createVoreList === 'function') {
                createVoreList(data.voreTypes, self);
            } else {
                // Fallback: maybe it's on window?
                // or try to re-import?
                import('./ui.js').then(module => {
                    module.createVoreList(data.voreTypes, self);
                });
            }
        }
    });

    this.socket.on('examinedInfo', (info) => {
        console.log('Received examined info:', info);
        const lookDisplay = document.getElementById('lookDisplay');
        if (lookDisplay) {
            const note = lookDisplay.querySelector('.paper-note');
            if (note) {
                const displayName = info.name || (info.firstName ? `${info.firstName} ${info.lastName}` : 'Unknown');
                const displayDesc = info.description || info.icDescrip || 'No description available.';
                const flavor = info.flavor ? `<p style="font-style:italic; color:#aaa; margin-top:5px;">${info.flavor}</p>` : '';

                note.innerHTML = `
                    <h3>Inspection: ${displayName}</h3>
                    <p>${displayDesc}</p>
                    ${flavor}
                `;
            }
            // Switch to Look tab
            const lookTab = document.getElementById('lookTab');
            if (lookTab) lookTab.click();
        }
    });

    this.socket.on('typing', (data) => {
        // console.log('[Client] Received typing event:', data);
        let targetContainer = null;
        if (self.playerContainer && self.playerContainer.playerInfo && self.playerContainer.playerInfo._id && self.playerContainer.playerInfo._id.toString() === data.charId) {
            targetContainer = self.playerContainer;
            // console.log('[Client] Typing target is SELF');
        } else {
            const others = self.otherPlayersGroup.getChildren();
            targetContainer = others.find(p => p.playerInfo && p.playerInfo._id && p.playerInfo._id.toString() === data.charId);
        }

        if (targetContainer) {
            updateTypingIndicator(targetContainer, data.isTyping);
        } else {
            // console.warn('[Client] Typing target not found:', data.charId);
        }
    });



    // --- Door Update Listener ---
    this.socket.on('doorUpdate', (data) => {
        // data = { id, state, blocked, lightBlock }
        // Find the door sprite
        if (self.objectGroup) {
            const doorSprite = self.objectGroup.getChildren().find(obj => obj.objectInfo && obj.objectInfo.uniqueId === data.id);
            if (doorSprite) {
                // Play Animation
                if (data.state === 'open') {
                    doorSprite.play('door_open');
                    doorSprite.body.enable = false; // Disable collision
                } else {
                    doorSprite.play('door_close');
                    doorSprite.body.enable = true; // Enable collision
                }

                // Update Metadata if needed
                doorSprite.objectInfo.state = data.state;
                // Collision is handled by body.enable above
            }
        }
    });

    // [FIX] Initial Door States (Bulk Update on Connect)
    this.socket.on('doorStates', (doors) => {
        // console.log('[Client] Received initial door states:', doors.length);
        self.startDoorStates = doors; // Cache for race condition

        if (self.objectGroup) {
            doors.forEach(d => {
                const doorSprite = self.objectGroup.getChildren().find(obj => obj.objectInfo && obj.objectInfo.uniqueId === d.id);
                if (doorSprite) {
                    if (d.state === 'open') {
                        doorSprite.play('door_open');
                        doorSprite.body.enable = false;
                    } else {
                        doorSprite.play('door_close');
                        doorSprite.body.enable = true;
                    }
                    doorSprite.objectInfo.state = d.state;
                }
            });
        }
    });

    // --- Zone-Based Transparency ---
    this.socket.on('zoneUpdate', (data) => {
        const currentZone = data.zone;
        console.log(`[Zone] Entered: ${currentZone}`);

        if (self.objectGroup) {
            self.objectGroup.getChildren().forEach(sprite => {
                if (sprite.clearZone) {
                    // If sprite's clearZone matches current zone, fade OUT
                    if (sprite.clearZone === currentZone) {
                        if (sprite.alpha > 0) {
                            self.tweens.add({
                                targets: sprite,
                                alpha: 0,
                                duration: 150
                            });
                        }
                    } else {
                        // Otherwise, ensure it is faded IN
                        if (sprite.alpha < 1) {
                            self.tweens.add({
                                targets: sprite,
                                alpha: 1,
                                duration: 250
                            });
                        }
                    }
                }
            });
        }
    });

    // Initialize Tabs
    initializeTabs();

    // Input Events
    // Input Events
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.UP);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.RIGHT);

    // Create Animations
    // We need sprite keys. In the original code, 'spritesToAnimate' was used.
    // It seems 'spritesToAnimate' is defined on 'self' somewhere?
    // Or it's a list of keys.
    // I need to find where 'spritesToAnimate' comes from.
    // It was used in `createAnimations.call(self, self.spritesToAnimate);`
    // I'll assume it's attached to self or I need to define it.
    // Searching the code... I didn't see where `spritesToAnimate` was defined.
    // It might be in `preload` or earlier in `create` (I might have missed it).
    // I'll check `preload.js` or assume it's available.
    // Actually, I should check `preload.js` to see if it sets it.

    // For now, I'll comment it out or try to find it.
    // If it's missing, animations won't work.
    // I'll add a TODO.
    if (self.spritesToAnimate) {
        createAnimations(self, self.spritesToAnimate);
    } else {
        // Fallback or log
        console.warn('spritesToAnimate not found on scene');
    }

    if (self.emoteKeys) {
        createEmoteAnimations(self, self.emoteKeys);
    }

    // --- Window Resize Handler ---
    function windowResize(e) {
        // console.log('[Resize Event] Triggered', e);
        const container = document.getElementById('phaserApp');
        if (container) {
            const width = container.clientWidth;
            const height = container.clientHeight;
            // console.log('[Resize Event] Dimensions:', width, height);

            self.scale.resize(width, height);

            if (window.cam1) {
                window.cam1.setSize(width, height);
            }

            if (self.cameras && self.cameras.main) {
                self.cameras.main.setSize(width, height);
            }
        }
    }

    // Listen for resize events
    window.addEventListener('resize', windowResize);

    // Force initial resize to fit container immediately (avoids jump)
    windowResize();


}
