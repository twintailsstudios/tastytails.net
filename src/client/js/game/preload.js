/**
 * @fileoverview Client Phaser 3 Asset Preloader & DOM Overlay Synchronizer (preload.js)
 * 
 * @description
 * Manages the primary asset loading phase (Phase 1: 0% - 50%) for the game scene.
 * Consumes asset definitions from assetsList.js, streams textures, tilesets, spritesheets,
 * and tilemaps into Phaser's Loader Plugin, and synchronizes the HTML DOM loading overlay.
 * 
 * Triggered by: Phaser 3 Scene Manager during scene initialization (registered in index.js).
 */

import { assets } from './assetsList.js';

// --- MODULE CONSTANTS ---
/**
 * Flavor text messages displayed to the player during asset streaming.
 * Hoisted to module scope to prevent re-allocation during scene re-initialization.
 */
const LOADING_MESSAGES = [
    "Waking the Innkeeper...",
    "Polishing Tankards...",
    "Herding Cats...",
    "Sharpening Claws...",
    "Rolling Dice...",
    "Checking Inventory...",
    "Opening the Tavern..."
];

/**
 * List of cache keys required for baseline scene creation.
 * Failures loading critical assets will halt scene execution to prevent unhandled crashes in create.js/map.js.
 */
const CRITICAL_ASSET_KEYS = ['dynamic_map'];

/**
 * Phaser Scene Preload Hook.
 * Executes within the context (`this`) of the active Phaser.Scene instance.
 */
export function preload() {
    console.log(`[Preload] Started. Map: ${window.mapFilename || 'Default'}`);

    // --- LAZY DOM CACHE ---
    let cachedBarFill = null;
    let cachedPercentText = null;
    let cachedStatusText = null;

    /**
     * Updates the DOM loading overlay elements.
     * OPTIMIZATION: Lazily caches DOM references on demand to eliminate repeated document.getElementById traversals.
     * 
     * @param {number} scaledPercent - Scaled progress percentage (0 - 50)
     * @param {string} [message] - Optional status message to present to the user
     */
    const updateLoadingUI = (scaledPercent, message) => {
        if (!cachedBarFill) cachedBarFill = document.getElementById('loading-bar-fill');
        if (!cachedPercentText) cachedPercentText = document.getElementById('loading-percent');
        if (!cachedStatusText) cachedStatusText = document.getElementById('loading-text');

        if (cachedBarFill) cachedBarFill.style.width = `${scaledPercent}%`;
        if (cachedPercentText) cachedPercentText.innerText = `${scaledPercent}%`;
        if (cachedStatusText && message) cachedStatusText.innerText = message;
    };

    // --- LOADING ERROR & PROGRESS TRACKING ---
    const failedAssets = { critical: [], nonCritical: [] };

    // SAFEGUARD: Track failed assets to isolate non-critical asset errors from breaking world map load
    this.load.on('loaderror', (file) => {
        console.error(`[Preload] ERROR loading file: ${file.key} from ${file.url}`);
        if (CRITICAL_ASSET_KEYS.includes(file.key)) {
            failedAssets.critical.push(file.key);
        } else {
            failedAssets.nonCritical.push(file.key);
        }
    });

    this.load.on('filecomplete-tilemapJSON-dynamic_map', (key, type, data) => {
        console.log(`[Preload] SUCCESS: Map 'dynamic_map' loaded! Data keys:`, Object.keys(data));
    });

    this.load.on('progress', function (value) {
        // OPTIMIZATION: Scale progress value to 50% (Asset Loading Phase 1)
        const scaledValue = value * 0.5;
        const percent = Math.floor(scaledValue * 100);
        const msgIndex = Math.floor(value * 5) % LOADING_MESSAGES.length;

        updateLoadingUI(percent, LOADING_MESSAGES[msgIndex]);
    });

    this.load.on('complete', function () {
        console.log('[Preload] Asset loading complete (50%).');

        // SAFEGUARD: Halt scene creation if critical world map assets failed to load
        if (failedAssets.critical.length > 0) {
            console.error('[Preload] CRITICAL ASSETS FAILED:', failedAssets.critical);
            updateLoadingUI(50, `Error: Failed to load critical world map (${failedAssets.critical.join(', ')}). Please refresh.`);
            return;
        }

        if (failedAssets.nonCritical.length > 0) {
            console.warn(`[Preload] Loaded with ${failedAssets.nonCritical.length} non-critical asset warning(s).`);
        }

        updateLoadingUI(50, "Initializing Engine...");
    });

    // --- ASSET LOADER ---
    // Scene-scoped arrays for downstream animation generation in create.js
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
        const key = typeof emote === 'string' ? emote : emote.key;
        const path = typeof emote === 'object' && emote.path ? emote.path : `/assets/emotes/${key}.png`;
        const frameWidth = (typeof emote === 'object' && emote.frameWidth) || 39;
        const frameHeight = (typeof emote === 'object' && emote.frameHeight) || 43;

        this.load.spritesheet(key, path, { frameWidth, frameHeight });
        // SAFEGUARD: Guarantee string primitive texture key push to preserve animations.js interface contract
        this.emoteKeys.push(key);
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


