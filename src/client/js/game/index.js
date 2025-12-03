import { config } from './config.js';
import { preload } from './preload.js';
import { create } from './create.js';
import { update } from './update.js';

const gameConfig = {
    ...config,
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

window.game = new Phaser.Game(gameConfig);
