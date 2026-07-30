/**
 * @fileoverview Client-Side Movement Prediction & Server State Reconciliation
 * 
 * @description
 * Handles deterministic client-side prediction, sequence-based input acknowledgment,
 * collision parity checking, smooth lerp interpolation, and visual animation sync
 * for the local player sprite in TastyTails.net.
 * 
 * Triggered by: `socket.on('playerUpdates')` in create.js on incoming server snapshot broadcasts.
 */

import { updatePlayerAnimations } from './animations.js';
import { updateStruggleBar } from './player.js';

/**
 * Reconciles local player position with authoritative server state snapshot.
 * Re-simulates unacknowledged local inputs starting from server target coordinates.
 * 
 * @param {Object} serverPlayerState - Authoritative player state snapshot sent by server.
 * @param {Phaser.Scene} self - Active Phaser game scene instance.
 * @returns {void}
 */
export function reconcile(serverPlayerState, self) {
    const localPlayer = self.playerContainer;
    // Defensive check: Ensure local player container, body, and server position payload exist
    if (!localPlayer || !localPlayer.body || !serverPlayerState || !serverPlayerState.position) {
        return;
    }

    const serverPos = serverPlayerState.position;
    // OPTIMIZATION: Extract primitive scalars to eliminate temporary {x, y} object allocations in hot loop
    const clientX = localPlayer.x;
    const clientY = localPlayer.y;
    const distance = Phaser.Math.Distance.Between(clientX, clientY, serverPos.x, serverPos.y);

    // --- SERVER RECONCILIATION WITH CLIENT-SIDE PREDICTION ---

    // 1. Remove acknowledged inputs in-place to avoid array allocation
    // OPTIMIZATION: In-place array pruning prevents GC pauses on 20Hz network update ticks
    if (serverPlayerState.lastProcessedInputSequence && Array.isArray(localPlayer.pendingInputs)) {
        const ackSeq = serverPlayerState.lastProcessedInputSequence;
        const inputs = localPlayer.pendingInputs;
        let writeIdx = 0;
        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].sequence > ackSeq) {
                inputs[writeIdx++] = inputs[i];
            }
        }
        inputs.length = writeIdx;
    }


    // Safeguard: Prevent runaway queue growth under severe packet loss (> 3s latency)
    const MAX_PENDING_INPUTS = 60;
    if (Array.isArray(localPlayer.pendingInputs) && localPlayer.pendingInputs.length > MAX_PENDING_INPUTS) {
        localPlayer.pendingInputs.length = 0;
        localPlayer.setPosition(serverPos.x, serverPos.y);
        if (localPlayer.body) {
            localPlayer.body.updateFromGameObject();
            localPlayer.body.prev.copy(localPlayer.body.position);
        }
        return;
    }

    // 2. Calculate Predicted Position
    // Start with the authoritative position from the server
    let predictedX = serverPos.x;
    let predictedY = serverPos.y;
    const speed = serverPlayerState.speed || 100; // Match server speed or default fallback

    // Re-apply all pending (unacknowledged) inputs
    if (Array.isArray(localPlayer.pendingInputs)) {
        for (let i = 0; i < localPlayer.pendingInputs.length; i++) {
            const inputData = localPlayer.pendingInputs[i];
            if (!inputData || !inputData.input) continue;
            const { input, delta } = inputData;

            let proposedX = predictedX;
            if (input.left) proposedX -= speed * delta;
            if (input.right) proposedX += speed * delta;

            // Check X Collision
            if (serverPlayerState.isDead || !checkPredictionCollision(self, proposedX, predictedY)) {
                predictedX = proposedX;
            }

            let proposedY = predictedY;
            if (input.up) proposedY -= speed * delta;
            if (input.down) proposedY += speed * delta;

            // Check Y Collision
            if (serverPlayerState.isDead || !checkPredictionCollision(self, predictedX, proposedY)) {
                predictedY = proposedY;
            }
        }
    }

    // 3. Compare Predicted vs Current
    const dist = Phaser.Math.Distance.Between(clientX, clientY, predictedX, predictedY);

    if (serverPlayerState.lastClientTimestamp) {
        const rtt = Date.now() - serverPlayerState.lastClientTimestamp;
        if (window.updateDebugStats) {
            window.updateDebugStats(rtt, dist);
        }
    }

    // Bypass reconciliation position snapping if held (attached to holder in update.js)
    const shouldReconcilePosition = !serverPlayerState.isHeld;

    if (shouldReconcilePosition) {
        self.playerContainer.holderPositionHistory = null;
    }

    if (shouldReconcilePosition && dist > 5.0) {
        const lerpFactor = 0.3;
        const newX = localPlayer.x + (predictedX - localPlayer.x) * lerpFactor;
        const newY = localPlayer.y + (predictedY - localPlayer.y) * lerpFactor;

        localPlayer.setPosition(newX, newY);

        // Update physics body to match
        const body = localPlayer.body;
        body.updateFromGameObject();
        body.prev.copy(body.position);

        if (self.localPlayerState?.position) {
            self.localPlayerState.position.x = newX;
            self.localPlayerState.position.y = newY;
        }
    }

    // Update local player animation state
    let isMoving = false;
    let rotation = serverPlayerState.rotation; // Default to server rotation

    if (self.cursors && !serverPlayerState.isCrafting && !window.chatFocused) {
        const left = self.cursors.left.isDown || (self.wasdKeys && self.wasdKeys.left.isDown);
        const right = self.cursors.right.isDown || (self.wasdKeys && self.wasdKeys.right.isDown);
        const up = self.cursors.up.isDown || (self.wasdKeys && self.wasdKeys.up.isDown);
        const down = self.cursors.down.isDown || (self.wasdKeys && self.wasdKeys.down.isDown);

        isMoving = left || right || up || down;

        if (left) rotation = 1;
        else if (right) rotation = 2;
        else if (up) rotation = 3;
        else if (down) rotation = 4;

        if (!isMoving && self.smartWalkTarget) {
            isMoving = true;
            const targetX = self.smartWalkTarget.target ? self.smartWalkTarget.target.x : self.smartWalkTarget.x;
            const targetY = self.smartWalkTarget.target ? self.smartWalkTarget.target.y : self.smartWalkTarget.y;
            const dx = targetX - localPlayer.x;
            const dy = targetY - localPlayer.y;

            if (Math.abs(dx) > Math.abs(dy)) {
                rotation = dx < 0 ? 1 : 2; // Left / Right
            } else {
                rotation = dy < 0 ? 3 : 4; // Up / Down
            }
        }
    }

    // If held, use server's state for animation (walking behind holder)
    if (serverPlayerState.isHeld) {
        isMoving = serverPlayerState.isMoving;
        rotation = serverPlayerState.rotation;
    }

    const localAnimState = {
        ...serverPlayerState,
        isMoving: isMoving,
        rotation: rotation
    };

    updatePlayerAnimations(localPlayer, localAnimState);
    updateStruggleBar(localPlayer, serverPlayerState, self);
}

/**
 * Checks for collisions at a predicted target position (x, y).
 * Mirrors server-side logic from server-loop.js checkCollision().
 * 
 * @param {Phaser.Scene} scene - Active Phaser scene context with mapLayers and objectGroup.
 * @param {number} x - Proposed target X coordinate.
 * @param {number} y - Proposed target Y coordinate.
 * @returns {boolean} True if proposed coordinate collides with tile or object; false if clear.
 */
function checkPredictionCollision(scene, x, y) {
    // Player Dimensions (Hardcoded to match server/player.js)
    const width = 60;
    const height = 30;

    // --- COORDINATE ALIGNMENT ---
    const serverOffsetX = 30;
    const margin = 0;

    // Calculate Proposed Bounding Box
    const left = (x + serverOffsetX) - (width / 2) - margin;
    const right = (x + serverOffsetX) + (width / 2) + margin;
    const top = y - (height / 2) - margin;
    const bottom = y + (height / 2) + margin;

    // 1. Check Tile Collision
    if (scene.mapLayers) {
        const tileXStart = scene.map.worldToTileX(left);
        const tileXEnd = scene.map.worldToTileX(right);
        const tileYStart = scene.map.worldToTileY(top);
        const tileYEnd = scene.map.worldToTileY(bottom);

        for (const layer of scene.mapLayers) {
            if (!layer) continue;

            // Match Server Logic: Skip 'zones' layer (lazy-evaluated boolean flag)
            if (layer.isZoneLayer === undefined) {
                const layerName = layer.layer?.name || '';
                layer.isZoneLayer = layerName.toLowerCase().includes('zones');
            }
            if (layer.isZoneLayer) continue;

            for (let ty = tileYStart; ty <= tileYEnd; ty++) {
                for (let tx = tileXStart; tx <= tileXEnd; tx++) {
                    const tile = layer.getTileAt(tx, ty);
                    if (tile && tile.properties && (tile.properties.blocked === true || tile.properties.blocked === 'true' || tile.properties.Blocked === 'True')) {
                        return true;
                    }
                }
            }
        }
    }

    // 2. Check Object Collision
    if (scene.objectGroup) {
        const objects = scene.objectGroup.getChildren();

        for (const obj of objects) {
            if (!obj.active || !obj.body) continue;

            const objBody = obj.body;

            // Proximity guard: Skip objects further than maximum radius
            const maxRadius = Math.max(objBody.width || 60, objBody.height || 60) + 100;
            if (Math.abs(objBody.x - x) > maxRadius || Math.abs(objBody.y - y) > maxRadius) {
                continue;
            }

            // AABB Overlap Check
            if (left < objBody.right &&
                right > objBody.x &&
                top < objBody.bottom &&
                bottom > objBody.y) {
                return true;
            }
        }
    }

    return false;
}

