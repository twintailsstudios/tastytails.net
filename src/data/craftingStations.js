/**
 * @fileoverview craftingStations.js - Authoritative Crafting Station Registry
 * 
 * @description
 * Defines UI titles, button labels, FontAwesome icon defaults, slot capacities,
 * and CSS themes for all crafting station types across TastyTails.net.
 * 
 * Invoked by:
 * - src/server-loop.js (Station slot limits & client payload construction)
 * - src/sockets/craftingHandlers.js (Server-side input validation & socket payload)
 * - src/client/js/game/crafting.js (Dynamic UI modal rendering & CSS skinning)
 */

/**
 * @typedef {Object} StationModuleConfig
 * @property {boolean} [recipeList] - Toggles visibility of the left-hand recipe selection list sidebar.
 * @property {boolean} [craftingInfo] - Toggles visibility of the recipe preview & requirement info panel.
 * @property {string} [type] - Custom module renderer identifier (e.g. 'sewing_custom').
 */

/**
 * @typedef {Object} CraftingStationConfig
 * @property {string} title - Window header title string.
 * @property {string} recipeBookTitle - Recipe sidebar header title string.
 * @property {string} recipeSelectPrompt - Placeholder instruction prompt text.
 * @property {string} inputLabel - Header label for the input crucible container.
 * @property {string} outputLabel - Header label for the output cooling rack container.
 * @property {string} buttonLabel - Primary action button text.
 * @property {string} actionProgressLabel - Status label shown during active crafting progress.
 * @property {string} defaultRecipeIcon - FontAwesome icon class fallback.
 * @property {number} inputSlots - Maximum allowed input inventory slots (validated on server).
 * @property {string} theme - Root CSS theme class name (e.g. 'theme-forge').
 * @property {StationModuleConfig} modules - Structural UI module flags.
 */

// OPTIMIZATION: Object.freeze guarantees runtime immutability and prevents accidental global state pollution across player sockets.
/** @type {Object.<string, CraftingStationConfig>} */
const craftingStations = Object.freeze({

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
        recipeSelectPrompt: "Select an Ingredient",
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
});

module.exports = craftingStations;

