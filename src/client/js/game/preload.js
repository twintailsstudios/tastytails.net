import { assets } from './assetsList.js';

export function preload() {
    console.log(`[Preload] Started. Map: ${window.mapFilename || 'Default'}`);

    // --- DOM LOADING SCREEN ---
    const loadingMessages = [
        "Waking the Innkeeper...",
        "Polishing Tankards...",
        "Herding Cats...",
        "Sharpening Claws...",
        "Rolling Dice...",
        "Checking Inventory...",
        "Opening the Tavern..."
    ];

    // --- LOADING EVENTS ---
    this.load.on('loaderror', (file) => {
        console.error(`[Preload] ERROR loading file: ${file.key} from ${file.url}`);
    });

    this.load.on('filecomplete-tilemapJSON-dynamic_map', (key, type, data) => {
        console.log(`[Preload] SUCCESS: Map 'dynamic_map' loaded! Data keys:`, Object.keys(data));
    });

    this.load.on('progress', function (value) {
        const barFill = document.getElementById('loading-bar-fill');
        const percentText = document.getElementById('loading-percent');
        const statusText = document.getElementById('loading-text');

        // Scale to 50% (Asset Loading Phase)
        const scaledValue = value * 0.5;
        const percent = Math.floor(scaledValue * 100);

        if (barFill) barFill.style.width = `${percent}%`;
        if (percentText) percentText.innerText = `${percent}%`;

        // Cycle messages
        if (statusText) {
            const msgIndex = Math.floor(value * 5) % loadingMessages.length;
            statusText.innerText = loadingMessages[msgIndex];
        }
    });

    this.load.on('complete', function () {
        console.log('[Preload] Asset loading complete (50%).');

        const barFill = document.getElementById('loading-bar-fill');
        const percentText = document.getElementById('loading-percent');
        const statusText = document.getElementById('loading-text');

        if (barFill) barFill.style.width = '50%';
        if (percentText) percentText.innerText = '50%';
        if (statusText) statusText.innerText = "Initializing Engine...";
    });

    // --- ASSET LOADER ---
    this.spritesToAnimate = [];
    this.emoteKeys = [];

    // 1. Tilesets (Static)
    assets.tilesets.forEach(ts => {
        this.load.image(ts.key, ts.path);
    });

    // 2. Images
    assets.images.forEach(img => {
        this.load.image(img.key, img.path);
    });

    // 3. Spritesheets
    assets.spritesheets.forEach(sheet => {
        this.load.spritesheet(sheet.key, sheet.path, {
            frameWidth: sheet.frameWidth || 215,
            frameHeight: sheet.frameHeight || 198
        });

        if (sheet.animate) {
            this.spritesToAnimate.push(sheet.key);
        }
    });

    // 4. Emotes
    assets.emotes.forEach(emote => {
        this.load.spritesheet(emote, `/assets/emotes/${emote}.png`, { frameWidth: 39, frameHeight: 43 });
        this.emoteKeys.push(emote);
    });

    // 5. Dynamic Map
    if (window.mapFilename) {
        console.log(`[Preload] Loading dynamic map: ${window.mapFilename}`);
        this.load.tilemapTiledJSON('dynamic_map', `/assets/tilemaps/${window.mapFilename}`);
    } else {
        console.warn('No map filename found in window.mapFilename, falling back to Demo_Map.json');
        this.load.tilemapTiledJSON('dynamic_map', '/assets/tilemaps/Demo_Map.json');
    }
}
