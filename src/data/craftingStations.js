module.exports = {
    anvil: {
        title: "The Hearthside Forge",
        recipeBookTitle: "Blueprints",
        recipeSelectPrompt: "Select a Blueprint",
        inputLabel: "Crucible (Deposit Materials)",
        outputLabel: "Cooling Rack",
        buttonLabel: "Strike Iron",
        actionProgressLabel: "Forging...",
        defaultRecipeIcon: "fa-scroll",
        inputSlots: 6,
        theme: "theme-forge",
        modules: {
            recipeList: true,
            craftingInfo: true
        }
    },
    furnace: {
        title: "Smelter",
        recipeBookTitle: "Smelting Recipes",
        recipeSelectPrompt: "Select Ore",
        inputLabel: "Fuel & Ore Input",
        outputLabel: "Output Tray",
        buttonLabel: "Ignite",
        actionProgressLabel: "Smelting...",
        defaultRecipeIcon: "fa-fire",
        inputSlots: 3,
        theme: "theme-smelter",
        modules: {
            recipeList: false, // Hidden for furnace
            craftingInfo: true
        }
    },
    cocktail_bar: {
        title: "The Tipsy Tail",
        recipeBookTitle: "Menu",
        recipeSelectPrompt: "Select a Drink",
        inputLabel: "Mixing Glass",
        outputLabel: "Serving Counter",
        buttonLabel: "Mix Drink",
        actionProgressLabel: "Mixing...",
        defaultRecipeIcon: "fa-cocktail",
        inputSlots: 4,
        theme: "theme-cocktail",
        modules: {
            recipeList: true,
            craftingInfo: true
        }
    },
    juicer: {
        title: "Juicer",
        recipeBookTitle: "Juicing Recipes",
        recipeSelectPrompt: "Select a Fruit",
        inputLabel: "Fruit Input",
        outputLabel: "Output Tray",
        buttonLabel: "Juice",
        actionProgressLabel: "Juicing...",
        defaultRecipeIcon: "fa-cocktail",
        inputSlots: 1,
        theme: "theme-juicer",
        modules: {
            recipeList: false,
            craftingInfo: true
        }
    },
    distillery: {
        title: "Distillery",
        recipeBookTitle: "Distilling Recipes",
        recipeSelectPrompt: "Select a Fruit",
        inputLabel: "Fruit Input",
        outputLabel: "Output Tray",
        buttonLabel: "Distill",
        actionProgressLabel: "Distilling...",
        defaultRecipeIcon: "fa-cocktail",
        inputSlots: 1,
        theme: "theme-distillery",
        modules: {
            recipeList: false,
            craftingInfo: true
        }
    },
    spinning_wheel: {
        title: "Spinning Wheel",
        recipeBookTitle: "Spinning Recipes",
        recipeSelectPrompt: "Select a Fiber",
        inputLabel: "Fiber Input",
        outputLabel: "Output Tray",
        buttonLabel: "Spin",
        actionProgressLabel: "Spinning...",
        defaultRecipeIcon: "fa-cocktail",
        inputSlots: 2,
        theme: "theme-spinner",
        modules: {
            recipeList: true,
            craftingInfo: true
        }
    },
    sewing_machine: {
        title: "Sewing Machine",
        recipeBookTitle: "Sewing Recipes",
        recipeSelectPrompt: "Select a Fiber",
        inputLabel: "Fiber Input",
        outputLabel: "Output Tray",
        buttonLabel: "Sew",
        actionProgressLabel: "Sewing...",
        defaultRecipeIcon: "fa-cocktail",
        inputSlots: 4,
        theme: "theme-seamstress",
        modules: {
            recipeList: false,
            craftingInfo: false,
            type: 'sewing_custom'
        }
    },
    cauldron: {
        title: "Cauldron",
        recipeBookTitle: "Cauldron Recipes",
        recipeSelectPrompt: "Select a Ingredient",
        inputLabel: "Ingredient Input",
        outputLabel: "Output Tray",
        buttonLabel: "Brew",
        actionProgressLabel: "Brewing...",
        defaultRecipeIcon: "fa-cocktail",
        inputSlots: 1,
        theme: "theme-alchemy",
        modules: {
            recipeList: true,
            craftingInfo: true
        }
    },
};
