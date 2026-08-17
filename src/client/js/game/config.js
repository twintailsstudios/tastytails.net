export const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    parent: 'phaserApp',
    physics: {
        default: 'arcade',
        arcade: {
            debug: true
        }
    },
    pixelArt: true, // Disables antialiasing and enables crisp nearest-neighbor filtering
    render: {
        antialias: false,
        pixelArt: true,
        roundPixels: true // Snaps drawing to whole integer pixels
    },
    disableVisibilityChange: true
};
