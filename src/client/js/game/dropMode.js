export const dropMode = {
    active: false,
    item: null,
    ghostSprite: null,
    targetLine: null,
    reachGraphics: null,
    scene: null,
    validDrop: false,
    dropCoords: { x: 0, y: 0 },
    candidates: [], // Reusable array for spiral search logic

    start(scene, item) {
        if (this.active) this.cancel(); // Reset if already active

        this.scene = scene;
        this.item = item;
        this.active = true;
        this.validDrop = false;

        // 1. Create Ghost Sprite
        const texture = item.texture || 'default_item';
        let frame = 0;
        if (item.timesUsed) frame = item.timesUsed;

        // Handle layered rendering (simplified: just use base texture or default)
        // If we really wanted to be fancy we'd replicate the whole container, 
        // but a single sprite is usually enough for a "ghost".
        this.ghostSprite = scene.add.sprite(scene.input.activePointer.worldX, scene.input.activePointer.worldY, texture, frame);
        this.ghostSprite.setAlpha(0.6);
        this.ghostSprite.setOrigin(0.5, 1);
        this.ghostSprite.setDepth(100000); // On top of everything

        // Tint if needed
        if (item.tint) this.ghostSprite.setTint(item.tint);

        // 2. Initialize Graphics
        this.reachGraphics = scene.add.graphics();
        this.reachGraphics.setDepth(99999);

        // 3. UI Cues
        if (window.addLocalSystemMessage) window.addLocalSystemMessage("Drop Mode: Click to place, Right-Click/ESC to cancel.");
        document.body.style.cursor = 'crosshair';

        // Populate Blocked Tiles Cache (Set for O(1) lookup)
        this.blockedTilesSet = new Set();
        if (window.serverBlockedTiles) {
            window.serverBlockedTiles.forEach(t => {
                this.blockedTilesSet.add(`${t.x},${t.y}`);
            });
        }

        // Cache for optimization
        this.lastPointerX = -1;
        this.lastPointerY = -1;
        this.lastPlayerX = -1;
        this.lastPlayerY = -1;

        // 4. Input Listeners (Pointer Down handled in update logic or global click handler interception)
        // actually update loop is better for 'continuous' checking, but we need a click listener.
        // We'll hook into the global click handler or add a one-off here.
        // A one-off scene listener is safest to avoid conflicts.
        this.clickHandler = (pointer) => {
            if (pointer.rightButtonDown()) {
                this.cancel();
            } else if (pointer.leftButtonDown()) {
                if (this.validDrop) {
                    this.confirm();
                } else {
                    if (window.showWorldToast) window.showWorldToast(pointer.event.clientX, pointer.event.clientY, "Invalid Location");
                }
            }
        };

        // Use a slight delay to avoid the *current* click (that started the mode) from triggering this
        setTimeout(() => {
            if (this.active && this.scene) {
                this.scene.input.on('pointerdown', this.clickHandler);
            }
        }, 100);

        // Keyboard ESC
        this.escHandler = (event) => {
            if (event.code === 'Escape') this.cancel();
        };
        window.addEventListener('keydown', this.escHandler);
    },

    update() {
        if (!this.active || !this.scene || !this.ghostSprite) return;

        const pointer = this.scene.input.activePointer;
        const player = this.scene.playerContainer;

        // Optimization: Skip if input & player haven't moved (much)
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

        // 1. Update Line of Sight / Reach Calculation
        const pX = player.x + 30; // Center X
        const pY = player.y;      // Center Y

        // Grid Params
        const REACH_RADIUS = 48; // 1.5 tiles (3x3 grid total)
        const GRID_SIZE = 32;

        const minX = pX - REACH_RADIUS;
        const minY = pY - REACH_RADIUS;

        // Vector from Player to Cursor
        let vecX = pointer.worldX - pX;
        let vecY = pointer.worldY - pY;

        // 1. Ray-Box Intersection (Reach Grid)
        // Find point on line segment (Player->Cursor) closest to cursor but inside Reach Box.
        let scaleX = Infinity;
        let scaleY = Infinity;

        if (Math.abs(vecX) > 0) scaleX = REACH_RADIUS / Math.abs(vecX);
        if (Math.abs(vecY) > 0) scaleY = REACH_RADIUS / Math.abs(vecY);

        let scale = Math.min(scaleX, scaleY);
        if (scale > 1) scale = 1; // Cursor is inside or on edge

        let targetX = pX + vecX * scale;
        let targetY = pY + vecY * scale;

        // 1.5 Raycast Check (Prevent dropping through walls)
        // Helper to check if a specific world point is in a blocked tile
        const isPointBlocked = (x, y) => {
            // Check Server Blocked Tiles (Optimized Set Lookup)
            // We check this FIRST as it's O(1) now and usually the authoritative source for walls
            if (this.blockedTilesSet) {
                const tx = Math.floor(x / 32) * 32;
                const ty = Math.floor(y / 32) * 32;
                if (this.blockedTilesSet.has(`${tx},${ty}`)) return true;
            }

            // Check Map Layers (Client) - Fallback or supplementary
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

        // Simple step-based Raycast
        const dist = Math.sqrt((targetX - pX) ** 2 + (targetY - pY) ** 2);
        const steps = Math.ceil(dist / 16); // Check every 16px (half tile)

        let wallHit = false;
        if (steps > 0) {
            const stepX = (targetX - pX) / steps;
            const stepY = (targetY - pY) / steps;

            let currX = pX;
            let currY = pY;

            for (let i = 1; i <= steps; i++) {
                const nextX = pX + stepX * i;
                const nextY = pY + stepY * i;

                if (isPointBlocked(nextX, nextY)) {
                    // Hit a wall! Stop at previous step (or midway)
                    wallHit = true;
                    // Back up slightly to stay "in front"
                    // We use `currX, currY` which was the last valid point
                    targetX = currX;
                    targetY = currY;
                    break;
                }
                currX = nextX;
                currY = nextY;
            }
        }

        // 2. Blocked Tile Check & Spiral Search
        // (Re-use the checkBlocked function but we define it inside scope for now or refactor)
        // Since we already defined isPointBlocked above, we can alias it or reuse logic.
        const checkBlocked = isPointBlocked;

        if (checkBlocked(targetX, targetY)) {
            // Spiral Search for nearest open tile
            const TILE_SIZE = 32;
            let found = false;
            let bestX = targetX;
            let bestY = targetY;

            // Search Origin (Tile Center of the blocked target)
            const originX = (Math.floor(targetX / TILE_SIZE) * TILE_SIZE) + (TILE_SIZE / 2);
            const originY = (Math.floor(targetY / TILE_SIZE) * TILE_SIZE) + (TILE_SIZE / 2);

            // Radius in tiles to search
            const MAX_SEARCH_RADIUS = 3;

            for (let r = 1; r <= MAX_SEARCH_RADIUS; r++) {
                this.candidates.length = 0; // Clear without re-allocating

                for (let dx = -r; dx <= r; dx++) {
                    for (let dy = -r; dy <= r; dy++) {
                        // Only check the outer ring 'r'
                        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

                        const cx = originX + (dx * TILE_SIZE);
                        const cy = originY + (dy * TILE_SIZE);

                        if (!checkBlocked(cx, cy)) {
                            // Calculate distance from the *original* intended target
                            const dist = (cx - targetX) ** 2 + (cy - targetY) ** 2;
                            this.candidates.push({ x: cx, y: cy, d: dist });
                        }
                    }
                }

                if (this.candidates.length > 0) {
                    // Pick closest candidate in this ring
                    this.candidates.sort((a, b) => a.d - b.d);
                    const best = this.candidates[0];
                    bestX = best.x;
                    bestY = best.y;
                    found = true;
                    break;
                }
            }

            if (found) {
                targetX = bestX;
                targetY = bestY;
                // Optional: Visual cue (e.g. cursor color change) could go here
            }
        }

        // onTable Detection
        let onTable = false;
        let tableDepth = targetY;

        if (this.scene.objectGroup) {
            const children = this.scene.objectGroup.getChildren();
            // Simple AABB check for now. Optimization: Spatial Hash or Quadtree if many objects.
            let debugCount = 0;
            for (const obj of children) {
                if (debugCount < 1 && Math.abs(obj.x - targetX) < 100 && Math.abs(obj.y - targetY) < 100) {
                    console.log('[DropMode] Inspection:', {
                        type: obj.type,
                        props: obj.properties,
                        data: obj.data ? obj.data.getAll() : 'no-data',
                        objectInfo: obj.objectInfo
                    });
                    debugCount++;
                }

                // Check if object has 'tableTop' property (Tiled property)
                // Phaser Tiled objects usually have 'properties' as an object or array.
                // Depending on loader, might be obj.properties.tableTop or obj.data...
                // We'll check standard locations.

                let isTableTop = false;
                if (obj.properties) {
                    if (Array.isArray(obj.properties)) {
                        isTableTop = !!obj.properties.find(p => p.name === 'tableTop' && p.value);
                    } else {
                        isTableTop = !!obj.properties.tableTop;
                    }
                }
                // Also check 'objectInfo' if copied from map data
                if (!isTableTop && obj.objectInfo && obj.objectInfo.tableTop) {
                    isTableTop = true;
                }

                if (isTableTop) {
                    // Check bounds
                    // Objects often use origin (0, 1) for bottom-left or bottom-center.
                    // Let's assume consistent origin or use getBounds().
                    const bounds = obj.getBounds();
                    if (bounds.contains(targetX, targetY)) {
                        onTable = true;
                        tableDepth = obj.depth;
                        // If we want it visually ON TOP of the table sprite (which is usually sorted by Y)
                        // we effectively want it to render *after* the table.
                        // Standard Y-sort: depth = y.
                        // If table y = 100, depth = 100.
                        // If item y = 85 (on table), depth = 85. Item renders BEHIND table.
                        // We want Item Depth > Table Depth.
                        // So Item Depth = Table Depth + 1.
                        console.log('[DropMode] Hovering TableTop:', obj);
                        break; // Found one, good enough
                    }
                }
            }
        }

        // Update Persistent Coords Object (Avoid GC)
        this.dropCoords.x = targetX;
        this.dropCoords.y = targetY;
        this.dropCoords.onTable = onTable;
        // Fix: Store exact surface depth for correct Z-sorting
        if (onTable) {
            this.dropCoords.surfaceDepth = tableDepth;
        } else {
            delete this.dropCoords.surfaceDepth;
        }

        this.validDrop = true; // Use more logic if needed to invalidate completely

        // 2. Update Visuals
        this.ghostSprite.x = targetX;
        this.ghostSprite.y = targetY; // Ghost origin is (0.5, 1) usually bottom-center

        // Sort depth by Y
        if (onTable) {
            // Force it slightly above the table surface
            // Player standing in front will be > tableDepth, so player renders in front of item.
            // Player standing behind will be < tableDepth, so player renders behind item (and table).
            this.ghostSprite.setDepth(tableDepth + 1);
        } else {
            this.ghostSprite.setDepth(targetY);
        }

        // Draw Line
        this.reachGraphics.clear();

        // Line from player center to drop point
        this.reachGraphics.lineStyle(2, 0xffffff, 0.5);
        this.reachGraphics.beginPath();
        this.reachGraphics.moveTo(pX, pY);
        this.reachGraphics.lineTo(targetX, targetY);
        this.reachGraphics.strokePath();

        // Highlight Reach Box
        this.reachGraphics.lineStyle(1, 0x00ffff, 0.3);
        this.reachGraphics.strokeRect(minX, minY, REACH_RADIUS * 2, REACH_RADIUS * 2);

        // Draw 'Target' marker at drop point
        this.reachGraphics.lineStyle(2, 0x00ff00, 1); // Green for valid
        this.reachGraphics.strokeCircle(targetX, targetY - 2, 4); // Small circle at feet pos
    },

    confirm() {
        if (!this.active) return;

        console.log('[DropMode] Confirming drop at:', this.dropCoords);

        const socket = window.gameSocket; // Access global socket or pass it in?
        // hands.js uses actionHands.socket, but we can grab standard window.gameSocket

        if (socket) {
            socket.emit('dropItemClicked', {
                x: this.dropCoords.x,
                y: this.dropCoords.y,
                onTable: this.dropCoords.onTable,
                surfaceDepth: this.dropCoords.surfaceDepth
            });
        }

        this.cancel(); // Cleanup
    },

    cancel() {
        if (!this.active) return;
        console.log('[DropMode] Cancelled');

        this.active = false;

        if (this.ghostSprite) {
            this.ghostSprite.destroy();
            this.ghostSprite = null;
        }

        if (this.reachGraphics) {
            this.reachGraphics.destroy();
            this.reachGraphics = null;
        }

        if (this.scene) {
            this.scene.input.off('pointerdown', this.clickHandler);
        }

        window.removeEventListener('keydown', this.escHandler);

        document.body.style.cursor = 'default';
        this.scene = null;
        this.item = null;
    }
};

window.dropMode = dropMode; // Expose global for easy debugging/access
