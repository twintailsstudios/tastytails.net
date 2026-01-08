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

export function updatePlayerEquipmentVisuals(container, equipmentData) {
    if (!equipmentData) return;

    // Better Approach: Iterate the SLOTS defined in visuals to decide what to show
    const processedSlots = new Set();
    Object.values(EQUIPMENT_VISUALS).forEach(config => {
        if (processedSlots.has(config.slotId)) return;
        processedSlots.add(config.slotId);

        const spriteName = `equip_${config.slotId}`;
        let sprite = container.getByName(spriteName);

        const equippedItem = equipmentData[config.slotId];
        // Find if there is a visual config for the CURRENTLY equipped item
        let activeConfig = null;
        if (equippedItem) {
            // Look up if this texture has a config
            activeConfig = EQUIPMENT_VISUALS[equippedItem.texture];
        }

        if (activeConfig && activeConfig.slotId === config.slotId) {

            // CHECK FOR DYNAMIC LAYERED RENDERING (e.g. Crafted Shirts)
            if (equippedItem.rendering && equippedItem.rendering.layers) {
                // Iterate Layers
                equippedItem.rendering.layers.forEach((layer, idx) => {
                    // Base layer (idx 0) keeps original name, others get suffix
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

                // Hide secondary layers
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

            // Hide layers
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


export function getPlayerSprite(playerId, group) {
    return group.getChildren().find(child => child.playerId === playerId);
}

export function displayPlayers(self, playerInfo) {
    const localPlayerInfo = window.localPlayerInfo;
    console.log('[displayPlayers] Creating player with playerInfo:', playerInfo);
    console.log(`%c[displayPlayers] Creating player at: (${playerInfo.position.x}, ${playerInfo.position.y})`, 'color: cyan; font-weight: bold;');
    console.log('localPlayerInfo at displayPlayers Function = ', localPlayerInfo);

    const playerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    updateStruggleBar(playerContainer, playerInfo, self);

    // If the player is consumed, we hide their sprite entirely.
    // They are technically still there (for camera following), but invisible.
    // If the player is consumed, we hide their sprite ONLY if fully consumed (Stage 3)
    if (playerInfo.consumedBy && (!playerInfo.voreStage || playerInfo.voreStage >= 3)) {
        playerContainer.setVisible(false);
    }

    // Render/Update Vore Progress Bar
    updateVoreProgressBar(playerContainer, playerInfo, self);

    console.log('[displayPlayers] playerContainer created at:', playerContainer.x, playerContainer.y);
    playerContainer.setSize(60, 163);
    self.physics.world.enable(playerContainer);
    playerContainer.body.setSize(60, 30); // Match server collision box size
    playerContainer.body.setOffset(30, 66.5); // Match server collision box position (centered on y, x aligned)
    playerContainer.body.setCollideWorldBounds(false); // Prevent going off-map
    playerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);

    // Add colliders for all map layers that have blocked tiles
    if (self.mapLayers) {
        self.mapLayers.forEach(layer => {
            if (layer) {
                self.physics.add.collider(playerContainer, layer);
            }
        });
    }

    console.log('player coordinates are: X= ', playerInfo.position.x, 'Y= ', playerInfo.position.y);

    // Helper for color parsing
    const parseColor = (color) => {
        if (typeof color === 'string') {
            return Number(color);
        }
        return color;
    };

    //----- the 30, -87 defines the placement of the sprite in the container -----//
    const playerContainerTail = self.add.sprite(30, -81.5, playerInfo.tail.sprite).setTint(parseColor(playerInfo.tail.color)).setName('tail');
    const playerContainersecondaryTail = self.add.sprite(30, -81.5, playerInfo.tail.secondarySprite).setTint(parseColor(playerInfo.tail.secondaryColor)).setName('secondaryTail');
    const playerContaineraccentTail = self.add.sprite(30, -81.5, playerInfo.tail.accentSprite).setTint(parseColor(playerInfo.tail.accentColor)).setName('accentTail');

    const playerContainerbody = self.add.sprite(30, -81.5, playerInfo.body.sprite).setTint(parseColor(playerInfo.body.color)).setName('body');
    const playerContainersecondaryBody = self.add.sprite(30, -81.5, playerInfo.body.secondarySprite).setTint(parseColor(playerInfo.body.secondaryColor)).setName('secondaryBody');
    const playerContaineraccentBody = self.add.sprite(30, -81.5, playerInfo.body.accentSprite).setTint(parseColor(playerInfo.body.accentColor)).setName('accentBody');
    const playerContainergenitles = self.add.sprite(30, -81.5, playerInfo.genitles.sprite).setName('genitles');
    const playerContainerHands = self.add.sprite(30, -81.5, playerInfo.hands.sprite).setTint(parseColor(playerInfo.hands.color)).setName('hands');
    const playerContainerFeet = self.add.sprite(30, -81.5, playerInfo.feet.sprite).setTint(parseColor(playerInfo.feet.color)).setName('feet');

    const playerContainerhead = self.add.sprite(30, -81.5, playerInfo.head.sprite).setTint(parseColor(playerInfo.head.color)).setName('head');
    const playerContainersecondaryHead = self.add.sprite(30, -81.5, playerInfo.head.secondarySprite).setTint(parseColor(playerInfo.head.secondaryColor)).setName('secondaryHead');
    const playerContaineraccentHead = self.add.sprite(30, -81.5, playerInfo.head.accentSprite).setTint(parseColor(playerInfo.head.accentColor)).setName('accentHead');

    const playerContainerBeak = self.add.sprite(30, -81.5, playerInfo.beak.sprite).setTint(parseColor(playerInfo.beak.color)).setName('beak');

    const playerContainerouterEar = self.add.sprite(30, -81.5, playerInfo.ear.outerSprite).setTint(parseColor(playerInfo.ear.outerColor)).setName('outerEar');
    const playerContainerinnerEar = self.add.sprite(30, -81.5, playerInfo.ear.innerSprite).setTint(parseColor(playerInfo.ear.innerColor)).setName('innerEar');

    const playerContainereyes = self.add.sprite(30, -81.5, playerInfo.eyes.outer).setName('eyes');
    const playerContaineriris = self.add.sprite(30, -81.5, playerInfo.eyes.iris).setTint(parseColor(playerInfo.eyes.color)).setName('iris');
    const playerContainerhair = self.add.sprite(30, -81.5, playerInfo.hair.sprite).setTint(parseColor(playerInfo.hair.color)).setName('hair');
    const playerContainerheadAccessories = self.add.sprite(30, -81.5, playerInfo.headAccessories.sprite).setTint(parseColor(playerInfo.headAccessories.color)).setName('headAccessories');

    playerContainer.add([
        playerContainerTail,
        playerContainersecondaryTail,
        playerContaineraccentTail,

        playerContainerbody,
        playerContainersecondaryBody,
        playerContaineraccentBody,
        playerContainergenitles,
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

    self.playerContainer = playerContainer;
    self.players.add(playerContainer);
    self.cameras.main.startFollow(self.playerContainer);
    createVoreList(playerInfo.voreTypes, self);
    window.avatarSelected = true;

    window.cam1 = self.cameras.main.setSize(windowSize().x, windowSize().y).startFollow(playerContainer).setName('Camera 1');
    console.log('cam1 width and height = ', window.cam1.width, window.cam1.height);

    document.getElementById('phaserApp').focus();

    playerContainer.playerInfo = playerInfo;
    playerContainer.pendingInputs = [];
    playerContainer.inputSequenceNumber = 0;
    window.avatarSelected = true;

    // Initialize Equipment Visuals
    updatePlayerEquipmentVisuals(playerContainer, playerInfo.equipment);
}

export function displayOtherPlayers(self, playerInfo) {
    console.log("displayOtherPlayers function called");
    // Check for existing player to avoid duplicates
    const existingPlayer = getPlayerSprite(playerInfo.playerId, self.otherPlayersGroup);
    if (existingPlayer) {
        console.warn('Duplicate player detected in displayOtherPlayers. Destroying old one.', playerInfo.playerId);
        existingPlayer.destroy();
    }

    const otherPlayerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    otherPlayerContainer.setSize(60, 163);
    self.physics.world.enable(otherPlayerContainer);
    otherPlayerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);
    otherPlayerContainer.body.setOffset(30, -81.5);

    // If the player is consumed, we hide their sprite.
    // If the player is consumed, we hide their sprite ONLY if fully consumed (Stage 3)
    if (playerInfo.consumedBy && (!playerInfo.voreStage || playerInfo.voreStage >= 3)) {
        otherPlayerContainer.setVisible(false);
    }

    // Render/Update Vore Progress Bar
    updateVoreProgressBar(otherPlayerContainer, playerInfo, self);

    // Helper for color parsing (re-defined or scope it out if possible, but localized is fine)
    const parseColor = (color) => {
        if (typeof color === 'string') {
            return Number(color);
        }
        return color;
    };

    const playerContainertail = self.add.sprite(30, -81.5, playerInfo.tail.sprite).setName('tail');
    playerContainertail.setTint(parseColor(playerInfo.tail.color));
    const playerContainersecondaryTail = self.add.sprite(30, -81.5, playerInfo.tail.secondarySprite).setName('secondaryTail');
    playerContainersecondaryTail.setTint(parseColor(playerInfo.tail.secondaryColor));
    const playerContaineraccentTail = self.add.sprite(30, -81.5, playerInfo.tail.accentSprite).setName('accentTail');
    playerContaineraccentTail.setTint(parseColor(playerInfo.tail.accentColor));
    const playerContainerbody = self.add.sprite(30, -81.5, playerInfo.body.sprite).setName('body');
    playerContainerbody.setTint(parseColor(playerInfo.body.color));
    const playerContainersecondaryBody = self.add.sprite(30, -81.5, playerInfo.body.secondarySprite).setName('secondaryBody');
    playerContainersecondaryBody.setTint(parseColor(playerInfo.body.secondaryColor));
    const playerContaineraccentBody = self.add.sprite(30, -81.5, playerInfo.body.accentSprite).setName('accentBody');
    playerContaineraccentBody.setTint(parseColor(playerInfo.body.accentColor));
    const playerContainergenitles = self.add.sprite(30, -81.5, playerInfo.genitles.sprite).setName('genitles');
    const playerContainerHands = self.add.sprite(30, -81.5, playerInfo.hands.sprite).setName('hands');
    playerContainerHands.setTint(parseColor(playerInfo.hands.color));
    const playerContainerFeet = self.add.sprite(30, -81.5, playerInfo.feet.sprite).setName('feet');
    playerContainerFeet.setTint(parseColor(playerInfo.feet.color));
    const playerContainerhead = self.add.sprite(30, -81.5, playerInfo.head.sprite).setName('head');
    playerContainerhead.setTint(parseColor(playerInfo.head.color));
    const playerContainersecondaryHead = self.add.sprite(30, -81.5, playerInfo.head.secondarySprite).setName('secondaryHead');
    playerContainersecondaryHead.setTint(parseColor(playerInfo.head.secondaryColor));
    const playerContaineraccentHead = self.add.sprite(30, -81.5, playerInfo.head.accentSprite).setName('accentHead');
    playerContaineraccentHead.setTint(parseColor(playerInfo.head.accentColor));
    const playerContainerhair = self.add.sprite(30, -81.5, playerInfo.hair.sprite).setName('hair');
    playerContainerhair.setTint(parseColor(playerInfo.hair.color));
    const playerContainerouterEar = self.add.sprite(30, -81.5, playerInfo.ear.outerSprite).setName('outerEar');
    playerContainerouterEar.setTint(parseColor(playerInfo.ear.outerColor));
    const playerContainerinnerEar = self.add.sprite(30, -81.5, playerInfo.ear.innerSprite).setName('innerEar');
    playerContainerinnerEar.setTint(parseColor(playerInfo.ear.innerColor));
    const playerContainereyes = self.add.sprite(30, -81.5, playerInfo.eyes.outer).setName('eyes');
    const playerContaineriris = self.add.sprite(30, -81.5, playerInfo.eyes.iris).setName('iris');
    playerContaineriris.setTint(parseColor(playerInfo.eyes.color));
    const playerContainerBeak = self.add.sprite(30, -81.5, playerInfo.beak.sprite).setName('beak');
    playerContainerBeak.setTint(parseColor(playerInfo.beak.color));
    const playerContainerheadAccessories = self.add.sprite(30, -81.5, playerInfo.headAccessories.sprite).setName('headAccessories');
    playerContainerheadAccessories.setTint(parseColor(playerInfo.headAccessories.color));

    otherPlayerContainer.add([
        playerContainertail,
        playerContainersecondaryTail,
        playerContaineraccentTail,
        playerContainerbody,
        playerContainersecondaryBody,
        playerContaineraccentBody,
        playerContainergenitles,
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
    otherPlayerContainer.sendToBack(playerContainertail);

    otherPlayerContainer.playerId = playerInfo.playerId;
    self.otherPlayersGroup.add(otherPlayerContainer);
    otherPlayerContainer.playerInfo = playerInfo;

    // Initial struggle bar render
    updateStruggleBar(otherPlayerContainer, playerInfo, self);

    // Initialize Equipment Visuals
    updatePlayerEquipmentVisuals(otherPlayerContainer, playerInfo.equipment);
}

export function updateStruggleBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    // Create struggleBar if it doesn't exist (as a separate scene object, not child)
    if (!playerContainer.struggleBar) {
        playerContainer.struggleBar = scene.add.graphics();
        // Ensure it's cleaned up when the player is destroyed
        playerContainer.on('destroy', () => {
            if (playerContainer.struggleBar) {
                playerContainer.struggleBar.destroy();
            }
        });
    }

    const bar = playerContainer.struggleBar;

    // Only show the struggle bar if the player is held AND gripped firmly.
    // Crucially, we do NOT show it if they are consumed (!playerInfo.consumedBy).
    // Consumed players have a different UI (the "Struggle" button).
    if (playerInfo.isHeld && playerInfo.grippedFirmly && !playerInfo.consumedBy) {
        bar.setVisible(true);
        bar.clear();

        // Sync position with player
        bar.x = playerContainer.x;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 100; // Ensure it's above the player

        bar.fillStyle(0x000000);
        bar.fillRect(-30, -180, 60, 10);
        bar.fillStyle(0xff0000);
        const fillPercent = (playerInfo.struggleCount || 0) / 3;
        bar.fillRect(-30, -180, 60 * fillPercent, 10);
    } else {
        bar.setVisible(false);
    }
}

export function updateTypingIndicator(container, isTyping) {
    if (!container || !container.active) return;

    let indicator = container.getByName('typingIndicator');

    if (isTyping) {
        if (!indicator) {
            // Position above head. Standard sprites are at 30, -81.5. Container is 163 high.
            // Struggle bar is at -180. Let's put typing bubble around -150?
            indicator = container.scene.add.sprite(30, -150, 'typing');
            indicator.setName('typingIndicator');
            container.add(indicator);
        }
        indicator.setVisible(true);
        // Play animation if not already playing
        if (!indicator.anims.isPlaying || indicator.anims.currentAnim.key !== 'typing') {
            indicator.play('typing');
        }
    } else {
        if (indicator) {
            indicator.setVisible(false);
            indicator.stop(); // Stop animation
        }
    }
}

export function updateVoreProgressBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    // Create voreBar if not exists
    if (!playerContainer.voreBar) {
        playerContainer.voreBar = scene.add.graphics();
        playerContainer.on('destroy', () => {
            if (playerContainer.voreBar) playerContainer.voreBar.destroy();
        });
    }

    const bar = playerContainer.voreBar;

    // Show if in Stage 1 or 2
    if (playerInfo.consumedBy && playerInfo.voreStage && playerInfo.voreStage < 3) {
        bar.setVisible(true);
        bar.clear();

        // Sync position (above struggle bar area)
        bar.x = playerContainer.x;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 101;

        // Background
        bar.fillStyle(0x000000);
        bar.fillRect(-30, -200, 60, 10);

        // Progress (Yellow for caution/progress)
        bar.fillStyle(0xFFD700);
        const fillPercent = playerInfo.voreStage / 3;
        bar.fillRect(-30, -200, 60 * fillPercent, 10);

    } else {
        bar.setVisible(false);
    }
}

export function updateCraftingBar(playerContainer, playerInfo, scene) {
    if (!playerContainer.active) return;

    // Create craftingBar if not exists
    if (!playerContainer.craftingBar) {
        playerContainer.craftingBar = scene.add.graphics();
        playerContainer.on('destroy', () => {
            if (playerContainer.craftingBar) playerContainer.craftingBar.destroy();
        });
    }

    const bar = playerContainer.craftingBar;

    // console.log(`[CraftingBar] Updating for ${playerInfo.name || 'Player'}: isCrafting=${playerInfo.isCrafting}`);

    if (playerInfo.isCrafting && playerInfo.craftingStartTime && playerInfo.craftingDuration) {
        bar.setVisible(true);
        bar.clear();

        // Calculate Progress
        const elapsed = Date.now() - playerInfo.craftingStartTime;
        let progress = elapsed / playerInfo.craftingDuration;
        progress = Math.max(0, Math.min(1, progress));

        // Position: Above Head (approx -120 to -140 range? Typing is -150)
        // Let's put it below typing, above struggle (-180?? wait. Struggle is -180, Typing -150)
        // Struggle is highest? No, y decreases upwards.
        // -200 is Vore (High)
        // -180 is Struggle
        // -150 is Typing
        // Let's put Crafting at -165 (Between Typing and Struggle)

        // Position using constants
        bar.x = playerContainer.x + CRAFTING_BAR_X_OFFSET;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 102; // Topmost

        // Background
        bar.fillStyle(CRAFTING_BAR_COLOR_BG);
        bar.fillRect(CRAFTING_BAR_DRAW_X, CRAFTING_BAR_Y_OFFSET, CRAFTING_BAR_WIDTH, CRAFTING_BAR_HEIGHT);

        // Fill (Orange/Gold)
        bar.fillStyle(CRAFTING_BAR_COLOR_FILL);
        bar.fillRect(CRAFTING_BAR_DRAW_X, CRAFTING_BAR_Y_OFFSET, CRAFTING_BAR_WIDTH * progress, CRAFTING_BAR_HEIGHT);

        // Border
        bar.lineStyle(1, CRAFTING_BAR_COLOR_BORDER);
        bar.strokeRect(CRAFTING_BAR_DRAW_X, CRAFTING_BAR_Y_OFFSET, CRAFTING_BAR_WIDTH, CRAFTING_BAR_HEIGHT);

    } else {
        bar.setVisible(false);
    }
}
