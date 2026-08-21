/**
 * @fileoverview enemyDefinitions.js - Data-Driven Enemy Registry & Attack Configurations
 * @subsystem Combat & Telegraph Engine & NPC Dietary Ecology
 * @description
 * Canonical data registry for all modular NPC enemies in TastyTails.net.
 * Adding or tweaking enemy types here automatically configures server-side AI behaviors,
 * disposition (aggressive | territorial | neutral | runner), diet (carnivore | herbivore | omnivore | none),
 * anatomical hitzones, 4-phase attack telegraphs, and client rendering with zero additional boilerplate.
 */

module.exports = {
  test: {
    id: "test",
    enemyName: "test",
    spriteFolder: "test",
    name: "Clockwork Sparring-Dummy",
    description: "An enchanted clockwork combat mannequin built for training guild champions and testing combat telegraphs.",
    texture: "idle_test",
    states: ["idle", "orbit", "windup", "flash", "active", "recovery"],
    scale: 1.0,
    footprint: { width: 48, height: 48 },

    // Base Stats & Vitals
    stats: {
      health: 300,
      maxHealth: 300,
      bloodVolume: 4000,
      maxBloodVolume: 4000,
      stamina: 100,
      moveSpeed: 85,
      baseArmor: 2
    },

    // AI & Engagement Parameters
    ai: {
      archetype: "skirmisher",
      disposition: "neutral",
      diet: "none",
      aggroRadius: 300,
      deaggroRadius: 450,
      preferredCombatDistance: 80,
      orbitSpeedMultiplier: 0.7,
      enrageHealthPercent: 0.35,
      enrageSpeedBuff: 1.3,
      enrageWindupMultiplier: 0.7
    },

    // Biological Needs & Desires Configuration
    needs: {
      enableHydration: false,
      enableHunger: false
    },

    // Anatomical Limbs & Weaknesses (Integrates with anatomyDamage.js)
    anatomy: {
      limbs: {
        gearCore: { hp: 90, maxHp: 90, disableAttackOnFracture: "radial_whirl" },
        head: { hp: 100, maxHp: 100 },
        torso: { hp: 180, maxHp: 180 },
        leftArm: { hp: 80, maxHp: 80, disableAttackOnFracture: "runway_thrust" },
        rightArm: { hp: 80, maxHp: 80, disableAttackOnFracture: "conical_cleave" },
        leftLeg: { hp: 80, maxHp: 80 },
        rightLeg: { hp: 80, maxHp: 80 }
      }
    },

    // Attacks & Abilities Registry
    attacks: [
      {
        id: "conical_cleave",
        name: "Conical Cleave",
        type: "conical",
        range: 80,
        arcAngle: 100,
        windupMs: 1000,
        flashMs: 150,
        activeMs: 250,
        recoveryMs: 600,
        damage: 20,
        damageType: "brute",
        bleedMult: 1.0,
        fractureMult: 1.0,
        limbGlow: "rightArm",
        weight: 40,
        cooldownMs: 3000,
        soundWindup: "sfx_dummy_wind",
        soundExecute: "sfx_dummy_slash"
      },
      {
        id: "runway_thrust",
        name: "Steam Piston Thrust",
        type: "linear_runway",
        length: 220,
        width: 45,
        windupMs: 1200,
        flashMs: 180,
        activeMs: 350,
        recoveryMs: 800,
        damage: 30,
        damageType: "brute",
        bleedMult: 0.8,
        fractureMult: 1.8,
        limbGlow: "leftArm",
        weight: 35,
        minDistance: 90,
        cooldownMs: 6000,
        wallStunDurationMs: 1500,
        soundWindup: "sfx_piston_press",
        soundExecute: "sfx_piston_burst"
      },
      {
        id: "radial_whirl",
        name: "Gear-Core Overload",
        type: "radial",
        radius: 100,
        innerRadius: 0,
        windupMs: 1400,
        flashMs: 200,
        activeMs: 300,
        recoveryMs: 900,
        damage: 35,
        damageType: "burn",
        bleedMult: 0.2,
        fractureMult: 1.2,
        limbGlow: "gearCore",
        weight: 25,
        cooldownMs: 8000,
        soundWindup: "sfx_gear_whir",
        soundExecute: "sfx_steam_release"
      }
    ],

    // Carcass & Loot Drops
    harvestLoot: [
      { itemId: "gear_copper", count: [2, 4], chance: 1.0 },
      { itemId: "ore_iron_dense", count: [1, 3], chance: 0.8 }
    ]
  },

  bunny: {
    id: "bunny",
    enemyName: "bunny",
    spriteFolder: "bunny",
    name: "Forest Bunny",
    description: "A timid woodland critter that flees at the slightest sound and grazes on fresh flora.",
    texture: "idle_bunny",
    states: ["idle", "orbit", "windup", "flash", "active", "recovery"],
    scale: 0.8,
    footprint: { width: 32, height: 32 },

    // Base Stats & Vitals
    stats: {
      health: 50,
      maxHealth: 50,
      bloodVolume: 800,
      maxBloodVolume: 800,
      stamina: 80,
      moveSpeed: 110,
      baseArmor: 0
    },

    // AI & Engagement Parameters
    ai: {
      archetype: "skirmisher",
      disposition: "runner",
      diet: "herbivore",
      fearRadius: 200,
      foodSearchRadius: 350,
      sprintMultiplier: 1.4,
      deaggroRadius: 350
    },

    // Biological Needs & Desires Configuration
    needs: {
      enableHydration: true,
      enableHunger: true,
      hungerDecayRate: 0.3,
      hungerThreshold: 40.0
    },

    // Anatomical Limbs & Weaknesses
    anatomy: {
      limbs: {
        head: { hp: 20, maxHp: 20 },
        torso: { hp: 30, maxHp: 30 },
        leftLeg: { hp: 15, maxHp: 15 },
        rightLeg: { hp: 15, maxHp: 15 }
      }
    },

    // Attacks & Abilities Registry
    attacks: [
      {
        id: "nibble_kick",
        name: "Panic Kick",
        type: "conical",
        range: 40,
        arcAngle: 60,
        windupMs: 500,
        flashMs: 100,
        activeMs: 150,
        recoveryMs: 400,
        damage: 5,
        damageType: "brute",
        bleedMult: 0.2,
        fractureMult: 0.1,
        weight: 100,
        cooldownMs: 2000
      }
    ],

    // Carcass & Loot Drops
    harvestLoot: [
      { itemId: "meat_raw_game", count: [1, 1], chance: 1.0 },
      { itemId: "pelt_small", count: [1, 1], chance: 0.8 }
    ]
  },

  sheep: {
    id: "sheep",
    enemyName: "sheep",
    spriteFolder: "sheep",
    name: "Meadow Sheep",
    description: "A gentle fleece-bearing herbivore grazing peacefully in the high meadows.",
    texture: "idle_bunny",
    states: ["idle", "orbit", "windup", "flash", "active", "recovery"],
    scale: 1.0,
    footprint: { width: 36, height: 36 },

    // Base Stats & Vitals
    stats: {
      health: 80,
      maxHealth: 80,
      bloodVolume: 1200,
      maxBloodVolume: 1200,
      stamina: 70,
      moveSpeed: 75,
      baseArmor: 0
    },

    // AI & Engagement Parameters
    ai: {
      archetype: "skirmisher",
      disposition: "runner",
      diet: "herbivore",
      fearRadius: 220,
      foodSearchRadius: 400,
      sprintMultiplier: 1.3,
      deaggroRadius: 400
    },

    // Biological Needs & Desires Configuration
    needs: {
      enableHydration: true,
      enableHunger: true,
      hungerDecayRate: 0.2,
      hungerThreshold: 40.0
    },

    // Anatomical Limbs & Weaknesses
    anatomy: {
      limbs: {
        head: { hp: 35, maxHp: 35 },
        torso: { hp: 60, maxHp: 60 },
        leftFrontLeg: { hp: 25, maxHp: 25 },
        rightFrontLeg: { hp: 25, maxHp: 25 },
        leftHindLeg: { hp: 25, maxHp: 25 },
        rightHindLeg: { hp: 25, maxHp: 25 }
      }
    },

    // Attacks & Abilities Registry
    attacks: [
      {
        id: "sheep_headbutt",
        name: "Panic Headbutt",
        type: "conical",
        range: 45,
        arcAngle: 60,
        windupMs: 600,
        flashMs: 100,
        activeMs: 150,
        recoveryMs: 500,
        damage: 8,
        damageType: "brute",
        bleedMult: 0.2,
        fractureMult: 0.2,
        weight: 100,
        cooldownMs: 2500
      }
    ],

    // Carcass & Loot Drops
    harvestLoot: [
      { itemId: "fiber_wool", count: [1, 2], chance: 1.0 },
      { itemId: "meat_raw_game", count: [1, 1], chance: 0.8 }
    ]
  },

  tiger: {
    id: "tiger",
    enemyName: "tiger",
    spriteFolder: "tiger",
    name: "Wild Tiger",
    description: "A ferocious predatory feline roaming the wilderness in search of prey.",
    texture: "idle_tiger",
    states: ["idle", "orbit", "windup", "flash", "active", "recovery"],
    scale: 1.0,
    footprint: { width: 48, height: 48 },

    // Base Stats & Vitals
    stats: {
      health: 240,
      maxHealth: 240,
      bloodVolume: 3200,
      maxBloodVolume: 3200,
      stamina: 120,
      moveSpeed: 115,
      baseArmor: 3
    },

    // AI & Engagement Parameters
    ai: {
      archetype: "rusher",
      disposition: "aggressive",
      diet: "carnivore",
      aggroRadius: 400,
      deaggroRadius: 700,
      foodSearchRadius: 1500,
      huntWanderSpeed: 85,
      preferredCombatDistance: 70,
      orbitSpeedMultiplier: 0.65,
      enrageHealthPercent: 0.3,
      enrageSpeedBuff: 1.35,
      enrageWindupMultiplier: 0.7
    },

    // Biological Needs & Desires Configuration
    needs: {
      enableHydration: true,
      enableHunger: true,
      hungerDecayRate: 0.25,
      hungerThreshold: 40.0
    },

    // Anatomical Limbs & Weaknesses
    anatomy: {
      limbs: {
        jaws: { hp: 75, maxHp: 75, disableAttackOnFracture: "tiger_bite" },
        head: { hp: 85, maxHp: 85 },
        torso: { hp: 150, maxHp: 150 },
        leftFrontLeg: { hp: 65, maxHp: 65, disableAttackOnFracture: "tiger_pounce" },
        rightFrontLeg: { hp: 65, maxHp: 65, disableAttackOnFracture: "tiger_pounce" },
        leftHindLeg: { hp: 65, maxHp: 65 },
        rightHindLeg: { hp: 65, maxHp: 65 },
        tail: { hp: 35, maxHp: 35 }
      }
    },

    // Attacks & Abilities Registry
    attacks: [
      {
        id: "tiger_bite",
        name: "Savage Bite",
        type: "conical",
        range: 70,
        arcAngle: 90,
        windupMs: 800,
        flashMs: 120,
        activeMs: 200,
        recoveryMs: 500,
        damage: 28,
        damageType: "pierce",
        bleedMult: 2.0,
        fractureMult: 1.0,
        limbGlow: "jaws",
        weight: 60,
        cooldownMs: 2500,
        soundWindup: "sfx_wolf_growl",
        soundExecute: "sfx_wolf_bite"
      },
      {
        id: "tiger_pounce",
        name: "Apex Pounce",
        type: "linear_runway",
        length: 240,
        width: 45,
        windupMs: 1100,
        flashMs: 150,
        activeMs: 350,
        recoveryMs: 800,
        damage: 36,
        damageType: "brute",
        bleedMult: 1.2,
        fractureMult: 1.8,
        limbGlow: "leftFrontLeg",
        weight: 40,
        minDistance: 100,
        cooldownMs: 6000,
        wallStunDurationMs: 1500,
        soundWindup: "sfx_wolf_snarl",
        soundExecute: "sfx_wolf_pounce"
      }
    ],

    // Carcass & Loot Drops
    harvestLoot: [
      { itemId: "pelt_small", count: [1, 2], chance: 1.0 },
      { itemId: "bone_beast_dense", count: [2, 3], chance: 0.8 },
      { itemId: "meat_raw_game", count: [2, 3], chance: 1.0 }
    ]
  }
};
