/**
 * itemData.js (ONLY EDIT THIS FILE WHEN CREATING OR CHANGING ITEMS)
 * Definitions for items, specifically their physical size.
 * Defaults to size 1 if not found.
 */
module.exports = {
    // Basic Items
    'apple': { size: 1, name: 'Apple' },
    'key': { size: 1, name: 'Key', icon: 'fa-key', texture: 'key' },
    'wallet': { size: 2, name: 'Wallet' },
    'phone': { size: 3, name: 'Smartphone' },
    'water_bottle': { size: 3, name: 'Water Bottle' },

    // Tools/Weapons
    'stick': { size: 4, name: 'Sturdy Stick' },
    'sword': { size: 10, name: 'Iron Sword' },

    // Crafting Items
    'ore_iron': { size: 2, name: 'Iron Ore', icon: 'fa-gem', texture: 'ore_iron' },
    'ingot_iron': { size: 2, name: 'Iron Ingot', icon: 'fa-cube', texture: 'ingot_iron' },

    // Drinkware
    'glass': { size: 1, name: 'Glass', icon: 'fa-glass-whiskey', texture: 'glass' },
    'glass_ale': { size: 1, name: 'Ale Glass', icon: 'fa-glass-whiskey', texture: 'glass_ale' },
    'glass_wine': { size: 1, name: 'Wine Glass', icon: 'fa-glass-whiskey', texture: 'glass_wine' },
    'glass_whiskey': { size: 1, name: 'Whiskey Glass', icon: 'fa-glass-whiskey', texture: 'glass_whiskey' },
    'glass_beer': { size: 1, name: 'Beer Glass', icon: 'fa-glass-whiskey', texture: 'glass_beer' },

    // Drink Bottles
    'bottle_ale': { size: 1, name: 'Ale Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_ale' },
    'bottle_wine': { size: 1, name: 'Wine Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_wine' },
    'bottle_whiskey': { size: 1, name: 'Whiskey Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_whiskey' },
    'bottle_beer': { size: 1, name: 'Beer Bottle', icon: 'fa-glass-whiskey', texture: 'bottle_beer' },

    // Default
    'default': { size: 1, name: 'Unknown Object' },

    // Food
    'food_orange': { size: 1, name: 'Orange', icon: 'fa-apple-whole', texture: 'food_orange' },
    'food_potato': { size: 1, name: 'Potato', icon: 'fa-apple-whole', texture: 'food_potato' },

    // Fibers
    'fiber_wool': { size: 1, name: 'Wool Fiber', icon: 'fa-apple-whole', texture: 'fiber_wool' },

    // Dye precursors
    'indigo': { size: 1, name: 'Indigo', icon: 'fa-apple-whole', texture: 'indigo' },


    // Special
    'alpha_bottle': {
        size: 3,
        name: 'Alpha Bottle',
        icon: 'fa-tint',
        texture: 'alpha_bottle',
        maxUses: 9,
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
        maxUses: 10,
        isDynamic: true,
        color: 0xFFFFFF,
        verb: 'wear',
        flavor: 'cloth',
        description: 'A simple plain t-shirt.',
        pockets: [
            { id: 'breast_pocket', name: 'Front Pocket', capacity: 2 }
        ]
    }
};

