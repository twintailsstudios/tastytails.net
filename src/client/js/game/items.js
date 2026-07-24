import StaticItemData from './itemData.js';
import resourceNodeData from './resourceNodeData.js';

export const itemManager = {
    scene: null,
    socket: null,
    itemsGroup: null,
    items: {}, // Map uid -> sprite

    init: function (scene, socket) {
        this.scene = scene;
        this.socket = socket;
        this.itemsGroup = scene.add.group(); // Visual group
        this.items = {};
        window.itemData = StaticItemData;
        window.itemManager = this;

        // Bind Socket Events
        socket.on('currentItems', (items) => this.syncItems(items));
        socket.on('itemSpawned', (item) => this.spawnItem(item));
        socket.on('itemRemoved', (uid) => this.removeItem(uid));

        // Handle Item Updates (Client-side sprite refresh)
        socket.on('itemUpdated', (item) => {
            console.log('[ItemManager] Item Updated:', item.uid);
            // Simplest way: Remove old and spawn new to update properties/frame
            this.removeItem(item.uid);
            this.spawnItem(item);
        });

        // console.log('[ItemManager] Initialized');
    },

    syncItems: function (serverItems) {
        console.log('[ItemManager] Syncing items:', serverItems.length);
        // clear existing
        Object.keys(this.items).forEach(uid => this.removeItem(uid));

        serverItems.forEach(item => this.spawnItem(item));

        // [MODIFIED] Update Loading Progress
        if (this.scene && this.scene.updateLoadingProgress) {
            console.log('[ItemManager] Setting Items Flag. count:', serverItems.length);
            this.scene.loadingFlags.items = true;
            this.scene.updateLoadingProgress(0.95, "Placing Items...");
            this.scene.checkLoadingComplete();
        }
    },

    setupItemInteraction: function (interactiveTarget, itemData, staticDef, tintTargets = []) {
        // Interaction
        interactiveTarget.setInteractive({ cursor: 'pointer' });

        // Attach Object Info
        interactiveTarget.objectInfo = {
            Identifier: 'mapObject',
            uniqueId: itemData.uid,
            name: itemData.name || 'Item',
            description: itemData.description || staticDef.description || 'A dropped item.',
            verb: itemData.verb || staticDef.verb,
            flavor: itemData.flavor || staticDef.flavor
        };

        // Also ensure the target itself has it (useful for container logic)
        if (interactiveTarget !== tintTargets) {
            // If target is container, maybe we attach to children? No, usually handled by caller.
        }

        // Resolve targets to tint (explicit tintTargets, interactiveTarget, or container children)
        const getTargetsToTint = () => {
            if (tintTargets && tintTargets.length) {
                return tintTargets;
            }
            if (typeof interactiveTarget.setTint === 'function') {
                return [interactiveTarget];
            }
            if (interactiveTarget.list && Array.isArray(interactiveTarget.list)) {
                return interactiveTarget.list.filter(t => typeof t.setTint === 'function');
            }
            return [];
        };

        // Hover Effects
        interactiveTarget.on('pointerover', () => {
            const targets = getTargetsToTint();
            targets.forEach(t => t.setTint(0xffeeaa));
            this.scene.input.setDefaultCursor('pointer');
        });

        interactiveTarget.on('pointerout', () => {
            const targets = getTargetsToTint();
            targets.forEach(t => {
                if (t.originalTint !== undefined) t.setTint(t.originalTint);
                else t.clearTint();
            });
            this.scene.input.setDefaultCursor('default');
        });

        // Click to Pickup
        interactiveTarget.on('pointerdown', (pointer) => {
            // If spacebar is pressed, allow contextMenu.js to handle opening the context wheel menu
            if (window.spacebarPressed) {
                return;
            }

            // If the item cannot be picked up, let the global click handler in contextMenu.js handle it
            if (staticDef.preventPickup || itemData.preventPickup || (itemData.properties && itemData.properties.preventPickup)) {
                return;
            }

            // Determine hand (Left Click = left, Right Click = right)
            const hand = pointer.rightButtonDown() ? 'right' : 'left';

            // Range Check (AABB Overlap: Reach Box vs Item Box)
            const playerContainer = this.scene.playerContainer;
            if (playerContainer) {
                // Reach Box (Centered on Player + 30)
                const reachRadius = 48; // half-width
                const pCenterX = playerContainer.x + 30;
                const pCenterY = playerContainer.y;

                const rLeft = pCenterX - reachRadius;
                const rRight = pCenterX + reachRadius;
                const rTop = pCenterY - reachRadius;
                const rBottom = pCenterY + reachRadius;

                // Item Box (Based on Sprite/Target dimensions & Origin)
                const iW = interactiveTarget.displayWidth || interactiveTarget.width || 32;
                const iH = interactiveTarget.displayHeight || interactiveTarget.height || 32;
                const oX = interactiveTarget.originX !== undefined ? interactiveTarget.originX : 0.5;
                const oY = interactiveTarget.originY !== undefined ? interactiveTarget.originY : 1;

                const iX = interactiveTarget.x; 

                let worldX = iX;
                let worldY = interactiveTarget.y;

                // If interactTarget is child of container, transform
                if (interactiveTarget.parentContainer) {
                    worldX = interactiveTarget.parentContainer.x + iX;
                    worldY = interactiveTarget.parentContainer.y + interactiveTarget.y;
                }

                const iLeft = worldX - (iW * oX);
                const iRight = worldX + (iW * (1 - oX));
                const iTop = worldY - (iH * oY);
                const iBottom = worldY + (iH * (1 - oY));

                const active = !(rLeft > iRight || rRight < iLeft || rTop > iBottom || rBottom < iTop);

                if (!active) {
                    console.log(`[ItemManager] Pickup Out of Reach (AABB) - Initiating Smart Walk`);
                    this.scene.smartWalkTarget = {
                        x: worldX,
                        y: worldY,
                        checkReach: (playerX, playerY) => {
                            const pCenterX = playerX + 30;
                            const pCenterY = playerY;
                            const rLeft = pCenterX - 15; 
                            const rRight = pCenterX + 15;
                            const rTop = pCenterY - 15;
                            const rBottom = pCenterY + 15;
                            return !(rLeft > iRight || rRight < iLeft || rTop > iBottom || rBottom < iTop);
                        },
                        onReach: () => {
                            console.log('[ItemManager] Smart Walk reached item:', itemData.uid);
                            this.socket.emit('playerHandClicked', {
                                hand: hand,
                                clickedItem: { Identifier: 'mapObject', uniqueId: itemData.uid },
                                playerIntent: window.currentIntent || 'friendly',
                                pointerX: pointer.event ? pointer.event.clientX : pointer.x,
                                pointerY: pointer.event ? pointer.event.clientY : pointer.y
                            });
                            if (window.completeTutorialTask) {
                                window.completeTutorialTask(hand === 'left' ? 'left_pickup' : 'right_pickup');
                            }
                        }
                    };
                    pointer.interactionHandled = true;
                    if (pointer.event) {
                        pointer.event.stopPropagation();
                    }
                    return;
                }
            }

            console.log('[ItemManager] Clicked item:', itemData.uid, 'Hand:', hand);
            this.socket.emit('playerHandClicked', {
                hand: hand,
                clickedItem: { Identifier: 'mapObject', uniqueId: itemData.uid },
                playerIntent: window.currentIntent || 'friendly',
                pointerX: pointer.event ? pointer.event.clientX : pointer.x,
                pointerY: pointer.event ? pointer.event.clientY : pointer.y
            });
            if (window.completeTutorialTask) {
                window.completeTutorialTask(hand === 'left' ? 'left_pickup' : 'right_pickup');
            }

            // Signal to Global ClickHandler (contextMenu.js) that we handled this.
            pointer.interactionHandled = true;

            // Stop propagation (DOM)
            if (pointer.event) {
                pointer.event.stopPropagation();
            }
        });
    },

    spawnItem: function (itemData) {
        if (this.items[itemData.uid]) return; // Already exists

        // Resolve Static Definition for Rendering Config
        const staticDef = StaticItemData[itemData.itemId] || StaticItemData[itemData.texture] || 
                          resourceNodeData[itemData.itemId] || resourceNodeData[itemData.texture] || {};

        // [FIX] Prioritize Instance Rendering Data (from Sewing Machine etc)
        const rendering = itemData.rendering || staticDef.rendering || {};

        // GENERIC LAYERED RENDERING
        if (rendering.type === 'layered') {
            const container = this.scene.add.container(itemData.x, itemData.y);
            // Height adjustment for TableTop items or ground-level items
            let depth = itemData.y;
            if (staticDef.isGround || itemData.isGround || (itemData.properties && itemData.properties.isGround)) {
                depth = -5; // Below players, above grass layer
            } else if (itemData.onTable) {
                depth = (itemData.surfaceDepth !== undefined) ? itemData.surfaceDepth + 1 : itemData.y + 100;
            }
            container.setDepth(depth);

            const timesUsed = Math.min(itemData.timesUsed || 0, 9);
            const layers = rendering.layers || [];
            let interactiveSprite = null;

            layers.forEach(layerDef => {
                const frame = (layerDef.frameOffset || 0) + timesUsed;
                const textureKey = layerDef.texture || itemData.texture;
                const sprite = this.scene.add.sprite(0, 0, textureKey, frame);
                sprite.setOrigin(0.5, 1);

                // Apply Initial Tint if param exists
                if (layerDef.tintParam) {
                    const tintColor = itemData[layerDef.tintParam] || staticDef[layerDef.tintParam];
                    if (tintColor) {
                        sprite.setTint(tintColor);
                        sprite.originalTint = tintColor; // Save for generic hover
                    }
                } else if (layerDef.tint) {
                    // [FIX] Support direct tint value (from Sewing Module)
                    sprite.setTint(layerDef.tint);
                    sprite.originalTint = layerDef.tint;
                }
                // Interactive / Hitbox logic: Layer designated as interactive gets the hit area
                if (layerDef.interactive || !interactiveSprite) {
                    interactiveSprite = sprite;
                }

                container.add(sprite);
            });

            // Set container size based on main layer or default frame size
            if (interactiveSprite && interactiveSprite.width > 0) {
                container.setSize(interactiveSprite.width, interactiveSprite.height);
            } else {
                container.setSize(32, 32);
            }

            const layerSprites = container.list ? container.list.filter(child => typeof child.setTint === 'function') : [];
            this.setupItemInteraction(container, itemData, staticDef, layerSprites);

            this.items[itemData.uid] = container; // Track container instead of single sprite
            this.itemsGroup.add(container);
            return;
        }

        // --- Standard Single Sprite Item Fallback ---
        const textureKey = itemData.texture || staticDef.texture || 'default_item';
        const sprite = this.scene.add.sprite(itemData.x, itemData.y, textureKey);
        sprite.setOrigin(0.5, 1);

        // Height adjustment for TableTop items or ground-level items
        let depth = itemData.y;
        if (staticDef.isGround || itemData.isGround || (itemData.properties && itemData.properties.isGround)) {
            depth = -5; // Below players, above grass layer
        } else if (itemData.onTable) {
            depth = (itemData.surfaceDepth !== undefined) ? itemData.surfaceDepth + 1 : itemData.y + 100;
        }
        sprite.setDepth(depth);

        // Dynamic Frame Rendering (for simple items that are usable but not layered)
        if (itemData.timesUsed !== undefined) {
            sprite.setFrame(Math.min(itemData.timesUsed, 9));
        }

        // Interaction & Metadata via Helper
        this.setupItemInteraction(sprite, itemData, staticDef);

        this.items[itemData.uid] = sprite; // FIX: Track the sprite
        this.itemsGroup.add(sprite);
    },

    removeItem: function (uid) {
        const sprite = this.items[uid];
        if (sprite) {
            sprite.destroy();
            delete this.items[uid];
        }
    }
};
