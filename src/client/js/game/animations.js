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
        // Play animations using named sprites
        if (get('tail')) get('tail').play(playerState.tail.sprite + animationSuffix, true);
        if (get('secondaryTail')) get('secondaryTail').play(playerState.tail.secondarySprite + animationSuffix, true);
        if (get('accentTail')) get('accentTail').play(playerState.tail.accentSprite + animationSuffix, true);

        if (get('body')) get('body').play(playerState.body.sprite + animationSuffix, true);
        if (get('secondaryBody')) get('secondaryBody').play(playerState.body.secondarySprite + animationSuffix, true);
        if (get('accentBody')) get('accentBody').play(playerState.body.accentSprite + animationSuffix, true);

        if (get('genitles')) get('genitles').play(playerState.genitles.sprite + animationSuffix, true);
        if (get('hands')) get('hands').play(playerState.hands.sprite + animationSuffix, true);
        if (get('feet')) get('feet').play(playerState.feet.sprite + animationSuffix, true);

        if (get('head')) get('head').play(playerState.head.sprite + animationSuffix, true);
        if (get('secondaryHead')) get('secondaryHead').play(playerState.head.secondarySprite + animationSuffix, true);
        if (get('accentHead')) get('accentHead').play(playerState.head.accentSprite + animationSuffix, true);

        if (get('beak')) get('beak').play(playerState.beak.sprite + animationSuffix, true);
        if (get('eyes')) get('eyes').play(playerState.eyes.outer + animationSuffix, true);
        if (get('iris')) get('iris').play(playerState.eyes.iris + animationSuffix, true);
        if (get('hair')) get('hair').play(playerState.hair.sprite + animationSuffix, true);
        if (get('outerEar')) get('outerEar').play(playerState.ear.outerSprite + animationSuffix, true);
        if (get('innerEar')) get('innerEar').play(playerState.ear.innerSprite + animationSuffix, true);
        if (get('headAccessories')) get('headAccessories').play(playerState.headAccessories.sprite + animationSuffix, true);
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
