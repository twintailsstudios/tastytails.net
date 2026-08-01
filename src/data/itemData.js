/**
 * @fileoverview Master Static Item Compendium (itemData.js)
 * 
 * @description
 * Single Source of Truth (SSOT) static item registry for TastyTails.net.
 * Defines item dimensions, FontAwesome icons, Phaser textures, crafting recipes,
 * multi-layered visual component tinting, ground hazards, and clothing metadata.
 * 
 * Synchronized to client build via: scripts/sync-items.js
 * 
 * IMPORTANT: ONLY EDIT THIS FILE WHEN CREATING OR CHANGING ITEMS.
 * Do not edit src/client/js/game/itemData.js directly.
 */

/**
 * OPTIMIZATION: Recursively deep-freezes static item definitions and sub-schemas
 * (recipes, rendering, pockets) to enforce state immutability and prevent accidental
 * dynamic property mutations at runtime across server and client sessions.
 * 
 * @param {Object} obj - Target item dictionary or schema object
 * @returns {Object} Deeply frozen immutable object
 */
function deepFreeze(obj) {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
        Object.keys(obj).forEach(prop => {
            if (typeof obj[prop] === 'object' && obj[prop] !== null) {
                deepFreeze(obj[prop]);
            }
        });
        Object.freeze(obj);
    }
    return obj;
}

const itemData = {
    // Basic Items
    'key': { size: 1, name: 'Key', icon: 'fa-key', texture: 'key' },
    'scroll_01': { size: 1, name: 'Test Scroll', icon: 'fa-scroll', texture: 'scroll2', description: 'A testing scroll.' },

    // Tools/Weapons
    'stick': { size: 4, name: 'Sturdy Stick', icon: 'fa-solid fa-tree' },

    // Crafting Items
    'ore_iron': { size: 2, name: 'Iron Ore', icon: 'fa-solid fa-gem', texture: 'ore_iron', flavor: `Hard and metallic`, description: `A chunk of iron ore.`, verb: 'use', maxUses: 1, playerUse: false },
    'ingot_iron': {
        size: 2,
        name: 'Iron Ingot',
        icon: 'fa-solid fa-cubes',
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

    // Ground Hazard Traps (Environmental Step Damage)
    'debug_ground_bleedDamage': {
        size: 1,
        name: 'Sharp Ground Shards',
        icon: 'fa-solid fa-droplet',
        texture: 'debug_ground_bleedDamage',
        description: 'Sharp glass shards on the ground that cut the feet of anyone stepping on them.',
        preventPickup: true,
        damageOnStep: {
            amount: 15,
            damageType: 'slash',
            targetPart: null, // Auto-selects leftFoot or rightFoot randomly
            cooldownMs: 1500,
            stepMessage: 'You stepped on sharp shards and cut your foot!'
        }
    },
    'debug_ground_burnDamage': {
        size: 1,
        name: 'Smoldering Embers',
        icon: 'fa-solid fa-fire',
        texture: 'debug_ground_burnDamage',
        description: 'Smoldering hot embers on the ground that burn the feet of anyone stepping on them.',
        preventPickup: true,
        damageOnStep: {
            amount: 15,
            damageType: 'burn',
            targetPart: null, // Auto-selects leftFoot or rightFoot randomly
            cooldownMs: 1500,
            stepMessage: 'You stepped on smoldering embers and burned your foot!'
        }
    },

    // Remedy Items (Handheld & Interactive Remedies)
    'debug_bandage': {
        size: 1,
        name: 'Linen Bandage',
        icon: 'fa-solid fa-bandage',
        texture: 'debug_bandage',
        description: 'Clean linen bandages used to seal cuts and stop active bleeding.',
        verb: 'apply',
        maxUses: 3,
        playerUse: true,
        isDynamic: true,
        remedyType: 'bandage'
    },
    'bandage': {
        size: 1,
        name: 'Linen Bandage',
        icon: 'fa-solid fa-bandage',
        texture: 'debug_bandage',
        description: 'Clean linen bandages used to seal cuts and stop active bleeding.',
        verb: 'apply',
        maxUses: 3,
        playerUse: true,
        isDynamic: true,
        remedyType: 'bandage'
    },
    'debug_salve': {
        size: 1,
        name: 'Sovereign Salve',
        icon: 'fa-solid fa-jar',
        texture: 'debug_salve',
        description: 'Soothing medicinal salve used to heal thermal burns.',
        verb: 'apply',
        maxUses: 3,
        playerUse: true,
        isDynamic: true,
        remedyType: 'salve'
    },
    'salve': {
        size: 1,
        name: 'Sovereign Salve',
        icon: 'fa-solid fa-jar',
        texture: 'debug_salve',
        description: 'Soothing medicinal salve used to heal thermal burns.',
        verb: 'apply',
        maxUses: 3,
        playerUse: true,
        isDynamic: true,
        remedyType: 'salve'
    },

    // Default
    'default': { size: 1, name: 'Unknown Object', icon: 'fa-solid fa-box-open' },

    // Food
    'food_orange': { size: 1, name: 'Orange', icon: 'fa-solid fa-apple-whole', texture: 'food_orange', flavor: `Tangy and sweet`, description: `A juicy orange.`, verb: 'eat', maxUses: 1, playerUse: true, isDynamic: true },
    'food_potato': { size: 1, name: 'Potato', icon: 'fa-solid fa-egg', texture: 'food_potato', flavor: `Starchy and savory`, description: `A rich potato.`, verb: 'eat', maxUses: 1, playerUse: true, isDynamic: true },

    // Tools
    'tool_sheers': {
        size: 1,
        name: 'Sheers',
        icon: 'fa-solid fa-scissors',
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
            icon: 'fa-solid fa-scissors'
        }
    },
    'tool_pickaxe': {
        size: 1,
        name: 'Pickaxe',
        icon: 'fa-solid fa-hammer',
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
            icon: 'fa-solid fa-hammer'
        }
    },
    'tool_hoe': {
        size: 1,
        name: 'Hoe',
        icon: 'fa-solid fa-trowel',
        texture: 'hoe',
        flavor: `Tastes like metal`,
        description: `Big heavy hoe`,
        verb: 'use',
        maxUses: 1,
        playerUse: false,
        recipe: {
            station: 'anvil',
            time: 5000,
            ingredients: [
                { itemId: 'ingot_iron', count: 2 }
            ],
            icon: 'fa-solid fa-trowel'
        }
    },
    'tool_watering_can': {
        size: 1,
        name: 'Watering Can',
        icon: 'fa-solid fa-faucet-drip',
        texture: 'watering_can',
        flavor: `Tastes like water`,
        description: `A watering can`,
        verb: 'use',
        maxUses: 1,
        playerUse: false,
        recipe: {
            station: 'anvil',
            time: 5000,
            ingredients: [
                { itemId: 'ingot_iron', count: 2 }
            ],
            icon: 'fa-solid fa-faucet-drip'
        }
    },

    // Fibers
    'fiber_wool': { size: 1, name: 'Wool Fiber', icon: 'fa-solid fa-cloud', texture: 'fiber_wool', flavor: `Soft and warm`, description: `A roll of wool fiber.`, verb: 'use', maxUses: 1, playerUse: false },

    // Dye precursors
    'indigo': { size: 1, name: 'Indigo', icon: 'fa-solid fa-leaf', texture: 'indigo', flavor: `Pungent`, description: `A roll of indigo fiber.`, verb: 'use', maxUses: 1, playerUse: false },
    'madder_root': { size: 1, name: 'Madder Root', icon: 'fa-solid fa-carrot', texture: 'madder_root', flavor: `Pungent`, description: `A roll of madder root fiber.`, verb: 'use', maxUses: 1, playerUse: false },
    'weld': { size: 1, name: 'Weld', icon: 'fa-solid fa-wheat-awn', texture: 'weld', flavor: `Pungent`, description: `A roll of weld fiber.`, verb: 'use', maxUses: 1, playerUse: false },



    // Farming Seeds
    'seed_indigo': { size: 1, name: 'Indigo Seed', icon: 'fa-seedling', texture: 'seed_indigo', flavor: 'Smells of dirt', description: 'Planted to grow indigo.' },
    'seed_madder_root': { size: 1, name: 'Madder Root Seed', icon: 'fa-seedling', texture: 'seed_madder_root', flavor: 'Smells of dirt', description: 'Planted to grow madder root.' },
    'seed_weld': { size: 1, name: 'Weld Seed', icon: 'fa-seedling', texture: 'seed_weld', flavor: 'Smells of dirt', description: 'Planted to grow weld.' },
    'seed_potato': { size: 1, name: 'Potato Seed', icon: 'fa-seedling', texture: 'seed_potato', flavor: 'Smells of dirt', description: 'Planted to grow potato.' },

    // Farming Soils
    'tilled_soil_dry': { size: 1, name: 'Tilled Soil', icon: 'fa-seedling', texture: 'tilled_soil_dry', flavor: 'Dry soil', description: 'Needs watering before planting.', preventPickup: true, isGround: true },
    'tilled_soil_watered': { size: 1, name: 'Watered Tilled Soil', icon: 'fa-seedling', texture: 'tilled_soil_watered', flavor: 'Wet soil', description: 'Ready for planting.', preventPickup: true, isGround: true },
    'tilled_soil_planted': { size: 1, name: 'Planted Tilled Soil', icon: 'fa-seedling', texture: 'tilled_soil_planted', flavor: 'Wet soil with seed', description: 'A seed is growing here.', preventPickup: true, isGround: true },

    // Farming Plant Textures (Simple definitions to ensure textures load)
    'plant_indigo': { size: 1, name: 'Indigo Plant Texture', icon: 'fa-seedling', texture: 'plant_indigo', preventPickup: true },
    'plant_madder_root': { size: 1, name: 'Madder Root Plant Texture', icon: 'fa-seedling', texture: 'plant_madder_root', preventPickup: true },
    'plant_weld': { size: 1, name: 'Weld Plant Texture', icon: 'fa-seedling', texture: 'plant_weld', preventPickup: true },
    'plant_potato': { size: 1, name: 'Potato Plant Texture', icon: 'fa-seedling', texture: 'plant_potato', preventPickup: true },


    // Special
    'alpha_bottle': {
        size: 3,
        name: 'Alpha Bottle',
        icon: 'fa-tint',
        texture: 'alpha_bottle',
        maxUses: 9,
        playerUse: true,
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
        maxUses: 9,
        playerUse: false,
        isDynamic: true,
        color: 0xFFC0CB,
        verb: 'use',
        flavor: 'pungent',
        description: 'A bottle of dye',
        rendering: {
            type: 'layered',
            layers: [
                { frameOffset: 0 }, // Layer 0: Bottle Base (Frames 0-9)
                { frameOffset: 10, tintParam: 'color', interactive: true } // Layer 1: Liquid Overlay (Frames 10-18)
            ]
        }
    },
    'alpha_thread': {
        size: 1,
        name: 'Alpha Thread',
        icon: 'fa-tint',
        texture: 'alpha_thread',
        maxUses: 9,
        playerUse: false,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'unspool',
        flavor: 'cloth',
        description: 'A roll of thread',
        rendering: {
            type: 'layered',
            layers: [
                { frameOffset: 0 }, // Layer 0: Spool Base (Frames 0-9)
                { frameOffset: 10, tintParam: 'color', interactive: true } // Layer 1: Wool Overlay (Frames 10-18)
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
        icon: 'fa-solid fa-shirt',
        maxUses: 1,
        playerUse: false,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'wear',
        flavor: 'cloth',
        description: 'A simple plain t-shirt.',
        secondaryPatterns: [
            { id: 'secondary_01', name: 'Shirt Pattern 1' },
            { id: 'secondary_02', name: 'Shirt Pattern 2' },
            { id: 'secondary_03', name: 'Shirt Pattern 3' }
        ],
        pockets: [
            { id: 'breast_pocket', name: 'Front Pocket', capacity: 2 }
        ],
        recipe: {
            station: 'sewing_machine',
            time: 5000,
            icon: 'fa-solid fa-shirt',
            ingredients: [
                { itemId: 'thread_wool_white', count: 1, usesConsumed: 2 }
            ],
            customData: {
                baseShape: 'shirt_01',
                baseName: 'T-Shirt'
            }
        }
    },
    'pants_01': {
        name: 'Plain Pants',
        equipSlot: 'legs',
        isItem: true,
        itemId: 'pants_01',
        itemType: 'clothing',
        texture: 'pants_01',
        icon: 'fa-solid fa-socks',
        maxUses: 1,
        playerUse: false,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'wear',
        flavor: 'cloth',
        description: 'A simple plain pants.',
        secondaryPatterns: [
            { id: 'secondary_01', name: 'Pants Pattern 1' },
            { id: 'secondary_02', name: 'Pants Pattern 2' },
            { id: 'secondary_03', name: 'Pants Pattern 3' }
        ],
        pockets: [
            { id: 'front_left', name: 'Front Left', capacity: 5 },
            { id: 'front_right', name: 'Front Right', capacity: 5 },
            { id: 'back_left', name: 'Back Left', capacity: 5 },
            { id: 'back_right', name: 'Back Right', capacity: 5 }
        ],
        recipe: {
            station: 'sewing_machine',
            time: 5000,
            icon: 'fa-solid fa-shirt',
            ingredients: [
                { itemId: 'thread_wool_white', count: 1, usesConsumed: 3 }
            ],
            customData: {
                baseShape: 'pants_01',
                baseName: 'Pants'
            }
        }
    },
    'skirt_01': {
        name: 'Plain Skirt',
        equipSlot: 'legs',
        isItem: true,
        itemId: 'skirt_01',
        itemType: 'clothing',
        texture: 'skirt_01',
        icon: 'fa-solid fa-socks',
        maxUses: 1,
        playerUse: false,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'wear',
        flavor: 'cloth',
        description: 'A simple plain skirt.',
        secondaryPatterns: [
            { id: 'secondary_01', name: 'Skirt Pattern 1' },
            { id: 'secondary_02', name: 'Skirt Pattern 2' },
            { id: 'secondary_03', name: 'Skirt Pattern 3' }
        ],
        pockets: [
            { id: 'front_left', name: 'Front Left', capacity: 5 },
            { id: 'front_right', name: 'Front Right', capacity: 5 },
            { id: 'back_left', name: 'Back Left', capacity: 5 },
            { id: 'back_right', name: 'Back Right', capacity: 5 }
        ],
        recipe: {
            station: 'sewing_machine',
            time: 5000,
            icon: 'fa-solid fa-shirt',
            ingredients: [
                { itemId: 'thread_wool_white', count: 1, usesConsumed: 3 }
            ],
            customData: {
                baseShape: 'skirt_01',
                baseName: 'Skirt'
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
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0xCACCC6,
        variant: 'thread_wool_white',
        flavor: 'tastes like wool.',
        description: 'Pure white, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
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
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0x0000FF,
        variant: 'thread_wool_blue',
        flavor: 'tastes like wool.',
        description: 'Blue, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_blue', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_red': {
        size: 1,
        name: 'Red Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0xFF0000,
        variant: 'thread_wool_red',
        flavor: 'tastes like wool.',
        description: 'Red, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_red', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_yellow': {
        size: 1,
        name: 'Yellow Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0xFFFF00,
        variant: 'thread_wool_yellow',
        flavor: 'tastes like wool.',
        description: 'Yellow, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_yellow', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_green': {
        size: 1,
        name: 'Green Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0x00FF00,
        variant: 'thread_wool_green',
        flavor: 'tastes like wool.',
        description: 'Green, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_green', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_orange': {
        size: 1,
        name: 'Orange Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0xFF8000,
        variant: 'thread_wool_orange',
        flavor: 'tastes like wool.',
        description: 'Orange, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_orange', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_purple': {
        size: 1,
        name: 'Purple Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0x800080,
        variant: 'thread_wool_purple',
        flavor: 'tastes like wool.',
        description: 'Purple, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_purple', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_teal': {
        size: 1,
        name: 'Teal Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0x008080,
        variant: 'thread_wool_teal',
        flavor: 'tastes like wool.',
        description: 'Teal, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_teal', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_lime': {
        size: 1,
        name: 'Lime Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0x80FF00,
        variant: 'thread_wool_lime',
        flavor: 'tastes like wool.',
        description: 'Lime, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_lime', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'thread_wool_amber': {
        size: 1,
        name: 'Amber Wool Thread',
        icon: 'fa-solid fa-scroll',
        texture: 'alpha_thread',
        maxUses: 9,
        isDynamic: true,
        color: 0xFFBF00,
        variant: 'thread_wool_amber',
        flavor: 'tastes like wool.',
        description: 'Amber, soft, warm, and fiberous thread',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'spinning_wheel',
            time: 1000,
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'dye_amber', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'dye_blue': {
        size: 1,
        name: 'Blue Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0x0000FF,
        variant: 'dye_blue',
        flavor: 'tastes like blue.',
        description: 'A blue dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'cauldron',
            time: 1000,
            ingredients: [
                { itemId: 'indigo', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'dye_red': {
        size: 1,
        name: 'Red Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0xFF0000,
        variant: 'dye_red',
        flavor: 'tastes like red.',
        description: 'A red dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'cauldron',
            time: 1000,
            ingredients: [
                { itemId: 'madder_root', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'dye_yellow': {
        size: 1,
        name: 'Yellow Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0xFFFF00,
        variant: 'dye_yellow',
        flavor: 'tastes like yellow.',
        description: 'A yellow dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'cauldron',
            time: 1000,
            ingredients: [
                { itemId: 'weld', count: 1, usesConsumed: 1 }
            ]
        }
    },
    'dye_green': {
        size: 1,
        name: 'Green Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0x00FF00,
        variant: 'dye_green',
        flavor: 'A lush green dye distilled from blue and yellow pigments.',
        description: 'A green dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'alembic',
            time: 2000,
            ingredients: [
                { itemId: 'dye_blue', count: 1, usesConsumed: 5 },
                { itemId: 'dye_yellow', count: 1, usesConsumed: 5 }
            ]
        }
    },
    'dye_orange': {
        size: 1,
        name: 'Orange Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0xFF8000,
        variant: 'dye_orange',
        flavor: 'A warm orange dye distilled from red and yellow pigments.',
        description: 'An orange dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'alembic',
            time: 2000,
            ingredients: [
                { itemId: 'dye_red', count: 1, usesConsumed: 5 },
                { itemId: 'dye_yellow', count: 1, usesConsumed: 5 }
            ]
        }
    },
    'dye_purple': {
        size: 1,
        name: 'Purple Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0x800080,
        variant: 'dye_purple',
        flavor: 'A regal purple dye distilled from red and blue pigments.',
        description: 'A purple dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'alembic',
            time: 2000,
            ingredients: [
                { itemId: 'dye_red', count: 1, usesConsumed: 5 },
                { itemId: 'dye_blue', count: 1, usesConsumed: 5 }
            ]
        }
    },
    'dye_teal': {
        size: 1,
        name: 'Teal Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0x008080,
        variant: 'dye_teal',
        flavor: 'A deep teal dye distilled from 7 parts blue and 3 parts yellow.',
        description: 'A teal dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'alembic',
            time: 2000,
            ingredients: [
                { itemId: 'dye_blue', count: 1, usesConsumed: 7 },
                { itemId: 'dye_yellow', count: 1, usesConsumed: 3 }
            ]
        }
    },
    'dye_lime': {
        size: 1,
        name: 'Lime Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0x80FF00,
        variant: 'dye_lime',
        flavor: 'A bright lime dye distilled from 7 parts yellow and 3 parts blue.',
        description: 'A lime dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'alembic',
            count: 1,
            ingredients: [
                { itemId: 'dye_yellow', count: 1, usesConsumed: 7 },
                { itemId: 'dye_blue', count: 1, usesConsumed: 3 }
            ]
        }
    },
    'dye_amber': {
        size: 1,
        name: 'Amber Dye',
        icon: 'fa-solid fa-bottle-droplet',
        texture: 'alpha_dye',
        maxUses: 9,
        isDynamic: true,
        color: 0xFFBF00,
        variant: 'dye_amber',
        flavor: 'A golden amber dye distilled from 7 parts yellow and 3 parts red.',
        description: 'An amber dye.',
        rendering: { type: 'layered', layers: [{ frameOffset: 0 }, { frameOffset: 10, tintParam: 'color', interactive: true }] },
        recipe: {
            station: 'alembic',
            time: 2000,
            ingredients: [
                { itemId: 'dye_yellow', count: 1, usesConsumed: 7 },
                { itemId: 'dye_red', count: 1, usesConsumed: 3 }
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
    }
};

module.exports = deepFreeze(itemData);

