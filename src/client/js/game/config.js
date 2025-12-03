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
    }
};
