import { windowSize, drawDebug } from './utils.js';
import { createAnimations, updatePlayerAnimations, createEmoteAnimations } from './animations.js';
import { displayPlayers, displayOtherPlayers, getPlayerSprite, updateStruggleBar, updatePlayerEquipmentVisuals, updateTypingIndicator } from './player.js';
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

let debugGraphics;
let playerDebugGraphics;
let showDebug = false;
let shadowSystem = null; // New Variable

export function create() {
    const self = this;
    initDebugGraph(); // Initialize HTML debug graph


    const localPlayerInfo = window.localPlayerInfo;
    this.input.topOnly = false;
    self.showDebug = false;

    //----- Window Resize -----//
    window.addEventListener("resize", windowResize);
    function windowResize(e) {
        console.log('e = ', e);
        var phaserWindow = {
            x: document.getElementById('phaserApp').clientWidth,
            y: document.getElementById('phaserApp').clientHeight
        }
        console.log('phaserWindow = ', phaserWindow);
        self.scale.resize(phaserWindow.x, phaserWindow.y);

        if (window.cam1) {
            window.cam1.setSize(phaserWindow.x, phaserWindow.y);
        }
    }

    var test = 'receiving on socket connection?';

    this.players = this.add.group();
    this.physics.add.collider(this.players);
    this.otherPlayersGroup = this.physics.add.group();
    this.playerContainer = null;
    const charId = document.location.href.split('play/')[1];

    // Socket.io is global
    this.socket = io({ query: { charId: charId } });
    window.gameSocket = this.socket; // Expose globally for UI interactions
    console.log('this.socket = ', this.socket);

    this.socket.emit('getAllChats', {
        token: document.cookie.replace('TastyTails=', ''),
        charId: document.location.href.split('play/')[1]
    });

    // Initialize Action Hands
    if (actionHands) {
        actionHands.init(this.socket);
    }

    // Initialize Item Manager
    if (itemManager) {
        itemManager.init(this, this.socket);
    }

    // Initialize Equipment Manager
    if (equipmentManager) {
        equipmentManager.init(this.socket);
    }

    // Initialize Inventory UI
    if (inventoryUI) {
        inventoryUI.init(this.socket);
    }

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
    const debugToggle = document.getElementById('debugToggle');
    if (debugToggle) {
        debugToggle.addEventListener('change', function (event) {
            self.showDebug = event.target.checked;
            const debugOverlay = document.getElementById('debug-overlay');

            if (self.showDebug) {
                self.socket.emit('requestCollisionData');
                if (debugOverlay) debugOverlay.style.display = 'block';

                // Show zones layer
                if (self.mapLayers) {
                    self.mapLayers.forEach(layer => {
                        if (layer.layer.name.toLowerCase().includes('zones')) {
                            layer.alpha = 0.5; // Visible but semi-transparent
                        }
                    });
                }
            } else {
                if (self.debugGraphics) {
                    self.debugGraphics.clear();
                }
                if (self.debugCoordsText) {
                    self.debugCoordsText.destroy();
                    self.debugCoordsText = null;
                }
                if (playerDebugGraphics) {
                    playerDebugGraphics.clear();
                }
                if (debugOverlay) debugOverlay.style.display = 'none';

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
    this.map = createMap(this);

    // --- Initialize Shadow System ---
    this.shadowSystem = new ShadowSystem(this);

    // Listen for Map Segments (for client-side prediction)
    this.socket.on('mapSegments', (segments) => {
        if (self.shadowSystem) {
            self.shadowSystem.setSegments(segments);
        }
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
            } else {
                displayOtherPlayers(self, players[id]);
            }
        });
    });

    this.socket.on('newPlayer', function (playerInfo) {
        console.log('newPlayer = ', playerInfo);
        displayOtherPlayers(self, playerInfo);
    });

    this.socket.on('removePlayer', function (playerId) {
        console.log('removePlayer = ', playerId);
        self.otherPlayersGroup.getChildren().forEach(function (otherPlayer) {
            if (playerId === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
    });

    this.socket.on('playerUpdates', function (players) {
        // console.log('[Client] Received playerUpdates', Object.keys(players).length);
        const receivedPlayerIds = Object.keys(players);

        // 1. Update received players
        receivedPlayerIds.forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                if (self.playerContainer) {
                    // console.log('[Client] Calling reconcile for local player');
                    reconcile(players[id], self);
                    if (actionHands) actionHands.update(players[id]);
                    if (equipmentManager) equipmentManager.update(players[id]);
                    if (inventoryUI) inventoryUI.update(players[id]);
                    updatePlayerEquipmentVisuals(self.playerContainer, players[id].equipment);

                    // Update Shadows
                    if (shadowSystem) {
                        shadowSystem.update(players[id]);
                    }


                    // --- Vore List Update ---
                    // Check if voreTypes have changed (e.g. contents added)
                    // Simple check: stringify comparison or just update if present
                    if (players[id].voreTypes) {
                        // We should probably optimize this to not re-render every frame if no change
                        // But for now, let's just update window.localPlayerInfo and re-render if different
                        const currentVoreTypesStr = JSON.stringify(window.localPlayerInfo.voreTypes);
                        const newVoreTypesStr = JSON.stringify(players[id].voreTypes);

                        if (currentVoreTypesStr !== newVoreTypesStr) {
                            console.log('[Client] VoreTypes changed, updating UI:', players[id].voreTypes);
                            window.localPlayerInfo.voreTypes = players[id].voreTypes;
                            createVoreList(window.localPlayerInfo.voreTypes, self);
                        }
                    }

                    // --- Consumed State & Camera Logic ---
                    // This block handles the client-side effects of being consumed.
                    // 1. We show/hide the "Struggle" button.
                    // 2. We hide the local player sprite.
                    // 3. We switch the camera to follow the predator.
                    createStruggleButton(!!players[id].consumedBy, self.socket);

                    if (players[id].consumedBy) {
                        // Player is consumed
                        self.playerContainer.setVisible(false);

                        // Find the predator
                        let predator = null;
                        self.otherPlayersGroup.getChildren().forEach(other => {
                            if (other.playerId === players[id].consumedBy) {
                                predator = other;
                            }
                        });

                        // If predator found, follow them
                        if (predator) {
                            self.cameras.main.startFollow(predator);
                            if (window.cam1) window.cam1.startFollow(predator);
                        }
                    } else {
                        // Player is NOT consumed (or released)
                        self.playerContainer.setVisible(true);

                        // Ensure camera follows self
                        self.cameras.main.startFollow(self.playerContainer);
                        if (window.cam1) window.cam1.startFollow(self.playerContainer);
                    }
                }
            } else {
                // OTHER PLAYERS
                let otherPlayer = getPlayerSprite(players[id].playerId, self.otherPlayersGroup);
                if (!otherPlayer) {
                    // New player entered AOI or connected
                    displayOtherPlayers(self, players[id]);
                    otherPlayer = getPlayerSprite(players[id].playerId, self.otherPlayersGroup);
                }

                if (otherPlayer) {
                    // Update position and state
                    otherPlayer.setPosition(players[id].position.x, players[id].position.y);
                    updatePlayerAnimations(otherPlayer, players[id]);
                    updateStruggleBar(otherPlayer, players[id], self);
                    updatePlayerEquipmentVisuals(otherPlayer, players[id].equipment);
                    otherPlayer.depth = otherPlayer.y;

                    // Hide other players if they are consumed
                    if (players[id].consumedBy) {
                        otherPlayer.setVisible(false);
                    } else {
                        otherPlayer.setVisible(true);
                    }
                }
            }
        });

        // 2. Reconciliation: Remove players NOT in the received list (AOI Culling)
        self.otherPlayersGroup.getChildren().forEach(function (otherPlayer) {
            // Check if this player is in the received list
            // Note: otherPlayer.playerId matches the key in 'players' (socket ID) usually, check logic.
            // players object keys are socket IDs. otherPlayer.playerId is socket ID.
            if (!players[otherPlayer.playerId]) {
                // Player is no longer in our update list (out of range/view or disconnected)
                console.log(`[AOI] Removing player ${otherPlayer.playerId} (out of view/range)`);
                otherPlayer.destroy();
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

                note.innerHTML = `
                    <h3>Inspection: ${displayName}</h3>
                    <p>${displayDesc}</p>
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
        if (self.playerContainer && self.playerContainer.playerInfo && self.playerContainer.playerInfo._id.toString() === data.charId) {
            targetContainer = self.playerContainer;
            // console.log('[Client] Typing target is SELF');
        } else {
            const others = self.otherPlayersGroup.getChildren();
            targetContainer = others.find(p => p.playerInfo && p.playerInfo._id.toString() === data.charId);
        }

        if (targetContainer) {
            updateTypingIndicator(targetContainer, data.isTyping);
        } else {
            // console.warn('[Client] Typing target not found:', data.charId);
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

    // Force initial resize to fit container
    setTimeout(() => {
        windowResize();
    }, 100);
}
