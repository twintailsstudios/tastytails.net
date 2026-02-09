
export class Animal extends Phaser.Physics.Arcade.Sprite {
    constructor(scene, x, y, texture, frame, properties) {
        super(scene, x, y, texture, frame);

        this.scene = scene;
        this.properties = properties || {};

        // Physics Setup
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Set an appropriate body size (smaller than the visual sprite usually)
        // Default to a reasonable size if not defined in properties
        const bodyWidth = properties.bodyWidth || 80;
        const bodyHeight = properties.bodyHeight || 15;
        this.body.setSize(bodyWidth, bodyHeight);
        this.body.setOffset((this.width - bodyWidth) / 2, this.height - bodyHeight);

        this.body.setCollideWorldBounds(true);
        this.body.pushable = false; // Cannot be pushed by players
        this.body.immovable = false; // Can move

        // Logic Properties
        this.moveSpeed = properties.moveSpeed || 30; // Slower than players
        this.wanderRange = 99999;
        this.idleTimer = 0;
        this.state = 'IDLE';

        // Context Menu Compatibility
        this.objectInfo = {
            uniqueId: properties.id || `animal_${Date.now()}_${Math.random()}`,
            name: properties.name || 'Animal',
            description: `A wild ${properties.species || 'creature'}.`,
            Identifier: 'mapObject' // Ensure Identifier matches one of the cases in server-loop RightClick logic?
            // "mapObject" case in server-loop expects clickedItem.uniqueId
            // "player" case expects clickedItem.playerId
        };
        // NOTE: if Identifier is missing, contextMenu might assume something?
        // Let's check contextMenu.js line 100+.
        // It pushes `objectClicked` to `clickedList`.
        // Then sends to server.
        // Server handles based on Identifier?
        // Let's assume generic mapObject structure.

        this.spawnOrigin = { x: x, y: y };
        this.targetPostion = null;

        // Visuals
        this.setDepth(this.y + (this.height / 2));

        // Input
        if (properties.interactType === 'gather') {
            this.setInteractive({ cursor: 'url(/assets/cursors/interact.cur), pointer' });
            this.on('pointerdown', this.onInteract, this);
        }

        // Initialize State
        // this.enterIdleState(); // Removing local state control
    }

    // --- Server Reconciliation ---
    serverUpdate(data) {
        // data contains: x, y, state
        this.targetPosition = new Phaser.Math.Vector2(data.x, data.y);

        // Visual State (Sheared)
        if (data.isSheared) {
            this.setTint(0xaaaaaa); // Greyed out to look meaningless/naked
        } else {
            this.clearTint();
        }

        // Move visual
        if (this.scene) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, data.x, data.y);

            // If very far (teleport), snap immediately
            if (dist > 150) {
                this.body.reset(data.x, data.y);
                this.targetPosition = null;
            } else if (dist > 2) {
                // Move towards target smoothly
                // moveSpeed * 1.5 to catch up
                // We do NOT snap here. We let physics move us.
                this.scene.physics.moveTo(this, data.x, data.y, this.moveSpeed * 1.5);
            } else {
                // Close enough to snap
                this.body.reset(data.x, data.y);
                this.targetPosition = null;
                this.setVelocity(0, 0);
            }
        }

        // Anim state
        if (data.state === 'IDLE') {
            // Stop anims?
            // Only if fully stopped? Or Server says IDLE so we should be IDLE.
            // But valid lag might mean we are still catching up.
            // We prioritize catching up (targetPosition != null).
            // If we are moving to catch up, we want Walk anim even if Server says Idle.
        }
    }

    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        // [FIX] Depth Sorting: Use the bottom of the hitbox (feet)
        this.setDepth(this.y + (this.height * 0.5));

        // If we represent a remote object, we rely on physics moving us to target
        if (this.targetPosition) {
            const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetPosition.x, this.targetPosition.y);
            if (dist < 4) { // Snap threshold
                this.body.reset(this.targetPosition.x, this.targetPosition.y);
                this.targetPosition = null;
                this.setVelocity(0, 0);
            }
        }

        // Just ensure anim matches velocity.
        // We do NOT check data.state here, we check implicit physical state.

        const isIdle = this.body.speed < 5;
        this.updateAnimation(isIdle);
    }

    updateAnimation(isIdle) {
        const v = this.body.velocity;
        const textureKey = this.texture.key;

        if (isIdle) {
            // ... (keep idle logic)
            // Just use current frame or stop
            this.anims.stop(); // simplified
            return;
        }

        if (Math.abs(v.x) > Math.abs(v.y)) {
            if (v.x > 0) this.play(textureKey + 'Right', true);
            else this.play(textureKey + 'Left', true);
        } else {
            if (v.y > 0) this.play(textureKey + 'Down', true);
            else this.play(textureKey + 'Up', true);
        }
    }

    onInteract(pointer) {
        // Only accept Primary (Left) Click (0)
        // If Right Click (2), we do nothing so it bubbles to Context Menu
        if (pointer.button !== 0) return;

        // Distance Check
        const player = this.scene.playerContainer;
        if (!player) return;

        const dist = Phaser.Math.Distance.Between(player.x, player.y, this.x, this.y);
        if (dist > 100) return; // Too far

        // Trigger Event
        console.log(`[Animal] Interacted with ${this.properties.name}`);

        // We will emit a socket event for the server to handle the inventory logic
        if (this.scene.socket) {
            this.scene.socket.emit('objectInteract', {
                type: 'animal',
                id: this.properties.id || 'unknown',
                action: this.properties.interactType
            });
        }
    }
}
