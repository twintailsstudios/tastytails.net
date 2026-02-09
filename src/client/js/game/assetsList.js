/**
 * Centralized Asset Manifest
 * All game assets (images, spritesheets) should be defined here.
 */

export const assets = {
    // Map Tilesets (Must match Tiled Tileset Names)
    tilesets: [
        { key: 'Demo_tileset', path: '/assets/tilemaps/tileset.png' },
        { key: 'alpha_tileset', path: '/assets/tilemaps/alpha_tileset.png' },
        { key: 'alpha_ground_set', path: '/assets/tilemaps/alpha_ground_set.png' },
        { key: 'alpha_zones', path: '/assets/tilemaps/alpha_zones.png' }
    ],

    // UI & Misc Images
    images: [
        { key: 'scroll', path: '/assets/images/Scroll_01.png' },
        { key: 'scroll2', path: '/assets/images/Scroll_02.png' },
        // Interactive Objects
        { key: 'tree_01', path: '/assets/tilemaps/tree_01.png' },
        { key: 'tree_02', path: '/assets/tilemaps/tree_02.png' },
        { key: 'tree_orange', path: '/assets/tilemaps/tree_orange.png' },
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
        // Crafting Stations
        { key: 'smelter', path: '/assets/tilemaps/smelter.png' },
        { key: 'anvil_01', path: '/assets/tilemaps/anvil_01.png' },
        { key: 'cocktail_bar', path: '/assets/tilemaps/cocktail_bar.png' },
        { key: 'juicer', path: '/assets/tilemaps/juicer.png' },
        { key: 'distillery', path: '/assets/tilemaps/distillery.png' },
        { key: 'spinning_wheel', path: '/assets/tilemaps/spinning_wheel.png' },
        { key: 'sewing_machine', path: '/assets/tilemaps/sewing_machine.png' },
        { key: 'cauldron', path: '/assets/tilemaps/cauldron.png' },
        { key: 'toilet', path: '/assets/tilemaps/toilet.png' },
        { key: 'sink', path: '/assets/tilemaps/sink.png' },
        { key: 'spa_massage_bed', path: '/assets/tilemaps/spa_massage_bed.png' },
        // Items & Misc
        { key: 'pants', path: '/assets/tilemaps/pants.png' },
        { key: 'shirt', path: '/assets/tilemaps/shirt.png' },
        { key: 'key', path: '/assets/tilemaps/key.png' },
        { key: 'ingot_iron', path: '/assets/tilemaps/ingot_iron.png' },
        { key: 'ore_iron', path: '/assets/tilemaps/ore_iron.png' },
        { key: 'food_orange', path: '/assets/tilemaps/food_orange.png' },
        { key: 'food_potato', path: '/assets/tilemaps/food_potato.png' },
        { key: 'fiber_wool', path: '/assets/tilemaps/fiber_wool.png' },
        { key: 'indigo', path: '/assets/tilemaps/indigo.png' },
        { key: 'madder_root', path: '/assets/tilemaps/madder_root.png' },
        { key: 'weld', path: '/assets/tilemaps/weld.png' },
        { key: 'clothing_store_exit_rug', path: '/assets/tilemaps/clothing_store_exit_rug.png' },
        { key: 'pub_exit_rug', path: '/assets/tilemaps/pub_exit_rug.png' },
        { key: 'sheers', path: '/assets/tilemaps/sheers.png' },
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

        // Ears (1-11 Outer/Inner)
        ...Array.from({ length: 11 }, (_, i) => i + 1).flatMap(i => {
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
        ...Array.from({ length: 6 }, (_, i) => i + 1).flatMap(i => {
            const id = `0${i}`;
            const secondaryCount = 5;
            const list = [{ key: `head_${id}`, path: `/assets/spritesheets/head_${id}.png`, animate: true }];
            if (i === 5) list.push({ key: 'head_05_beak', path: '/assets/spritesheets/head_05_beak.png', animate: true });

            for (let j = 1; j <= secondaryCount; j++) {
                list.push({ key: `head_${id}-secondary_0${j}`, path: `/assets/spritesheets/head_${id}-secondary_0${j}.png`, animate: true });
            }
            return list;
        }),

        // Tails (1-10 & Secondary)
        ...Array.from({ length: 10 }, (_, i) => i + 1).flatMap(i => {
            const id = i < 10 ? `0${i}` : `${i}`;
            const list = [{ key: `tail_${id}`, path: `/assets/spritesheets/tail_${id}.png`, animate: true }];
            for (let j = 1; j <= 6; j++) {
                list.push({ key: `tail_${id}-secondary_0${j}`, path: `/assets/spritesheets/tail_${id}-secondary_0${j}.png`, animate: true });
            }
            return list;
        }),

        // Hair
        { key: 'hair-front_01', path: '/assets/spritesheets/hair-front_01.png', animate: true },
        { key: 'hair-front_02', path: '/assets/spritesheets/hair-front_02.png', animate: true },
        { key: 'hair-front_03', path: '/assets/spritesheets/hair-front_03.png', animate: true },

        // Clothing
        { key: 'shirt_01', path: '/assets/clothes/shirt_01.png', animate: true },
        { key: 'shirt_01-secondary_01', path: '/assets/clothes/shirt_01-secondary_01.png', animate: true },
        { key: 'shirt_01-secondary_02', path: '/assets/clothes/shirt_01-secondary_02.png', animate: true },
        { key: 'shirt_01-secondary_03', path: '/assets/clothes/shirt_01-secondary_03.png', animate: true },
        { key: 'pants_01', path: '/assets/clothes/pants_01.png', animate: true },

        // Doors
        { key: 'door_clothing_store', path: '/assets/spritesheets/door_clothing_store.png', frameWidth: 197, frameHeight: 255 },
        { key: 'door_pub', path: '/assets/spritesheets/door_pub.png', frameWidth: 197, frameHeight: 255 },
        { key: 'door_spa', path: '/assets/spritesheets/door_spa.png', frameWidth: 197, frameHeight: 255 },
        { key: 'alpha_door', path: '/assets/tilemaps/alpha_door.png', frameWidth: 96, frameHeight: 288 },

        // Interactive Sprites
        { key: 'alpha_bottle', path: '/assets/tilemaps/alpha_bottle.png', frameWidth: 12, frameHeight: 64 },
        { key: 'alpha_thread', path: '/assets/tilemaps/alpha_thread.png', frameWidth: 12, frameHeight: 64 },
        { key: 'alpha_dye', path: '/assets/tilemaps/alpha_dye.png', frameWidth: 12, frameHeight: 64 },

        //animals
        { key: 'sheep', path: '/assets/animals/sheep.png', frameWidth: 215, frameHeight: 198 },
    ],

    // Emotes
    emotes: [
        'typing'
    ]
};
