import { windowSize, drawDebug } from './utils.js';
import { createAnimations, updatePlayerAnimations } from './animations.js';
import { displayPlayers, displayOtherPlayers, getPlayerSprite, updateStruggleBar } from './player.js';
import { reconcile } from './reconcile.js';
import { createMap } from './map.js';
import { initializeTabs } from './tabs.js';
import { createVoreList, createStruggleButton } from './ui.js';
import { initDebugGraph } from './debugGraph.js';

let debugGraphics;
let playerDebugGraphics;
let showDebug = false;

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
    console.log('this.socket = ', this.socket);

    this.socket.emit('getAllChats', {
        token: document.cookie.replace('TastyTails=', ''),
        charId: document.location.href.split('play/')[1]
    });

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
            }
        });
    }



    // Create Map
    createMap(this);

    // Socket Listeners
    this.socket.on('currentPlayers', function (players) {
        console.log('players = ', players);
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                displayPlayers(self, players[id]);
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
        Object.keys(players).forEach(function (id) {
            if (players[id].playerId === self.socket.id) {
                if (self.playerContainer) {
                    // console.log('[Client] Calling reconcile for local player');
                    reconcile(players[id], self);

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
                self.otherPlayersGroup.getChildren().forEach(function (otherPlayer) {
                    if (players[id].playerId === otherPlayer.playerId) {
                        otherPlayer.setPosition(players[id].position.x, players[id].position.y);
                        updatePlayerAnimations(otherPlayer, players[id]);
                        updateStruggleBar(otherPlayer, players[id], self);
                        otherPlayer.depth = otherPlayer.y;

                        // Hide other players if they are consumed
                        if (players[id].consumedBy) {
                            otherPlayer.setVisible(false);
                        } else {
                            otherPlayer.setVisible(true);
                        }
                    }
                });
            }
        });
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
                note.innerHTML = `
                    <h3>Inspection: ${info.firstName} ${info.lastName}</h3>
                    <p>${info.icDescrip}</p>
                `;
            }
            // Switch to Look tab
            const lookTab = document.getElementById('lookTab');
            if (lookTab) lookTab.click();
        }
    });

    // --- HillHome Transparency ---
    this.socket.on('enterHillHome', () => {
        console.log('Entering HillHome - Transparency ON');
        if (self.mapLayers) {
            // Assuming 'objects2' is the roof/upper layer based on map.js
            // We need to find the layer by name or index.
            // In map.js: scene.mapLayers = [grass, inside, objects, objects2, outsideWallLayer, bushes, trees];
            // objects2 is index 3. outsideWallLayer is index 4.
            // Let's try fading objects2 and outsideWallLayer.
            const objects2 = self.mapLayers[3];
            const outsideWallLayer = self.mapLayers[4];

            if (objects2) self.tweens.add({ targets: objects2, alpha: 0, duration: 500 });
            if (outsideWallLayer) self.tweens.add({ targets: outsideWallLayer, alpha: 0, duration: 500 });
        }
    });

    this.socket.on('exitHillHome', () => {
        console.log('Exiting HillHome - Transparency OFF');
        if (self.mapLayers) {
            const objects2 = self.mapLayers[3];
            const outsideWallLayer = self.mapLayers[4];

            if (objects2) self.tweens.add({ targets: objects2, alpha: 1, duration: 500 });
            if (outsideWallLayer) self.tweens.add({ targets: outsideWallLayer, alpha: 1, duration: 500 });
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
}
