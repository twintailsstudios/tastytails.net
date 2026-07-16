/**
 * itemData.js (ONLY EDIT THIS FILE WHEN CREATING OR CHANGING ITEMS)
 * Definitions for items, specifically their physical size.
 * Defaults to size 1 if not found.
 */
module.exports = {
    // Basic Items
    'glass_beer': { size: 1, name: 'Beer Glass', icon: 'fa-glass-whiskey', texture: 'glass_beer' },
    'bottle_empty': { size: 1, name: 'Empty Bottle', icon: 'fa-wine-bottle', texture: 'bottle_empty', description: 'An empty glass bottle.' },
    'key': { size: 1, name: 'Key', icon: 'fa-key', texture: 'key' },
    'scroll_01': { size: 1, name: 'Test Scroll', icon: 'fa-scroll', texture: 'scroll2', description: 'A testing scroll.' },

    // Drink Bottles
    'bottle_ale': { size: 1, name: 'Ale Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_ale', playerUse: true, returnOnEmpty: 'bottle_empty' },
    'bottle_wine': { size: 1, name: 'Wine Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_wine', playerUse: true, returnOnEmpty: 'bottle_empty' },
    'bottle_whiskey': { size: 1, name: 'Whiskey Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_whiskey', playerUse: true, returnOnEmpty: 'bottle_empty' },
    'bottle_beer': { size: 1, name: 'Beer Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_beer', playerUse: true, returnOnEmpty: 'bottle_empty' },

    // Tools/Weapons
    'stick': { size: 4, name: 'Sturdy Stick' },

    // Crafting Items
    'ore_iron': { size: 2, name: 'Iron Ore', icon: 'fa-gem', texture: 'ore_iron', flavor: `Hard and metallic`, description: `A chunk of iron ore.`, verb: 'use', maxUses: 1, playerUse: false },
    'ingot_iron': { 
        size: 2, 
        name: 'Iron Ingot', 
        icon: 'fa-solid fa-smithing', 
        texture: 'ingot_iron', 
        flavor: `Hard and metallic`, 
        description: `An ingot of iron.`, 
        verb: 'use', 
        maxUses: 1, 
        playerUse: false,
        recipe: {
            station: 'furnace',
            time: 5000,
            ingredients: [
                { itemId: 'ore_iron', count: 1 }
            ]
        }
    },

    // Default
    'default': { size: 1, name: 'Unknown Object' },

    // Food
    'food_orange': { size: 1, name: 'Orange', icon: 'fa-apple-whole', texture: 'food_orange', flavor: `Tangy and sweet`, description: `A juicy orange.`, verb: 'eat', maxUses: 1, playerUse: true, isDynamic: true },
    'food_potato': { size: 1, name: 'Potato', icon: 'fa-apple-whole', texture: 'food_potato', flavor: `Starchy and savory`, description: `A rich potato.`, verb: 'eat', maxUses: 1, playerUse: true, isDynamic: true },

    // Tools
    'tool_sheers': { 
        size: 1, 
        name: 'Sheers', 
        icon: 'fa-apple-whole', 
        texture: 'sheers', 
        flavor: `Tastes like metal`, 
        description: `Big heavy scissors`, 
        verb: 'use', 
        maxUses: 1, 
        playerUse: false,
        recipe: {
            station: 'anvil',
            time: 5000,
            ingredients: [
                { itemId: 'ingot_iron', count: 2 }
            ],
            icon: 'fa-solid fa-khanda'
        }
    },
    'tool_pickaxe': { 
        size: 1, 
        name: 'Pickaxe', 
        icon: 'fa-apple-whole', 
        texture: 'pickaxe', 
        flavor: `Tastes like metal`, 
        description: `Big heavy pickaxe`, 
        verb: 'use', 
        maxUses: 1, 
        playerUse: false,
        recipe: {
            station: 'anvil',
            time: 5000,
            ingredients: [
                { itemId: 'ingot_iron', count: 3 }
            ],
            icon: 'fa-solid fa-khanda'
        }
    },

    // Fibers
    'fiber_wool': { size: 1, name: 'Wool Fiber', icon: 'fa-apple-whole', texture: 'fiber_wool', flavor: `Soft and warm`, description: `A roll of wool fiber.`, verb: 'use', maxUses: 1, playerUse: false },

    // Dye precursors
    'indigo': { size: 1, name: 'Indigo', icon: 'fa-apple-whole', texture: 'indigo', flavor: `Pungent`, description: `A roll of indigo fiber.`, verb: 'use', maxUses: 1, playerUse: false },
    'madder_root': { size: 1, name: 'Madder Root', icon: 'fa-apple-whole', texture: 'madder_root', flavor: `Pungent`, description: `A roll of madder root fiber.`, verb: 'use', maxUses: 1, playerUse: false },
    'weld': { size: 1, name: 'Weld', icon: 'fa-apple-whole', texture: 'weld', flavor: `Pungent`, description: `A roll of weld fiber.`, verb: 'use', maxUses: 1, playerUse: false },


    // Special
    'alpha_bottle': {
        size: 3,
        name: 'Alpha Bottle',
        icon: 'fa-tint',
        texture: 'alpha_bottle',
        maxUses: 9,
        playerUse: true,
        returnOnEmpty: 'bottle_empty',
        isDynamic: true,
        color: 0x66ccff,
        verb: 'Drink',
        flavor: 'A bubbling blue liquid.',
        description: 'A strange bottle that seems to refill itself.',
        rendering: {
            type: 'layered',
            layers: [
                { frameOffset: 10, tintParam: 'color' }, // Liquid (Bottom)
                { frameOffset: 0, interactive: true }    // Bottle (Top)
            ]
        }
    },
    'alpha_dye': {
        size: 1,
        name: 'Alpha Dye',
        icon: 'fa-tint',
        texture: 'alpha_dye',
        maxUses: 10,
        playerUse: false,
        isDynamic: true,
        color: 0xFFC0CB,
        verb: 'use',
        flavor: 'pungent',
        description: 'A bottle of dye',
        rendering: {
            type: 'layered',
            layers: [
                { frameOffset: 10, tintParam: 'color' }, // Liquid (Bottom)
                { frameOffset: 0, interactive: true }    // Bottle (Top)
            ]
        }
    },
    'alpha_thread': {
        size: 1,
        name: 'Alpha Thread',
        icon: 'fa-tint',
        texture: 'alpha_thread',
        maxUses: 10,
        playerUse: false,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'unspool',
        flavor: 'cloth',
        description: 'A roll of thread',
        rendering: {
            type: 'layered',
            layers: [
                { frameOffset: 0 }, // spool (Bottom)
                { frameOffset: 10, tintParam: 'color', interactive: true } // thread (Top)
            ]
        }
    },
    'shirt_01': {
        name: 'Plain T-Shirt',
        equipSlot: 'torsoOuter',
        isItem: true,
        itemId: 'shirt_01',
        itemType: 'clothing',
        texture: 'shirt_01',
        icon: 'fa-shirt', // Changed to fa-shirt to match context
        maxUses: 1,
        playerUse: false,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'wear',
        flavor: 'cloth',
        description: 'A simple plain t-shirt.',
        pockets: [
            { id: 'breast_pocket', name: 'Front Pocket', capacity: 2 }
        ],
        recipe: {
            station: 'sewing_machine',
            time: 5000,
            icon: 'fa-solid fa-shirt',
            ingredients: [
                { itemId: 'thread_wool_white', count: 1 }
            ],
            customData: {
                baseShape: 'shirt',
                baseName: 'T-Shirt'
            }
        }
    },
    'weapon_iron_sword': {
        size: 10,
        name: 'Iron Sword',
        icon: 'fa-solid fa-khanda',
        texture: 'weapon_iron_sword',
        description: 'A standard iron sword.',
        recipe: {
            station: 'anvil',
            time: 5000,
            ingredients: [
                { itemId: 'ingot_iron', count: 3 }
            ],
            icon: 'fa-solid fa-khanda'
        }
    },
    'weapon_iron_dagger': {
        size: 5,
        name: 'Iron Dagger',
        icon: 'fa-solid fa-syringe',
        texture: 'weapon_iron_dagger',
        description: 'A small but sharp dagger.',
        recipe: {
            station: 'anvil',
            time: 3000,
            ingredients: [
                { itemId: 'ingot_iron', count: 1 }
            ],
            icon: 'fa-solid fa-syringe'
        }
    },
    'screwdriver': {
        size: 1,
        name: 'Screwdriver',
        icon: 'fa-glass-whiskey',
        texture: 'alpha_bottle',
        color: 0xFFD700,
        variant: 'screwdriver',
        flavor: 'A classic mix of vodka and orange juice.',
        description: 'The sweet tang of orange with a bit of a kick~',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'cocktail_bar',
            time: 1500,
            ingredients: [
                { itemId: 'vodka', count: 1 },
                { itemId: 'juice_orange', count: 1 }
            ]
        }
    },
    'juice_orange': {
        size: 1,
        name: 'Bottled Orange Juice',
        icon: 'fa-glass-whiskey',
        texture: 'alpha_bottle',
        color: 0xFFA500,
        variant: 'orange_juice',
        flavor: 'The sweet tang of orange.',
        description: 'Freshly squeezed orange juice.',
        rendering: { type: 'layered', layers: [{ frameOffset: 12, tintParam: 'color' }, { frameOffset: 0 }] },
        recipe: {
            station: 'juicer',
            time: 1000,
            ingredients: [
                { itemId: 'food_orange', count: 1 }
            ]
        }
    },
    'vodka': {
        size: 3,
        name: 'Bottled Vodka',
        icon: 'fa-wine-bottle',
        texture: 'alpha_bottle',
        color: 0xCACCC6,
        variant: 'vodka',
        flavor: 'The burning flavor of vodka.',
        description: 'A hard-hitting bottle of vodka.',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'distillery',
            time: 1000,
            ingredients: [
                { itemId: 'food_potato', count: 1 }
            ]
        }
    },
    'thread_wool_white': {
        size: 1,
        name: 'White Wool Thread',
        icon: 'fa-scroll',
        texture: 'alpha_thread',
        color: 0xCACCC6,
        variant: 'thread_wool_white',
        flavor: 'tastes like wool.',
        description: 'Pure white, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 }
            ]
        }
    },
    'thread_wool_blue': {
        size: 1,
        name: 'Blue Wool Thread',
        icon: 'fa-scroll',
        texture: 'alpha_thread',
        color: 0x0000FF,
        variant: 'thread_wool_blue',
        flavor: 'tastes like wool.',
        description: 'Blue, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_blue', count: 1 }
            ]
        }
    },
    'thread_wool_red': {
        size: 1,
        name: 'Red Wool Thread',
        icon: 'fa-scroll',
        texture: 'alpha_thread',
        color: 0xFF0000,
        variant: 'thread_wool_red',
        flavor: 'tastes like wool.',
        description: 'Red, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_red', count: 1 }
            ]
        }
    },
    'thread_wool_yellow': {
        size: 1,
        name: 'Yellow Wool Thread',
        icon: 'fa-scroll',
        texture: 'alpha_thread',
        color: 0xFFFF00,
        variant: 'thread_wool_yellow',
        flavor: 'tastes like wool.',
        description: 'Yellow, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_yellow', count: 1 }
            ]
        }
    },
    'dye_blue': {
        size: 1,
        name: 'Blue Dye',
        icon: 'fa-scroll',
        texture: 'alpha_dye',
        color: 0x0000FF,
        variant: 'dye_blue',
        flavor: 'tastes like blue.',
        description: 'A blue dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'cauldron',
            time: 1000,
            ingredients: [
                { itemId: 'indigo', count: 1 }
            ]
        }
    },
    'dye_red': {
        size: 1,
        name: 'Red Dye',
        icon: 'fa-scroll',
        texture: 'alpha_dye',
        color: 0xFF0000,
        variant: 'dye_red',
        flavor: 'tastes like red.',
        description: 'A red dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'cauldron',
            time: 1000,
            ingredients: [
                { itemId: 'madder_root', count: 1 }
            ]
        }
    },
    'dye_yellow': {
        size: 1,
        name: 'Yellow Dye',
        icon: 'fa-scroll',
        texture: 'alpha_dye',
        color: 0xFFFF00,
        variant: 'dye_yellow',
        flavor: 'tastes like yellow.',
        description: 'A yellow dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 10, tintParam: 'color' }, { frameOffset: 0, interactive: true }] },
        recipe: {
            station: 'cauldron',
            time: 1000,
            ingredients: [
                { itemId: 'weld', count: 1 }
            ]
        }
    },
    'sewing_1_layer': {
        name: 'Sewing (1 Layer)',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 5000,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 1 }],
            result: { itemId: 'shirt_01', count: 1 },
            icon: 'fa-solid fa-layer-group'
        }
    },
    'sewing_2_layer': {
        name: 'Sewing (2 Layers)',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 6000,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 2 }],
            result: { itemId: 'shirt_01', count: 1 },
            icon: 'fa-solid fa-layer-group'
        }
    },
    'sewing_3_layer': {
        name: 'Sewing (3 Layers)',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 7000,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 3 }],
            result: { itemId: 'shirt_01', count: 1 },
            icon: 'fa-solid fa-layer-group'
        }
    },
    'sewing_4_layer': {
        name: 'Sewing (4 Layers)',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 8000,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 4 }],
            result: { itemId: 'shirt_01', count: 1 },
            icon: 'fa-solid fa-layer-group'
        }
    },
    'pattern_secondary_01': {
        name: 'Pattern Style 1',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 0,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 1 }],
            result: { itemId: 'shirt_01', count: 1 },
            customData: {
                patternId: 'secondary_01',
                patternName: 'Style 01'
            }
        }
    },
    'pattern_secondary_02': {
        name: 'Pattern Style 2',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 0,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 1 }],
            result: { itemId: 'shirt_01', count: 1 },
            customData: {
                patternId: 'secondary_02',
                patternName: 'Style 02'
            }
        }
    },
    'pattern_secondary_03': {
        name: 'Pattern Style 3',
        virtual: true,
        recipe: {
            station: 'sewing_machine',
            time: 0,
            validateOnly: true,
            ingredients: [{ itemId: 'thread_wool_white', count: 1 }],
            result: { itemId: 'shirt_01', count: 1 },
            customData: {
                patternId: 'secondary_03',
                patternName: 'Style 03'
            }
        }
    }
};

