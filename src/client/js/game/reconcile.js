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

    // Increased threshold to 6.0 to tolerate server stopping slightly before wall (discrete steps)
    // while client slides to wall (continuous physics).
    if (distance > 6.0) {
        // This log will only appear if a correction is actually being made.
        // console.log(`%c[RECONCILE] Correction needed! Resetting body to server position.`, 'color: orange; font-weight: bold;');

        // 1. Forcefully stop all physics movement.
        // This is the key step. .stop() clears all velocity, acceleration, and applied forces.
        // This prevents the physics engine from trying to continue a previous movement
        // after we teleport the player.
        self.playerContainer.body.stop();


        // 2. Directly set the visual Container's position.
        self.playerContainer.setPosition(serverPos.x, serverPos.y);

        // 3. Immediately teleport the physics Body to match the Container's new position.
        // This stops any residual physics forces from interfering and ensures both are in sync.
        // Using .reset() is the correct way to do this.
        const body = self.playerContainer.body;
        body.position.set(
            serverPos.x - body.offset.x,
            serverPos.y - body.offset.y
        );
        body.prev.copy(body.position);
        body.velocity.set(0);

        if (self.localPlayerState?.position) {
            self.localPlayerState.position.x = serverPos.x;
            self.localPlayerState.position.y = serverPos.y;
        }
        const localPlayerInfo = window.localPlayerInfo;
        if (typeof localPlayerInfo?.position === 'object') {
            localPlayerInfo.position.x = serverPos.x;
            localPlayerInfo.position.y = serverPos.y;
        }

        // This log tells us the position immediately after the correction.
        // console.log(`[RECONCILE] Position after reset: (${self.playerContainer.x.toFixed(2)}, ${self.playerContainer.y.toFixed(2)})`);
        // console.log(`[RECONCILE] Body position after reset: (${self.playerContainer.body.x.toFixed(2)}, ${self.playerContainer.body.y.toFixed(2)})`);
        // console.log(`[RECONCILE] Velocity after reset: (${self.playerContainer.body.velocity.x.toFixed(2)}, ${self.playerContainer.body.velocity.y.toFixed(2)})`);
    }

    // Update local player animations based on server's state
    updatePlayerAnimations(localPlayer, serverPlayerState);
    updateStruggleBar(localPlayer, serverPlayerState, self);
}
