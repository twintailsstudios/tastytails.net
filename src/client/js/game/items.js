/**
 * @fileoverview Item Manager - Client-side Ground Item Renderer & Spatial Registry
 * 
 * @description
 * Manages the lifecycle, Phaser 3 visual rendering, depth sorting, hover interaction feedback,
 * and spatial registration of ground items dropped or spawned in the 2D game world.
 * Interoperates with radial context menus via window.itemManager and listens to real-time
 * WebSocket item synchronization events ('currentItems', 'itemSpawned', 'itemRemoved', 'itemUpdated').
 */

import StaticItemData from './itemData.js';
import resourceNodeData from './resourceNodeData.js';

/**
 * Calculates display depth for a ground item based on tile flags and tabletop placement.
 * OPTIMIZATION: Extracted to a top-level pure function to enforce DRY depth sorting across single/layered items.
 * 
 * @param {Object} itemData - Dynamic item instance payload from server
 * @param {Object} staticDef - Static item definition from itemData.js or resourceNodeData.js
 * @returns {number} Calculated Phaser depth value
 */
function computeItemDepth(itemData, staticDef) {
    if (staticDef.isGround || itemData.isGround || (itemData.properties && itemData.properties.isGround)) {
        return -5; // Below players, above grass layer
    }
    if (itemData.onTable) {
        return (itemData.surfaceDepth !== undefined) ? itemData.surfaceDepth + 1 : itemData.y + 100;
    }
    return itemData.y;
}

/**
 * Resolves child sprites or containers to apply hover highlight tints to.
 * OPTIMIZATION: Extracted to prevent creating inner closure helper functions inside hot item setup loops.
 * 
 * @param {Phaser.GameObjects.GameObject} interactiveTarget - Target container or sprite
 * @param {Array<Phaser.GameObjects.Sprite>} [tintTargets=[]] - Explicit list of child sprites to tint
 * @returns {Array<Phaser.GameObjects.Sprite>} List of tintable Phaser game objects
 */
function resolveTargetsToTint(interactiveTarget, tintTargets) {
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
}

export const itemManager = {
    scene: null,
    socket: null,
    itemsGroup: null,
    items: {}, // Map uid -> sprite or container

    // Named socket event handlers to prevent listener duplication on re-init
    _onCurrentItems: null,
    _onItemSpawned: null,
    _onItemRemoved: null,
    _onItemUpdated: null,

    /**
     * Initializes item manager with Phaser scene context and WebSocket listeners.
     * 
     * @param {Phaser.Scene} scene - Active game scene
     * @param {SocketIO.Socket} socket - Client socket connection
     */
    init: function (scene, socket) {
        this.scene = scene;
        this.socket = socket;
        this.itemsGroup = scene.add.group(); // Visual group
        this.items = {};
        window.itemData = StaticItemData;
        window.itemManager = this;

        // OPTIMIZATION: Clean up previous event listeners on re-init to prevent duplicate event handling
        if (this._onCurrentItems) socket.off('currentItems', this._onCurrentItems);
        if (this._onItemSpawned) socket.off('itemSpawned', this._onItemSpawned);
        if (this._onItemRemoved) socket.off('itemRemoved', this._onItemRemoved);
        if (this._onItemUpdated) socket.off('itemUpdated', this._onItemUpdated);

        // Store reference-stable handles for specific unbinding
        this._onCurrentItems = (items) => this.syncItems(items);
        this._onItemSpawned = (item) => this.spawnItem(item);
        this._onItemRemoved = (uid) => this.removeItem(uid);
        this._onItemUpdated = (item) => {
            const existing = this.items[item.uid];
            if (existing) {
                this.updateItemInPlace(existing, item);
            } else {
                this.spawnItem(item);
            }
        };

        // Bind Socket Events
        socket.on('currentItems', this._onCurrentItems);
        socket.on('itemSpawned', this._onItemSpawned);
        socket.on('itemRemoved', this._onItemRemoved);
        socket.on('itemUpdated', this._onItemUpdated);
    },

    /**
     * Synchronizes client ground items with a full server payload using set-based reconciliation diffing.
     * OPTIMIZATION: Avoids destroying unchanged items to eliminate GC spikes and GPU texture re-allocations.
     * 
     * @param {Array<Object>} serverItems - List of active ground items from server
     */
    syncItems: function (serverItems) {
        console.log('[ItemManager] Syncing items:', serverItems.length);

        const serverUidSet = new Set(serverItems.map(item => item.uid));

        // 1. Remove items no longer present on server
        Object.keys(this.items).forEach(uid => {
            if (!serverUidSet.has(uid)) {
                this.removeItem(uid);
            }
        });

        // 2. Spawn new items or update existing in-place
        serverItems.forEach(itemData => {
            const existing = this.items[itemData.uid];
            if (!existing) {
                this.spawnItem(itemData);
            } else {
                this.updateItemInPlace(existing, itemData);
            }
        });

        // Update Loading Progress flag in scene
        if (this.scene && this.scene.updateLoadingProgress) {
            console.log('[ItemManager] Setting Items Flag. count:', serverItems.length);
            this.scene.loadingFlags.items = true;
            this.scene.updateLoadingProgress(0.95, "Placing Items...");
            this.scene.checkLoadingComplete();
        }
    },

    /**
     * Updates an existing ground item object in-place without visual tear-down.
     * 
     * @param {Phaser.GameObjects.Sprite | Phaser.GameObjects.Container} target - Active Phaser game object
     * @param {Object} itemData - Updated server item state payload
     */
    updateItemInPlace: function (target, itemData) {
        const staticDef = StaticItemData[itemData.itemId] || StaticItemData[itemData.texture] || 
                          resourceNodeData[itemData.itemId] || resourceNodeData[itemData.texture] || {};

        const rendering = itemData.rendering || staticDef.rendering || {};
        const isContainer = typeof target.add === 'function';
        const needsContainer = rendering.type === 'layered';

        // If structural rendering mode changed, execute a clean re-spawn for this item
        if (isContainer !== needsContainer) {
            this.removeItem(itemData.uid);
            this.spawnItem(itemData);
            return;
        }

        // Update position and depth
        target.setPosition(itemData.x, itemData.y);
        target.setDepth(computeItemDepth(itemData, staticDef));

        // Sync sprite texture when texture key changes (e.g. soil state updates)
        const newTextureKey = itemData.texture || itemData.itemId || staticDef.texture;
        if (!isContainer && newTextureKey && typeof target.setTexture === 'function') {
            if (!target.texture || target.texture.key !== newTextureKey) {
                target.setTexture(newTextureKey);
            }
        }

        // Sync metadata for contextMenu.js inspect menu
        if (target.objectInfo) {
            target.objectInfo.name = itemData.name || 'Item';
            target.objectInfo.description = itemData.description || staticDef.description || 'A dropped item.';
            target.objectInfo.verb = itemData.verb || staticDef.verb;
            target.objectInfo.flavor = itemData.flavor || staticDef.flavor;
        }

        // Sync frame for simple sprites
        if (!isContainer && itemData.timesUsed !== undefined && typeof target.setFrame === 'function') {
            target.setFrame(Math.min(itemData.timesUsed, 9));
        }
    },

    /**
     * Binds pointer interactive cursor, hover highlight tints, and objectInfo inspect metadata.
     * OPTIMIZATION: Pre-calculates target array to prevent memory allocation during hover events.
     * 
     * @param {Phaser.GameObjects.GameObject} interactiveTarget - Target sprite or container
     * @param {Object} itemData - Item state payload
     * @param {Object} staticDef - Item static configuration
     * @param {Array<Phaser.GameObjects.Sprite>} [tintTargets=[]] - Sub-sprites to highlight on hover
     */
    setupItemInteraction: function (interactiveTarget, itemData, staticDef, tintTargets = []) {
        // Interaction
        interactiveTarget.setInteractive({ cursor: 'pointer' });

        // Attach Object Info for radial context menus
        interactiveTarget.objectInfo = {
            Identifier: 'mapObject',
            uniqueId: itemData.uid,
            name: itemData.name || 'Item',
            description: itemData.description || staticDef.description || 'A dropped item.',
            verb: itemData.verb || staticDef.verb,
            flavor: itemData.flavor || staticDef.flavor
        };

        // Pre-calculate target sprites to tint
        const targets = resolveTargetsToTint(interactiveTarget, tintTargets);

        // Hover Effects with active scene safeguards
        interactiveTarget.on('pointerover', () => {
            targets.forEach(t => {
                if (t && t.scene && typeof t.setTint === 'function') {
                    t.setTint(0xffeeaa);
                }
            });
            if (this.scene && this.scene.input) {
                this.scene.input.setDefaultCursor('pointer');
            }
        });

        interactiveTarget.on('pointerout', () => {
            targets.forEach(t => {
                if (t && t.scene && typeof t.setTint === 'function') {
                    if (t.originalTint !== undefined) t.setTint(t.originalTint);
                    else t.clearTint();
                }
            });
            if (this.scene && this.scene.input) {
                this.scene.input.setDefaultCursor('default');
            }
        });

        // Click to Pickup - Allow contextMenu.js to manage long-press radial menu and pointerup hand clicks
        interactiveTarget.on('pointerdown', (pointer) => {
            return;
        });
    },

    /**
     * Instantiates a Phaser Sprite or Container for a ground item and sets depth, frames, tints, and interaction.
     * 
     * @param {Object} itemData - Item instance payload from server
     */
    spawnItem: function (itemData) {
        if (this.items[itemData.uid]) return; // Already exists

        // Resolve Static Definition for Rendering Config
        const staticDef = StaticItemData[itemData.itemId] || StaticItemData[itemData.texture] || 
                          resourceNodeData[itemData.itemId] || resourceNodeData[itemData.texture] || {};

        // Prioritize Instance Rendering Data (from Sewing Machine etc)
        const rendering = itemData.rendering || staticDef.rendering || {};

        // GENERIC LAYERED RENDERING
        if (rendering.type === 'layered') {
            const container = this.scene.add.container(itemData.x, itemData.y);
            container.setDepth(computeItemDepth(itemData, staticDef));

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
                    // Support direct tint value (from Sewing Module)
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
        sprite.setDepth(computeItemDepth(itemData, staticDef));

        // Dynamic Frame Rendering (for simple items that are usable but not layered)
        if (itemData.timesUsed !== undefined) {
            sprite.setFrame(Math.min(itemData.timesUsed, 9));
        }

        // Interaction & Metadata via Helper
        this.setupItemInteraction(sprite, itemData, staticDef);

        this.items[itemData.uid] = sprite; // Track the sprite
        this.itemsGroup.add(sprite);
    },

    /**
     * Destroys Phaser game object for item and removes entry from items registry.
     * 
     * @param {string} uid - Unique item identifier
     */
    removeItem: function (uid) {
        const sprite = this.items[uid];
        if (sprite) {
            sprite.destroy();
            delete this.items[uid];
        }
    }
};


