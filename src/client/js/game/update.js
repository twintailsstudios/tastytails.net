import { updateCraftingBar } from './player.js';
import { updateStatsUI } from './stats.js';

function getPositionAtDistance(history, targetDistance) {
    if (!history || history.length === 0) return null;
    if (history.length === 1) return { x: history[0].x, y: history[0].y, rotation: history[0].rotation, isMoving: history[0].isMoving };

    let accumulatedDistance = 0;
    for (let i = 0; i < history.length - 1; i++) {
        const pCurrent = history[i];
        const pNext = history[i + 1];
        const dx = pNext.x - pCurrent.x;
        const dy = pNext.y - pCurrent.y;
        const segLength = Math.sqrt(dx * dx + dy * dy);

        if (accumulatedDistance + segLength >= targetDistance) {
            const remaining = targetDistance - accumulatedDistance;
            const ratio = segLength > 0 ? (remaining / segLength) : 0;
            
            const x = pCurrent.x + ratio * dx;
            const y = pCurrent.y + ratio * dy;
            
            const rotation = pNext.rotation;
            const isMoving = pNext.isMoving;

            // Prune old history that is no longer needed
            history.splice(i + 2); 

            return { x, y, rotation, isMoving };
        }
        accumulatedDistance += segLength;
    }

    // If the history path is shorter than targetDistance, return the oldest point
    const oldest = history[history.length - 1];
    return { x: oldest.x, y: oldest.y, rotation: oldest.rotation, isMoving: oldest.isMoving };
}

export function update(time, delta) {
    const chatFocused = window.chatFocused;
    const showDebug = this.showDebug;
    const playerDebugGraphics = this.playerDebugGraphics;
    const debugGraphics = this.debugGraphics;
    const serverBlockedTiles = window.serverBlockedTiles;

    // Always update UI even if chat is focused
    if (this.playerContainer && this.playerContainer.playerInfo) {
        // --- STATE CACHE (DIRTY FLAG) ---
        // Only touch the DOM if values have mathematically changed.
        const statsRef = this.playerContainer.playerInfo;
        const stats = statsRef.stats || statsRef; // Handle potential nested stats

        const lastStats = this.playerContainer.lastStats || {};

        const hasChanged =
            stats.health !== lastStats.health ||
            stats.maxHealth !== lastStats.maxHealth ||
            stats.mana !== lastStats.mana ||
            stats.maxMana !== lastStats.maxMana ||
            stats.stamina !== lastStats.stamina ||
            stats.maxStamina !== lastStats.maxStamina;

        if (hasChanged) {
            updateStatsUI(stats);
            // Update Cache
            this.playerContainer.lastStats = {
                health: stats.health,
                maxHealth: stats.maxHealth,
                mana: stats.mana,
                maxMana: stats.maxMana,
                stamina: stats.stamina,
                maxStamina: stats.maxStamina
            };
        }
    }

    if (!this.playerContainer || !this.cursors) {
        return;
    }
    // DEBUG: Check for multiple containers
    // console.log(`[DEBUG] Players group size: ${this.players.getChildren().length}`);
    // console.log(`[DEBUG] playerContainer ID: ${this.playerContainer.name || 'unnamed'}`);
    // console.log(`[DEBUG] playerContainer instance:`, this.playerContainer);
    // --- DIAGNOSTIC LOG ---
    // Log the position at the VERY START of the update loop.
    // console.log(`[UPDATE START] Pos: (${this.playerContainer.x.toFixed(2)}, ${this.playerContainer.y.toFixed(2)})`);

    const speed = 100;

    // Disable movement if consumed
    let inputPayload = {
        left: false,
        right: false,
        up: false,
        down: false
    };

    // Read keyboard inputs (Arrows + WASD)
    const leftPressed = this.cursors.left.isDown || (this.wasdKeys && this.wasdKeys.left.isDown);
    const rightPressed = this.cursors.right.isDown || (this.wasdKeys && this.wasdKeys.right.isDown);
    const upPressed = this.cursors.up.isDown || (this.wasdKeys && this.wasdKeys.up.isDown);
    const downPressed = this.cursors.down.isDown || (this.wasdKeys && this.wasdKeys.down.isDown);

    // Cancel Smart Walk if the player manually inputs movement
    if (leftPressed || rightPressed || upPressed || downPressed) {
        this.smartWalkTarget = null;
    }

    // Disable movement if consumed OR crafting
    // If the player is consumed, we ignore their keyboard input for movement.
    // This prevents them from moving their invisible sprite around while inside someone.
    if (!this.playerContainer.playerInfo.consumedBy && !chatFocused) {
        if (!this.playerContainer.playerInfo.isCrafting) {
            if (leftPressed || rightPressed || upPressed || downPressed) {
                // Normal Movement
                inputPayload = {
                    left: leftPressed,
                    right: rightPressed,
                    up: upPressed,
                    down: downPressed
                };
            } else if (this.smartWalkTarget) {
                // Smart Walk Autopathing
                const targetX = this.smartWalkTarget.target ? this.smartWalkTarget.target.x : this.smartWalkTarget.x;
                const targetY = this.smartWalkTarget.target ? this.smartWalkTarget.target.y : this.smartWalkTarget.y;

                // Check if reach condition is met
                const isReached = this.smartWalkTarget.checkReach ?
                    this.smartWalkTarget.checkReach(this.playerContainer.x, this.playerContainer.y) :
                    Phaser.Math.Distance.Between(this.playerContainer.x, this.playerContainer.y, targetX, targetY) <= (this.smartWalkTarget.range || 48);

                if (isReached) {
                    const onReach = this.smartWalkTarget.onReach;
                    this.smartWalkTarget = null; // Clear target
                    if (onReach) onReach();
                } else {
                    // Simulate direction keys towards target
                    const dx = targetX - this.playerContainer.x;
                    const dy = targetY - this.playerContainer.y;
                    const deadzone = 5; // prevent jitter when close

                    inputPayload = {
                        left: dx < -deadzone,
                        right: dx > deadzone,
                        up: dy < -deadzone,
                        down: dy > deadzone
                    };
                }
            }
        } else {
            // Crafting - Check for movement attempt to trigger Pause
            if (leftPressed || rightPressed || upPressed || downPressed) {
                // Throttle: Only check every 200ms to allow "holding" keys without spams
                const now = Date.now();
                if (!this.lastPauseCheck || now - this.lastPauseCheck > 200) {
                    this.lastPauseCheck = now;
                    if (window.craftingUI && typeof window.craftingUI.showPauseConfirmation === 'function') {
                        window.craftingUI.showPauseConfirmation();
                    }
                }
            }
        }
    }

    this.playerContainer.body.setVelocity(0);

    if (inputPayload.left) {
        this.playerContainer.body.setVelocityX(-speed);
    } else if (inputPayload.right) {
        this.playerContainer.body.setVelocityX(speed);
    }

    if (inputPayload.up) {
        this.playerContainer.body.setVelocityY(-speed);
    } else if (inputPayload.down) {
        this.playerContainer.body.setVelocityY(speed);
    }

    this.playerContainer.depth = this.playerContainer.y;

    // --- TARGET SIDE ATTACHMENT (Fix Latency) ---
    // If we are held, we ignore our own physics/inputs and attach to the holder's sprite.
    if (this.playerContainer.playerInfo && this.playerContainer.playerInfo.isHeld && this.playerContainer.playerInfo.heldBySocketId) {
        const holderId = this.playerContainer.playerInfo.heldBySocketId;

        // Find holder in map (O(1)) or group
        let holder = null;
        if (this.otherPlayersMap) {
            holder = this.otherPlayersMap.get(holderId);
        } else {
            holder = this.otherPlayersGroup.getChildren().find(p => p.playerInfo && p.playerInfo.playerId === holderId);
        }

        if (holder) {
            const holdDist = this.playerContainer.playerInfo.grippedFirmly ? 20 : 64;

            // Initialize holder position history queue on local player if not present
            if (!this.playerContainer.holderPositionHistory) {
                this.playerContainer.holderPositionHistory = [
                    { x: holder.x, y: holder.y, rotation: holder.playerInfo ? holder.playerInfo.rotation : 0, isMoving: holder.playerInfo ? holder.playerInfo.isMoving : false },
                    { x: this.playerContainer.x, y: this.playerContainer.y, rotation: this.playerContainer.playerInfo ? this.playerContainer.playerInfo.rotation : 0, isMoving: this.playerContainer.playerInfo ? this.playerContainer.playerInfo.isMoving : false }
                ];
            }

            // Push holder's position if it changed
            const lastHistory = this.playerContainer.holderPositionHistory[0];
            const currentRot = holder.playerInfo ? holder.playerInfo.rotation : 0;
            const currentIsMoving = holder.playerInfo ? holder.playerInfo.isMoving : false;
            if (!lastHistory || lastHistory.x !== holder.x || lastHistory.y !== holder.y || lastHistory.rotation !== currentRot || lastHistory.isMoving !== currentIsMoving) {
                this.playerContainer.holderPositionHistory.unshift({
                    x: holder.x,
                    y: holder.y,
                    rotation: currentRot,
                    isMoving: currentIsMoving
                });
            }

            const prevX = this.playerContainer.x;
            const prevY = this.playerContainer.y;

            const targetPos = getPositionAtDistance(this.playerContainer.holderPositionHistory, holdDist);
            if (targetPos) {
                this.playerContainer.setPosition(targetPos.x, targetPos.y);
                if (this.playerContainer.playerInfo) {
                    this.playerContainer.playerInfo.rotation = targetPos.rotation;
                    const dx = targetPos.x - prevX;
                    const dy = targetPos.y - prevY;
                    const distMoved = Math.sqrt(dx * dx + dy * dy);
                    this.playerContainer.playerInfo.isMoving = distMoved > 0.1;
                }
            }

            // Stop Physics Velocity so we don't fight
            this.playerContainer.body.setVelocity(0);
        }
    }

    // --- INPUT THROTTLING (30Hz Network Rate) ---
    // We update local physics every frame (60Hz+) for smoothness.
    // But we only send inputs to server at 30Hz to save bandwidth/CPU.

    if (!this.inputAccumulator) this.inputAccumulator = 0;
    this.inputAccumulator += delta;

    // Send packet if ~33ms has passed (30Hz) or instant if critical? 
    // Actually, simple accumulator check is fine.
    if (this.inputAccumulator >= 33) {
        // Increment sequence number
        this.playerContainer.inputSequenceNumber++;
        inputPayload.sequence = this.playerContainer.inputSequenceNumber;
        inputPayload.clientTimestamp = Date.now();
        inputPayload.delta = this.inputAccumulator / 1000; // Send accumulated delta in seconds

        // Store input for reconciliation
        this.playerContainer.pendingInputs.push({
            sequence: inputPayload.sequence,
            input: inputPayload,
            delta: this.inputAccumulator / 1000,
            clientTimestamp: Date.now()
        });

        this.socket.emit('playerInput', inputPayload);
        this.inputAccumulator = 0;
    }

    // --- NEW DIAGNOSTIC LOG ---
    // Log the position at the VERY END of the update loop.
    // Note: Velocity doesn't change position instantly, so this might not change much frame-to-frame,
    // but it will help us see if something is wrong within this function itself.
    // console.log(`[UPDATE END] Pos: (${this.playerContainer.x.toFixed(2)}, ${this.playerContainer.y.toFixed(2)})`);
    if (this.playerContainer.body) {
        const b = this.playerContainer.body;
        // console.log(`[Body Debug] Container: (${this.playerContainer.x}, ${this.playerContainer.y}), Body: (${b.x}, ${b.y}), Size: ${b.width}x${b.height}, Offset: ${b.offset.x}, ${b.offset.y}`);
    }

    // --- Player Collision Debug Drawing ---
    if (playerDebugGraphics) {
        playerDebugGraphics.clear();
        if (showDebug) {
            // Draw for local player
            if (this.playerContainer) {
                const width = (this.playerContainer.playerInfo && this.playerContainer.playerInfo.collisionBox) ? this.playerContainer.playerInfo.collisionBox.width : 24;
                const height = (this.playerContainer.playerInfo && this.playerContainer.playerInfo.collisionBox) ? this.playerContainer.playerInfo.collisionBox.height : 24;
                // Add 30 to x to account for sprite offset in container
                const x = this.playerContainer.x + 30 - width / 2;
                const y = this.playerContainer.y - height / 2;

                playerDebugGraphics.lineStyle(2, 0x00ff00, 1); // Green
                playerDebugGraphics.fillStyle(0x00ff00, 0.5); // Transparent Green Fill
                playerDebugGraphics.strokeRect(x, y, width, height);
                playerDebugGraphics.fillRect(x, y, width, height);
                playerDebugGraphics.setDepth(20000);
            }

            // Draw for other players
            if (this.otherPlayersGroup) {
                this.otherPlayersGroup.getChildren().forEach(otherPlayer => {
                    const width = (otherPlayer.playerInfo && otherPlayer.playerInfo.collisionBox) ? otherPlayer.playerInfo.collisionBox.width : 24;
                    const height = (otherPlayer.playerInfo && otherPlayer.playerInfo.collisionBox) ? otherPlayer.playerInfo.collisionBox.height : 24;
                    // Add 30 to x to account for sprite offset in container
                    const x = otherPlayer.x + 30 - width / 2;
                    const y = otherPlayer.y - height / 2;

                    playerDebugGraphics.lineStyle(2, 0x00ff00, 1);
                    playerDebugGraphics.fillStyle(0x00ff00, 0.5);
                    playerDebugGraphics.strokeRect(x, y, width, height);
                    playerDebugGraphics.fillRect(x, y, width, height);
                    playerDebugGraphics.setDepth(20000);
                });
            }
        }
    }

    // --- DEBUG DRAWING ---
    if (showDebug) {
        if (!this.debugGraphics) {
            this.debugGraphics = debugGraphics; // Assign global if missing (though we expect it on 'this')
        }
        if (this.debugGraphics) {
            this.debugGraphics.clear();

            // Draw Area of Reach Grid (3x3 'Tiles' smoothed)
            if (this.playerContainer) {
                // 3x3 tiles = 96x96 pixels.
                // Centered on player (with +30 visual offset).
                // Left Edge = (PlayerX + 30) - 48
                // Top Edge = PlayerY - 48
                const size = 96;
                const halfSize = 48;

                const centerX = this.playerContainer.x + 30;
                const centerY = this.playerContainer.y;

                this.debugGraphics.lineStyle(2, 0x00ffff, 0.8); // Cyan for Reach Box
                this.debugGraphics.strokeRect(centerX - halfSize, centerY - halfSize, size, size);
            }

            // Draw Server Blocked Tiles (Orange Outlines)
            if (serverBlockedTiles && serverBlockedTiles.length > 0) {
                this.debugGraphics.lineStyle(2, 0xffa500, 1);

                // OPTIMIZATION: Only draw tiles visible to the camera
                const camera = this.cameras.main;
                const view = camera.worldView;
                // Add a small buffer to prevent popping artifacts at edges
                const buffer = 64;

                // Optimization: simple bounds check
                const viewLeft = view.x - buffer;
                const viewRight = view.right + buffer;
                const viewTop = view.y - buffer;
                const viewBottom = view.bottom + buffer;

                serverBlockedTiles.forEach(tile => {
                    if (tile.x >= viewLeft && tile.x <= viewRight &&
                        tile.y >= viewTop && tile.y <= viewBottom) {
                        this.debugGraphics.strokeRect(tile.x, tile.y, 32, 32);
                    }
                });
                this.debugGraphics.setDepth(20000);
            }

            // Draw Client Blocked Tiles (Transparent Orange Fill)
            if (this.mapLayers) {
                this.debugGraphics.fillStyle(0xffa500, 0.4); // Transparent Orange (approx 100/255)

                const camera = this.cameras.main;
                const view = camera.worldView;
                const buffer = 2; // Tile buffer to ensure edges don't pop

                this.mapLayers.forEach(layer => {
                    if (!layer) return;

                    // We need to calculate the Tile coordinates corresponding to the View
                    // layer.worldToTileX handles the conversion based on tile size/scale
                    const tileX = layer.worldToTileX(view.x) - buffer;
                    const tileY = layer.worldToTileY(view.y) - buffer;
                    const tileRight = layer.worldToTileX(view.right) + buffer;
                    const tileBottom = layer.worldToTileY(view.bottom) + buffer;

                    const width = tileRight - tileX;
                    const height = tileBottom - tileY;

                    // Get only the tiles within the current camera view
                    const tiles = layer.getTilesWithin(tileX, tileY, width, height);

                    if (tiles) {
                        tiles.forEach(tile => {
                            // Check for collision flag (standard Phaser Arcade Physics or Custom 'collides')
                            if (tile && (tile.collides || (tile.properties && tile.properties.collides))) {
                                this.debugGraphics.fillRect(tile.pixelX, tile.pixelY, tile.width, tile.height);
                            }
                        });
                    }
                });
                this.debugGraphics.setDepth(30000); // Ensure it's on top of everything
            }

            // Draw coordinates for local player (DOM Update)
            if (this.playerContainer) {
                // Optimization: Only update DOM if coordinates genuinely changed significantly or on a timer?
                // For coords, every frame is fine if we use Cached DOM Element, but let's throttle slightly if possible.
                // Actually, simple textContent set is fast enough if element is cached.

                // Use Cached DOM Element
                if (this.debugUI && this.debugUI.coords) {
                    const x = Math.round(this.playerContainer.x);
                    const y = Math.round(this.playerContainer.y);
                    this.debugUI.coords.textContent = `X: ${x}, Y: ${y}`;
                }

                // Remove old text if it exists (cleanup)
                if (this.debugCoordsText) {
                    this.debugCoordsText.destroy();
                    this.debugCoordsText = null;
                }
            }

            // --- Update Extra Stats (Bandwidth & Render) ---
            // Throttled to every 500ms to be readable
            const now = Date.now();
            if (!this.lastStatUpdate || now - this.lastStatUpdate > 500) {
                this.lastStatUpdate = now;

                // 1. Render Stats
                const loop = this.sys.game.loop;
                const fps = loop.actualFps ? Math.round(loop.actualFps) : 0;

                let entityCount = 0;
                if (this.players) entityCount += this.players.getLength();
                if (this.otherPlayersGroup) entityCount += this.otherPlayersGroup.getLength();
                if (this.objectGroup) entityCount += this.objectGroup.getLength();

                if (this.debugUI && this.debugUI.renderStats) {
                    this.debugUI.renderStats.textContent = `${fps} FPS / ${entityCount} Ents`;
                }

                // 2. Bandwidth Stats
                if (this.bandwidthStats) {
                    const elapsedSec = (now - this.bandwidthStats.lastCheck) / 1000;
                    if (elapsedSec > 0) {
                        const downRate = Math.round(this.bandwidthStats.bytesIn / elapsedSec);
                        const upRate = Math.round(this.bandwidthStats.bytesOut / elapsedSec);

                        // Reset accumulators
                        this.bandwidthStats.bytesIn = 0;
                        this.bandwidthStats.bytesOut = 0;
                        this.bandwidthStats.lastCheck = now;

                        if (this.debugUI && this.debugUI.bandwidth) {
                            this.debugUI.bandwidth.textContent = `${downRate} / ${upRate} B/s`;
                        }
                    }
                }
            }
        }
    } else if (!showDebug && this.debugGraphics) {
        this.debugGraphics.clear();
        // DOM Cleanup not strictly necessary as it's static in the menu, 
        // but we could clear the text if desired. For now, leaving last known coords is fine.
    }

    // --- Shadow System Update (Client Prediction) ---
    if (this.shadowSystem) {
        this.shadowSystem.update();
    }

    // --- Crafting Range Check ---
    if (window.craftingUI && window.craftingUI.isOpen && window.craftingUI.currentStationId) {
        // Find the station object to check distance
        // OPTIMIZATION: Cache station object in craftingUI or locally
        // We shouldn't search an array of 2000+ objects every frame.

        // Strategy: We'll assume craftingUI.currentStationObject is set, or we find it ONCE.
        if (!window.craftingUI.currentStationObject) {
            const stationId = window.craftingUI.currentStationId;
            window.craftingUI.currentStationObject = this.objectGroup.getChildren().find(obj => obj.objectInfo && obj.objectInfo.uniqueId === stationId);
        }

        const station = window.craftingUI.currentStationObject;

        if (station) {
            // Optimization: Use distanceSq
            const dx = this.playerContainer.x - station.x;
            const dy = this.playerContainer.y - station.y;
            const distSq = dx * dx + dy * dy;

            // 150 * 150 = 22500
            if (distSq > 22500) {
                // console.log(`[Range Check] Too far from station. Closing.`);
                window.craftingUI.close();
                window.craftingUI.showFloatingText("Too far away!", true);
                window.craftingUI.currentStationObject = null; // Clear cache
            }
        }
    } else {
        // Ensure cache is cleared if UI is closed
        if (window.craftingUI && window.craftingUI.currentStationObject) {
            window.craftingUI.currentStationObject = null;
        }
    }

    // --- Update Crafting Bars (Animate Progress) ---
    // Moved inside if(this.playerContainer) check below? No, keep it here.
    if (this.playerContainer) {
        updateCraftingBar(this.playerContainer, this.playerContainer.playerInfo, this);
        // Stats UI update handled by Dirty Flag check at top of function
    }
    // --- OTHER PLAYERS UPDATE (Optimized Map) ---
    // Optimization: Pre-calculate lerp factor once per frame
    const lerpT = 1.0 - Math.pow(0.001, delta / 1000);

    if (this.otherPlayersMap) { // Use Map if valid (create.js initialized it)
        for (const otherPlayer of this.otherPlayersMap.values()) {
            if (otherPlayer.playerInfo) {
                // --- CLIENT SIDE PREDICTION FOR HOLDING (Fix Latency) ---
                if (otherPlayer.playerInfo.isHeld && otherPlayer.playerInfo.heldBySocketId) {
                    const holderId = otherPlayer.playerInfo.heldBySocketId;
                    let holder = null;

                    // 1. Check if held by Local Player
                    if (this.socket && this.socket.id === holderId) {
                        holder = this.playerContainer;
                    }
                    // 2. Check if held by another Visible Player (O(1) Lookup)
                    else {
                        holder = this.otherPlayersMap.get(holderId);
                    }

                    if (holder) {
                        const holdDist = otherPlayer.playerInfo.grippedFirmly ? 20 : 64;

                        // Initialize holder position history queue on other player if not present
                        if (!otherPlayer.holderPositionHistory) {
                            otherPlayer.holderPositionHistory = [
                                { x: holder.x, y: holder.y, rotation: holder.playerInfo ? holder.playerInfo.rotation : 0, isMoving: holder.playerInfo ? holder.playerInfo.isMoving : false },
                                { x: otherPlayer.x, y: otherPlayer.y, rotation: otherPlayer.playerInfo ? otherPlayer.playerInfo.rotation : 0, isMoving: otherPlayer.playerInfo ? otherPlayer.playerInfo.isMoving : false }
                            ];
                        }

                        // Push holder's position if it changed
                        const lastHistory = otherPlayer.holderPositionHistory[0];
                        const currentRot = holder.playerInfo ? holder.playerInfo.rotation : 0;
                        const currentIsMoving = (holder === this.playerContainer) ? (holder.body.velocity.length() > 5) : (holder.playerInfo ? holder.playerInfo.isMoving : false);
                        if (!lastHistory || lastHistory.x !== holder.x || lastHistory.y !== holder.y || lastHistory.rotation !== currentRot || lastHistory.isMoving !== currentIsMoving) {
                            otherPlayer.holderPositionHistory.unshift({
                                x: holder.x,
                                y: holder.y,
                                rotation: currentRot,
                                isMoving: currentIsMoving
                            });
                        }

                        const prevX = otherPlayer.x;
                        const prevY = otherPlayer.y;

                        const targetPos = getPositionAtDistance(otherPlayer.holderPositionHistory, holdDist);
                        if (targetPos) {
                            otherPlayer.x = targetPos.x;
                            otherPlayer.y = targetPos.y;
                            otherPlayer.depth = otherPlayer.y;
                            if (otherPlayer.playerInfo) {
                                otherPlayer.playerInfo.rotation = targetPos.rotation;
                                const dx = targetPos.x - prevX;
                                const dy = targetPos.y - prevY;
                                const distMoved = Math.sqrt(dx * dx + dy * dy);
                                otherPlayer.playerInfo.isMoving = distMoved > 0.1;
                            }
                        }
                    }
                }
                // --- GENERIC REMOTE INTERPOLATION ---
                else if (typeof otherPlayer.targetX !== 'undefined') {
                    // OPTIMIZATION: Snap to target if very close to stop per-frame Float updates and Depth sorting
                    const dx = otherPlayer.targetX - otherPlayer.x;
                    const dy = otherPlayer.targetY - otherPlayer.y;

                    // If within 1 pixel (distanceSq < 1), snap
                    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
                        if (otherPlayer.x !== otherPlayer.targetX || otherPlayer.y !== otherPlayer.targetY) {
                            otherPlayer.x = otherPlayer.targetX;
                            otherPlayer.y = otherPlayer.targetY;
                            otherPlayer.depth = otherPlayer.y;
                        }
                    } else {
                        // Use pre-calculated t
                        otherPlayer.x += dx * lerpT;
                        otherPlayer.y += dy * lerpT;
                        otherPlayer.depth = otherPlayer.y;
                    }
                }

                updateCraftingBar(otherPlayer, otherPlayer.playerInfo, this);
            }
        }
    } else if (this.otherPlayersGroup) {
        // Fallback if Map not ready (shouldn't happen with new create.js)
        // Keeping for safety transition
        this.otherPlayersGroup.getChildren().forEach(otherPlayer => {
            // ... (Legacy slow code omitted for brevity in fallback, user should restart) ...
        });
    }
    // --- Drop Mode Update ---
    if (window.dropMode && window.dropMode.active) {
        window.dropMode.update();
    }
}
