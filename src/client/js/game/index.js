import { config } from './config.js';
import { preload } from './preload.js';
import { create } from './create.js';
import { update } from './update.js';
import './dropMode.js';

const container = document.getElementById('phaserApp');
const width = container ? container.clientWidth : window.innerWidth;
const height = container ? container.clientHeight : window.innerHeight;

const gameConfig = {
    ...config,
    width: width,
    height: height,
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

window.game = new Phaser.Game(gameConfig);
