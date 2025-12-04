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
    const speed = 200; // Must match server speed

    // Re-apply all pending (unacknowledged) inputs
    localPlayer.pendingInputs.forEach(inputData => {
        const { input, delta } = inputData;
        if (input.left) predictedX -= speed * delta;
        if (input.right) predictedX += speed * delta;
        if (input.up) predictedY -= speed * delta;
        if (input.down) predictedY += speed * delta;
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

    // Threshold can be small (e.g. 10px) to allow for minor floating point differences
    // Threshold can be small (e.g. 10px) to allow for minor floating point differences
    if (dist > 10.0) {
        // console.log(`[RECONCILE] Divergence detected (${dist.toFixed(2)}px). Interpolating to predicted.`);

        // Interpolate to the PREDICTED position
        // This keeps us in the "future" relative to the server, maintaining responsiveness.
        const lerpFactor = 0.1;
        const newX = self.playerContainer.x + (predictedX - self.playerContainer.x) * lerpFactor;
        const newY = self.playerContainer.y + (predictedY - self.playerContainer.y) * lerpFactor;

        self.playerContainer.setPosition(newX, newY);

        // Update physics body to match
        const body = self.playerContainer.body;
        body.position.set(
            newX - body.offset.x,
            newY - body.offset.y
        );
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

    if (self.cursors) {
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

    const localAnimState = {
        ...serverPlayerState, // Inherit visuals
        isMoving: isMoving,
        rotation: rotation
    };

    updatePlayerAnimations(localPlayer, localAnimState);
    updateStruggleBar(localPlayer, serverPlayerState, self);
}
