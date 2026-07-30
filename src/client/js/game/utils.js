/**
 * @fileoverview Game Client Utility Module (utils.js)
 * 
 * @description
 * Provides essential browser DOM measurement routines, collision debug logging,
 * and framerate reporting helpers for the Phaser 3 game client.
 * 
 * Triggered by: Phaser Scene initialization, camera configuration, and debug overlays.
 */

// OPTIMIZATION: Module-scoped cached DOM node reference to avoid expensive document searches per query
let phaserAppElem = null;

/**
 * Calculates current viewport dimensions of the #phaserApp container.
 * 
 * @returns {{ x: number, y: number }} Object containing viewport width (x) and height (y).
 */
export function windowSize() {
    // OPTIMIZATION: Re-verify DOM element if not cached or if element was detached from document body
    if (!phaserAppElem || !document.body.contains(phaserAppElem)) {
        phaserAppElem = document.getElementById('phaserApp');
    }

    // RATIONALE: Fall back to window inner dimensions if #phaserApp is not yet mounted during early startup
    if (!phaserAppElem) {
        return {
            x: window.innerWidth || 800,
            y: window.innerHeight || 600
        };
    }

    return {
        x: phaserAppElem.clientWidth || 800,
        y: phaserAppElem.clientHeight || 600
    };
}

/**
 * Logs tilemap collision debug data in development or debug mode.
 * 
 * @param {Array} [collidingTiles=[]] - List of tile objects triggering collisions.
 * @param {Array} [serverBlockedTiles=[]] - List of server-side blocked tile coordinates.
 * @returns {Array} List of colliding tiles.
 */
export function drawDebug(collidingTiles = [], serverBlockedTiles = []) {
    // RATIONALE: Guard console output behind environment checks to eliminate log spam and UI thread blocking in production
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
    if (isDev || window.DEBUG_MODE) {
        console.debug('[Tilemap Debug] Colliding tiles:', collidingTiles);
    }
    return collidingTiles || [];
}

/**
 * Retrieves the current actual frames per second (FPS) from the Phaser game instance.
 * 
 * @param {Object} game - Phaser Game instance or Phaser Scene instance.
 * @returns {number} Rounded frame rate in FPS (or 0 if unavailable).
 */
export function getFrameRate(game) {
    // RATIONALE: Safely navigate game loop property whether passed a Phaser Game or Phaser Scene object
    const loop = game?.loop || game?.game?.loop;
    if (!loop || typeof loop.actualFps !== 'number') {
        return 0;
    }
    return Math.round(loop.actualFps);
}


