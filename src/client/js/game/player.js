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

    // OPTIMIZATION: Dirty Check
    // Compare new equipment with last rendered equipment
    // Simple stringify comparison is fast enough for small objects like equipment slots
    const equipStr = JSON.stringify(equipmentData);
    if (container._lastEquipStr === equipStr) {
        return; // No change
    }
    container._lastEquipStr = equipStr;

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

    // --- SPIRIT/DEATH LOGIC START ---
    // If dead, use spiritSprite for visuals
    let visualData = playerInfo;
    const isDead = playerInfo.isDead && playerInfo.spiritSprite;

    if (isDead) {
        // Overlay spirit visual parts onto the base player info for rendering purposes
        visualData = { ...playerInfo, ...playerInfo.spiritSprite };
    }
    // --- SPIRIT/DEATH LOGIC END ---

    const playerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    updateStruggleBar(playerContainer, playerInfo, self);

    // If dead, set ghost transparency
    if (isDead) {
        playerContainer.setAlpha(0.8);
    }

    // If the player is consumed, we hide their sprite entirely.
    // They are technically still there (for camera following), but invisible.
    // If the player is consumed, we hide their sprite ONLY if fully consumed (Stage 3)
    if (playerInfo.consumedBy && (!playerInfo.voreStage || playerInfo.voreStage >= 3)) {
        playerContainer.setVisible(false);
    }

    // Render/Update Vore Progress Bar
    updateVoreProgressBar(playerContainer, playerInfo, self);

    // console.log('[displayPlayers] playerContainer created at:', playerContainer.x, playerContainer.y);
    playerContainer.setSize(60, 163);
    self.physics.world.enable(playerContainer);
    playerContainer.body.setSize(60, 30); // Match server collision box size
    playerContainer.body.setOffset(30, 66.5); // Match server collision box position (centered on y, x aligned)
    playerContainer.body.setCollideWorldBounds(false); // Prevent going off-map

    if (isDead) {
        playerContainer.body.checkCollision.none = true;
    }
    playerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);

    // Add colliders for all map layers that have blocked tiles
    if (self.mapLayers) {
        self.mapLayers.forEach(layer => {
            if (layer) {
                self.physics.add.collider(playerContainer, layer);
            }
        });
    }

    // console.log('player coordinates are: X= ', playerInfo.position.x, 'Y= ', playerInfo.position.y);

    // Helper for color parsing
    const parseColor = (color) => {
        if (typeof color === 'string') {
            return Number(color);
        }
        return color;
    };

    //----- the 30, -87 defines the placement of the sprite in the container -----//
    const playerContainerTail = self.add.sprite(30, -81.5, visualData.tail.sprite).setTint(parseColor(visualData.tail.color)).setName('tail');
    const playerContainersecondaryTail = self.add.sprite(30, -81.5, visualData.tail.secondarySprite).setTint(parseColor(visualData.tail.secondaryColor)).setName('secondaryTail');
    const playerContaineraccentTail = self.add.sprite(30, -81.5, visualData.tail.accentSprite).setTint(parseColor(visualData.tail.accentColor)).setName('accentTail');

    const playerContainerbody = self.add.sprite(30, -81.5, visualData.body.sprite).setTint(parseColor(visualData.body.color)).setName('body');
    const playerContainersecondaryBody = self.add.sprite(30, -81.5, visualData.body.secondarySprite).setTint(parseColor(visualData.body.secondaryColor)).setName('secondaryBody');
    const playerContaineraccentBody = self.add.sprite(30, -81.5, visualData.body.accentSprite).setTint(parseColor(visualData.body.accentColor)).setName('accentBody');
    const playerContainergenitles = self.add.sprite(30, -81.5, visualData.genitles.sprite).setName('genitles');
    const playerContainerHands = self.add.sprite(30, -81.5, visualData.hands.sprite).setTint(parseColor(visualData.hands.color)).setName('hands');
    const playerContainerFeet = self.add.sprite(30, -81.5, visualData.feet.sprite).setTint(parseColor(visualData.feet.color)).setName('feet');

    const playerContainerhead = self.add.sprite(30, -81.5, visualData.head.sprite).setTint(parseColor(visualData.head.color)).setName('head');
    const playerContainersecondaryHead = self.add.sprite(30, -81.5, visualData.head.secondarySprite).setTint(parseColor(visualData.head.secondaryColor)).setName('secondaryHead');
    const playerContaineraccentHead = self.add.sprite(30, -81.5, visualData.head.accentSprite).setTint(parseColor(visualData.head.accentColor)).setName('accentHead');

    const playerContainerBeak = self.add.sprite(30, -81.5, visualData.beak.sprite).setTint(parseColor(visualData.beak.color)).setName('beak');

    const playerContainerouterEar = self.add.sprite(30, -81.5, visualData.ear.outerSprite).setTint(parseColor(visualData.ear.outerColor)).setName('outerEar');
    const playerContainerinnerEar = self.add.sprite(30, -81.5, visualData.ear.innerSprite).setTint(parseColor(visualData.ear.innerColor)).setName('innerEar');

    const playerContainereyes = self.add.sprite(30, -81.5, visualData.eyes.outer).setName('eyes');
    const playerContaineriris = self.add.sprite(30, -81.5, visualData.eyes.iris).setTint(parseColor(visualData.eyes.color)).setName('iris');
    const playerContainerhair = self.add.sprite(30, -81.5, visualData.hair.sprite).setTint(parseColor(visualData.hair.color)).setName('hair');
    const playerContainerheadAccessories = self.add.sprite(30, -81.5, visualData.headAccessories.sprite).setTint(parseColor(visualData.headAccessories.color)).setName('headAccessories');

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
    // console.log('cam1 width and height = ', window.cam1.width, window.cam1.height);

    document.getElementById('phaserApp').focus();

    Object.assign(self.playerInfo, playerInfo);
    playerContainer.playerInfo = self.playerInfo;
    playerContainer.pendingInputs = [];
    playerContainer.inputSequenceNumber = 0;
    window.avatarSelected = true;

    // Initialize Equipment Visuals
    updatePlayerEquipmentVisuals(playerContainer, playerInfo.equipment);
}

export function displayOtherPlayers(self, playerInfo) {
    // console.log("displayOtherPlayers function called");
    // Check for existing player to avoid duplicates
    const existingPlayer = getPlayerSprite(playerInfo.playerId, self.otherPlayersGroup);
    if (existingPlayer) {
        console.warn('Duplicate player detected in displayOtherPlayers. Destroying old one.', playerInfo.playerId);
        existingPlayer.destroy();
    }

    // --- SPIRIT/DEATH LOGIC START ---
    let visualData = playerInfo;
    const isDead = playerInfo.isDead && playerInfo.spiritSprite;

    if (isDead) {
        visualData = { ...playerInfo, ...playerInfo.spiritSprite };
    }
    // --- SPIRIT/DEATH LOGIC END ---

    const otherPlayerContainer = self.add.container(playerInfo.position.x, playerInfo.position.y);
    otherPlayerContainer.setSize(60, 163);
    self.physics.world.enable(otherPlayerContainer);
    otherPlayerContainer.setInteractive(new Phaser.Geom.Rectangle(30, -81.5, 60, 163), Phaser.Geom.Rectangle.Contains);
    otherPlayerContainer.body.setOffset(30, -81.5);


    if (isDead) {
        otherPlayerContainer.body.checkCollision.none = true;
        otherPlayerContainer.setAlpha(0.8);
    } else {
        // otherPlayerContainer.setAlpha(0.8); // Original logic was here, but let's keep it safe
    }

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

    const playerContainertail = self.add.sprite(30, -81.5, visualData.tail.sprite).setName('tail');
    playerContainertail.setTint(parseColor(visualData.tail.color));
    const playerContainersecondaryTail = self.add.sprite(30, -81.5, visualData.tail.secondarySprite).setName('secondaryTail');
    playerContainersecondaryTail.setTint(parseColor(visualData.tail.secondaryColor));
    const playerContaineraccentTail = self.add.sprite(30, -81.5, visualData.tail.accentSprite).setName('accentTail');
    playerContaineraccentTail.setTint(parseColor(visualData.tail.accentColor));
    const playerContainerbody = self.add.sprite(30, -81.5, visualData.body.sprite).setName('body');
    playerContainerbody.setTint(parseColor(visualData.body.color));
    const playerContainersecondaryBody = self.add.sprite(30, -81.5, visualData.body.secondarySprite).setName('secondaryBody');
    playerContainersecondaryBody.setTint(parseColor(visualData.body.secondaryColor));
    const playerContaineraccentBody = self.add.sprite(30, -81.5, visualData.body.accentSprite).setName('accentBody');
    playerContaineraccentBody.setTint(parseColor(visualData.body.accentColor));
    const playerContainergenitles = self.add.sprite(30, -81.5, visualData.genitles.sprite).setName('genitles');
    const playerContainerHands = self.add.sprite(30, -81.5, visualData.hands.sprite).setName('hands');
    playerContainerHands.setTint(parseColor(visualData.hands.color));
    const playerContainerFeet = self.add.sprite(30, -81.5, visualData.feet.sprite).setName('feet');
    playerContainerFeet.setTint(parseColor(visualData.feet.color));
    const playerContainerhead = self.add.sprite(30, -81.5, visualData.head.sprite).setName('head');
    playerContainerhead.setTint(parseColor(visualData.head.color));
    const playerContainersecondaryHead = self.add.sprite(30, -81.5, visualData.head.secondarySprite).setName('secondaryHead');
    playerContainersecondaryHead.setTint(parseColor(visualData.head.secondaryColor));
    const playerContaineraccentHead = self.add.sprite(30, -81.5, visualData.head.accentSprite).setName('accentHead');
    playerContaineraccentHead.setTint(parseColor(visualData.head.accentColor));
    const playerContainerhair = self.add.sprite(30, -81.5, visualData.hair.sprite).setName('hair');
    playerContainerhair.setTint(parseColor(visualData.hair.color));
    const playerContainerouterEar = self.add.sprite(30, -81.5, visualData.ear.outerSprite).setName('outerEar');
    playerContainerouterEar.setTint(parseColor(visualData.ear.outerColor));
    const playerContainerinnerEar = self.add.sprite(30, -81.5, visualData.ear.innerSprite).setName('innerEar');
    playerContainerinnerEar.setTint(parseColor(visualData.ear.innerColor));
    const playerContainereyes = self.add.sprite(30, -81.5, visualData.eyes.outer).setName('eyes');
    const playerContaineriris = self.add.sprite(30, -81.5, visualData.eyes.iris).setName('iris');
    playerContaineriris.setTint(parseColor(visualData.eyes.color));
    const playerContainerBeak = self.add.sprite(30, -81.5, visualData.beak.sprite).setName('beak');
    playerContainerBeak.setTint(parseColor(visualData.beak.color));
    const playerContainerheadAccessories = self.add.sprite(30, -81.5, visualData.headAccessories.sprite).setName('headAccessories');
    playerContainerheadAccessories.setTint(parseColor(visualData.headAccessories.color));

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

    return otherPlayerContainer;
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

        // OPTIMIZATION: Dirty Check
        const fillPercent = (playerInfo.struggleCount || 0) / 3;
        // Check if state changed (visibility or progress)
        if (bar.visible && bar._lastFillPercent === fillPercent &&
            bar._lastX === playerContainer.x && bar._lastY === playerContainer.y) {
            return; // No change
        }

        bar.setVisible(true);
        bar.clear();

        // Sync position with player
        bar.x = playerContainer.x;
        bar.y = playerContainer.y;
        bar.depth = playerContainer.depth + 100; // Ensure it's above the player

        bar.fillStyle(0x000000);
        bar.fillRect(-30, -180, 60, 10);
        bar.fillStyle(0xff0000);
        bar.fillRect(-30, -180, 60 * fillPercent, 10);

        // Cache last values
        bar._lastFillPercent = fillPercent;
        bar._lastX = bar.x;
        bar._lastY = bar.y;

    } else {
        if (bar.visible) {
            bar.setVisible(false);
            bar._lastFillPercent = null;
        }
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

        // OPTIMIZATION: Dirty Check
        const fillPercent = playerInfo.voreStage / 3;

        if (bar.visible && bar._lastFillPercent === fillPercent &&
            bar._lastX === playerContainer.x && bar._lastY === playerContainer.y) {
            return;
        }

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
        bar.fillRect(-30, -200, 60 * fillPercent, 10);

        bar._lastFillPercent = fillPercent;
        bar._lastX = bar.x;
        bar._lastY = bar.y;

    } else {
        if (bar.visible) {
            bar.setVisible(false);
            bar._lastFillPercent = null;
        }
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

        // Calculate Progress
        const elapsed = Date.now() - playerInfo.craftingStartTime;
        let progress = elapsed / playerInfo.craftingDuration;
        progress = Math.max(0, Math.min(1, progress));

        // OPTIMIZATION: Dirty Check
        // Significant change check for progress (e.g., > 1%) 
        // to avoid sub-pixel redrawing every frame if it's slow? 
        // No, smooth bar needs every frame. But let's check if it moved or changed significantly.
        // Actually, if calculating progress, it WILL change every frame.
        // But maybe we can skip if visual change is < 1 pixel?
        // Width is 60. 1% is 0.6px.
        // Let's check pixel width change.

        const currentPixelWidth = Math.round(CRAFTING_BAR_WIDTH * progress);

        if (bar.visible && bar._lastPixelWidth === currentPixelWidth &&
            bar._lastX === playerContainer.x && bar._lastY === playerContainer.y) {
            return;
        }

        bar.setVisible(true);
        bar.clear();

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

        bar._lastPixelWidth = currentPixelWidth;
        bar._lastX = bar.x;
        bar._lastY = bar.y;

    } else {
        if (bar.visible) {
            bar.setVisible(false);
            bar._lastPixelWidth = null;
        }
    }
}

/**
 * Updates the visual cosmetics (tint/texture) of a player container based on the provided playerInfo.
 * This is crucial for applying updates when the server sends authoritative data (like after DB load).
 */
export function updatePlayerCosmetics(container, playerInfo) {
    if (!container || !container.active) return;

    // Helper for color parsing
    const parseColor = (color) => {
        if (typeof color === 'string') {
            return Number(color);
        }
        return color;
    };

    // List of cosmetic parts and their sub-sprites
    // Structure: { partName: 'head', sprites: ['sprite', 'secondarySprite', 'accentSprite'], names: ['head', 'secondaryHead', 'accentHead'] }
    // Or we can map strictly.

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
            key: 'genitles', parts: [
                { prop: 'sprite', name: 'genitles' }
            ]
        },
        {
            key: 'beak', parts: [
                { prop: 'sprite', name: 'beak' }
            ]
        },
        {
            key: 'eyes', parts: [
                { prop: 'outer', name: 'eyes', noTint: true }, // Eyes often don't have tint, or have specific logic
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
                // Update Texture if changed and valid
                const textureKey = data[part.prop];
                if (textureKey && textureKey !== 'empty' && sprite.texture.key !== textureKey) {
                    sprite.setTexture(textureKey);
                }

                // Update Tint if supported
                if (!part.noTint) {
                    // Determine which color property to use
                    // Default to 'color', 'secondaryColor', 'accentColor' based on standard pattern
                    // Or use specific 'colorProp' override
                    let colorKey = 'color';
                    if (part.colorProp) {
                        colorKey = part.colorProp;
                    } else if (part.name.toLowerCase().includes('secondary')) {
                        colorKey = 'secondaryColor';
                    } else if (part.name.toLowerCase().includes('accent')) {
                        colorKey = 'accentColor';
                    }

                    const newColor = parseColor(data[colorKey]);
                    // Only update if valid number
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
