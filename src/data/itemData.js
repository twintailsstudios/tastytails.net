/**
 * itemData.js
 * Definitions for items, specifically their physical size.
 * Defaults to size 1 if not found.
 */
module.exports = {
    // Basic Items
    'apple': { size: 1, name: 'Apple' },
    'key': { size: 1, name: 'Key' },
    'wallet': { size: 2, name: 'Wallet' },
    'phone': { size: 3, name: 'Smartphone' },
    'water_bottle': { size: 3, name: 'Water Bottle' },

    // Tools/Weapons
    'stick': { size: 4, name: 'Sturdy Stick' },
    'sword': { size: 10, name: 'Iron Sword' },

    // Special
    'default': { size: 1, name: 'Unknown Object' }
};
