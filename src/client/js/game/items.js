
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

        console.log('[ItemManager] Initialized');
    },

    syncItems: function (serverItems) {
        console.log('[ItemManager] Syncing items:', serverItems.length);
        // clear existing
        Object.keys(this.items).forEach(uid => this.removeItem(uid));

        serverItems.forEach(item => this.spawnItem(item));
    },

    spawnItem: function (itemData) {
        if (this.items[itemData.uid]) return; // Already exists

        // Texture: Use itemData.texture or default
        const texture = itemData.texture || 'default_item';
        // Need to ensure texture exists, or fallback? 
        // Phaser will show a placeholder/green box if missing usually?

        const sprite = this.scene.add.sprite(itemData.x, itemData.y, texture);

        // Origin: Bottom Center to match server collision logic
        sprite.setOrigin(0.5, 1);
        sprite.setDepth(itemData.y); // Simple depth sorting

        // Interaction
        sprite.setInteractive({ cursor: 'pointer' });

        // Hover Effects
        sprite.on('pointerover', () => {
            sprite.setTint(0xffeeaa); // Light yellow tint
            this.scene.input.setDefaultCursor('pointer');
        });

        sprite.on('pointerout', () => {
            sprite.clearTint();
            this.scene.input.setDefaultCursor('default');
        });

        // Click to Pickup
        sprite.on('pointerdown', (pointer) => {
            if (pointer.leftButtonDown()) {
                console.log('[ItemManager] Clicked item:', itemData.uid);
                this.socket.emit('pickUpClicked', {
                    Identifier: 'item',
                    Name: itemData.uid
                });
            }
        });

        // Add to tracking
        this.items[itemData.uid] = sprite;

        // Attach metadata for Context Menu (Treat as mapObject or similar)
        sprite.objectInfo = {
            Identifier: 'mapObject', // Use 'mapObject' to reuse existing contextMenu/server logic? Or 'item'?
            // Re-using 'mapObject' logic in server (which echoes name/desc) is easiest.
            uniqueId: itemData.uid,
            name: itemData.name || 'Item',
            description: itemData.description || 'A dropped item.'
        };

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
