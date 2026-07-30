/**
 * @fileoverview dropMode.js - Interactive Item Drop & Spatial Placement Controller
 * 
 * @description
 * Manages the drop mode targeting state for placing items held in player hands into the game world.
 * Calculates reach boundaries (48px / 1.5 tiles), steps along line-of-sight raycasts to prevent wall drops,
 * executes allocation-free spiral searches for obstacle evasion, and detects tabletop surfaces to ensure
 * correct Z-depth rendering.
 *
 * Triggered by: hands.js (on hand action drop click)
 * Updated by: update.js (per-frame game loop update)
 * Suppresses: create.js (click-to-move navigation during drop mode)
 */

/** Max reach distance in world pixels (1.5 tiles) */
const REACH_RADIUS = 48;
/** Standard map grid size in pixels */
const GRID_SIZE = 32;
/** Player container center horizontal offset in pixels */
const PLAYER_CENTER_OFFSET_X = 30;
/** Step distance in pixels for line-of-sight wall collision raycasting */
const RAYCAST_STEP = 16;
/** Max ring radius in tiles for spiral obstacle evasion search */
const MAX_SEARCH_RADIUS = 3;

/**
 * Drop Mode Singleton Controller State Machine
 */
export const dropMode = {
    /** @type {boolean} Indicates whether drop targeting mode is currently active */
    active: false,
    /** @type {Object|null} Item payload object being placed */
    item: null,
    /** @type {Phaser.GameObjects.Sprite|null} Semi-transparent ghost preview sprite */
    ghostSprite: null,
    /** @type {Phaser.GameObjects.Graphics|null} Line-of-sight and reach canvas graphics */
    reachGraphics: null,
    /** @type {Phaser.Scene|null} Reference to current Phaser scene */
    scene: null,
    /** @type {boolean} Flag indicating if current targeted location is valid for dropping */
    validDrop: false,
    /** @type {{x: number, y: number, onTable?: boolean, surfaceDepth?: number}} Pre-allocated drop target coordinates */
    dropCoords: { x: 0, y: 0 },
    /** @type {Array} Legacy candidates array retained for backward compatibility */
    candidates: [],
    /** @type {number|null} Handle for input click binding timeout */
    clickTimeoutId: null,
    /** @type {Phaser.Geom.Rectangle|null} Pre-allocated temporary rectangle for bounds calculations */
    tempBounds: null,

    /**
     * Activates Drop Mode for a specific item and hand.
     * 
     * @param {Phaser.Scene} scene - Active Phaser game scene
     * @param {Object} item - Item payload object to drop
     * @param {string} hand - Hand identifier ('left' | 'right')
     */
    start(scene, item, hand) {
        if (this.active) this.cancel(); // Reset if already active

        this.scene = scene;
        this.item = item;
        this.hand = hand;
        this.active = true;
        this.validDrop = false;

        // 1. Create Ghost Sprite
        const texture = item.texture || 'default_item';
        let frame = 0;
        if (item.timesUsed !== undefined) frame = Math.min(item.timesUsed, 9);

        this.ghostSprite = scene.add.sprite(scene.input.activePointer.worldX, scene.input.activePointer.worldY, texture, frame);
        this.ghostSprite.setAlpha(0.6);
        this.ghostSprite.setOrigin(0.5, 1);
        this.ghostSprite.setDepth(100000); // Render above world elements

        // Tint if needed
        if (item.tint) this.ghostSprite.setTint(item.tint);

        // 2. Initialize Graphics Layer
        this.reachGraphics = scene.add.graphics();
        this.reachGraphics.setDepth(99999);

        // 3. UI System Cues
        if (window.addLocalSystemMessage) {
            const isRightHand = this.hand === 'right';
            const confirmAction = isRightHand ? 'Right-Click' : 'Left-Click';
            const cancelAction = isRightHand ? 'Left-Click/ESC' : 'Right-Click/ESC';
            window.addLocalSystemMessage(`Drop Mode (${isRightHand ? 'Right' : 'Left'} Hand): ${confirmAction} to place, ${cancelAction} to cancel.`);
        }
        document.body.style.cursor = 'crosshair';

        // OPTIMIZATION: Populate Set for O(1) server tile collision lookups
        this.blockedTilesSet = new Set();
        if (window.serverBlockedTiles) {
            window.serverBlockedTiles.forEach(t => {
                this.blockedTilesSet.add(`${t.x},${t.y}`);
            });
        }

        // Cache positions for delta check optimization
        this.lastPointerX = -1;
        this.lastPointerY = -1;
        this.lastPlayerX = -1;
        this.lastPlayerY = -1;

        // 4. Input Handler Setup (Hand-specific button mapping)
        this.clickHandler = (pointer) => {
            const isRightHand = this.hand === 'right';
            const isConfirmClick = isRightHand ? pointer.rightButtonDown() : pointer.leftButtonDown();
            const isCancelClick = isRightHand ? pointer.leftButtonDown() : pointer.rightButtonDown();

            if (isCancelClick) {
                this.cancel();
            } else if (isConfirmClick) {
                if (this.validDrop) {
                    this.confirm();
                } else {
                    if (window.showWorldToast) window.showWorldToast(pointer.event.clientX, pointer.event.clientY, "Invalid Location");
                }
            }
        };

        // OPTIMIZATION & SAFEGUARD: Clear existing timeout handle to avoid race conditions on rapid re-entry
        if (this.clickTimeoutId) {
            clearTimeout(this.clickTimeoutId);
            this.clickTimeoutId = null;
        }

        // Delay attaching click listener by 100ms to prevent instant drop on start click
        this.clickTimeoutId = setTimeout(() => {
            if (this.active && this.scene && this.scene.input) {
                this.scene.input.on('pointerdown', this.clickHandler);
            }
            this.clickTimeoutId = null;
        }, 100);

        // Keyboard ESC Listener
        this.escHandler = (event) => {
            if (event.code === 'Escape') this.cancel();
        };
        window.addEventListener('keydown', this.escHandler);
    },

    /**
     * Per-frame update loop called from game update.js.
     * Computes reach clamping, wall collision raycasting, obstacle evasion, tabletop surface detection, and renders preview graphics.
     */
    update() {
        // SAFEGUARD: Early exit if player container or scene teardown in progress
        if (!this.active || !this.scene || !this.ghostSprite || !this.scene.playerContainer) return;

        const pointer = this.scene.input.activePointer;
        const player = this.scene.playerContainer;

        // OPTIMIZATION: Skip spatial calculations if cursor and player positions haven't moved
        if (Math.abs(pointer.worldX - this.lastPointerX) < 1 &&
            Math.abs(pointer.worldY - this.lastPointerY) < 1 &&
            Math.abs(player.x - this.lastPlayerX) < 1 &&
            Math.abs(player.y - this.lastPlayerY) < 1) {
            return;
        }

        this.lastPointerX = pointer.worldX;
        this.lastPointerY = pointer.worldY;
        this.lastPlayerX = player.x;
        this.lastPlayerY = player.y;

        // 1. Update Line of Sight & Reach Clamping
        const pX = player.x + PLAYER_CENTER_OFFSET_X;
        const pY = player.y;

        const minX = pX - REACH_RADIUS;
        const minY = pY - REACH_RADIUS;

        let vecX = pointer.worldX - pX;
        let vecY = pointer.worldY - pY;

        // Ray-Box Intersection (Clamp reach to 48px square radius)
        let scaleX = Infinity;
        let scaleY = Infinity;

        if (Math.abs(vecX) > 0) scaleX = REACH_RADIUS / Math.abs(vecX);
        if (Math.abs(vecY) > 0) scaleY = REACH_RADIUS / Math.abs(vecY);

        let scale = Math.min(scaleX, scaleY);
        if (scale > 1) scale = 1;

        let targetX = pX + vecX * scale;
        let targetY = pY + vecY * scale;

        /**
         * Checks if world point intersects with server or client collision map tiles.
         * @param {number} x - World X coordinate
         * @param {number} y - World Y coordinate
         * @returns {boolean} True if point is inside a collision tile
         */
        const isPointBlocked = (x, y) => {
            if (this.blockedTilesSet) {
                const tx = Math.floor(x / GRID_SIZE) * GRID_SIZE;
                const ty = Math.floor(y / GRID_SIZE) * GRID_SIZE;
                if (this.blockedTilesSet.has(`${tx},${ty}`)) return true;
            }

            if (this.scene.mapLayers) {
                for (const layer of this.scene.mapLayers) {
                    const tile = layer.getTileAtWorldXY(x, y);
                    if (tile && (tile.collides || (tile.properties && tile.properties.collides))) {
                        return true;
                    }
                }
            }
            return false;
        };

        // Step-based Raycast (Prevent dropping items across wall boundaries)
        const dist = Math.sqrt((targetX - pX) ** 2 + (targetY - pY) ** 2);
        const steps = Math.ceil(dist / RAYCAST_STEP);

        if (steps > 0) {
            const stepX = (targetX - pX) / steps;
            const stepY = (targetY - pY) / steps;

            let currX = pX;
            let currY = pY;

            for (let i = 1; i <= steps; i++) {
                const nextX = pX + stepX * i;
                const nextY = pY + stepY * i;

                if (isPointBlocked(nextX, nextY)) {
                    targetX = currX;
                    targetY = currY;
                    break;
                }
                currX = nextX;
                currY = nextY;
            }
        }

        // 2. Blocked Tile Check & Allocation-Free Spiral Search
        if (isPointBlocked(targetX, targetY)) {
            const originX = (Math.floor(targetX / GRID_SIZE) * GRID_SIZE) + (GRID_SIZE / 2);
            const originY = (Math.floor(targetY / GRID_SIZE) * GRID_SIZE) + (GRID_SIZE / 2);

            // OPTIMIZATION: Track minRingDist scalar to avoid heap array allocations ({x,y,d}) during search
            for (let r = 1; r <= MAX_SEARCH_RADIUS; r++) {
                let minRingDist = Infinity;
                let ringBestX = targetX;
                let ringBestY = targetY;
                let foundInRing = false;

                for (let dx = -r; dx <= r; dx++) {
                    for (let dy = -r; dy <= r; dy++) {
                        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

                        const cx = originX + (dx * GRID_SIZE);
                        const cy = originY + (dy * GRID_SIZE);

                        if (!isPointBlocked(cx, cy)) {
                            const d = (cx - targetX) ** 2 + (cy - targetY) ** 2;
                            if (d < minRingDist) {
                                minRingDist = d;
                                ringBestX = cx;
                                ringBestY = cy;
                                foundInRing = true;
                            }
                        }
                    }
                }

                if (foundInRing) {
                    targetX = ringBestX;
                    targetY = ringBestY;
                    break;
                }
            }
        }

        // 3. TableTop Surface & Elevation Depth Detection
        let onTable = false;
        let tableDepth = targetY;

        if (this.scene.objectGroup) {
            // OPTIMIZATION: Lazy initialize single reusable rectangle to prevent heap allocations in getBounds
            if (!this.tempBounds) {
                this.tempBounds = new Phaser.Geom.Rectangle();
            }

            const children = this.scene.objectGroup.getChildren();
            for (let i = 0; i < children.length; i++) {
                const obj = children[i];
                if (!obj || !obj.active) continue;

                // OPTIMIZATION: Dynamic spatial pruning based on display dimensions before property/bounds evaluation
                const maxDim = Math.max(obj.displayWidth || 64, obj.displayHeight || 64, 256);
                if (Math.abs(obj.x - targetX) > maxDim || Math.abs(obj.y - targetY) > maxDim) {
                    continue;
                }

                // Non-allocating property inspection for tableTop flag
                let isTableTop = false;
                const props = obj.properties;
                if (props) {
                    if (Array.isArray(props)) {
                        for (let j = 0; j < props.length; j++) {
                            if (props[j].name === 'tableTop' && props[j].value) {
                                isTableTop = true;
                                break;
                            }
                        }
                    } else if (props.tableTop) {
                        isTableTop = true;
                    }
                }
                if (!isTableTop && obj.objectInfo && obj.objectInfo.tableTop) {
                    isTableTop = true;
                }

                if (isTableTop) {
                    const bounds = obj.getBounds ? obj.getBounds(this.tempBounds) : null;
                    if (bounds && bounds.contains(targetX, targetY)) {
                        onTable = true;
                        tableDepth = obj.depth;
                        break;
                    }
                }
            }
        }

        // Update persistent coords object without re-allocation
        this.dropCoords.x = targetX;
        this.dropCoords.y = targetY;
        this.dropCoords.onTable = onTable;
        if (onTable) {
            this.dropCoords.surfaceDepth = tableDepth;
        } else {
            delete this.dropCoords.surfaceDepth;
        }

        this.validDrop = true;

        // 4. Update Visuals
        this.ghostSprite.x = targetX;
        this.ghostSprite.y = targetY;

        // Z-Depth sorting: Items on tables render at tableDepth + 1
        if (onTable) {
            this.ghostSprite.setDepth(tableDepth + 1);
        } else {
            this.ghostSprite.setDepth(targetY);
        }

        // Draw line vector and targeting indicators
        this.reachGraphics.clear();

        this.reachGraphics.lineStyle(2, 0xffffff, 0.5);
        this.reachGraphics.beginPath();
        this.reachGraphics.moveTo(pX, pY);
        this.reachGraphics.lineTo(targetX, targetY);
        this.reachGraphics.strokePath();

        this.reachGraphics.lineStyle(1, 0x00ffff, 0.3);
        this.reachGraphics.strokeRect(minX, minY, REACH_RADIUS * 2, REACH_RADIUS * 2);

        this.reachGraphics.lineStyle(2, 0x00ff00, 1);
        this.reachGraphics.strokeCircle(targetX, targetY - 2, 4);
    },

    /**
     * Confirms drop selection and transmits coordinates packet to socket server.
     */
    confirm() {
        if (!this.active) return;

        const socket = window.gameSocket;
        if (socket) {
            socket.emit('dropItemClicked', {
                x: this.dropCoords.x,
                y: this.dropCoords.y,
                onTable: this.dropCoords.onTable,
                surfaceDepth: this.dropCoords.surfaceDepth,
                hand: this.hand
            });
        }

        this.cancel();
    },

    /**
     * Deactivates drop mode, destroys preview graphics, clears timers, and unbinds event listeners.
     */
    cancel() {
        if (!this.active) return;

        this.active = false;

        // Clear input binding timer handle
        if (this.clickTimeoutId) {
            clearTimeout(this.clickTimeoutId);
            this.clickTimeoutId = null;
        }

        if (this.ghostSprite) {
            this.ghostSprite.destroy();
            this.ghostSprite = null;
        }

        if (this.reachGraphics) {
            this.reachGraphics.destroy();
            this.reachGraphics = null;
        }

        if (this.scene && this.scene.input) {
            this.scene.input.off('pointerdown', this.clickHandler);
        }

        window.removeEventListener('keydown', this.escHandler);

        document.body.style.cursor = 'default';
        this.scene = null;
        this.item = null;
    }
};

window.dropMode = dropMode; // Expose global for easy debugging/access
