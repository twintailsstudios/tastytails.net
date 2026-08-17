/**
 * @fileoverview Phaser Scene Creation & Setup Orchestrator (create.js)
 * 
 * @description
 * Bootstraps client scene rendering, socket networking, environment maps, 
 * subsystem managers, and DOM loading screen handover for TastyTails.net.
 * 
 * Triggered by: Phaser Scene Manager after preload.js finishes asset loading.
 */

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
import { initMedicalUI } from './medicalUI.js';
import { initTargetSelection } from './targetSelection.js';
import { MidiEngine } from './audio/MidiEngine.js';

let debugGraphics;
let playerDebugGraphics;
let showDebug = false;
let shadowSystem = null; // New Variable

/**
 * Safe O(1) retrieval helper for map objects.
 * Evicts inactive or destroyed sprite references automatically.
 * @param {Phaser.Scene} scene
 * @param {string} uniqueId
 * @returns {Phaser.GameObjects.Sprite|null}
 */
function getMapObject(scene, uniqueId) {
    if (!scene.mapObjectsMap) return null;
    const sprite = scene.mapObjectsMap.get(uniqueId);
    if (sprite && sprite.active) return sprite;
    if (sprite && !sprite.active) {
        scene.mapObjectsMap.delete(uniqueId);
    }
    return null;
}

export function create() {
    const self = this;
    window.gameScene = self; // Expose globally for UI interactions
    initDebugGraph(); // Initialize HTML debug graph
    initTargetSelection(); // Initialize Target Selection Paper Doll Widget

    // Initialize MIDI Background Music Subsystem & Start Default Track
    this.midiEngine = new MidiEngine();
    this.midiEngine.init();
    this.midiEngine.isReadyToPlay = false;
    this.midiEngine.loadMidi('/assets/music/test_theme.mid')
        .then(() => {
            console.log('[create] Background music sequence preloaded.');
            this.midiEngine.isReadyToPlay = true;
            // If player container is already spawned, start BGM with initial spawn zone state
            if (this.playerContainer) {
                this.midiEngine.applyInitialZoneState(this.playerContainer.x, this.playerContainer.y);
                this.midiEngine.play();
            }
        })
        .catch(err => {
            console.warn('[create] Could not load default background music:', err);
        });

    // OPTIMIZATION: Fast O(1) lookup Maps for map objects and animal entities
    this.mapObjectsMap = new Map();
    this.animalsMap = new Map();

    // --- LOADING SCREEN HANDOVER ---
    // Initialize Loading State
    this.loadingFlags = {
        player: false,
        items: false,
        segments: false,
        mapObjects: false
    };

    // Store initial door states to handle race condition (Packet vs Map Build)
    this.startDoorStates = null;
    this.startResourceNodeStates = null;

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
        // Need all flags to proceed
        if (self.loadingFlags.player && self.loadingFlags.items && self.loadingFlags.segments && self.loadingFlags.mapObjects) {

            // OPTIMIZATION: Apply cached door states using O(1) Map lookup
            if (self.startDoorStates && self.mapObjectsMap) {
                console.log('[Client] Applying cached door states after map build.');
                self.startDoorStates.forEach(d => {
                    const doorSprite = getMapObject(self, d.id);
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

            // OPTIMIZATION: Apply cached resource node states using O(1) Map lookup
            if (self.startResourceNodeStates && self.mapObjectsMap) {
                console.log('[Client] Applying cached resource node states after map build.');
                self.startResourceNodeStates.forEach(nodeData => {
                    const sprite = getMapObject(self, nodeData.id);
                    if (sprite) {
                        sprite.setFrame(nodeData.frame);
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
    self.showMusicTiles = false;

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
    initMedicalUI(this.socket);
    console.log('this.socket = ', this.socket);

    // Cleanly disconnect socket when leaving the /play page or closing the tab
    const cleanDisconnect = () => {
        if (this.socket && this.socket.connected) {
            this.socket.disconnect();
        }
    };
    window.addEventListener('beforeunload', cleanDisconnect);
    window.addEventListener('pagehide', cleanDisconnect);

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

    // OPTIMIZATION: Lightweight payload byte size estimation without JSON.stringify GC overhead
    const estimatePayloadSize = (payload) => {
        if (!payload) return 0;
        if (typeof payload === 'string') return payload.length;
        if (typeof payload === 'number') return 8;
        if (typeof payload === 'boolean') return 4;
        return 64; // Fast shallow estimate for objects/arrays
    };

    const isDebugVisible = () => {
        return self.showDebug; // Simple boolean check
    };

    // 1. Outgoing (Monkey-patch emit)
    const originalEmit = this.socket.emit;
    this.socket.emit = function (eventName, data, ...args) {
        if (data && isDebugVisible()) {
            self.bandwidthStats.bytesOut += estimatePayloadSize(data) + 20; // +20 overhead
        }
        return originalEmit.apply(this, [eventName, data, ...args]);
    };

    // 2. Incoming (Wildcard listener)
    this.socket.onAny((event, ...args) => {
        if (isDebugVisible()) {
            self.bandwidthStats.bytesIn += estimatePayloadSize(args) + 20;
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

    // Global Capture-Phase UI Click Detector
    // Captures raw DOM event target BEFORE any event bubbling or Phaser input processing
    if (typeof window.isPointerDownOnUI === 'undefined') {
        window.isPointerDownOnUI = false;

        let captureTimer = null;
        const handleCaptureDown = (e) => {
            const target = e.target;
            const tag = target && target.tagName ? target.tagName.toUpperCase() : '';
            const isCanvas = target && (tag === 'CANVAS' || (typeof target.closest === 'function' && target.closest('canvas')));
            window.isPointerDownOnUI = !isCanvas;
        };

        ['pointerdown', 'mousedown', 'touchstart'].forEach(eventType => {
            window.addEventListener(eventType, handleCaptureDown, true);
        });

        const handleCaptureUp = (e) => {
            if (captureTimer) clearTimeout(captureTimer);
            captureTimer = setTimeout(() => {
                window.isPointerDownOnUI = false;
            }, 150);
        };

        ['pointerup', 'mouseup', 'touchend', 'touchcancel'].forEach(eventType => {
            window.addEventListener(eventType, handleCaptureUp, true);
        });
    }

    // Helper to determine if a click event occurred over an HTML UI element
    let lastPointerDownIsUI = false;
    const isClickOnUI = (pointer) => {
        if (window.isPointerDownOnUI) return true;
        if (!pointer) return false;
        const evt = pointer.event;

        // Helper to evaluate element targets for UI matching
        const isUIElement = (target) => {
            if (!target) return false;
            const tag = target.tagName ? target.tagName.toUpperCase() : '';
            if (tag && tag !== 'CANVAS') return true;
            if (typeof target.closest === 'function') {
                if (target.closest('#target-doll-widget') ||
                    target.closest('#target-lens-popout') ||
                    target.closest('.target-zone-node') ||
                    target.closest('.intent-dock-group') ||
                    target.closest('.intent-option') ||
                    target.closest('#active-apparel-pill') ||
                    target.closest('#hands-hud') ||
                    target.closest('#dashboard-cluster')) {
                    return true;
                }
            }
            return false;
        };

        // 1. Direct target check from native browser event
        if (evt && isUIElement(evt.target)) {
            return true;
        }

        // 2. Viewport clientX/clientY check with document.elementFromPoint
        let clientX = null;
        let clientY = null;

        if (evt) {
            if (evt.clientX !== undefined) {
                clientX = evt.clientX;
                clientY = evt.clientY;
            } else if (evt.touches && evt.touches.length > 0) {
                clientX = evt.touches[0].clientX;
                clientY = evt.touches[0].clientY;
            } else if (evt.changedTouches && evt.changedTouches.length > 0) {
                clientX = evt.changedTouches[0].clientX;
                clientY = evt.changedTouches[0].clientY;
            }
        }

        if (clientX !== null && clientY !== null) {
            const el = document.elementFromPoint(clientX, clientY);
            if (isUIElement(el)) {
                return true;
            }
        }

        return false;
    };

    // Global pointer down for ground click-to-move navigation
    this.input.on('pointerdown', (pointer, currentlyOverObjects) => {
        // Accept Primary (Left) Click or Secondary (Right) Click
        if (pointer.button !== 0 && pointer.button !== 2) return;

        // Ignore clicks on HTML UI elements anywhere on screen
        lastPointerDownIsUI = window.isPointerDownOnUI || isClickOnUI(pointer);
        if (lastPointerDownIsUI) return;

        // Skip if a menu/overlay is open or if dropMode is active
        const contextMenu = document.getElementById('contextMenu');
        if (contextMenu && contextMenu.style.display !== 'none') return;
        if (window.dropMode && window.dropMode.active) return;
        if (window.craftingUI && window.craftingUI.isOpen) return;

        // Defer check to allow object-specific pointerdown handlers to run and set interactionHandled = true
        this.time.delayedCall(0, () => {
            if (lastPointerDownIsUI || window.isPointerDownOnUI || isClickOnUI(pointer)) return;
            if (pointer.interactionHandled) return;

            // Also check currentlyOverObjects to avoid moving when clicking on interactive elements that might not have set the flag
            if (currentlyOverObjects && currentlyOverObjects.length > 0) {
                const clickedInteractive = currentlyOverObjects.some(obj => obj.input && obj.input.enabled);
                if (clickedInteractive) return;
            }

            const worldX = pointer.worldX;
            const worldY = pointer.worldY;

            console.log(`[SmartWalk] Navigating to ground coordinates: (${worldX}, ${worldY})`);
            this.smartWalkTarget = {
                x: worldX - 30, // center offset for player container origin
                y: worldY,
                range: 5,
                onReach: () => {
                    console.log(`[SmartWalk] Finished navigating to ground coordinates: (${worldX}, ${worldY})`);
                }
            };
        });
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

    // Initial render of Vore Destinations list on game scene creation
    if (window.localPlayerInfo && window.localPlayerInfo.voreTypes) {
        createVoreList(window.localPlayerInfo.voreTypes, this);
    }

    // --- DEBUG GRAPHICS INIT ---
    this.debugGraphics = this.add.graphics();
    debugGraphics = this.debugGraphics; // Assign to module-level variable if needed
    playerDebugGraphics = this.add.graphics(); // Initialize player debug graphics
    this.musicDebugGraphics = this.add.graphics(); // Initialize music debug graphics layer
    this.musicDebugGraphics.setDepth(19000);
    this.musicDebugTexts = [];

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

    // --- AUDIO & MUSIC OPTIONS UI BINDING ---
    const musicMuteToggle = document.getElementById('musicMuteToggle');
    const musicVolumeSlider = document.getElementById('musicVolumeSlider');
    const musicVolumeValue = document.getElementById('musicVolumeValue');
    const showMusicTilesToggle = document.getElementById('showMusicTilesToggle');

    if (this.midiEngine) {
        if (musicMuteToggle) {
            musicMuteToggle.checked = this.midiEngine.isMuted;
            musicMuteToggle.addEventListener('change', (e) => {
                this.midiEngine.toggleMute();
            });
        }

        if (musicVolumeSlider) {
            const initialVol = Math.round(this.midiEngine.masterVolume * 100);
            musicVolumeSlider.value = initialVol;
            if (musicVolumeValue) musicVolumeValue.innerText = `${initialVol}%`;

            musicVolumeSlider.addEventListener('input', (e) => {
                const val = Number(e.target.value);
                if (musicVolumeValue) musicVolumeValue.innerText = `${val}%`;
                this.midiEngine.setMasterVolume(val / 100);
            });
        }
    }

    if (showMusicTilesToggle) {
        showMusicTilesToggle.checked = Boolean(self.showMusicTiles);
        showMusicTilesToggle.addEventListener('change', (e) => {
            self.showMusicTiles = e.target.checked;

            // Toggle visibility of tilemap music layers
            if (self.mapLayers) {
                self.mapLayers.forEach(layer => {
                    const lname = layer.layer?.name?.toLowerCase() || '';
                    if (lname.includes('music')) {
                        layer.alpha = self.showMusicTiles ? 0.75 : 0;
                    }
                });
            }

            if (!self.showMusicTiles) {
                if (self.musicDebugGraphics) {
                    self.musicDebugGraphics.clear();
                }
                if (self.musicDebugTexts && self.musicDebugTexts.length > 0) {
                    self.musicDebugTexts.forEach(t => t.destroy());
                    self.musicDebugTexts = [];
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
            const isLocalPlayer = (id === self.socket.id) || 
                                  (players[id] && players[id].playerId === self.socket.id) || 
                                  (self.playerInfo && players[id] && players[id]._id && self.playerInfo._id && players[id]._id.toString() === self.playerInfo._id.toString());

            if (isLocalPlayer) {
                displayPlayers(self, players[id]);

                // Evaluate spawn location audio gains and start BGM BEFORE loading overlay fades out
                if (self.midiEngine) {
                    self.midiEngine.applyInitialZoneState(players[id].x, players[id].y);
                    if (self.midiEngine.isReadyToPlay && !self.midiEngine.isPlaying) {
                        console.log('[create] Starting background music sequence for spawned character.');
                        self.midiEngine.play();
                    }
                }

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
        if (!this.animals || !this.animalsMap) return;

        Object.keys(updates).forEach(id => {
            const data = updates[id];
            // Robust O(1) + Fallback Animal lookup
            let animal = this.animalsMap.get(id) || 
                         this.animalsMap.get(id.toLowerCase());
            
            if (!animal && this.animalsMap.size > 0) {
                const searchId = id.toLowerCase();
                for (const a of this.animalsMap.values()) {
                    if (a && a.objectInfo && (a.objectInfo.uniqueId?.toLowerCase() === searchId || a.properties?.id?.toLowerCase() === searchId)) {
                        animal = a;
                        break;
                    }
                }
            }

            if (animal && animal.active) {
                animal.serverUpdate(data);
            }
        });
    });

    this.socket.on('newPlayer', function (playerInfo) {
        if (!playerInfo) return;
        const isLocalPlayer = (playerInfo.playerId === self.socket.id) || 
                              (self.playerInfo && playerInfo._id && self.playerInfo._id && playerInfo._id.toString() === self.playerInfo._id.toString());
        if (isLocalPlayer) {
            console.log('[Client] Ignoring newPlayer broadcast for local player identity');
            return;
        }
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
            const isLocalPlayer = (id === self.socket.id) || 
                                  (players[id] && players[id].playerId === self.socket.id) || 
                                  (self.playerInfo && players[id] && players[id]._id && self.playerInfo._id && players[id]._id.toString() === self.playerInfo._id.toString());

            if (isLocalPlayer) {
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
                    createStruggleButton(!!fullState.consumedBy, self.socket, window.lastClenchData);

                    if (fullState.consumedBy) {
                        // Player is consumed
                        self.playerContainer.setVisible(false);

                        // OPTIMIZATION: Resolve predator via local container or O(1) otherPlayersMap
                        let predator = null;
                        if (self.socket && self.socket.id === fullState.consumedBy) {
                            predator = self.playerContainer;
                        } else {
                            predator = self.otherPlayersMap.get(fullState.consumedBy);
                        }

                        // If predator found, follow them
                        if (predator && predator.active) {
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

                    // Update playerInfo with latest server state (Merge Delta)
                    Object.assign(otherPlayer.playerInfo, players[id]);
                    const fullState = otherPlayer.playerInfo;

                    // Update position and state
                    let isPredicted = false;
                    if (fullState.isHeld && fullState.heldBySocketId) {
                        const holderId = fullState.heldBySocketId;
                        if (self.socket && self.socket.id === holderId) {
                            isPredicted = true;
                        }
                        else {
                            const holder = self.otherPlayersGroup.getChildren().find(p => p.playerId === holderId);
                            if (holder) isPredicted = true;
                        }
                    }

                    if (!isPredicted) {
                        otherPlayer.holderPositionHistory = null;
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

                    if (!fullState.isHeld) {
                        otherPlayer.holderPositionHistory = null;
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


    this.socket.on('voreStageUpdate', function (data) {
        console.log('[Client] voreStageUpdate:', data);
        const myCharId = window.localPlayerInfo ? (window.localPlayerInfo.playerId || window.localPlayerInfo._id) : null;
        if (data.predatorId === self.socket.id || (myCharId && data.predatorId === myCharId)) {
            if (!data || !data.stage || data.stage <= 0) {
                removePredatorVoreControls();
            } else {
                createPredatorVoreControls(data, self.socket);
            }
        }
        if (data.playerId === self.socket.id || (myCharId && data.playerId === myCharId)) {
            // We are the contained target (prey)
            if (!data || !data.stage || data.stage <= 0) {
                createStruggleButton(false, self.socket);
            } else {
                createStruggleButton(true, self.socket, data);
            }
        }
    });

    // --- Target Struggle Activity Pulse Listener ---
    this.socket.on('targetStruggleActivity', function (data) {
        const container = document.getElementById('vore-struggle-activity');
        const statusText = document.getElementById('struggle-status-text');
        if (container) {
            container.classList.remove('active-struggle', 'intense-struggle');
            container.classList.add('intense-struggle');
            if (statusText) statusText.innerText = 'Desperately Struggling!';

            if (container.struggleTimer) clearTimeout(container.struggleTimer);
            container.struggleTimer = setTimeout(() => {
                container.classList.remove('intense-struggle');
                container.classList.add('active-struggle');
                if (statusText) statusText.innerText = 'Wriggling';

                container.struggleTimer = setTimeout(() => {
                    container.classList.remove('active-struggle');
                    if (statusText) statusText.innerText = 'Calm';
                }, 2000);
            }, 1500);
        }
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
        if (!lookDisplay) return;

        const defaultNotice = document.getElementById('defaultLookNotice');
        const playerCard = document.getElementById('playerExamineCard');
        const genericCard = document.getElementById('genericExamineCard');

        if (info && (info.Identifier === 'player' || info.firstName)) {
            // Hide default notice & generic card
            if (defaultNotice) defaultNotice.style.display = 'none';
            if (genericCard) genericCard.style.display = 'none';
            if (playerCard) playerCard.style.display = 'block';

            // 1. Populate Character Header
            const fn = info.firstName || '';
            const ln = info.lastName || '';
            const fullName = (fn || ln) ? `${fn} ${ln}`.trim() : 'Unknown Character';
            const playNameEl = document.getElementById('playExamineName');
            if (playNameEl) playNameEl.textContent = fullName;

            const playSpeciesEl = document.getElementById('playExamineSpecies');
            if (playSpeciesEl) {
                playSpeciesEl.setAttribute('data-tooltip', 'Species');
                playSpeciesEl.innerHTML = `<i class="fa-solid fa-paw"></i> ${info.speciesName || 'Unknown Species'}`;
            }

            const playPronounsEl = document.getElementById('playExaminePronouns');
            if (playPronounsEl) {
                let pVal = info.pronouns !== undefined ? info.pronouns : 1;
                let pText = 'She / Her';
                let pIcon = 'fa-venus';
                if (pVal === 2 || pVal === '2') { pText = 'He / Him'; pIcon = 'fa-mars'; }
                else if (pVal === 3 || pVal === '3') { pText = 'They / Them'; pIcon = 'fa-genderless'; }
                playPronounsEl.setAttribute('data-tooltip', 'Pronouns');
                playPronounsEl.innerHTML = `<i class="fa-solid ${pIcon}"></i> ${pText}`;
            }

            const playAliasEl = document.getElementById('playExamineAlias');
            if (playAliasEl) {
                playAliasEl.setAttribute('data-tooltip', 'Nickname');
                if (info.nickName && info.nickName.trim() !== '') {
                    playAliasEl.style.display = 'inline-flex';
                    playAliasEl.innerHTML = `<i class="fa-solid fa-tag"></i> "${info.nickName.trim()}"`;
                } else {
                    playAliasEl.style.display = 'none';
                }
            }

            // 2. Parse Simple Markdown helper
            const parseMarkdown = (text) => {
                if (!text || text.trim() === '') return '';

                // 1. Escape HTML special characters first so user input is safe
                let html = text
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\r\n/g, '\n');

                // 2. Extract &gt; [!WARNING] callout box (matches ONLY non-empty &gt; lines immediately following &gt; [!WARNING])
                html = html.replace(/(?:^|\n)&gt;\s*\[!WARNING\]\s*\n((?:&gt;\s*\S+.*(?:\n|$))+)/gi, (match, body) => {
                    const content = body.split('\n')
                        .map(line => line.replace(/^&gt;\s*/, '').trim())
                        .filter(Boolean)
                        .join(' ');
                    return `\n<div class="warning-box"><i class="fa-solid fa-triangle-exclamation"></i> <strong>WARNING:</strong> ${content}</div>\n`;
                });

                // 3. Strip leftover leading blockquote markers (&gt; ) from non-warning content lines
                html = html.replace(/^&gt;\s?/gm, '');

                // 4. Format Markdown elements into trusted HTML
                html = html
                    .replace(/### (.*)/g, '<strong style="color:var(--gold,#d4af37); display:block; margin-top:10px; margin-bottom:4px; font-size:0.9rem;">$1</strong>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/^- (.*)/gm, '<li>$1</li>');

                if (html.includes('<li>')) {
                    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
                }
                return html;
            };

            // 3. Populate Look (IC Description)
            const icEl = document.getElementById('playExamineIcContent');
            if (icEl) {
                const parsedIc = parseMarkdown(info.icDescrip);
                icEl.innerHTML = parsedIc || '<em>No IC description available.</em>';
            }

            // 4. Populate OOC Notes
            const oocEl = document.getElementById('playExamineOocContent');
            if (oocEl) {
                const parsedOoc = parseMarkdown(info.oocDescrip);
                oocEl.innerHTML = parsedOoc || '<em>No OOC notes available.</em>';
            }

            // 5. Populate Kinks Grid (Non-Zero Ratings, Sorted Highest First: +2, +1, -1, -2)
            const kinksContainer = document.getElementById('playExamineKinksContent');
            if (kinksContainer) {
                kinksContainer.innerHTML = '';
                const kinksList = window.KINKS_CONFIG || [
                    { key: 'ovStar', title: 'Oral Vore', category: 'vore' },
                    { key: 'avStar', title: 'Anal Vore', category: 'vore' },
                    { key: 'cvStar', title: 'Cock Vore', category: 'vore' },
                    { key: 'ubStar', title: 'Unbirth', category: 'vore' },
                    { key: 'tvStar', title: 'Tail Vore', category: 'vore' },
                    { key: 'absStar', title: 'Absorption', category: 'vore' },
                    { key: 'svStar', title: 'Soul Vore', category: 'vore' },
                    { key: 'predStar', title: 'Being Pred', category: 'roleplay' },
                    { key: 'preyStar', title: 'Being Prey', category: 'roleplay' },
                    { key: 'softStar', title: 'Soft Vore', category: 'vore' },
                    { key: 'hardStar', title: 'Hard Vore', category: 'vore' },
                    { key: 'digestionStar', title: 'Digestion', category: 'vore' },
                    { key: 'disposalStar', title: 'Disposal', category: 'vore' },
                    { key: 'tfStar', title: 'Transformation', category: 'transformation' },
                    { key: 'btfStar', title: 'Body Part Trans', category: 'transformation' },
                    { key: 'bsStar', title: 'Body Swap', category: 'transformation' },
                    { key: 'gStar', title: 'Gender Trans', category: 'transformation' },
                    { key: 'sStar', title: 'Species Trans', category: 'transformation' },
                    { key: 'iaoStar', title: 'Inanimate Object', category: 'transformation' },
                    { key: 'shvStar', title: 'Sheath Vore', category: 'vore' },
                    { key: 'bvStar', title: 'Breast Vore', category: 'vore' },
                    { key: 'pvStar', title: 'Pouch Vore', category: 'vore' },
                    { key: 'uvStar', title: 'Udder Vore', category: 'vore' },
                    { key: 'sfStar', title: 'Sentient Fat', category: 'transformation' },
                    { key: 'tatStar', title: 'Tattooification', category: 'transformation' },
                    { key: 'wgStar', title: 'Weight Gain', category: 'transformation' },
                    { key: 'microStar', title: 'Microphilia', category: 'roleplay' },
                    { key: 'macroStar', title: 'Macrophilia', category: 'roleplay' },
                    { key: 'pawStar', title: 'Paw Play', category: 'roleplay' },
                    { key: 'burpStar', title: 'Belching / Burping', category: 'roleplay' },
                    { key: 'fartStar', title: 'Farting', category: 'roleplay' },
                    { key: 'wsStar', title: 'Watersports', category: 'roleplay' }
                ];

                const parseRating = (val) => {
                    if (val === undefined || val === null) return 0;
                    const num = Number(val);
                    if (isNaN(num)) return 0;
                    // Current rating scale (-2 to +2) takes precedence
                    if (num >= -2 && num <= 2) return num;
                    // Legacy 1-to-5 star scale conversion fallback
                    if (num === 3) return 0;
                    if (num === 4) return 1;
                    if (num === 5) return 2;
                    return 0;
                };

                const userRatings = info.ratings || {};
                const activeKinks = [];

                kinksList.forEach(k => {
                    const ratingScore = parseRating(userRatings[k.key]);
                    if (ratingScore !== 0) { // Exclude neutral score 0
                        activeKinks.push({
                            title: k.title,
                            category: k.category,
                            score: ratingScore
                        });
                    }
                });

                // Sort: Highest preference (+2) -> (+1) -> (-1) -> (-2) (Hate)
                activeKinks.sort((a, b) => b.score - a.score);

                const favorites = activeKinks.filter(k => k.score === 2);
                const likes = activeKinks.filter(k => k.score === 1);
                const maybes = activeKinks.filter(k => k.score === -1);
                const hates = activeKinks.filter(k => k.score === -2);

                if (activeKinks.length === 0) {
                    kinksContainer.innerHTML = '<div class="no-kinks-notice"><em>No active kink preferences listed for this character.</em></div>';
                } else {
                    const grid = document.createElement('div');
                    grid.className = 'play-kinks-4col-grid';

                    const cols = [
                        { title: 'Favorites', key: 'love', items: favorites, colorClass: 'col-love', icon: '<i class="fa-solid fa-heart"></i>' },
                        { title: 'Likes', key: 'like', items: likes, colorClass: 'col-like', icon: '<i class="fa-regular fa-heart-half-stroke"></i>' },
                        { title: 'Maybe', key: 'maybe', items: maybes, colorClass: 'col-maybe', icon: '<i class="fa-solid fa-heart-crack"></i>' },
                        { title: 'Hate', key: 'hate', items: hates, colorClass: 'col-hate', icon: '<i class="fa-solid fa-heart-crack"></i>' }
                    ];

                    cols.forEach(col => {
                        const colEl = document.createElement('div');
                        colEl.className = `kink-column ${col.colorClass}`;

                        const headerEl = document.createElement('div');
                        headerEl.className = 'kink-col-header';
                        headerEl.innerHTML = `${col.icon} ${col.title}`;
                        colEl.appendChild(headerEl);

                        const listEl = document.createElement('div');
                        listEl.className = 'kink-col-list';

                        if (col.items.length === 0) {
                            listEl.innerHTML = '<span class="kink-empty-col">-</span>';
                        } else {
                            col.items.forEach(k => {
                                const item = document.createElement('div');
                                item.className = 'kink-compact-item';
                                item.innerHTML = `<span class="kink-inline-icon">${col.icon}</span><span class="kink-inline-title">${k.title}</span>`;
                                listEl.appendChild(item);
                            });
                        }
                        colEl.appendChild(listEl);
                        grid.appendChild(colEl);
                    });
                    kinksContainer.appendChild(grid);
                }
            }

            // 6. Sub-Tab Switcher Event Delegation & Diagnostic Instrumentation
            const tabBtns = playerCard.querySelectorAll('.examine-tab-btn');
            tabBtns.forEach(btn => {
                btn.onclick = function () {
                    playerCard.querySelectorAll('.examine-tab-btn').forEach(b => b.classList.remove('active'));
                    playerCard.querySelectorAll('.examine-pane').forEach(p => p.classList.remove('active'));
                    this.classList.add('active');
                    const targetPane = document.getElementById(this.dataset.tab);
                    if (targetPane) targetPane.classList.add('active');

                    if (typeof window.debugExamineKinks === 'function') {
                        setTimeout(() => window.debugExamineKinks(), 50);
                    }
                };
            });

            if (typeof window.debugExamineKinks === 'function') {
                setTimeout(() => window.debugExamineKinks(), 100);
            }
        } else {
            // Generic Object / Non-Player Item Examination
            if (defaultNotice) defaultNotice.style.display = 'none';
            if (playerCard) playerCard.style.display = 'none';
            if (genericCard) {
                genericCard.style.display = 'block';
                const titleEl = document.getElementById('genericExamineTitle');
                const descEl = document.getElementById('genericExamineDesc');
                const flavorEl = document.getElementById('genericExamineFlavor');

                if (titleEl) titleEl.textContent = `Inspection: ${info.name || info.firstName || 'Object'}`;
                if (descEl) descEl.textContent = info.description || info.icDescrip || 'No details available.';
                if (flavorEl) {
                    if (info.flavor) {
                        flavorEl.style.display = 'block';
                        flavorEl.textContent = info.flavor;
                    } else {
                        flavorEl.style.display = 'none';
                    }
                }
            }
        }

        // Switch to Look tab automatically
        const lookTab = document.getElementById('lookTab');
        if (lookTab) lookTab.click();
    });

    this.socket.on('typing', (data) => {
        if (!data || !data.charId) return;
        const charIdStr = data.charId.toString();

        let targetContainer = null;
        if (self.playerContainer && self.playerContainer.playerInfo && self.playerContainer.playerInfo._id && self.playerContainer.playerInfo._id.toString() === charIdStr) {
            targetContainer = self.playerContainer;
        } else if (self.otherPlayersGroup) {
            const others = self.otherPlayersGroup.getChildren();
            targetContainer = others.find(p => p.playerInfo && (
                (p.playerInfo._id && p.playerInfo._id.toString() === charIdStr) ||
                (p.playerInfo.playerId && p.playerInfo.playerId.toString() === charIdStr) ||
                (p.playerId && p.playerId.toString() === charIdStr)
            ));
        }

        if (targetContainer) {
            updateTypingIndicator(targetContainer, data.isTyping);
        }
    });

    // --- Door Update Listener ---
    this.socket.on('doorUpdate', (data) => {
        // OPTIMIZATION: Fast O(1) Map lookup
        const doorSprite = getMapObject(self, data.id);
        if (doorSprite) {
            if (data.state === 'open') {
                doorSprite.play('door_open');
                doorSprite.body.enable = false;
            } else {
                doorSprite.play('door_close');
                doorSprite.body.enable = true;
            }
            doorSprite.objectInfo.state = data.state;
        }
    });

    // Initial Door States (Bulk Update on Connect)
    this.socket.on('doorStates', (doors) => {
        self.startDoorStates = doors; // Cache for race condition

        if (self.mapObjectsMap) {
            doors.forEach(d => {
                const doorSprite = getMapObject(self, d.id);
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

    // --- Resource Node State Listeners ---
    this.socket.on('resourceNodeUpdate', (data) => {
        const sprite = getMapObject(self, data.id);
        if (sprite) {
            sprite.setFrame(data.frame);
        }
    });

    this.socket.on('resourceNodeStates', (nodes) => {
        self.startResourceNodeStates = nodes;
        if (self.mapObjectsMap) {
            nodes.forEach(nodeData => {
                const sprite = getMapObject(self, nodeData.id);
                if (sprite) {
                    sprite.setFrame(nodeData.frame);
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
                    const targetAlpha = (sprite.clearZone === currentZone) ? 0 : 1;
                    if (sprite.targetZoneAlpha === targetAlpha) return;
                    sprite.targetZoneAlpha = targetAlpha;

                    // OPTIMIZATION: Stop active zone-fade tween specifically to avoid killing combat/stealth tweens
                    if (sprite.zoneTween) {
                        sprite.zoneTween.stop();
                        sprite.zoneTween = null;
                    }

                    sprite.zoneTween = self.tweens.add({
                        targets: sprite,
                        alpha: targetAlpha,
                        duration: targetAlpha === 0 ? 150 : 250,
                        onComplete: () => { sprite.zoneTween = null; }
                    });
                }
            });
        }
    });

    // Initialize Tabs
    initializeTabs();

    // Input Events
    // Input Events
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasdKeys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });
    this.smartWalkTarget = null;
    
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.UP);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.W);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.A);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.S);
    this.input.keyboard.removeCapture(Phaser.Input.Keyboard.KeyCodes.D);

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
        const container = document.getElementById('phaserApp');
        if (container) {
            const width = Math.max(container.clientWidth || 800, 100);
            const height = Math.max(container.clientHeight || 600, 100);

            if (self.scale && (self.scale.width !== width || self.scale.height !== height)) {
                self.scale.resize(width, height);
            }

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

window.debugExamineKinks = function() {
    const ids = [
        'sidePanel',
        'menu',
        'menuDisplay',
        'lookDisplay',
        'playerExamineCard',
        'playExamineKinksPane',
        'playExamineKinksContent'
    ];
    console.log('=== EXAMINE KINKS DIAGNOSTICS ===');
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) {
            console.log(`[${id}] -> NOT FOUND`);
        } else {
            const cs = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            console.log(`[${id}]`, {
                display: cs.display,
                overflowY: cs.overflowY,
                height: cs.height,
                maxHeight: cs.maxHeight,
                minHeight: cs.minHeight,
                clientHeight: el.clientHeight,
                scrollHeight: el.scrollHeight,
                offsetHeight: el.offsetHeight,
                rectHeight: Math.round(rect.height)
            });
        }
    });
    const grid = document.querySelector('.play-kinks-4col-grid');
    if (grid) {
        const cs = window.getComputedStyle(grid);
        console.log('[.play-kinks-4col-grid]', {
            height: cs.height,
            minHeight: cs.minHeight,
            clientHeight: grid.clientHeight,
            scrollHeight: grid.scrollHeight
        });
    }
};

if (!window.__kinksWheelDebugAttached) {
    window.__kinksWheelDebugAttached = true;
    window.addEventListener('wheel', (e) => {
        const kinksContainer = document.getElementById('playExamineKinksContent');
        if (kinksContainer && kinksContainer.contains(e.target)) {
            console.log('[WHEEL EVENT ON KINKS CONTAINER]', {
                target: e.target.className || e.target.tagName,
                deltaY: e.deltaY,
                defaultPrevented: e.defaultPrevented,
                scrollTop: kinksContainer.scrollTop,
                scrollHeight: kinksContainer.scrollHeight,
                clientHeight: kinksContainer.clientHeight
            });
        }
    }, { passive: false });
}
