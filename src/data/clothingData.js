/**
 * clothingData.js
 * Definitions for clothing items, specifically their storage 'pockets'.
 * 
 * capacity: Max total size (sum of item sizes) this pocket can hold.
 */
module.exports = {
    'pants': {
        name: 'Blue Jeans',
        pockets: [
            { id: 'front_left', name: 'Front Left', capacity: 5 },
            { id: 'front_right', name: 'Front Right', capacity: 5 },
            { id: 'back_left', name: 'Back Left', capacity: 5 },
            { id: 'back_right', name: 'Back Right', capacity: 5 }
        ]
    },
    'shirt': {
        name: 'Pink Shirt', // Keeping consistent with existing texture names if possible
        pockets: [
            { id: 'breast_pocket', name: 'Front Pocket', capacity: 2 }
        ]
    },
    'shirt_01': {
        name: 'Plain T-Shirt',
        pockets: [
            { id: 'breast_pocket', name: 'Front Pocket', capacity: 2 }
        ]
    },
    // Add more clothing items as needed
    'backpack_01': {
        name: 'Explorer Backpack',
        pockets: [
            { id: 'main', name: 'Main Compartment', capacity: 20 },
            { id: 'small', name: 'Small Pouch', capacity: 5 }
        ]
    }
};
