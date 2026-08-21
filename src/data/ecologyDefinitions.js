/**
 * @fileoverview ecologyDefinitions.js - Canonical Data Registry for Ecological Spawning
 * @subsystem World Generation & NPC Dietary Ecology
 * @description
 * Defines weighted flora spawn tables, nutritional values for herbivore grazing,
 * player harvesting items/tools, and fauna population pools for painted map zones
 * (`plantZone`, `herbivoreZone`, `carnivoreZone`).
 */

module.exports = {
  // =========================================================================
  // VEGETATION & FLORA SPAWN POOL (plantZone)
  // =========================================================================
  floraPool: {
    flora_tall_grass: {
      id: "flora_tall_grass",
      name: "Wild Tall Grass",
      description: "Lush, fibrous meadow grass favored by grazing woodland animals.",
      texture: "flora_tall_grass",
      weight: 35, // 35% probability
      maxCapacity: 1,
      nutritionValue: 20, // Replenishes 20 hunger to herbivores
      harvestItem: "fiber_plant",
      harvestTool: "none",
      isGround: true,
      gatherable: true,
      respawnCooldown: 60 // Seconds until relocation respawn
    },
    flora_clover: {
      id: "flora_clover",
      name: "White Clover Patch",
      description: "A cluster of sweet clover blossoms rich in nutrients.",
      texture: "flora_clover",
      weight: 20, // 20% probability
      maxCapacity: 1,
      nutritionValue: 25,
      harvestItem: "clover_leaf",
      rareDrop: { itemId: "four_leaf_clover", chance: 0.05 },
      harvestTool: "none",
      isGround: true,
      gatherable: true,
      respawnCooldown: 60
    },
    flora_dandelion: {
      id: "flora_dandelion",
      name: "Yellow Dandelion",
      description: "A bright yellow bloom edible by herbivores and prized for yellow pigments.",
      texture: "flora_dandelion",
      weight: 15, // 15% probability
      maxCapacity: 1,
      nutritionValue: 20,
      harvestItem: "flower_dandelion",
      harvestTool: "none",
      isGround: true,
      gatherable: true,
      respawnCooldown: 60
    },
    flora_flower_1: {
      id: "flora_flower_1",
      name: "Red Poppy",
      description: "A delicate crimson wildflower containing vibrant red dye pigments.",
      texture: "flora_flower_1",
      weight: 7, // 7% probability
      maxCapacity: 1,
      nutritionValue: 15,
      harvestItem: "petal_red",
      harvestTool: "none",
      isGround: true,
      gatherable: true,
      respawnCooldown: 75
    },
    flora_flower_2: {
      id: "flora_flower_2",
      name: "Blue Starflower",
      description: "A rare indigo-blue wildflower that flourishes in shaded clearings.",
      texture: "flora_flower_2",
      weight: 7, // 7% probability
      maxCapacity: 1,
      nutritionValue: 15,
      harvestItem: "petal_blue",
      harvestTool: "none",
      isGround: true,
      gatherable: true,
      respawnCooldown: 75
    },
    flora_flower_3: {
      id: "flora_flower_3",
      name: "Yellow Marigold",
      description: "A sunny golden marigold known for sweet nectar and herbal remedies.",
      texture: "flora_flower_3",
      weight: 6, // 6% probability
      maxCapacity: 1,
      nutritionValue: 15,
      harvestItem: "petal_yellow",
      harvestTool: "none",
      isGround: true,
      gatherable: true,
      respawnCooldown: 75
    },
    flora_berry_bush: {
      id: "flora_berry_bush",
      name: "Sweet Berry Bush",
      description: "A hardy woodland bush laden with ripe, sweet wild berries.",
      texture: "flora_berry_bush",
      weight: 10, // 10% probability
      maxCapacity: 2, // 2 harvests / bites before depletion
      nutritionValue: 35,
      harvestItem: "food_berry",
      harvestTool: "none",
      isGround: false,
      gatherable: true,
      respawnCooldown: 90
    }
  },

  // =========================================================================
  // FAUNA SPAWN POOLS (herbivoreZone & carnivoreZone)
  // =========================================================================
  faunaPools: {
    herbivores: {
      targetPopulation: 6,
      respawnCooldown: 90,
      species: [
        { defId: "bunny", weight: 70 },
        { defId: "sheep", weight: 30 }
      ]
    },
    carnivores: {
      targetPopulation: 3,
      respawnCooldown: 120,
      species: [
        { defId: "tiger", weight: 100 }
      ]
    }
  },

  // =========================================================================
  // CONFIGURATION CONSTANTS
  // =========================================================================
  config: {
    // Density ratio: approximately 1 flora item per every N painted plantZone tiles
    tilesPerFlora: 3.5,
    // Minimum and maximum active flora limits
    minFloraCount: 30,
    maxFloraCount: 75,
    // Sub-pixel placement jitter in pixels (±jitter)
    jitterPixels: 10
  }
};
