module.exports = {
    anvil: [
        {
            id: 'iron_sword',
            name: 'Iron Sword',
            description: 'A standard iron sword.',
            ingredients: [
                { itemId: 'ingot_iron', count: 3 }
            ],
            result: { itemId: 'weapon_iron_sword', count: 1 },
            time: 5000, // 5 seconds
            icon: 'fa-solid fa-khanda' // FontAwesome icon for UI
        },
        {
            id: 'iron_dagger',
            name: 'Iron Dagger',
            description: 'A small but sharp dagger.',
            ingredients: [
                { itemId: 'ingot_iron', count: 1 }
            ],
            result: { itemId: 'weapon_iron_dagger', count: 1 },
            time: 3000,
            icon: 'fa-solid fa-syringe' // Placeholder
        }
    ],
    furnace: [
        {
            id: 'ingot_iron',
            name: 'Iron Ingot',
            description: 'A solid ingot of iron.',
            ingredients: [
                { itemId: 'ore_iron', count: 1 }
            ],
            result: { itemId: 'ingot_iron', count: 1 },
            time: 5000,
            icon: 'fa-solid fa-smithing' // FontAwesome icon for UI
        }
    ],
    cocktail_bar: [
        {
            id: 'cocktail_screwdriver',
            name: 'Screwdriver',
            description: 'The sweet tang of orange with a bit of a kick~',
            ingredients: [
                { itemId: 'alpha_bottle', count: 1, customData: { variant: 'vodka' } },
                { itemId: 'alpha_bottle', count: 1, customData: { variant: 'orange_juice' } }
            ],
            result: {
                itemId: 'alpha_bottle',
                count: 1,
                customData: {
                    name: 'Screwdriver',
                    variant: 'screwdriver',
                    icon: 'fa-cocktail',
                    color: 0xFFD700, // Gold/Yellow
                    flavor: 'A classic mix of vodka and orange juice.',
                    description: 'A simple but effective cocktail.',
                    rendering: {
                        type: 'layered',
                        layers: [
                            { frameOffset: 10, tintParam: 'color' },
                            { frameOffset: 0, interactive: true }
                        ]
                    }
                }
            },
            time: 1500,
            icon: 'fa-solid fa-cocktail' // FontAwesome icon for UI
        }
    ],
    juicer: [
        {
            id: 'juice_orange',
            name: 'Orange Juice',
            description: 'Freshly squeezed orange juice.',
            ingredients: [
                { itemId: 'food_orange', count: 1 }
            ],
            result: {
                itemId: 'alpha_bottle',
                count: 1,
                customData: {
                    name: 'Bottled Orange Juice',
                    description: 'Freshly squeezed orange juice.',
                    flavor: 'The sweet tang of orange.',
                    icon: 'fa-glass-whiskey',
                    variant: 'orange_juice',
                    color: 0xFFA500,
                    rendering: { type: 'layered', layers: [{ frameOffset: 12, tintParam: 'color' }, { frameOffset: 0 }] }
                }
            },
            time: 1000,
            icon: 'fa-solid fa-glass-citrus'
        }
    ],
    distillery: [
        {
            id: 'vodka',
            ingredients: [
                { itemId: 'food_potato', count: 1 }
            ],
            result: {
                itemId: 'alpha_bottle',
                count: 1,
                customData: {
                    name: 'Bottled Vodka',
                    variant: 'vodka', // Critical for ingredient matching
                    icon: 'fa-wine-bottle',
                    color: 0xCACCC6, // Vodka hex color
                    flavor: 'The burning flavor of vodka.',
                    description: 'A hard-hitting bottle of vodka.',
                    rendering: {
                        type: 'layered',
                        layers: [
                            { frameOffset: 10, tintParam: 'color' }, // Liquid (Bottom) uses the new color
                            { frameOffset: 0, interactive: true }    // Bottle (Top)
                        ]
                    }
                }
            },
            time: 1000
        }
    ],
    spinning_wheel: [
        {
            id: 'thread_wool_white',
            name: 'White Wool Thread',
            description: 'A thread made from wool.',
            ingredients: [
                { itemId: 'fiber_wool', count: 1 }
            ],
            result: {
                itemId: 'alpha_thread',
                count: 1,
                customData: {
                    name: 'White Wool Thread',
                    variant: 'thread_wool_white', // Critical for ingredient matching
                    icon: 'fa-scroll',
                    color: 0xCACCC6, // Vodka hex color
                    flavor: 'tastes like wool.',
                    description: 'Pure white, soft, warm, and fiberous thread',
                    rendering: {
                        type: 'layered',
                        layers: [
                            { frameOffset: 10, tintParam: 'color' }, // Threads (Bottom) uses the new color
                            { frameOffset: 0, interactive: true }    // Spool (Top)
                        ]
                    }
                }
            },
            time: 1000
        },
        {
            id: 'thread_wool_blue',
            name: 'Blue Wool Thread',
            description: 'A deep blue thread made from wool.',
            ingredients: [
                { itemId: 'fiber_wool', count: 1 },
                { itemId: 'alpha_dye', count: 1, customData: { variant: 'dye_blue' } }
            ],
            result: {
                itemId: 'alpha_thread',
                count: 1,
                customData: {
                    name: 'Blue Wool Thread',
                    variant: 'thread_wool_blue', // Critical for ingredient matching
                    icon: 'fa-scroll',
                    color: 0x0000FF, // Blue Thread hex color
                    flavor: 'tastes like wool.',
                    description: 'Blue, soft, warm, and fiberous thread',
                    rendering: {
                        type: 'layered',
                        layers: [
                            { frameOffset: 10, tintParam: 'color' }, // Threads (Bottom) uses the new color
                            { frameOffset: 0, interactive: true }    // Spool (Top)
                        ]
                    }
                }
            },
            time: 1000
        }
    ],
    sewing_machine: [
        {
            id: 'sewing_shirt',
            name: 'Plain T-Shirt',
            // This recipe serves as a "Base Definition" for the UI.
            // Expected ingredients: 1 Thread (Base).
            ingredients: [
                { itemId: 'alpha_thread', count: 1 }
            ],
            result: {
                itemId: 'shirt_01',
                count: 1
            },
            time: 5000,
            icon: 'fa-solid fa-shirt',
            customData: {
                baseShape: 'shirt', // Used by SewingModule to identify as a base
                baseName: 'T-Shirt'
            }
        },
        // Generic Layer Recipes (Used for validation of N-thread crafts)
        {
            id: 'sewing_1_layer',
            name: 'Sewing (1 Layer)',
            ingredients: [{ itemId: 'alpha_thread', count: 1 }],
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 5000,
            validateOnly: true, // Flag for module
            icon: 'fa-solid fa-layer-group'
        },
        {
            id: 'sewing_2_layer',
            name: 'Sewing (2 Layers)',
            ingredients: [{ itemId: 'alpha_thread', count: 2 }],
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 6000,
            validateOnly: true,
            icon: 'fa-solid fa-layer-group'
        },
        {
            id: 'sewing_3_layer',
            name: 'Sewing (3 Layers)',
            ingredients: [{ itemId: 'alpha_thread', count: 3 }],
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 7000,
            validateOnly: true,
            icon: 'fa-solid fa-layer-group'
        },
        {
            id: 'sewing_4_layer',
            name: 'Sewing (4 Layers)',
            ingredients: [{ itemId: 'alpha_thread', count: 4 }],
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 8000,
            validateOnly: true,
            icon: 'fa-solid fa-layer-group'
        },
        // Pattern Definitions
        {
            id: 'pattern_secondary_01',
            name: 'Pattern Style 1',
            ingredients: [{ itemId: 'alpha_thread', count: 1 }], // Dummy ingredient
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 0,
            validateOnly: true, // Only for UI population
            customData: {
                patternId: 'secondary_01',
                patternName: 'Style 01'
            }
        },
        {
            id: 'pattern_secondary_02',
            name: 'Pattern Style 2',
            ingredients: [{ itemId: 'alpha_thread', count: 1 }],
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 0,
            validateOnly: true,
            customData: {
                patternId: 'secondary_02',
                patternName: 'Style 02'
            }
        },
        {
            id: 'pattern_secondary_03',
            name: 'Pattern Style 3',
            ingredients: [{ itemId: 'alpha_thread', count: 1 }],
            result: { itemId: 'alpha_shirt', count: 1 },
            time: 0,
            validateOnly: true,
            customData: {
                patternId: 'secondary_03',
                patternName: 'Style 03'
            }
        }
    ],
    cauldron: [
        {
            id: `dye_blue`,
            name: 'Blue Dye',
            description: 'A blue dye.',
            ingredients: [
                { itemId: 'indigo', count: 1 }
            ],
            result: {
                itemId: 'alpha_dye',
                count: 1,
                customData: {
                    name: 'Blue Dye',
                    variant: 'dye_blue', // Critical for ingredient matching
                    icon: 'fa-scroll',
                    color: 0x0000FF, // Blue hex color
                    flavor: 'tastes like blue.',
                    description: 'A blue dye.',
                    rendering: {
                        type: 'layered',
                        layers: [
                            { frameOffset: 10, tintParam: 'color' }, // Dye (Bottom) uses the new color
                            { frameOffset: 0, interactive: true }    // Cauldron (Top)
                        ]
                    }
                }
            },
            time: 1000
        }
    ],
    // Add other stations here later
    sample: []
};
