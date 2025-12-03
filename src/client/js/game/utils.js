export function windowSize() {
    var windowSize = {
        x: document.getElementById('phaserApp').clientWidth,
        y: document.getElementById('phaserApp').clientHeight
    }
    console.log('windowSize = ', windowSize);
    return windowSize;
}

export function drawDebug(collidingTiles, serverBlockedTiles) {
    console.log('collidingTiles = ', collidingTiles);
    // Note: serverBlockedTiles is passed by reference or needs to be returned/assigned
    // Since we are moving to modules, we might need to handle state differently.
    // For now, let's just return the value or handle it in the main state.
    return collidingTiles || [];
}


export function getFrameRate(game) {
    // frameRate.setText('FrameRate: ' + game.loop.actualFps.toFixed(2));
}
