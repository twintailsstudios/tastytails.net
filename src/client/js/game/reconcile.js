import { updatePlayerAnimations } from './animations.js';
import { updateStruggleBar } from './player.js';

export function reconcile(serverPlayerState, self) {
    const localPlayer = self.playerContainer;
    // Add a guard to make sure the player and its physics body exist
    if (!localPlayer || !localPlayer.body) {
        // console.log("Reconcile called but local player or its body isn't ready yet.");
        return;
    }

    const serverPos = serverPlayerState.position;
    const clientPos = { x: self.playerContainer.x, y: self.playerContainer.y };
    const distance = Phaser.Math.Distance.Between(clientPos.x, clientPos.y, serverPos.x, serverPos.y);



    // --- DIAGNOSTIC LOGGING ---
    // We'll log the positions from both the server and the client to compare them.
    // console.log(`[RECONCILE] Server wants us at: (${serverPos.x.toFixed(2)}, ${serverPos.y.toFixed(2)})`);
    // console.log(`[RECONCILE] Client is currently at: (${clientPos.x.toFixed(2)}, ${clientPos.y.toFixed(2)})`);
    // console.log(`[RECONCILE] Distance between them: ${distance.toFixed(2)}`);

    // --- SERVER RECONCILIATION WITH CLIENT-SIDE PREDICTION ---

    // 1. Remove acknowledged inputs
    if (serverPlayerState.lastProcessedInputSequence) {
        localPlayer.pendingInputs = localPlayer.pendingInputs.filter(input => {
            return input.sequence > serverPlayerState.lastProcessedInputSequence;
        });
    }

    // 2. Calculate Predicted Position
    // Start with the authoritative position from the server
    let predictedX = serverPos.x;
    let predictedY = serverPos.y;
    const speed = 100; // Must match server speed

    // Re-apply all pending (unacknowledged) inputs
    // Re-apply all pending (unacknowledged) inputs
    localPlayer.pendingInputs.forEach(inputData => {
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
    });

    // 3. Compare Predicted vs Current
    const dist = Phaser.Math.Distance.Between(clientPos.x, clientPos.y, predictedX, predictedY);

    // --- DIAGNOSTICS ---
    // console.log('Reconcile State:', { 
    //     ts: serverPlayerState.lastClientTimestamp, 
    //     hasUpdateFunc: !!window.updateDebugStats 
    // });

    if (serverPlayerState.lastClientTimestamp) {
        const rtt = Date.now() - serverPlayerState.lastClientTimestamp;
        if (window.updateDebugStats) {
            window.updateDebugStats(rtt, dist);
        }
    }

    // Threshold can be small (e.g. 2px) to allow for minor floating point differences
    // --- BYPASS RECONCILIATION IF HELD (Target-Side Attachment) ---
    // If we are held, we are manually attaching to the holder in update.js
    // We do NOT want the server to snap us back, as that causes "bungee" lag.
    // However, we MUST allow animation updates to proceed below.
    const shouldReconcilePosition = !serverPlayerState.isHeld;

    if (shouldReconcilePosition && dist > 5.0) {
        // console.log(`[RECONCILE] Divergence detected (${dist.toFixed(2)}px). Interpolating to predicted.`);

        // Interpolate to the PREDICTED position
        // Increased lerpFactor from 0.1 to 0.5 for snappier response (less sliding/acceleration feel)
        const lerpFactor = 0.3;
        const newX = self.playerContainer.x + (predictedX - self.playerContainer.x) * lerpFactor;
        const newY = self.playerContainer.y + (predictedY - self.playerContainer.y) * lerpFactor;

        self.playerContainer.setPosition(newX, newY);

        // Update physics body to match
        const body = self.playerContainer.body;
        body.updateFromGameObject();
        body.prev.copy(body.position);

        // We do NOT reset velocity here, as we want to keep momentum while correcting
        // body.velocity.set(0); 

        if (self.localPlayerState?.position) {
            self.localPlayerState.position.x = newX;
            self.localPlayerState.position.y = newY;
        }
    }

    // Update local player animations based on server's state (or keep local?)
    // Usually for local player, we want to trust local input for animation state to feel responsive.
    // But if we are snapping, we might want to use server state. 
    // For now, let's keep using server state for animations to ensure other players see correct things,
    // but strictly speaking, local inputs should drive local animations.
    // Update local player animations based on local input
    // We use the current cursor keys to determine animation state.
    // This prevents stuttering when pendingInputs is empty (fully reconciled).
    let isMoving = false;
    let rotation = serverPlayerState.rotation; // Default to server rotation

    if (self.cursors && !serverPlayerState.isCrafting && !window.chatFocused) {
        const left = self.cursors.left.isDown;
        const right = self.cursors.right.isDown;
        const up = self.cursors.up.isDown;
        const down = self.cursors.down.isDown;

        isMoving = left || right || up || down;

        if (left) rotation = 1;
        else if (right) rotation = 2;
        else if (up) rotation = 3;
        else if (down) rotation = 4;
    }

    // If held, we MUST use the server's state for animation (walking behind holder)
    // because local input is likely zero or irrelevant.
    if (serverPlayerState.isHeld) {
        isMoving = serverPlayerState.isMoving;
        rotation = serverPlayerState.rotation;
    }

    const localAnimState = {
        ...serverPlayerState, // Inherit visuals
        isMoving: isMoving,
        rotation: rotation
    };

    updatePlayerAnimations(localPlayer, localAnimState);
    updateStruggleBar(localPlayer, serverPlayerState, self);
}

/**
 * Checks for collisions at a predicted position (x, y).
 * Mirrors server-side logic from server-loop.js checkCollision().
 */
function checkPredictionCollision(scene, x, y) {
    // Player Dimensions (Hardcoded to match server/player.js)
    const width = 60;
    const height = 30;

    // --- COORDINATE ALIGNMENT ---
    // Server logic (server-loop.js:438): left = x + 30 - width/2
    // The server offsets the collision box by +30px relative to the player's center 'x'.
    const serverOffsetX = 30;

    // --- SAFETY MARGIN ("Fat Prediction") ---
    // Expand the collision box by 2px to ensure we stop before the server does.
    const margin = 0;

    // Calculate Proposed Bounding Box
    const left = (x + serverOffsetX) - (width / 2) - margin;
    const right = (x + serverOffsetX) + (width / 2) + margin;
    const top = y - (height / 2) - margin;
    const bottom = y + (height / 2) + margin;

    // 1. Check Tile Collision
    if (scene.mapLayers) {
        // Optimization: Unroll checks to avoid array allocation
        const tileXStart = scene.map.worldToTileX(left);
        const tileXEnd = scene.map.worldToTileX(right);
        const tileYStart = scene.map.worldToTileY(top);
        const tileYEnd = scene.map.worldToTileY(bottom);

        for (const layer of scene.mapLayers) {
            if (!layer) continue;

            // Match Server Logic: Skip 'zones' layer
            if (layer.layer.name.toLowerCase().includes('zones')) continue;

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

        // Optimize: Use Spatial Hash if available, or simple AABB scan for now (client object count is usually low < 100 visible)
        // For accurate parity, we check basic AABB.

        for (const obj of objects) {
            // Check if object is active and static (has body)
            if (!obj.active || !obj.body) continue;

            const objBody = obj.body;

            // Interaction Check (Items): 
            // In server-loop, items are skipped unless 'isSolid'. 
            // In map.js, items might not have bodies or set to sensor?
            // Assuming objectGroup contains solid obstacles.

            // AABB Overlap
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
