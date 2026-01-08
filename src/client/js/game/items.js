import StaticItemData from './itemData.js';

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

        console.log('[ItemManager] Initialized');
    },

    syncItems: function (serverItems) {
        console.log('[ItemManager] Syncing items:', serverItems.length);
        // clear existing
        Object.keys(this.items).forEach(uid => this.removeItem(uid));

        serverItems.forEach(item => this.spawnItem(item));
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

        // Hover Effects
        interactiveTarget.on('pointerover', () => {
            tintTargets.length ? tintTargets.forEach(t => t.setTint(0xffeeaa)) : interactiveTarget.setTint(0xffeeaa);
            this.scene.input.setDefaultCursor('pointer');
        });

        interactiveTarget.on('pointerout', () => {
            tintTargets.length ? tintTargets.forEach(t => {
                if (t.originalTint) t.setTint(t.originalTint);
                else t.clearTint();
            }) : interactiveTarget.clearTint();
            this.scene.input.setDefaultCursor('default');
        });

        // Click to Pickup
        interactiveTarget.on('pointerdown', (pointer) => {
            if (pointer.leftButtonDown()) {
                console.log('[ItemManager] Clicked item:', itemData.uid);
                this.socket.emit('pickUpClicked', {
                    Identifier: 'item',
                    Name: itemData.uid
                });
            }
        });
    },

    spawnItem: function (itemData) {
        if (this.items[itemData.uid]) return; // Already exists

        // Resolve Static Definition for Rendering Config
        const staticDef = StaticItemData[itemData.itemId] || StaticItemData[itemData.texture] || {};

        // [FIX] Prioritize Instance Rendering Data (from Sewing Machine etc)
        const rendering = itemData.rendering || staticDef.rendering || {};

        // GENERIC LAYERED RENDERING
        if (rendering.type === 'layered') {
            const container = this.scene.add.container(itemData.x, itemData.y);
            container.setDepth(itemData.y);

            const timesUsed = itemData.timesUsed || 0;
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

                container.add(sprite);

                if (layerDef.interactive) {
                    interactiveSprite = sprite;
                    sprite.setInteractive({ cursor: 'pointer' });
                }
            });

            // If no interactive layer defined, default to the first layer (Base)
            if (!interactiveSprite && layers.length > 0 && container.list.length > 0) {
                const baseSprite = container.list[0];
                baseSprite.setInteractive({ cursor: 'pointer' });
                interactiveSprite = baseSprite;
            }

            if (interactiveSprite) {
                // Collect tint targets (all children)
                const tintTargets = container.list;
                this.setupItemInteraction(interactiveSprite, itemData, staticDef, tintTargets);

                // Copy objectInfo to container for reference if needed
                container.objectInfo = interactiveSprite.objectInfo;
            }

            this.items[itemData.uid] = container;
            this.itemsGroup.add(container);
            return;
        }

        // Texture: Use itemData.texture or default
        const texture = itemData.texture || 'default_item';
        // Need to ensure texture exists, or fallback? 
        // Phaser will show a placeholder/green box if missing usually?

        const sprite = this.scene.add.sprite(itemData.x, itemData.y, texture);

        // Origin: Bottom Center to match server collision logic
        sprite.setOrigin(0.5, 1);
        sprite.setDepth(itemData.y); // Simple depth sorting

        // Dynamic Frame Rendering (for simple items that are usable but not layered)
        if (itemData.timesUsed) {
            sprite.setFrame(itemData.timesUsed);
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
