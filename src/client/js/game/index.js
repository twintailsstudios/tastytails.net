import { config } from './config.js';
import { preload } from './preload.js';
import { create } from './create.js';
import { update } from './update.js';
import './dropMode.js';
import { TutorialManager } from './tutorial.js';

function launchGame() {
    TutorialManager.init();

    const container = document.getElementById('phaserApp');
    const width = Math.max(container && container.clientWidth > 0 ? container.clientWidth : (window.innerWidth || 800), 200);
    const height = Math.max(container && container.clientHeight > 0 ? container.clientHeight : (window.innerHeight || 600), 200);

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
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(launchGame, 20);
} else {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(launchGame, 20);
    });
}
