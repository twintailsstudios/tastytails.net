/**
 * @fileoverview player.js - Client Avatar Compositor & Floating Status HUD Engine
 * 
 * @description
 * Assembles multi-layered 2D player character Phaser containers (body, head, ears, tail, hair, eyes)
 * and dynamically manages equipment overlays and custom dye tints.
 * Controls floating status indicators above player avatars (Struggle bar, Vore digest bar, Crafting progress bar, Typing bubble).
 * 
 * Invoked by:
 * - `create.js`: Socket.io player spawning, cosmetic updates, and equipment updates.
 * - `update.js`: Per-frame crafting bar updates in the main game loop.
 * - `reconcile.js`: Client input prediction & server state reconciliation.
 * - `corpses.js`: Player corpse equipment visual rendering.
 */

import { windowSize } from './utils.js';
import { createVoreList } from './ui.js';
import { EQUIPMENT_VISUALS } from './equipment.js';

// --- Constants ---
const CRAFTING_BAR_WIDTH = 60;
const CRAFTING_BAR_HEIGHT = 8;
const CRAFTING_BAR_Y_OFFSET = -165; // Height relative to player center
const CRAFTING_BAR_X_OFFSET = 30; // Graphics object offset (container + 30)
const CRAFTING_BAR_DRAW_X = -30; // Draw offset (centers the bar if X_OFFSET is 30)
const CRAFTING_BAR_COLOR_BG = 0x222222;
const CRAFTING_BAR_COLOR_FILL = 0xFFA500;
const CRAFTING_BAR_COLOR_BORDER = 0x000000;

// --- Helper Functions ---

/**
 * Normalizes color inputs (string hex/decimal or numbers) into a valid numeric color format.
 * @param {string|number} color - Color input to parse
 * @returns {number} Numeric color value for Phaser setTint()
 */
function parseColor(color) {
    if (typeof color === 'string') {
        return Number(color);
    }
    return color;
}

/**
 * OPTIMIZATION: Generates a lightweight string hash representing equipment textures, colors, and dynamic layers.
 * Replaces expensive JSON.stringify(equipmentData) V8 allocations in hot network packet handlers.
 * @param {Object} equipmentData - Key-value map of equipped items by slot ID
 * @returns {string} Fast hash string for dirty checking
 */
function getEquipHash(equipmentData) {
    if (!equipmentData) return '';
    let hash = '';
    for (const slotId in equipmentData) {
        const item = equipmentData[slotId];
        if (!item) continue;
        hash += `${slotId}:${item.texture || ''}_${item.color || ''}`;
        if (item.rendering && item.rendering.layers) {
            for (let i = 0; i < item.rendering.layers.length; i++) {
                const l = item.rendering.layers[i];
                hash += `_${l.texture || ''}_${l.tint || ''}`;
            }
        }
    }
    return hash;
}

/**
 * DRY CONSOLIDATION: Constructs the 21 nested body-part Phaser Sprites inside a player container.
 * Includes optional chaining guards (e.g. `visualData?.beak?.sprite`) to prevent client crashes on partial server payloads.
 * @param {Phaser.Scene} scene - Active Phaser game scene instance
 * @param {Phaser.GameObjects.Container} container - Player Phaser container
 * @param {Object} visualData - Player cosmetic visual properties
 */
function buildPlayerAvatarSprites(scene, container, visualData) {
    const tail = visualData.tail || {};
    const body = visualData.body || {};
    const genitals = visualData.genitals || visualData.genitles || {};
    const hands = visualData.hands || {};
    const feet = visualData.feet || {};
    const head = visualData.head || {};
    const beak = visualData.beak || {};
    const ear = visualData.ear || {};
    const eyes = visualData.eyes || {};
    const hair = visualData.hair || {};
    const headAccessories = visualData.headAccessories || {};

    const playerContainerTail = scene.add.sprite(30, -81.5, tail.sprite).setTint(parseColor(tail.color)).setName('tail');
    const playerContainersecondaryTail = scene.add.sprite(30, -81.5, tail.secondarySprite).setTint(parseColor(tail.secondaryColor)).setName('secondaryTail');
    const playerContaineraccentTail = scene.add.sprite(30, -81.5, tail.accentSprite).setTint(parseColor(tail.accentColor)).setName('accentTail');

    const playerContainerbody = scene.add.sprite(30, -81.5, body.sprite).setTint(parseColor(body.color)).setName('body');
    const playerContainersecondaryBody = scene.add.sprite(30, -81.5, body.secondarySprite).setTint(parseColor(body.secondaryColor)).setName('secondaryBody');
    const playerContaineraccentBody = scene.add.sprite(30, -81.5, body.accentSprite).setTint(parseColor(body.accentColor)).setName('accentBody');
    const playerContainergenitals = scene.add.sprite(30, -81.5, genitals.sprite).setName('genitals');
    const playerContainerHands = scene.add.sprite(30, -81.5, hands.sprite).setTint(parseColor(hands.color)).setName('hands');
    const playerContainerFeet = scene.add.sprite(30, -81.5, feet.sprite).setTint(parseColor(feet.color)).setName('feet');

    const playerContainerhead = scene.add.sprite(30, -81.5, head.sprite).setTint(parseColor(head.color)).setName('head');
    const playerContainersecondaryHead = scene.add.sprite(30, -81.5, head.secondarySprite).setTint(parseColor(head.secondaryColor)).setName('secondaryHead');
    const playerContaineraccentHead = scene.add.sprite(30, -81.5, head.accentSprite).setTint(parseColor(head.accentColor)).setName('accentHead');

    const playerContainerBeak = scene.add.sprite(30, -81.5, beak.sprite).setTint(parseColor(beak.color)).setName('beak');

    const playerContainerouterEar = scene.add.sprite(30, -81.5, ear.outerSprite).setTint(parseColor(ear.outerColor)).setName('outerEar');
    const playerContainerinnerEar = scene.add.sprite(30, -81.5, ear.innerSprite).setTint(parseColor(ear.innerColor)).setName('innerEar');

    const playerContainereyes = scene.add.sprite(30, -81.5, eyes.outer).setName('eyes');
    const playerContaineriris = scene.add.sprite(30, -81.5, eyes.iris).setTint(parseColor(eyes.color)).setName('iris');
    const playerContainerhair = scene.add.sprite(30, -81.5, hair.sprite).setTint(parseColor(hair.color)).setName('hair');
    const playerContainerheadAccessories = scene.add.sprite(30, -81.5, headAccessories.sprite).setTint(parseColor(headAccessories.color)).setName('headAccessories');

    container.add([
        playerContainerTail,
        playerContainersecondaryTail,
        playerContaineraccentTail,

        playerContainerbody,
        playerContainersecondaryBody,
        playerContaineraccentBody,
        playerContainergenitals,
        playerContainerHands,
        playerContainerFeet,

        playerContainerhead,
        playerContainersecondaryHead,
        playerContaineraccentHead,

        playerContainerBeak,

        playerContainereyes,
        playerContaineriris,
        playerContainerhair,
        playerContainerouterEar,
        playerContainerinnerEar,
        playerContainerheadAccessories
    ]);
}

/**
 * Renders gear/equipment visual overlays and custom dye tints onto a player container.
 * @param {Phaser.GameObjects.Container} container - Player container instance
 * @param {Object} equipmentData - Key-value map of equipped items by slot
 */
export function updatePlayerEquipmentVisuals(container, equipmentData) {
    if (!equipmentData) return;

    // OPTIMIZATION: Dirty Check with lightweight property hash (no JSON.stringify V8 allocations)
    const equipStr = getEquipHash(equipmentData);
    if (container._lastEquipStr === equipStr) {
        return; // No change
    }
    container._lastEquipStr = equipStr;
    container._lastAnimStateKey = null; // Invalidate cached animation state so updatePlayerAnimations re-syncs all sprite animations!

    const processedSlots = new Set();
    Object.values(EQUIPMENT_VISUALS).forEach(config => {
        if (processedSlots.has(config.slotId)) return;
        processedSlots.add(config.slotId);

        const spriteName = `equip_${config.slotId}`;
        let sprite = container.getByName(spriteName);

        const equippedItem = equipmentData[config.slotId];
        let activeConfig = null;
        if (equippedItem) {
            activeConfig = EQUIPMENT_VISUALS[equippedItem.texture];
        }

        if (activeConfig && activeConfig.slotId === config.slotId) {
            // DYNAMIC LAYERED RENDERING (e.g. Crafted Shirts with custom dyes)
            if (equippedItem.rendering && equippedItem.rendering.layers) {
                equippedItem.rendering.layers.forEach((layer, idx) => {
                    const layerName = idx === 0 ? spriteName : `${spriteName}_layer_${idx}`;
                    let layerSprite = container.getByName(layerName);

                    const textureKey = layer.texture || activeConfig.atlas;

                    if (layerSprite) {
                        if (layerSprite.texture.key !== textureKey) {
                            layerSprite.setTexture(textureKey);
                        }
                    } else {
                        layerSprite = container.scene.add.sprite(30, -81.5, textureKey).setName(layerName);
                        container.add(layerSprite);
                    }

                    layerSprite.setVisible(true);
                    layerSprite.visualConfig = activeConfig;

                    if (layer.tint) {
                        layerSprite.setTint(layer.tint);
                    } else {
                        layerSprite.clearTint();
                    }
                });

                // Hide extra layers
                let i = equippedItem.rendering.layers.length;
                while (true) {
                    const extraName = `${spriteName}_layer_${i}`;
                    const extraSprite = container.getByName(extraName);
                    if (extraSprite) {
                        extraSprite.setVisible(false);
                        i++;
                    } else {
                        break;
                    }
                }

            } else {
                // STANDARD SINGLE-LAYER RENDERING
                if (sprite) {
                    if (sprite.texture.key !== activeConfig.atlas) {
                        sprite.setTexture(activeConfig.atlas);
                    }
                } else {
                    sprite = container.scene.add.sprite(30, -81.5, activeConfig.atlas).setName(spriteName);
                    container.add(sprite);
                }

                sprite.setVisible(true);
                sprite.visualConfig = activeConfig;

                if (equippedItem.color) {
                    sprite.setTint(equippedItem.color);
                } else {
                    sprite.clearTint();
                }

                let i = 1;
                while (true) {
                    const extraName = `${spriteName}_layer_${i}`;
                    const extraSprite = container.getByName(extraName);
                    if (extraSprite) {
                        extraSprite.setVisible(false);
                        i++;
                    } else {
                        break;
                    }
                }
            }

        } else {
            // Nothing to show for this slot
            if (sprite) sprite.setVisible(false);

            let i = 1;
            while (true) {
                const extraName = `${spriteName}_layer_${i}`;
                const extraSprite = container.getByName(extraName);
                if (extraSprite) {
                    extraSprite.setVisible(false);
                    i++;
                } else {
                    break;
                }
            }
        }
    });
}

/**
 * Utility helper to locate a specific player container within a Phaser Group.
 * @param {string} playerId - Target player ID
 * @param {Phaser.GameObjects.Group} group - Phaser container group
 * @returns {Phaser.GameObjects.Container|undefined} Matching player container
 */
export function getPlayerSprite(playerId, group) {
    return group.getChildren().find(child => child.playerId === playerId);
}

/**
 * Initializes and renders the controllable local player avatar container.
 * Configures Arcade Physics body size (60x30 matching server collision box), camera target following, and HUD lists.
 * @param {Phaser.Scene} self - Main game Phaser scene context
 * @param {Object} playerInfo - Initialized player state payload from server
 */
export function displayPlayers(self, playerInfo) {
    if (self.playerContainer) {
        console.log('[Client] Evicting existing player container before recreating.');
        if (typeof self.playerContainer.destroy === 'function') {
            self.playerContainer.destroy();
        }
        self.playerContainer = null;
    }

    let visualData = playerInfo;
    const isDead = playerInfo.isDead && playerInfo.spiritSprite;

    if (isDead) {
        // Overlay spirit visual parts onto the base player info for rendering purposes
        visualData = { ...playerInfo, ...playerInfo.spiritSprite };
    }

    const playerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    updateStruggleBar(playerContainer, playerInfo, self);

    if (isDead) {
        playerContainer.setAlpha(0.8);
    }

    // Hide container if player is fully consumed (Vore Stage 3)
    if (playerInfo.consumedBy && (!playerInfo.voreStage || playerInfo.voreStage >= 3)) {
        playerContainer.setVisible(false);
    }

    updateVoreProgressBar(playerContainer, playerInfo, self);

    playerContainer.setSize(60, 163);
    self.physics.world.enable(playerContainer);
    playerContainer.body.setSize(60, 30); // Match server collision box size
    playerContainer.body.setOffset(30, 66.5); // Match server collision box position (centered on y, x aligned)
    playerContainer.body.setCollideWorldBounds(false);

    if (isDead) {
        playerContainer.body.checkCollision.none = true;
    }
    playerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);

    if (self.mapLayers) {
        self.mapLayers.forEach(layer => {
            if (layer) {
                self.physics.add.collider(playerContainer, layer);
            }
        });
    }

    buildPlayerAvatarSprites(self, playerContainer, visualData);

    self.playerContainer = playerContainer;
    self.players.add(playerContainer);
    self.cameras.main.startFollow(self.playerContainer);
    createVoreList(playerInfo.voreTypes, self);
    window.avatarSelected = true;

    const { x: camW, y: camH } = windowSize();
    window.cam1 = self.cameras.main.setSize(camW, camH).startFollow(playerContainer).setName('Camera 1');

    document.getElementById('phaserApp').focus();

    Object.assign(self.playerInfo, playerInfo);
    playerContainer.playerInfo = self.playerInfo;
    playerContainer.pendingInputs = [];
    playerContainer.inputSequenceNumber = 0;
    window.avatarSelected = true;

    updatePlayerEquipmentVisuals(playerContainer, playerInfo.equipment);
}

/**
 * Spawns or updates a remote player avatar container in the scene.
 * OPTIMIZATION: Reuses existing player containers in-place to eliminate memory destruction/re-creation of 21 sprites.
 * @param {Phaser.Scene} self - Main game Phaser scene context
 * @param {Object} playerInfo - Synchronized remote player state payload
 * @returns {Phaser.GameObjects.Container} Remote player container instance
 */
export function displayOtherPlayers(self, playerInfo) {
    const existingPlayer = getPlayerSprite(playerInfo.playerId, self.otherPlayersGroup);
    if (existingPlayer) {
        existingPlayer.setPosition(playerInfo.position.x, playerInfo.position.y);
        existingPlayer.playerInfo = playerInfo;

        const isDead = playerInfo.isDead && playerInfo.spiritSprite;
        existingPlayer.setAlpha(isDead ? 0.8 : 1.0);
        if (existingPlayer.body) {
            existingPlayer.body.checkCollision.none = isDead;
        }

        const isFullyConsumed = playerInfo.consumedBy && (!playerInfo.voreStage || playerInfo.voreStage >= 3);
        existingPlayer.setVisible(!isFullyConsumed);

        updateStruggleBar(existingPlayer, playerInfo, self);
        updateVoreProgressBar(existingPlayer, playerInfo, self);
        updatePlayerCosmetics(existingPlayer, playerInfo);
        updatePlayerEquipmentVisuals(existingPlayer, playerInfo.equipment);
        return existingPlayer;
    }

    let visualData = playerInfo;
    const isDead = playerInfo.isDead && playerInfo.spiritSprite;

    if (isDead) {
        visualData = { ...playerInfo, ...playerInfo.spiritSprite };
    }

    const otherPlayerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    otherPlayerContainer.setSize(60, 163);
    self.physics.world.enable(otherPlayerContainer);
    otherPlayerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);
    otherPlayerContainer.body.setOffset(30, -81.5);

    if (isDead) {
        otherPlayerContainer.body.checkCollision.none = true;
        otherPlayerContainer.setAlpha(0.8);
    }

    if (playerInfo.consumedBy && (!playerInfo.voreStage || playerInfo.voreStage >= 3)) {
        otherPlayerContainer.setVisible(false);
    }

    updateVoreProgressBar(otherPlayerContainer, playerInfo, self);

    buildPlayerAvatarSprites(self, otherPlayerContainer, visualData);

    const tailSprite = otherPlayerContainer.getByName('tail');
    if (tailSprite) {
        otherPlayerContainer.sendToBack(tailSprite);
    }

    otherPlayerContainer.playerId = playerInfo.playerId;
    self.otherPlayersGroup.add(otherPlayerContainer);
    otherPlayerContainer.playerInfo = playerInfo;

    updateStruggleBar(otherPlayerContainer, playerInfo, self);
    updatePlayerEquipmentVisuals(otherPlayerContainer, playerInfo.equipment);

    return otherPlayerContainer;
}

/**
 * Manages the floating struggle progress bar drawn above held/gripped players.
 * OPTIMIZATION: Spatial transform (bar.x, bar.y, bar.depth) updates every frame, while vector paths (bar.clear/fillRect) are gated on fillPercent changes.
 * @param {Phaser.GameObjects.Container} playerContainer - Target player container
 * @param {Object} playerInfo - Player state payload
 * @param {Phaser.Scene} scene - Active Phaser scene
 */
export function updateStruggleBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    if (!playerContainer.struggleBar) {
        playerContainer.struggleBar = scene.add.graphics();
        playerContainer.on('destroy', () => {
            if (playerContainer.struggleBar) {
                playerContainer.struggleBar.destroy();
            }
        });
    }

    const bar = playerContainer.struggleBar;

    if (playerInfo.isHeld && playerInfo.grippedFirmly && !playerInfo.consumedBy) {
        const fillPercent = (playerInfo.struggleCount || 0) / 3;

        // Always update spatial position & depth sorting without re-tessellating vector paths
        bar.x = playerContainer.x;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 100;

        // OPTIMIZATION: Only clear and redraw vector geometry if fillPercent or visibility changed
        if (bar.visible && bar._lastFillPercent === fillPercent) {
            return;
        }

        bar.setVisible(true);
        bar.clear();

        bar.fillStyle(0x000000);
        bar.fillRect(-30, -180, 60, 10);
        bar.fillStyle(0xff0000);
        bar.fillRect(-30, -180, 60 * fillPercent, 10);

        bar._lastFillPercent = fillPercent;
    } else {
        if (bar.visible) {
            bar.setVisible(false);
            bar._lastFillPercent = null;
        }
    }
}

/**
 * Controls the visibility and animation playback of the chat typing bubble above a player's head.
 * @param {Phaser.GameObjects.Container} container - Player container
 * @param {boolean} isTyping - Whether the player is currently typing in chat
 */
export function updateTypingIndicator(container, isTyping) {
    if (!container || !container.active) return;

    let indicator = container.getByName('typingIndicator');

    if (isTyping) {
        if (!indicator) {
            indicator = container.scene.add.sprite(30, -150, 'typing');
            indicator.setName('typingIndicator');
            container.add(indicator);
        }
        indicator.setVisible(true);
        if (!indicator.anims.isPlaying || indicator.anims.currentAnim.key !== 'typing') {
            indicator.play('typing');
        }
    } else {
        if (indicator) {
            indicator.setVisible(false);
            indicator.stop();
        }
    }
}

/**
 * Renders and updates the floating yellow vore digestion progress bar for swallowed players (Stages 1 & 2).
 * OPTIMIZATION: Spatial transform updates every frame, while vector geometry redrawing is gated on stage fillPercent changes.
 * @param {Phaser.GameObjects.Container} playerContainer - Player container instance
 * @param {Object} playerInfo - Player state payload
 * @param {Phaser.Scene} scene - Active Phaser scene
 */
export function updateVoreProgressBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    if (!playerContainer.voreBar) {
        playerContainer.voreBar = scene.add.graphics();
        playerContainer.on('destroy', () => {
            if (playerContainer.voreBar) playerContainer.voreBar.destroy();
        });
    }

    const bar = playerContainer.voreBar;

    if (playerInfo.consumedBy && playerInfo.voreStage && playerInfo.voreStage < 3) {
        const fillPercent = playerInfo.voreStage / 3;

        // Always update spatial position & depth sorting without re-tessellating vector paths
        bar.x = playerContainer.x;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 101;

        // OPTIMIZATION: Only clear and redraw vector geometry if fillPercent or visibility changed
        if (bar.visible && bar._lastFillPercent === fillPercent) {
            return;
        }

        bar.setVisible(true);
        bar.clear();

        bar.fillStyle(0x000000);
        bar.fillRect(-30, -200, 60, 10);

        bar.fillStyle(0xFFD700);
        bar.fillRect(-30, -200, 60 * fillPercent, 10);

        bar._lastFillPercent = fillPercent;
    } else {
        if (bar.visible) {
            bar.setVisible(false);
            bar._lastFillPercent = null;
        }
    }
}

/**
 * Renders real-time crafting progress bar above active crafting players.
 * OPTIMIZATION: Spatial position and depth update every frame, while vector geometry redrawing is gated on pixel width change.
 * @param {Phaser.GameObjects.Container} playerContainer - Target player container
 * @param {Object} playerInfo - Player state payload containing craftingStartTime & craftingDuration
 * @param {Phaser.Scene} scene - Active Phaser scene
 */
export function updateCraftingBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    if (!playerContainer.craftingBar) {
        playerContainer.craftingBar = scene.add.graphics();
        playerContainer.on('destroy', () => {
            if (playerContainer.craftingBar) playerContainer.craftingBar.destroy();
        });
    }

    const bar = playerContainer.craftingBar;

    if (playerInfo.isCrafting && playerInfo.craftingStartTime && playerInfo.craftingDuration) {
        const elapsed = Date.now() - playerInfo.craftingStartTime;
        let progress = elapsed / playerInfo.craftingDuration;
        progress = Math.max(0, Math.min(1, progress));

        const currentPixelWidth = Math.round(CRAFTING_BAR_WIDTH * progress);

        // Always update spatial position & depth sorting without re-tessellating vector paths
        bar.x = playerContainer.x + CRAFTING_BAR_X_OFFSET;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 102;

        // OPTIMIZATION: Only clear and redraw vector geometry if progress pixel width changed
        if (bar.visible && bar._lastPixelWidth === currentPixelWidth) {
            return;
        }

        bar.setVisible(true);
        bar.clear();

        bar.fillStyle(CRAFTING_BAR_COLOR_BG);
        bar.fillRect(CRAFTING_BAR_DRAW_X, CRAFTING_BAR_Y_OFFSET, CRAFTING_BAR_WIDTH, CRAFTING_BAR_HEIGHT);

        bar.fillStyle(CRAFTING_BAR_COLOR_FILL);
        bar.fillRect(CRAFTING_BAR_DRAW_X, CRAFTING_BAR_Y_OFFSET, CRAFTING_BAR_WIDTH * progress, CRAFTING_BAR_HEIGHT);

        bar.lineStyle(1, CRAFTING_BAR_COLOR_BORDER);
        bar.strokeRect(CRAFTING_BAR_DRAW_X, CRAFTING_BAR_Y_OFFSET, CRAFTING_BAR_WIDTH, CRAFTING_BAR_HEIGHT);

        bar._lastPixelWidth = currentPixelWidth;
    } else {
        if (bar.visible) {
            bar.setVisible(false);
            bar._lastPixelWidth = null;
        }
    }
}

/**
 * Updates visual cosmetic textures and hex/number tints of an existing player container based on authoritative server state.
 * Invalidates `container._lastAnimStateKey` to force animation re-synchronization.
 * @param {Phaser.GameObjects.Container} container - Target player container
 * @param {Object} playerInfo - Server player state payload with cosmetic properties
 */
export function updatePlayerCosmetics(container, playerInfo) {
    if (!container || !container.active) return;

    container._lastAnimStateKey = null;

    const cosmeticConfig = [
        {
            key: 'tail', parts: [
                { prop: 'sprite', name: 'tail' },
                { prop: 'secondarySprite', name: 'secondaryTail' },
                { prop: 'accentSprite', name: 'accentTail' }
            ]
        },
        {
            key: 'body', parts: [
                { prop: 'sprite', name: 'body' },
                { prop: 'secondarySprite', name: 'secondaryBody' },
                { prop: 'accentSprite', name: 'accentBody' }
            ]
        },
        {
            key: 'head', parts: [
                { prop: 'sprite', name: 'head' },
                { prop: 'secondarySprite', name: 'secondaryHead' },
                { prop: 'accentSprite', name: 'accentHead' }
            ]
        },
        {
            key: 'ear', parts: [
                { prop: 'outerSprite', name: 'outerEar', colorProp: 'outerColor' },
                { prop: 'innerSprite', name: 'innerEar', colorProp: 'innerColor' }
            ]
        },
        {
            key: 'hands', parts: [
                { prop: 'sprite', name: 'hands' }
            ]
        },
        {
            key: 'feet', parts: [
                { prop: 'sprite', name: 'feet' }
            ]
        },
        {
            key: 'genitals', parts: [
                { prop: 'sprite', name: 'genitals' }
            ]
        },
        {
            key: 'beak', parts: [
                { prop: 'sprite', name: 'beak' }
            ]
        },
        {
            key: 'eyes', parts: [
                { prop: 'outer', name: 'eyes', noTint: true },
                { prop: 'iris', name: 'iris' }
            ]
        },
        {
            key: 'hair', parts: [
                { prop: 'sprite', name: 'hair' }
            ]
        },
        {
            key: 'headAccessories', parts: [
                { prop: 'sprite', name: 'headAccessories' }
            ]
        }
    ];

    cosmeticConfig.forEach(config => {
        const data = playerInfo[config.key];
        if (!data) return;

        config.parts.forEach(part => {
            const sprite = container.getByName(part.name);
            if (sprite) {
                const textureKey = data[part.prop];
                if (textureKey && textureKey !== 'empty' && sprite.texture.key !== textureKey) {
                    sprite.setTexture(textureKey);
                }

                if (!part.noTint) {
                    let colorKey = 'color';
                    if (part.colorProp) {
                        colorKey = part.colorProp;
                    } else if (part.name.toLowerCase().includes('secondary')) {
                        colorKey = 'secondaryColor';
                    } else if (part.name.toLowerCase().includes('accent')) {
                        colorKey = 'accentColor';
                    }

                    const newColor = parseColor(data[colorKey]);
                    if (newColor !== undefined && !isNaN(newColor)) {
                        sprite.setTint(newColor);
                    } else {
                        sprite.clearTint();
                    }
                }
            }
        });
    });
}
