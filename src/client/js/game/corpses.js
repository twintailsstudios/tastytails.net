/**
 * @fileoverview Client-side Corpse System (Phaser 3 Game Engine)
 * 
 * @description
 * Manages the client-side lifecycle and visual rendering of dead player/creature bodies within the Phaser 3 game world.
 * Listens for Socket.IO network events (`currentCorpses`, `corpseSpawned`, `corpseDespawned`) and dynamically constructs
 * rotated, multi-layered sprite containers representing player corpses at specific coordinates.
 * 
 * Triggered by:
 * - `CreateScene.create()` during scene initialization (`initCorpses`).
 * - Server Socket.IO broadcasts: `currentCorpses` (load batch), `corpseSpawned` (entity death), `corpseDespawned` (cleanup).
 */

import { updatePlayerEquipmentVisuals } from './player.js';

// OPTIMIZATION: Module-level color parser to avoid re-allocating function closures per corpse display
/**
 * Safely parses string hex color values or numbers to Phaser integer color tints.
 * @param {string|number|null|undefined} color - The input color payload
 * @returns {number} Numeric hex color suitable for Phaser sprite tinting (default: 0xffffff)
 */
const parseColor = (color) => {
    if (color === null || color === undefined) return 0xffffff;
    if (typeof color === 'string') {
        const parsed = Number(color);
        return isNaN(parsed) ? 0xffffff : parsed;
    }
    return color;
};

/**
 * Initializes corpse tracking data structures on the active Phaser scene and registers Socket.IO network listeners.
 * 
 * @param {Phaser.Scene} scene - The active Phaser game scene
 * @param {Socket} socket - The active Socket.IO client socket connection
 */
export function initCorpses(scene, socket) {
    console.log('[Corpses] Initializing Corpse System...');

    // OPTIMIZATION: Clean up existing named handlers on socket if re-initializing scene to prevent listener accumulation
    if (scene._currentCorpsesHandler) {
        socket.off('currentCorpses', scene._currentCorpsesHandler);
    }
    if (scene._corpseSpawnedHandler) {
        socket.off('corpseSpawned', scene._corpseSpawnedHandler);
    }
    if (scene._corpseDespawnedHandler) {
        socket.off('corpseDespawned', scene._corpseDespawnedHandler);
    }

    // Group for holding corpse containers in Phaser display list
    if (!scene.corpseGroup || scene.corpseGroup.scene !== scene) {
        scene.corpseGroup = scene.add.group();
    }
    scene.corpseMap = new Map(); // Store corpses by ID for O(1) lookup and despawn removal

    // Named Listener: Initial load of corpses batch
    scene._currentCorpsesHandler = (corpses) => {
        console.log('[Corpses] Received current corpses:', corpses);
        if (!corpses) return;
        Object.values(corpses).forEach(corpseData => {
            // SAFETY: Per-item try/catch so one corrupted corpse payload does not break initial load batching
            try {
                displayCorpse(scene, corpseData);
            } catch (err) {
                console.error('[Corpses] Error loading corpse batch item:', corpseData?.id, err);
            }
        });
    };

    // Named Listener: New corpse spawn broadcast
    scene._corpseSpawnedHandler = (corpseData) => {
        console.log('[Corpses] A corpse has spawned:', corpseData);
        try {
            displayCorpse(scene, corpseData);
        } catch (err) {
            console.error('[Corpses] Error displaying spawned corpse:', corpseData?.id, err);
        }
    };

    // Named Listener: Corpse despawning/removal broadcast
    scene._corpseDespawnedHandler = (corpseId) => {
        console.log('[Corpses] A corpse has despawned:', corpseId);
        try {
            removeCorpse(scene, corpseId);
        } catch (err) {
            console.error('[Corpses] Error removing despawned corpse:', corpseId, err);
        }
    };

    socket.on('currentCorpses', scene._currentCorpsesHandler);
    socket.on('corpseSpawned', scene._corpseSpawnedHandler);
    socket.on('corpseDespawned', scene._corpseDespawnedHandler);
}

/**
 * Safely removes and destroys a corpse container and all child sprites from the scene.
 * 
 * @param {Phaser.Scene} scene - The active Phaser game scene
 * @param {string} corpseId - Unique ID of the corpse to remove
 */
export function removeCorpse(scene, corpseId) {
    if (!scene || !scene.corpseMap) return;

    const container = scene.corpseMap.get(corpseId);
    if (container) {
        if (scene.corpseGroup) {
            scene.corpseGroup.remove(container, true, true); // Atomic removal from scene group and destruction of GameObjects
        } else {
            container.destroy(true);
        }
        scene.corpseMap.delete(corpseId);
    }
}

/**
 * Constructs and renders a multi-layered Phaser Container representing a corpse.
 * 
 * @param {Phaser.Scene} scene - The active Phaser scene
 * @param {Object} corpseData - Corpse state payload (position, cosmetics, equipment)
 */
function displayCorpse(scene, corpseData) {
    // Prevent duplicate processing or invalid data
    if (!corpseData || !corpseData.id || scene.corpseMap.has(corpseData.id)) {
        return;
    }

    // Create Container at corpse world position
    const container = scene.add.container(corpseData.x, corpseData.y);
    container.setSize(60, 163);

    // Visual tweak: Rotate to look like lying flat on ground (90 degrees / Math.PI / 2 rad)
    container.setRotation(Math.PI / 2);
    container.setAlpha(0.9);
    container.setDepth(scene.playerContainer ? scene.playerContainer.depth - 1 : 1);

    const sprites = [];

    // TAIL LAYER
    const tailObj = corpseData.tail;
    if (tailObj) {
        if (tailObj.sprite) sprites.push(scene.add.sprite(30, -81.5, tailObj.sprite).setTint(parseColor(tailObj.color)));
        if (tailObj.secondarySprite) sprites.push(scene.add.sprite(30, -81.5, tailObj.secondarySprite).setTint(parseColor(tailObj.secondaryColor)));
        if (tailObj.accentSprite) sprites.push(scene.add.sprite(30, -81.5, tailObj.accentSprite).setTint(parseColor(tailObj.accentColor)));
    }

    // BODY & LIMBS LAYER
    const bodyObj = corpseData.body;
    if (bodyObj) {
        if (bodyObj.sprite) sprites.push(scene.add.sprite(30, -81.5, bodyObj.sprite).setTint(parseColor(bodyObj.color)));
        if (bodyObj.secondarySprite) sprites.push(scene.add.sprite(30, -81.5, bodyObj.secondarySprite).setTint(parseColor(bodyObj.secondaryColor)));
        if (bodyObj.accentSprite) sprites.push(scene.add.sprite(30, -81.5, bodyObj.accentSprite).setTint(parseColor(bodyObj.accentColor)));
    }

    // Defensive fallback for legacy backend typo 'genitles'
    const genitalsObj = corpseData.genitals || corpseData.genitles;
    if (genitalsObj && genitalsObj.sprite) sprites.push(scene.add.sprite(30, -81.5, genitalsObj.sprite));

    const handsObj = corpseData.hands;
    if (handsObj && handsObj.sprite) sprites.push(scene.add.sprite(30, -81.5, handsObj.sprite).setTint(parseColor(handsObj.color)));

    const feetObj = corpseData.feet;
    if (feetObj && feetObj.sprite) sprites.push(scene.add.sprite(30, -81.5, feetObj.sprite).setTint(parseColor(feetObj.color)));

    // HEAD LAYER
    const headObj = corpseData.head;
    if (headObj) {
        if (headObj.sprite) sprites.push(scene.add.sprite(30, -81.5, headObj.sprite).setTint(parseColor(headObj.color)));
        if (headObj.secondarySprite) sprites.push(scene.add.sprite(30, -81.5, headObj.secondarySprite).setTint(parseColor(headObj.secondaryColor)));
        if (headObj.accentSprite) sprites.push(scene.add.sprite(30, -81.5, headObj.accentSprite).setTint(parseColor(headObj.accentColor)));
    }

    const beakObj = corpseData.beak;
    if (beakObj && beakObj.sprite) sprites.push(scene.add.sprite(30, -81.5, beakObj.sprite).setTint(parseColor(beakObj.color)));

    const eyesObj = corpseData.eyes;
    if (eyesObj) {
        if (eyesObj.outer) sprites.push(scene.add.sprite(30, -81.5, eyesObj.outer));
        if (eyesObj.iris) sprites.push(scene.add.sprite(30, -81.5, eyesObj.iris).setTint(parseColor(eyesObj.color)));
    }

    const hairObj = corpseData.hair;
    if (hairObj && hairObj.sprite) sprites.push(scene.add.sprite(30, -81.5, hairObj.sprite).setTint(parseColor(hairObj.color)));

    const earObj = corpseData.ear;
    if (earObj) {
        if (earObj.outerSprite) sprites.push(scene.add.sprite(30, -81.5, earObj.outerSprite).setTint(parseColor(earObj.outerColor)));
        if (earObj.innerSprite) sprites.push(scene.add.sprite(30, -81.5, earObj.innerSprite).setTint(parseColor(earObj.innerColor)));
    }

    const accObj = corpseData.headAccessories;
    if (accObj && accObj.sprite) sprites.push(scene.add.sprite(30, -81.5, accObj.sprite).setTint(parseColor(accObj.color)));

    // Add all compiled sprites to container batch
    container.add(sprites);

    // Apply Equipment Visual Overlays (Reuses player equipment renderer)
    if (corpseData.equipment) {
        updatePlayerEquipmentVisuals(container, corpseData.equipment);
    }

    // Register with scene group and corpse lookup map
    scene.corpseGroup.add(container);
    scene.corpseMap.set(corpseData.id, container);
}


