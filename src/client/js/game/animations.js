export function updatePlayerAnimations(playerSprite, playerState) {
    let direction = null;
    let animationSuffix = null;

    if (playerState.rotation == 1) direction = 'Left';
    if (playerState.rotation == 2) direction = 'Right';
    if (playerState.rotation == 3) direction = 'Up';
    if (playerState.rotation == 4) direction = 'Down';

    if (playerState.isMoving && direction) {
        animationSuffix = direction;
    } else if (direction) {
        animationSuffix = 'Stop' + direction;
    } else {
        // Default to a standing down animation if no direction
        animationSuffix = 'StopDown';
    }

    // Helper to safely get sprite by name
    const get = (name) => playerSprite.getByName(name);

    // Z-Ordering Logic
    if (direction === 'Up') {
        // Tail to Top
        const tail = get('tail');
        const secondaryTail = get('secondaryTail');
        const accentTail = get('accentTail');
        if (tail) playerSprite.bringToTop(tail);
        if (secondaryTail) playerSprite.bringToTop(secondaryTail);
        if (accentTail) playerSprite.bringToTop(accentTail);

        // Head Accessories to Bottom
        const headAccessories = get('headAccessories');
        if (headAccessories) playerSprite.sendToBack(headAccessories);
    } else if (direction === 'Down') {
        // Head Accessories to Top
        const headAccessories = get('headAccessories');
        if (headAccessories) playerSprite.bringToTop(headAccessories);

        // Tail to Bottom
        const tail = get('tail');
        const secondaryTail = get('secondaryTail');
        const accentTail = get('accentTail');
        if (accentTail) playerSprite.sendToBack(accentTail);
        if (secondaryTail) playerSprite.sendToBack(secondaryTail);
        if (tail) playerSprite.sendToBack(tail);
    }

    if (playerSprite && playerSprite.list) {
        // Safe play helper
        const safePlay = (spriteName, keyFunc) => {
            const sprite = get(spriteName);
            const keyBase = keyFunc();
            if (sprite && keyBase && keyBase !== 'undefined' && keyBase !== 'null' && keyBase !== 'empty') {
                const animKey = keyBase + animationSuffix;
                // Check if animation exists to avoid console warnings
                if (playerSprite.scene.anims.exists(animKey)) {
                    sprite.play(animKey, true);
                    sprite.setVisible(true);
                } else {
                    // console.warn(`Animation missing: ${animKey}`);
                }
            } else if (sprite) {
                // If key is invalid (empty/null), make sure we don't play anything or hide it?
                // Usually 'empty' sprites shouldn't be played.
                // sprite.stop(); // Optional
                if (keyBase === 'empty') {
                    // Keep visible but maybe static? Or hide? 
                    // Usually 'empty' is a valid sprite sheet but maybe no animation needed?
                    // The 'empty' sheet has frames, so we CAN play 'emptyDown'.
                    // But if keyBase is undefined/null, we must skip.
                }

                // If it IS 'empty', we might want to play 'emptyDown' if it exists.
                if (keyBase === 'empty') {
                    const animKey = 'empty' + animationSuffix;
                    if (playerSprite.scene.anims.exists(animKey)) {
                        sprite.play(animKey, true);
                    }
                }
            }
        };

        // Play animations using named sprites with safety checks
        safePlay('tail', () => playerState.tail?.sprite);
        safePlay('secondaryTail', () => playerState.tail?.secondarySprite);
        safePlay('accentTail', () => playerState.tail?.accentSprite);

        safePlay('body', () => playerState.body?.sprite);
        safePlay('secondaryBody', () => playerState.body?.secondarySprite);
        safePlay('accentBody', () => playerState.body?.accentSprite);

        safePlay('genitles', () => playerState.genitles?.sprite);
        safePlay('hands', () => playerState.hands?.sprite);
        safePlay('feet', () => playerState.feet?.sprite);

        safePlay('head', () => playerState.head?.sprite);
        safePlay('secondaryHead', () => playerState.head?.secondarySprite);
        safePlay('accentHead', () => playerState.head?.accentSprite);

        safePlay('beak', () => playerState.beak?.sprite);
        safePlay('eyes', () => playerState.eyes?.outer);
        safePlay('iris', () => playerState.eyes?.iris);
        safePlay('hair', () => playerState.hair?.sprite);
        safePlay('outerEar', () => playerState.ear?.outerSprite);
        safePlay('innerEar', () => playerState.ear?.innerSprite);
        safePlay('headAccessories', () => playerState.headAccessories?.sprite);

        // --- Equipment Animations ---
        if (playerSprite.list) {
            playerSprite.list.forEach(child => {
                // Check if it's an equipment sprite (starts with equip_)
                if (child.name.startsWith('equip_')) {
                    // console.log('[Anim] Found equipment sprite:', child.name, child.visualConfig);
                    if (child.visualConfig) {
                        const atlasKey = child.visualConfig.atlas;
                        const animKey = atlasKey + animationSuffix;
                        // console.log('[Anim] Playing:', animKey);
                        child.play(animKey, true);
                    } else {
                        console.warn('[Anim] Equipment sprite missing visualConfig:', child.name);
                    }
                }
            });
        }
    }
}

export function createAnimations(scene, spriteKeys) {
    // console.log('spriteKeys = ', spriteKeys);
    // console.log('spriteKeys.length = ', spriteKeys.length);
    spriteKeys.forEach(key => {
        // console.log('key = ',key)
        scene.anims.create({
            key: `${key}Down`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 1, end: 8 }), // Adjust frame numbers as needed
            frameRate: 8,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}Right`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 10, end: 17 }), // Adjust frame numbers as needed
            frameRate: 8,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}Left`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 19, end: 26 }), // Adjust frame numbers as needed
            frameRate: 8,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}Up`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 28, end: 35 }), // Adjust frame numbers as needed
            frameRate: 8,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}StopDown`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 0 }), // Adjust frame numbers as needed
            frameRate: 1,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}StopRight`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 9, end: 9 }), // Adjust frame numbers as needed
            frameRate: 1,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}StopLeft`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 18, end: 18 }), // Adjust frame numbers as needed
            frameRate: 1,
            repeat: -1 // Loop the animation
        });

        scene.anims.create({
            key: `${key}StopUp`, // Example animation key naming convention
            frames: scene.anims.generateFrameNumbers(key, { start: 27, end: 27 }), // Adjust frame numbers as needed
            frameRate: 1,
            repeat: -1 // Loop the animation
        });
    });
}

export function createEmoteAnimations(scene, emoteKeys) {
    if (!emoteKeys) return;

    emoteKeys.forEach(key => {
        scene.anims.create({
            key: key,
            frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 2 }), // 3 frames: 0, 1, 2
            frameRate: 8,
            repeat: -1
        });
    });
}
