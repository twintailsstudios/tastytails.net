/**
 * @fileoverview animations.js - Client-Side Animation Engine
 *
 * @description
 * Manages standard 8-directional frame animation generation, emote animations, and real-time
 * execution / depth re-ordering for multi-layered player character containers and equipment overlays.
 *
 * Triggered by:
 * - Scene initialization (create.js)
 * - Movement reconciliation tick (reconcile.js)
 * - Network player state updates (create.js)
 */

/**
 * Static configuration map of anatomical sprite layers.
 * Pre-defined outside hot loops to prevent per-tick closure allocations.
 */
const ANATOMY_LAYERS = [
    { name: 'tail', getKey: s => s.tail?.sprite },
    { name: 'secondaryTail', getKey: s => s.tail?.secondarySprite },
    { name: 'accentTail', getKey: s => s.tail?.accentSprite },
    { name: 'body', getKey: s => s.body?.sprite },
    { name: 'secondaryBody', getKey: s => s.body?.secondarySprite },
    { name: 'accentBody', getKey: s => s.body?.accentSprite },
    { name: 'genitals', getKey: s => (s.genitals?.sprite || s.genitles?.sprite) },
    { name: 'hands', getKey: s => s.hands?.sprite },
    { name: 'feet', getKey: s => s.feet?.sprite },
    { name: 'head', getKey: s => s.head?.sprite },
    { name: 'secondaryHead', getKey: s => s.head?.secondarySprite },
    { name: 'accentHead', getKey: s => s.head?.accentSprite },
    { name: 'beak', getKey: s => s.beak?.sprite },
    { name: 'eyes', getKey: s => s.eyes?.outer },
    { name: 'iris', getKey: s => s.eyes?.iris },
    { name: 'hair', getKey: s => s.hair?.sprite },
    { name: 'outerEar', getKey: s => s.ear?.outerSprite },
    { name: 'innerEar', getKey: s => s.ear?.innerSprite },
    { name: 'headAccessories', getKey: s => s.headAccessories?.sprite }
];

/**
 * Retrieves a child sprite from a container by name using a cached Map.
 * OPTIMIZATION: Replaces linear O(N) getByName() calls with an O(1) map read.
 * Automatically invalidates the cache when the container's list length changes.
 *
 * @param {Phaser.GameObjects.Container} playerSprite - Player container object
 * @param {string} name - Name of child sprite to retrieve
 * @returns {Phaser.GameObjects.GameObject|null} Child game object or null
 */
function getNamedChild(playerSprite, name) {
    if (!playerSprite || !playerSprite.list) return null;
    const currentLength = playerSprite.list.length;
    let cache = playerSprite._namedChildCache;

    // Cache invalidation: rebuild map if list length changed or cache uninitialized
    if (!cache || playerSprite._lastListLength !== currentLength) {
        cache = new Map();
        for (let i = 0; i < currentLength; i++) {
            const child = playerSprite.list[i];
            if (child && child.name) {
                cache.set(child.name, child);
            }
        }
        playerSprite._namedChildCache = cache;
        playerSprite._lastListLength = currentLength;
    }

    const child = cache.get(name);
    return (child && child.active !== false) ? child : null;
}

/**
 * Dynamically updates played animation keys and Z-index depth ordering for all
 * body layers and equipped item overlays contained within a player container sprite.
 *
 * @param {Phaser.GameObjects.Container} playerSprite - Player character container
 * @param {Object} playerState - State snapshot containing rotation, motion, and layer keys
 */
export function updatePlayerAnimations(playerSprite, playerState) {
    if (!playerSprite || !playerState) return;

    // Check optional scene/anims availability for defensive null safety
    const animsManager = playerSprite.scene?.anims;

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
        animationSuffix = 'StopDown';
    }

    // OPTIMIZATION: State-diffing check short-circuits idle tick execution
    const eqHash = playerState.equipmentVersion || playerState.cosmeticVersion || '';
    const animStateKey = `${playerState.rotation || 4}_${playerState.isMoving ? 1 : 0}_${animationSuffix}_${eqHash}`;

    if (playerSprite._lastAnimStateKey === animStateKey) {
        return;
    }
    playerSprite._lastAnimStateKey = animStateKey;

    // Z-Ordering Logic using cached child lookups
    if (direction === 'Up') {
        const tail = getNamedChild(playerSprite, 'tail');
        const secondaryTail = getNamedChild(playerSprite, 'secondaryTail');
        const accentTail = getNamedChild(playerSprite, 'accentTail');
        if (tail) playerSprite.bringToTop(tail);
        if (secondaryTail) playerSprite.bringToTop(secondaryTail);
        if (accentTail) playerSprite.bringToTop(accentTail);

        const headAccessories = getNamedChild(playerSprite, 'headAccessories');
        if (headAccessories) playerSprite.sendToBack(headAccessories);
    } else if (direction === 'Down') {
        const headAccessories = getNamedChild(playerSprite, 'headAccessories');
        if (headAccessories) playerSprite.bringToTop(headAccessories);

        const tail = getNamedChild(playerSprite, 'tail');
        const secondaryTail = getNamedChild(playerSprite, 'secondaryTail');
        const accentTail = getNamedChild(playerSprite, 'accentTail');
        if (accentTail) playerSprite.sendToBack(accentTail);
        if (secondaryTail) playerSprite.sendToBack(secondaryTail);
        if (tail) playerSprite.sendToBack(tail);
    }

    if (playerSprite.list && animsManager) {
        // OPTIMIZATION: Update anatomical layers via static configuration table (no per-tick closures)
        for (let i = 0; i < ANATOMY_LAYERS.length; i++) {
            const layer = ANATOMY_LAYERS[i];
            const sprite = getNamedChild(playerSprite, layer.name);
            if (!sprite) continue;

            const keyBase = layer.getKey(playerState);
            if (keyBase && keyBase !== 'undefined' && keyBase !== 'null' && keyBase !== 'empty') {
                const animKey = keyBase + animationSuffix;
                if (animsManager.exists(animKey)) {
                    if (sprite.anims?.currentAnim?.key !== animKey || !sprite.anims?.isPlaying) {
                        sprite.play(animKey, true);
                    }
                    if (!sprite.visible) sprite.setVisible(true);
                }
            } else if (keyBase === 'empty') {
                const animKey = 'empty' + animationSuffix;
                if (animsManager.exists(animKey)) {
                    if (sprite.anims?.currentAnim?.key !== animKey || !sprite.anims?.isPlaying) {
                        sprite.play(animKey, true);
                    }
                }
            }
        }

        // --- Equipment Animations ---
        for (let i = 0; i < playerSprite.list.length; i++) {
            const child = playerSprite.list[i];
            if (child && child.name && child.name.startsWith('equip_')) {
                if (!child.visible) continue;

                if (child.visualConfig || child.texture) {
                    const atlasKey = child.texture ? child.texture.key : child.visualConfig.atlas;
                    const animKey = atlasKey + animationSuffix;
                    if (animsManager.exists(animKey) && (child.anims?.currentAnim?.key !== animKey || !child.anims?.isPlaying)) {
                        child.play(animKey, true);
                    }
                }
            }
        }
    }
}

/**
 * Bulk-registers 8-directional frame animation sequences (Down, Right, Left, Up, and Stop states)
 * into Phaser's global AnimationManager (scene.anims) for a list of texture keys.
 *
 * @param {Phaser.Scene} scene - Phaser scene instance
 * @param {Array<string>} spriteKeys - Array of texture asset keys to generate animations for
 */
export function createAnimations(scene, spriteKeys) {
    if (!scene || !scene.anims || !spriteKeys) return;

    spriteKeys.forEach(key => {
        scene.anims.create({
            key: `${key}Down`,
            frames: scene.anims.generateFrameNumbers(key, { start: 1, end: 8 }),
            frameRate: 8,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}Right`,
            frames: scene.anims.generateFrameNumbers(key, { start: 10, end: 17 }),
            frameRate: 8,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}Left`,
            frames: scene.anims.generateFrameNumbers(key, { start: 19, end: 26 }),
            frameRate: 8,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}Up`,
            frames: scene.anims.generateFrameNumbers(key, { start: 28, end: 35 }),
            frameRate: 8,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}StopDown`,
            frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 0 }),
            frameRate: 1,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}StopRight`,
            frames: scene.anims.generateFrameNumbers(key, { start: 9, end: 9 }),
            frameRate: 1,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}StopLeft`,
            frames: scene.anims.generateFrameNumbers(key, { start: 18, end: 18 }),
            frameRate: 1,
            repeat: -1
        });

        scene.anims.create({
            key: `${key}StopUp`,
            frames: scene.anims.generateFrameNumbers(key, { start: 27, end: 27 }),
            frameRate: 1,
            repeat: -1
        });
    });
}

/**
 * Registers 3-frame looping animations for chat and status emotes into scene.anims.
 *
 * @param {Phaser.Scene} scene - Phaser scene instance
 * @param {Array<string>} emoteKeys - Array of emote texture asset keys
 */
export function createEmoteAnimations(scene, emoteKeys) {
    if (!scene || !scene.anims || !emoteKeys) return;

    emoteKeys.forEach(key => {
        scene.anims.create({
            key: key,
            frames: scene.anims.generateFrameNumbers(key, { start: 0, end: 2 }),
            frameRate: 8,
            repeat: -1
        });
    });
}
