
/**
 * @fileoverview Client-side Animal Entity Sprite
 * @description Phaser Arcade Sprite implementation for rendering animal entities,
 * smooth network position catch-up, directional animations, depth sorting, and click interaction.
 * Triggered by: Map loading (map.js), socket network updates (create.js), and user clicks.
 */
export class Animal extends Phaser.Physics.Arcade.Sprite {
    /**
     * Creates a new client-side Animal sprite entity.
     * @param {Phaser.Scene} scene - Active Phaser game scene
     * @param {number} x - Spawn X coordinate in pixels
     * @param {number} y - Spawn Y coordinate in pixels
     * @param {string} texture - Loaded texture key (e.g. 'sheep')
     * @param {string|number} frame - Initial frame identifier
     * @param {Object} properties - Merged Tiled object layer properties
     */
    constructor(scene, x, y, texture, frame, properties) {
        super(scene, x, y, texture, frame);

        this.scene = scene;
        this.properties = properties || {};

        // Physics Setup
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Bounding Box Setup (anchored to feet level)
        const bodyWidth = properties.bodyWidth || 80;
        const bodyHeight = properties.bodyHeight || 15;
        this.body.setSize(bodyWidth, bodyHeight);
        this.body.setOffset((this.width - bodyWidth) / 2, this.height - bodyHeight);

        this.body.setCollideWorldBounds(true);
        this.body.pushable = false; // Cannot be pushed by players
        this.body.immovable = true; // Controlled via server network lerp
        this.body.moves = false;     // Disable Arcade Physics internal velocity integration

        // Logic Properties
        this.moveSpeed = properties.moveSpeed || 30;
        this.wanderRange = 99999;
        this.idleTimer = 0;
        this.state = 'IDLE';
        this.lastDirection = 'Down';

        // Context Menu & Interaction Payload
        this.objectInfo = {
            uniqueId: properties.id || `animal_${Date.now()}_${Math.random()}`,
            name: properties.name || 'Animal',
            description: `A wild ${properties.species || 'creature'}.`,
            Identifier: 'mapObject'
        };

        this.spawnOrigin = { x: x, y: y };
        this.targetPosition = null;
        
        // OPTIMIZATION: Allocation pooling for target vector to prevent GC churn on packet receipt
        this._targetVector = new Phaser.Math.Vector2();

        // OPTIMIZATION: Pre-cached animation key strings to avoid per-frame string concatenation
        const key = texture;
        this.animKeys = {
            right: `${key}Right`,
            left: `${key}Left`,
            down: `${key}Down`,
            up: `${key}Up`,
            stopRight: `${key}StopRight`,
            stopLeft: `${key}StopLeft`,
            stopDown: `${key}StopDown`,
            stopUp: `${key}StopUp`
        };

        // OPTIMIZATION: Y-Depth throttle state (guarantees first frame depth execution)
        this.lastDepthY = -999999;

        // Visual Depth Initialization
        this.setDepth(this.y + (this.height / 2));

        // Interaction Handler
        if (properties.interactType === 'gather') {
            this.setInteractive({ cursor: 'pointer' });
            this.on('pointerdown', this.onInteract, this);
        }
    }

    /**
     * Processes server position and state snapshot updates.
     * @param {Object} data - Snapshot payload { x, y, state, isSheared }
     */
    serverUpdate(data) {
        if (!this.active || !this.scene) return;

        this.targetX = data.x;
        this.targetY = data.y;
        this.serverState = data.state;

        // Visual Sheared State (Grey Tint)
        if (data.isSheared) {
            this.setTint(0xaaaaaa);
        } else {
            this.clearTint();
        }

        // Large displacement / Teleport check
        const dist = Phaser.Math.Distance.Between(this.x, this.y, data.x, data.y);
        if (dist > 150) {
            this.setPosition(data.x, data.y);
            this.targetX = data.x;
            this.targetY = data.y;
            if (this.body) this.body.reset(data.x, data.y);
        }
    }

    /**
     * Pre-render frame update lifecycle hook.
     * @param {number} time - Current game time in ms
     * @param {number} delta - Frame delta time in ms
     */
    preUpdate(time, delta) {
        super.preUpdate(time, delta);
        
        // OPTIMIZATION: Throttled Depth Sorting (only re-sort when Y position moves > 0.5px)
        if (Math.abs(this.y - this.lastDepthY) > 0.5) {
            this.setDepth(this.y + (this.height * 0.5));
            this.lastDepthY = this.y;
        }

        // Smooth Position Catch-Up Interpolation
        let moveX = 0;
        let moveY = 0;
        if (typeof this.targetX === 'number' && typeof this.targetY === 'number') {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 150) {
                this.setPosition(this.targetX, this.targetY);
                if (this.body) this.body.updateFromGameObject();
            } else if (dist > 0.5) {
                // Smooth Lerp Catch-Up towards target
                const lerpFactor = Math.min(1.0, (delta / 1000) * 10);
                moveX = dx * lerpFactor;
                moveY = dy * lerpFactor;
                this.x += moveX;
                this.y += moveY;
                if (this.body) this.body.updateFromGameObject();
            } else {
                this.x = this.targetX;
                this.y = this.targetY;
                if (this.body) this.body.updateFromGameObject();
            }
        }

        // Directional Animation Update
        this.updateAnimation(moveX, moveY);
    }

    /**
     * Updates directional Phaser animations based on active frame movement vector.
     * @param {number} moveX - Delta X movement in current frame
     * @param {number} moveY - Delta Y movement in current frame
     */
    updateAnimation(moveX, moveY) {
        const isIdle = Math.abs(moveX) < 0.05 && Math.abs(moveY) < 0.05;

        if (isIdle || this.serverState === 'IDLE') {
            const stopKey = this.animKeys[`stop${this.lastDirection}`];
            if (stopKey && this.scene.anims && this.scene.anims.exists(stopKey)) {
                this.play(stopKey, true);
            } else {
                this.anims.stop();
            }
            return;
        }

        // OPTIMIZATION: Use pre-cached animKeys strings to prevent string concatenation GC overhead
        if (Math.abs(moveX) > Math.abs(moveY)) {
            if (moveX > 0) {
                this.lastDirection = 'Right';
                this.play(this.animKeys.right, true);
            } else {
                this.lastDirection = 'Left';
                this.play(this.animKeys.left, true);
            }
        } else {
            if (moveY > 0) {
                this.lastDirection = 'Down';
                this.play(this.animKeys.down, true);
            } else {
                this.lastDirection = 'Up';
                this.play(this.animKeys.up, true);
            }
        }
    }

    /**
     * Handles pointer click events on the animal.
     * @param {Phaser.Input.Pointer} pointer - Input pointer object
     */
    onInteract(pointer) {
        // Defer to contextMenu.js when spacebar is pressed to trigger Space+Click radial context wheel
        if (window.spacebarPressed) return;

        // Accept Primary (Left: 0) and Secondary (Right: 2) Click
        if (pointer.button !== 0 && pointer.button !== 2) return;

        pointer.interactionHandled = true;

        const player = this.scene.playerContainer;
        if (!player) return;

        const targetAnimalId = this.objectInfo?.uniqueId || this.properties?.id || 'unknown';
        const activeHand = pointer.button === 2 ? 'right' : 'left';

        const dist = Phaser.Math.Distance.Between(player.x, player.y, this.x, this.y);
        if (dist > 100) {
            // Trigger Smart Walk pathing towards animal before interaction
            this.scene.smartWalkTarget = {
                target: this,
                range: 75,
                onReach: () => {
                    if (this.scene.socket) {
                        this.scene.socket.emit('objectInteract', {
                            type: 'animal',
                            id: targetAnimalId,
                            action: this.properties.interactType || 'gather',
                            hand: activeHand
                        });
                    }
                }
            };
            return;
        }

        // Direct interaction emit
        if (this.scene.socket) {
            this.scene.socket.emit('objectInteract', {
                type: 'animal',
                id: targetAnimalId,
                action: this.properties.interactType || 'gather',
                hand: activeHand
            });
        }
    }
}
