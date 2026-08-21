/**
 * @fileoverview Centralized Asset Manifest (assetsList.js)
 * 
 * @description
 * Serves as the single source of truth for declaring all static images, tilesets,
 * player avatar customization layers, clothing items, and resource nodes loaded
 * by the client Phaser engine during preloading.
 * 
 * Triggered by: preload.js during Phaser scene initialization.
 */

import resourceNodeData from './resourceNodeData.js';
import itemData from './itemData.js';
import craftingStations from './craftingStations.js';

// Configuration constants for avatar customization layer bounds
const EAR_COUNT = 11;
const HEAD_COUNT = 6;
const HEAD_SECONDARY_COUNT = 5;
const TAIL_COUNT = 10;
const TAIL_SECONDARY_COUNT = 6;

/**
 * Single-pass extractor for static images, clothing spritesheets, and rendered items from itemData.
 * OPTIMIZATION: Consolidates 3 separate .filter()/.map() iterations into a single O(N) loop
 * to minimize Garbage Collection (GC) pauses during client module initialization.
 * 
 * @param {Object} itemDefinitions - Map of item definitions from itemData.js
 * @returns {{ itemImages: Array<Object>, itemClothingSheets: Array<Object>, itemRenderSheets: Array<Object> }} Extracted asset objects grouped by category.
 */
function extractItemAssets(itemDefinitions) {
    if (!itemDefinitions || typeof itemDefinitions !== 'object') {
        return { itemImages: [], itemClothingSheets: [], itemRenderSheets: [] };
    }

    const itemImages = [];
    const itemClothingSheets = [];
    const itemRenderSheets = [];

    for (const [key, def] of Object.entries(itemDefinitions)) {
        if (!def || typeof def !== 'object') continue;

        // Static item image textures (clothing items load as spritesheets from /assets/clothes/)
        if (def.texture && !def.rendering && def.itemType !== 'clothing') {
            itemImages.push({
                key: String(def.texture),
                path: `/assets/tilemaps/${def.texture}.png`
            });
        }

        // Layered/rendered spritesheet items
        if (def.texture && def.rendering) {
            itemRenderSheets.push({
                key: String(def.texture),
                path: `/assets/tilemaps/${def.texture}.png`,
                frameWidth: 12,
                frameHeight: 64
            });
        }

        // Dynamic clothing items & secondary patterns
        if (def.itemType === 'clothing') {
            const baseTex = def.texture || def.itemId || key;
            if (baseTex) {
                itemClothingSheets.push({
                    key: String(baseTex),
                    path: `/assets/clothes/${baseTex}.png`,
                    animate: true
                });
            }
            if (Array.isArray(def.secondaryPatterns)) {
                for (const pattern of def.secondaryPatterns) {
                    const patternId = typeof pattern === 'string' ? pattern : pattern?.id;
                    if (patternId) {
                        itemClothingSheets.push({
                            key: `${baseTex}-${patternId}`,
                            path: `/assets/clothes/${baseTex}-${patternId}.png`,
                            animate: true
                        });
                    }
                }
            }
        }
    }

    return { itemImages, itemClothingSheets, itemRenderSheets };
}

/**
 * Single-pass extractor for static crafting station image textures from craftingStations.js.
 * @param {Object} stationDefinitions - Map of crafting station definitions from craftingStations.js
 * @returns {Array<Object>} Extracted image asset objects for Phaser preloading.
 */
function extractStationAssets(stationDefinitions) {
    if (!stationDefinitions || typeof stationDefinitions !== 'object') {
        return [];
    }

    const stationImages = [];
    const addedKeys = new Set();

    for (const [key, def] of Object.entries(stationDefinitions)) {
        if (!def || typeof def !== 'object') continue;
        const texKey = def.texture || key;
        if (!addedKeys.has(texKey)) {
            addedKeys.add(texKey);
            stationImages.push({
                key: String(texKey),
                path: `/assets/tilemaps/${texKey}.png`
            });
        }
    }

    return stationImages;
}

const { itemImages, itemClothingSheets, itemRenderSheets } = extractItemAssets(itemData);
const stationImages = extractStationAssets(craftingStations);

export const assets = {
    // Map Tilesets (Must match Tiled Tileset Names)
    tilesets: [
        { key: 'Demo_tileset', path: '/assets/tilemaps/tileset.png' },
        { key: 'alpha_tileset', path: '/assets/tilemaps/alpha_tileset.png' },
        { key: 'alpha_ground_set', path: '/assets/tilemaps/alpha_ground_set.png' },
        { key: 'alpha_zones', path: '/assets/tilemaps/alpha_zones.png' },
        { key: 'music_zones', path: '/assets/tilemaps/music_zones.png' }
    ],

    // UI & Misc Images
    images: [
        { key: 'scroll', path: '/assets/images/Scroll_01.png' },
        { key: 'scroll2', path: '/assets/images/Scroll_02.png' },
        // Interactive Objects
        { key: 'tree_01', path: '/assets/tilemaps/tree_01.png' },
        { key: 'tree_02', path: '/assets/tilemaps/tree_02.png' },
        { key: 'lamp_01', path: '/assets/tilemaps/lamp_01.png' },
        { key: 'lamp_02', path: '/assets/tilemaps/lamp_02.png' },
        { key: 'grand_altar', path: '/assets/tilemaps/grand_altar.png' },
        { key: 'cloth_shelf_01', path: '/assets/tilemaps/cloth_shelf_01.png' },
        { key: 'cloth_shelf_02', path: '/assets/tilemaps/cloth_shelf_02.png' },
        { key: 'mirror_01', path: '/assets/tilemaps/mirror_01.png' },
        { key: 'mannequin_00', path: '/assets/tilemaps/mannequin_00.png' },
        { key: 'mannequin_01', path: '/assets/tilemaps/mannequin_01.png' },
        { key: 'mannequin_02', path: '/assets/tilemaps/mannequin_02.png' },
        { key: 'cloth_roll_basket01', path: '/assets/tilemaps/cloth_roll_basket01.png' },
        { key: 'yarn_basket_01', path: '/assets/tilemaps/yarn_basket_01.png' },
        { key: 'pub_table', path: '/assets/tilemaps/pub_table.png' },
        { key: 'pub_stool', path: '/assets/tilemaps/pub_stool.png' },
        { key: 'bar_front', path: '/assets/tilemaps/bar_front.png' },
        { key: 'card_table', path: '/assets/tilemaps/card_table.png' },
        { key: 'pub_stool_tall', path: '/assets/tilemaps/pub_stool_tall.png' },
        { key: 'desk_horizontal_01', path: '/assets/tilemaps/desk_horizontal_01.png' },
        { key: 'counter_horizontal_03', path: '/assets/tilemaps/counter_horizontal_03.png' },
        { key: 'counter_front_left_base', path: '/assets/tilemaps/counter_front_left_base.png' },
        { key: 'counter_front_middle_base', path: '/assets/tilemaps/counter_front_middle_base.png' },
        { key: 'counter_front_right_base', path: '/assets/tilemaps/counter_front_right_base.png' },
        { key: 'counter_front_small', path: '/assets/tilemaps/counter_front_small.png' },
        { key: 'counter_corner_tl', path: '/assets/tilemaps/counter_corner_tl.png' },
        { key: 'counter_corner_tr', path: '/assets/tilemaps/counter_corner_tr.png' },
        { key: 'counter_corner_bl', path: '/assets/tilemaps/counter_corner_bl.png' },
        { key: 'counter_corner_br', path: '/assets/tilemaps/counter_corner_br.png' },
        { key: 'counter_side_noBase', path: '/assets/tilemaps/counter_side_noBase.png' },
        { key: 'counter_side_base', path: '/assets/tilemaps/counter_side_base.png' },
        { key: 'counter_corner_left_noBase', path: '/assets/tilemaps/counter_corner_left_noBase.png' },
        { key: 'counter_corner_right_noBase', path: '/assets/tilemaps/counter_corner_right_noBase.png' },
        // Dynamically loaded crafting station textures (extracted via extractStationAssets helper)
        ...stationImages,
        { key: 'toilet', path: '/assets/tilemaps/toilet.png' },
        { key: 'sink', path: '/assets/tilemaps/sink.png' },
        { key: 'spa_massage_bed', path: '/assets/tilemaps/spa_massage_bed.png' },
        // Items & Misc
        { key: 'pants', path: '/assets/tilemaps/pants.png' },
        { key: 'shirt', path: '/assets/tilemaps/shirt.png' },
        { key: 'clothing_store_exit_rug', path: '/assets/tilemaps/clothing_store_exit_rug.png' },
        { key: 'pub_exit_rug', path: '/assets/tilemaps/pub_exit_rug.png' },
        // Dynamically loaded item textures (extracted via single-pass helper)
        ...itemImages,
        // Building Sprites
        { key: 'blacksmith_outside_01', path: '/assets/tilemaps/blacksmith_outside_01.png' },
        { key: 'blacksmith_outside_02', path: '/assets/tilemaps/blacksmith_outside_02.png' },
        { key: 'seamstress', path: '/assets/tilemaps/seamstress.png' },
        { key: 'great_ash', path: '/assets/tilemaps/great_ash.png' },
        { key: 'tailor_structure', path: '/assets/tilemaps/tailor_structure.png' },
        { key: 'cozy_house', path: '/assets/tilemaps/cozy_house.png' },
        { key: 'maintenance_outside', path: '/assets/tilemaps/maintenance_outside.png' }
    ],

    // Spritesheets (Frames will be 215x198 unless specified)
    // Most of these are candidates for Animation.
    spritesheets: [
        { key: 'tilesetSprite', path: '/assets/tilemaps/tileset.png', frameWidth: 32, frameHeight: 32 },
        // Player Bases (Empty)
        { key: 'empty', path: '/assets/spritesheets/empty.png', frameWidth: 109, frameHeight: 220, animate: true },
        { key: 'body_01-empty', path: '/assets/spritesheets/empty.png', frameWidth: 109, frameHeight: 220, animate: true },
        { key: 'body_02-empty', path: '/assets/spritesheets/empty.png', frameWidth: 109, frameHeight: 220, animate: true },
        { key: 'body_03-empty', path: '/assets/spritesheets/empty.png', frameWidth: 109, frameHeight: 220, animate: true },
        { key: 'body_04-empty', path: '/assets/spritesheets/empty.png', frameWidth: 109, frameHeight: 220, animate: true },

        // Player Body Parts (Standard 215x198)
        { key: 'body_01', path: '/assets/spritesheets/body_01.png', animate: true },

        // Secondary Patterns
        { key: 'body_01-secondary_01', path: '/assets/spritesheets/body_01-secondary_01.png', animate: true },
        { key: 'body_01-secondary_02', path: '/assets/spritesheets/body_01-secondary_02.png', animate: true },
        { key: 'body_01-secondary_03', path: '/assets/spritesheets/body_01-secondary_03.png', animate: true },
        { key: 'body_01-secondary_04', path: '/assets/spritesheets/body_01-secondary_04.png', animate: true },

        // Accents
        { key: 'body_01-accent_01', path: '/assets/spritesheets/body_01-accent_01.png', animate: true },
        { key: 'body_01-accent_02', path: '/assets/spritesheets/body_01-accent_02.png', animate: true },
        { key: 'body_01-accent_03', path: '/assets/spritesheets/body_01-accent_03.png', animate: true },

        // Hands & Feet
        { key: 'body_01-hands-secondary_01', path: '/assets/spritesheets/body_01-hands-secondary_01.png', animate: true },
        { key: 'body_01-hands-secondary_02', path: '/assets/spritesheets/body_01-hands-secondary_02.png', animate: true },
        { key: 'body_01-feet-secondary_01', path: '/assets/spritesheets/body_01-feet-secondary_01.png', animate: true },
        { key: 'body_01-feet-secondary_02', path: '/assets/spritesheets/body_01-feet-secondary_02.png', animate: true },

        // Ears (1 to EAR_COUNT Outer/Inner)
        ...Array.from({ length: EAR_COUNT }, (_, i) => i + 1).flatMap(i => {
            const id = i < 10 ? `0${i}` : `${i}`;
            return [
                { key: `ears_${id}-outer`, path: `/assets/spritesheets/ears_${id}-outer.png`, animate: true },
                { key: `ears_${id}-inner`, path: `/assets/spritesheets/ears_${id}-inner.png`, animate: true }
            ];
        }),

        // Eyes
        { key: 'eyes_01', path: '/assets/spritesheets/eyes_01.png', animate: true },
        { key: 'eyes_02', path: '/assets/spritesheets/eyes_02.png', animate: true },

        // Head Accessories
        { key: 'headAccessories_01', path: '/assets/spritesheets/headAccessories_01.png', animate: true },
        { key: 'headAccessories_02', path: '/assets/spritesheets/headAccessories_02.png', animate: true },
        { key: 'headAccessories_03', path: '/assets/spritesheets/headAccessories_03.png', animate: true },
        { key: 'headAccessories_04', path: '/assets/spritesheets/headAccessories_04.png', animate: true },
        { key: 'headAccessories_05', path: '/assets/spritesheets/headAccessories_05.png', animate: true },

        // Heads & Secondary Heads
        ...Array.from({ length: HEAD_COUNT }, (_, i) => i + 1).flatMap(i => {
            const id = `0${i}`;
            const list = [{ key: `head_${id}`, path: `/assets/spritesheets/head_${id}.png`, animate: true }];
            if (i === 5) list.push({ key: 'head_05_beak', path: '/assets/spritesheets/head_05_beak.png', animate: true });

            for (let j = 1; j <= HEAD_SECONDARY_COUNT; j++) {
                list.push({ key: `head_${id}-secondary_0${j}`, path: `/assets/spritesheets/head_${id}-secondary_0${j}.png`, animate: true });
            }
            return list;
        }),

        // Tails (1 to TAIL_COUNT & Secondary)
        ...Array.from({ length: TAIL_COUNT }, (_, i) => i + 1).flatMap(i => {
            const id = i < 10 ? `0${i}` : `${i}`;
            const list = [{ key: `tail_${id}`, path: `/assets/spritesheets/tail_${id}.png`, animate: true }];
            for (let j = 1; j <= TAIL_SECONDARY_COUNT; j++) {
                list.push({ key: `tail_${id}-secondary_0${j}`, path: `/assets/spritesheets/tail_${id}-secondary_0${j}.png`, animate: true });
            }
            return list;
        }),

        // Hair
        { key: 'hair-front_01', path: '/assets/spritesheets/hair-front_01.png', animate: true },
        { key: 'hair-front_02', path: '/assets/spritesheets/hair-front_02.png', animate: true },
        { key: 'hair-front_03', path: '/assets/spritesheets/hair-front_03.png', animate: true },

        // Dynamic Clothing items & secondary patterns (extracted via single-pass helper)
        ...itemClothingSheets,

        // Doors
        { key: 'door_clothing_store', path: '/assets/spritesheets/door_clothing_store.png', frameWidth: 197, frameHeight: 255 },
        { key: 'door_pub', path: '/assets/spritesheets/door_pub.png', frameWidth: 197, frameHeight: 255 },
        { key: 'door_spa', path: '/assets/spritesheets/door_spa.png', frameWidth: 197, frameHeight: 255 },
        { key: 'alpha_door', path: '/assets/tilemaps/alpha_door.png', frameWidth: 96, frameHeight: 288 },

        // Dynamically loaded layered/spritesheet items (extracted via single-pass helper)
        ...itemRenderSheets,

        // Animals
        { key: 'sheep', path: '/assets/animals/sheep.png', frameWidth: 215, frameHeight: 198 },

        // Enemy Multi-State Spritesheets (/assets/enemies/{enemyName}/{status}_{enemyName}.png)
        { key: 'idle_bunny', path: '/assets/enemies/bunny/idle_bunny.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'idle_tiger', path: '/assets/enemies/tiger/idle_tiger.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'idle_test', path: '/assets/enemies/test/idle_test.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'orbit_test', path: '/assets/enemies/test/orbit_test.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'windup_test', path: '/assets/enemies/test/windup_test.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'flash_test', path: '/assets/enemies/test/flash_test.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'active_test', path: '/assets/enemies/test/active_test.png', frameWidth: 215, frameHeight: 198, animate: true },
        { key: 'recovery_test', path: '/assets/enemies/test/recovery_test.png', frameWidth: 215, frameHeight: 198, animate: true },

        // Dynamic resource nodes (skip layered crop nodes that load individual layer textures)
        ...Object.entries(resourceNodeData)
            .filter(([key, def]) => {
                if (def.rendering?.type === 'layered' || def.skipPreload) return false;
                if (!def.frameWidth || !def.frameHeight) {
                    console.warn(`[AssetsList] Resource node '${key}' missing frame dimensions. Skipping tilemap preload.`);
                    return false;
                }
                return true;
            })
            .map(([key, def]) => ({
                key: key,
                path: `/assets/tilemaps/${key}.png`,
                frameWidth: def.frameWidth,
                frameHeight: def.frameHeight
            }))
    ],

    // Emotes
    emotes: [
        'typing'
    ],

    // Background Music (MIDI Tracks)
    music: [
        { key: 'test_theme', path: '/assets/music/test_theme.mid' }
    ]
};


