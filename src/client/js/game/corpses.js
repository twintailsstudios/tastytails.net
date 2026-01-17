import { updatePlayerEquipmentVisuals } from './player.js';

export function initCorpses(scene, socket) {
    console.log('[Corpses] Initializing Corpse System...');

    // Group for holding corpse containers
    scene.corpseGroup = scene.add.group();
    scene.corpseMap = new Map(); // Store corpses by ID for easy lookup/removal

    // Listener: Initial load of corpses
    socket.on('currentCorpses', (corpses) => {
        console.log('[Corpses] Received current corpses:', corpses);
        Object.values(corpses).forEach(corpseData => {
            displayCorpse(scene, corpseData);
        });
    });

    // Listener: New corpse spawn
    socket.on('corpseSpawned', (corpseData) => {
        console.log('[Corpses] A corpse has spawned:', corpseData);
        displayCorpse(scene, corpseData);
    });
}

function displayCorpse(scene, corpseData) {
    // Prevent duplicate processing
    if (scene.corpseMap.has(corpseData.id)) {
        return;
    }

    // Create Container
    const container = scene.add.container(corpseData.x, corpseData.y);
    container.setSize(60, 163);

    // Visual tweak: Rotate to look like lying on ground (90 degrees)
    // Adjust y slightly to center the "lying" body
    container.setRotation(Math.PI / 2);
    container.setAlpha(0.9); // Slightly transparent/darker? Or just normal.
    container.setDepth(scene.playerContainer ? scene.playerContainer.depth - 1 : 1); // Below living players

    // Helper for color parsing
    const parseColor = (color) => {
        if (typeof color === 'string') return Number(color);
        return color;
    };

    // Render Parts (Copied/Adapted from player.js displayOtherPlayers)
    // Note: We use the same offset logic (30, -81.5) inside the container

    const parts = [
        { key: 'tail', layer: 'back' },
        { key: 'body', layer: 'body' },
        { key: 'genitles', layer: 'body' },
        { key: 'hands', layer: 'body' },
        { key: 'feet', layer: 'body' },
        { key: 'head', layer: 'head' },
        { key: 'beak', layer: 'head' },
        { key: 'eyes', layer: 'head', sub: ['outer', 'iris'] }, // specialized handling
        { key: 'hair', layer: 'head' },
        { key: 'ear', layer: 'head', sub: ['outer', 'inner'] }, // specialized handling
        { key: 'headAccessories', layer: 'head' }
    ];

    const sprites = [];

    // TAIL
    const tailObj = corpseData.tail;
    if (tailObj) {
        sprites.push(scene.add.sprite(30, -81.5, tailObj.sprite).setTint(parseColor(tailObj.color)));
        sprites.push(scene.add.sprite(30, -81.5, tailObj.secondarySprite).setTint(parseColor(tailObj.secondaryColor)));
        sprites.push(scene.add.sprite(30, -81.5, tailObj.accentSprite).setTint(parseColor(tailObj.accentColor)));
    }

    // BODY & LIMBS
    const bodyObj = corpseData.body;
    if (bodyObj) {
        sprites.push(scene.add.sprite(30, -81.5, bodyObj.sprite).setTint(parseColor(bodyObj.color)));
        sprites.push(scene.add.sprite(30, -81.5, bodyObj.secondarySprite).setTint(parseColor(bodyObj.secondaryColor)));
        sprites.push(scene.add.sprite(30, -81.5, bodyObj.accentSprite).setTint(parseColor(bodyObj.accentColor)));
    }

    const genitlesObj = corpseData.genitles;
    if (genitlesObj) sprites.push(scene.add.sprite(30, -81.5, genitlesObj.sprite)); // No color usually?

    const handsObj = corpseData.hands;
    if (handsObj) sprites.push(scene.add.sprite(30, -81.5, handsObj.sprite).setTint(parseColor(handsObj.color)));

    const feetObj = corpseData.feet;
    if (feetObj) sprites.push(scene.add.sprite(30, -81.5, feetObj.sprite).setTint(parseColor(feetObj.color)));

    // HEAD
    const headObj = corpseData.head;
    if (headObj) {
        sprites.push(scene.add.sprite(30, -81.5, headObj.sprite).setTint(parseColor(headObj.color)));
        sprites.push(scene.add.sprite(30, -81.5, headObj.secondarySprite).setTint(parseColor(headObj.secondaryColor)));
        sprites.push(scene.add.sprite(30, -81.5, headObj.accentSprite).setTint(parseColor(headObj.accentColor)));
    }

    const beakObj = corpseData.beak;
    if (beakObj) sprites.push(scene.add.sprite(30, -81.5, beakObj.sprite).setTint(parseColor(beakObj.color)));

    const eyesObj = corpseData.eyes;
    if (eyesObj) {
        sprites.push(scene.add.sprite(30, -81.5, eyesObj.outer));
        sprites.push(scene.add.sprite(30, -81.5, eyesObj.iris).setTint(parseColor(eyesObj.color)));
    }

    const hairObj = corpseData.hair;
    if (hairObj) sprites.push(scene.add.sprite(30, -81.5, hairObj.sprite).setTint(parseColor(hairObj.color)));

    const earObj = corpseData.ear;
    if (earObj) {
        sprites.push(scene.add.sprite(30, -81.5, earObj.outerSprite).setTint(parseColor(earObj.outerColor)));
        sprites.push(scene.add.sprite(30, -81.5, earObj.innerSprite).setTint(parseColor(earObj.innerColor)));
    }

    const accObj = corpseData.headAccessories;
    if (accObj) sprites.push(scene.add.sprite(30, -81.5, accObj.sprite).setTint(parseColor(accObj.color)));

    // Add all to container
    container.add(sprites);

    // Apply Equipment Visuals (Reuse existing logic)
    if (corpseData.equipment) {
        updatePlayerEquipmentVisuals(container, corpseData.equipment);
    }

    // Add to group and map
    scene.corpseGroup.add(container);
    scene.corpseMap.set(corpseData.id, container);
}
