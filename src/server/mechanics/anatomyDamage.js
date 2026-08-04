/**
 * @fileoverview anatomyDamage.js - Multi-Typed Anatomical Limb & Health Simulation Engine
 * @subsystem Combat & Anatomy
 * @tickBudget Budgeted microsecond execution cost per frame (<33.3ms 30Hz loop compliant)
 * @databaseResilience In-memory player state; synchronized via DatabaseResilience.js write-behind cache
 * 
 * @description
 * Primary server-side mechanics module for multi-typed anatomical damage calculation,
 * limb condition management (fractures, open wound bleeding, item drop checks, sensory damage),
 * and composite player health evaluation (80% limb health + 20% blood volume).
 * 
 * Triggered by: Combat attacks (damage.js), medical remedies (remedies.js), healing spells (health.js), and server tick loops (server-loop.js).
 */

const log = require('../../logger');

/**
 * List of valid external anatomical body parts.
 * @type {string[]}
 */
const BODY_PARTS = [
    'head', 'leftEar', 'rightEar', 'eyes', 'mouth', 'torso', 'groin', 'tail',
    'leftArm', 'rightArm', 'leftHand', 'rightHand',
    'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot'
];

// OPTIMIZATION: Module-level frozen Sets eliminate hot-path array allocations in combat & routing routines.
const SUB_BODY_PARTS = Object.freeze(new Set(['leftEar', 'rightEar', 'eyes', 'mouth', 'groin']));
const FRACTURABLE_LIMBS = Object.freeze(new Set(['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'tail']));

/**
 * Creates default bodyParts state object with base HP and domain damage tracking buckets.
 * @returns {Object.<string, {hp?: number, maxHp?: number, brute: number, burn: number, toxin?: number, suffocation?: number, bleeding: number, fractured?: boolean, splinted?: boolean}>}
 */
function createDefaultBodyParts() {
    return {
        head: { hp: 100, maxHp: 100, brute: 0, burn: 0, toxin: 0, suffocation: 0, bleeding: 0 },
        leftEar: { brute: 0, burn: 0, bleeding: 0 },
        rightEar: { brute: 0, burn: 0, bleeding: 0 },
        eyes: { brute: 0, burn: 0, bleeding: 0 },
        mouth: { brute: 0, burn: 0, bleeding: 0 },
        torso: { hp: 100, maxHp: 100, brute: 0, burn: 0, toxin: 0, suffocation: 0, bleeding: 0 },
        groin: { brute: 0, burn: 0, bleeding: 0 },
        leftArm: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, bleeding: 0 },
        rightArm: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, bleeding: 0 },
        leftHand: { hp: 100, maxHp: 100, brute: 0, burn: 0, bleeding: 0 },
        rightHand: { hp: 100, maxHp: 100, brute: 0, burn: 0, bleeding: 0 },
        leftLeg: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, splinted: false, bleeding: 0 },
        rightLeg: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, splinted: false, bleeding: 0 },
        leftFoot: { hp: 100, maxHp: 100, brute: 0, burn: 0, bleeding: 0 },
        rightFoot: { hp: 100, maxHp: 100, brute: 0, burn: 0, bleeding: 0 },
        tail: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, bleeding: 0 }
    };
}

// OPTIMIZATION: Frozen static default body parts template prevents heap object re-allocations during lazy migration checks.
const STATIC_DEFAULT_BODY_PARTS = Object.freeze(createDefaultBodyParts());

// OPTIMIZATION: Pre-allocated weighted selection table avoids dynamic object and 2D array allocations in hot combat paths.
const WEIGHTED_BODY_PARTS = [
    { part: 'torso', weight: 35 },
    { part: 'leftLeg', weight: 12 }, { part: 'rightLeg', weight: 12 },
    { part: 'leftArm', weight: 10 }, { part: 'rightArm', weight: 10 },
    { part: 'leftFoot', weight: 5 }, { part: 'rightFoot', weight: 5 },
    { part: 'leftHand', weight: 4 }, { part: 'rightHand', weight: 4 },
    { part: 'head', weight: 2 }, { part: 'tail', weight: 1 }
];

// OPTIMIZATION: Pre-compiled RegExp normalizers for zero-allocation domain mapping.
const BURN_REGEX = /burn|fire|frost|cold|acid|plasma|lightning/i;
const TOXIN_REGEX = /toxin|poison|venom|spores|chemical/i;
const SUFFOCATION_REGEX = /suffocation|drowning|asphyxiation|choking|void/i;

/**
 * Ensures player stats object has complete anatomical fields initialized.
 * Handles lazy migration of legacy character records.
 * 
 * @param {Object} target - The player character object reference.
 */
function ensureAnatomyStats(target) {
    if (!target) return;
    if (!target.stats) {
        target.stats = { health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, mana: 100, maxMana: 100 };
    }
    if (typeof target.stats.bloodVolume !== 'number') {
        target.stats.bloodVolume = 5000;
        target.stats.maxBloodVolume = 5000;
    }
    if (typeof target.stats.bleedingRate !== 'number') {
        target.stats.bleedingRate = 0;
    }
    if (!target.stats.sensory) {
        target.stats.sensory = { eyeDamage: 0, earDamage: 0 };
    }
    if (!target.stats.bodyParts) {
        target.stats.bodyParts = createDefaultBodyParts();
    } else {
        // OPTIMIZATION: Shallow property assignment prevents spread operator allocation overhead
        for (const part of BODY_PARTS) {
            if (!target.stats.bodyParts[part]) {
                target.stats.bodyParts[part] = Object.assign({}, STATIC_DEFAULT_BODY_PARTS[part]);
            }
        }
    }
}

/**
 * Maps raw damage type strings to one of the 4 primary domains:
 * 'brute', 'burn', 'toxin', 'suffocation'.
 * 
 * @param {string} [type='brute'] - Raw incoming damage classification.
 * @returns {string} Normalized domain ('brute'|'burn'|'toxin'|'suffocation').
 */
function normalizeDamageType(type = 'brute') {
    const lower = String(type).toLowerCase();
    if (BURN_REGEX.test(lower)) return 'burn';
    if (TOXIN_REGEX.test(lower)) return 'toxin';
    if (SUFFOCATION_REGEX.test(lower)) return 'suffocation';
    return 'brute'; // Default domain
}

/**
 * Selects a random external body part weighted by natural exposure.
 * @returns {string} Target body part key.
 */
function getRandomBodyPart() {
    let roll = Math.random() * 100;
    for (let i = 0; i < WEIGHTED_BODY_PARTS.length; i++) {
        const entry = WEIGHTED_BODY_PARTS[i];
        if (roll < entry.weight) return entry.part;
        roll -= entry.weight;
    }
    return 'torso';
}

/**
 * Recalculates composite total health percentage based on body parts & blood volume.
 * Dynamically computes cumulative bleeding rate from all limbs with HP <= 50 and open wounds.
 * 
 * @param {Object} target - The player character object reference.
 * @returns {number} Final composite health value.
 */
function recalculateTotalHealth(target) {
    ensureAnatomyStats(target);
    const parts = target.stats.bodyParts;
    let totalHpSum = 0;
    let totalMaxHpSum = 0;
    let cumulativeLimbBleed = 0;

    for (const partKey of BODY_PARTS) {
        const part = parts[partKey];
        // DEFENSIVE GUARD: Only sum limbs with defined numeric HP pools (ignores non-HP sub-parts: ears, eyes, mouth, groin)
        if (part && typeof part.hp === 'number') {
            const currentHp = Math.max(0, part.hp);
            totalHpSum += currentHp;
            totalMaxHpSum += (part.maxHp || 100);

            // Per-Limb Bleeding Threshold: Limbs with HP <= 50 generate proportional bleeding
            if (currentHp <= 50) {
                const limbDeficitRatio = (50 - currentHp) / 50; // 0.0 at 50 HP -> 1.0 at 0 HP
                const limbBleedRate = limbDeficitRatio * 0.8; // Up to 0.8 mL/s per destroyed limb
                cumulativeLimbBleed += limbBleedRate;
            }

            // Per-Limb Open Cut Wound Bleeding
            if (part.bleeding && part.bleeding > 0) {
                cumulativeLimbBleed += part.bleeding;
            }
        }
    }

    // Update cumulative bleeding rate (rounded to 1 decimal place)
    target.stats.bleedingRate = Math.round(cumulativeLimbBleed * 10) / 10;

    // Total Health Calculation: lower of Body Percent or Blood Percent
    const bodyPercent = totalMaxHpSum > 0 ? (totalHpSum / totalMaxHpSum) : 0;
    const maxVol = (typeof target.stats.maxBloodVolume === 'number' && target.stats.maxBloodVolume > 0) ? target.stats.maxBloodVolume : 5000;
    const currentVol = typeof target.stats.bloodVolume === 'number' ? target.stats.bloodVolume : maxVol;
    const bloodPercent = maxVol > 0 ? Math.max(0, currentVol / maxVol) : 0;

    let combinedPercent = Math.max(0, Math.min(1, Math.min(bodyPercent, bloodPercent)));
    let finalHealth = Math.round(combinedPercent * (target.stats.maxHealth || 100));

    target.stats.health = finalHealth;
    return finalHealth;
}

/**
 * Applies anatomical multi-typed damage to a target player.
 * 
 * @param {Object} target - The player object reference.
 * @param {number} amount - Raw damage amount.
 * @param {string} [rawDamageType='brute'] - Damage type ('brute', 'burn', 'toxin', 'suffocation', etc.)
 * @param {string|null} [targetPart=null] - Specified body part ('leftFoot', 'head', etc.) or null for random.
 * @param {Object} [options={}] - Weapon modifiers ({ bleedMult, fractureMult }).
 * @returns {Object} Outcome details.
 */
function applyAnatomyDamage(target, amount, rawDamageType = 'brute', targetPart = null, options = {}) {
    ensureAnatomyStats(target);
    target.lastDamageTakenTime = Date.now();

    // Combat Session Entry Penalty: Entering a new combat session adds +1 minute (+60s) to all splinted limb timers
    if (!target.inCombat) {
        target.inCombat = true;
        if (target.stats && target.stats.bodyParts) {
            for (const pKey of BODY_PARTS) {
                const part = target.stats.bodyParts[pKey];
                if (part && part.splinted) {
                    part.mendTimer = Math.min(1800, (part.mendTimer || 600) + 60); // Capped at 1800s (30m) max penalty
                    log.info(`[AnatomyDamage] ${target.firstName || target.Username} entered combat. Added 1m penalty to splinted ${pKey} (New mendTimer: ${part.mendTimer}s).`);
                }
            }
        }
    }

    const damageType = normalizeDamageType(rawDamageType);
    let bodyPart = targetPart && BODY_PARTS.includes(targetPart) ? targetPart : null;

    // Environmental / context defaults if no target part specified
    if (!bodyPart) {
        if (damageType === 'suffocation') {
            bodyPart = 'torso';
        } else if (rawDamageType.includes('acid') || rawDamageType.includes('digestion')) {
            const bParts = target.stats.bodyParts;
            const candidates = [];
            for (let i = 0; i < BODY_PARTS.length; i++) {
                const pName = BODY_PARTS[i];
                if (bParts[pName] && (bParts[pName].hp === undefined || bParts[pName].hp > 0)) candidates.push(pName);
            }
            bodyPart = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : BODY_PARTS[Math.floor(Math.random() * BODY_PARTS.length)];
        } else if (rawDamageType.includes('glass') || rawDamageType.includes('step')) {
            bodyPart = Math.random() < 0.5 ? 'leftFoot' : 'rightFoot';
        } else {
            bodyPart = getRandomBodyPart();
        }
    }

    // Handle sub-part localized status effect tracking & parent HP pool routing (Head for ears/eyes/mouth, Torso for groin)
    if (SUB_BODY_PARTS.has(bodyPart)) {
        if (!target.stats.bodyParts[bodyPart]) {
            target.stats.bodyParts[bodyPart] = { brute: 0, burn: 0, bleeding: 0 };
        }
        const subNode = target.stats.bodyParts[bodyPart];
        if (damageType === 'brute') subNode.brute = (subNode.brute || 0) + amount;
        if (damageType === 'burn') subNode.burn = (subNode.burn || 0) + amount;

        if (bodyPart === 'eyes') {
            target.stats.sensory.eyeDamage = Math.min(100, target.stats.sensory.eyeDamage + Math.round(amount * 0.8));
        } else if (bodyPart === 'leftEar' || bodyPart === 'rightEar') {
            target.stats.sensory.earDamage = Math.min(100, target.stats.sensory.earDamage + Math.round(amount * 0.8));
        }
        bodyPart = bodyPart === 'groin' ? 'torso' : 'head';
    }

    const part = target.stats.bodyParts[bodyPart];
    let newLimbHp = part.hp;
    let fractured = false;
    let itemDropped = false;
    let bleedingTriggered = false;

    if (damageType === 'suffocation') {
        // Suffocation drains stamina rapidly and reduces head/torso suffocation pool
        target.stats.stamina = Math.max(0, target.stats.stamina - (amount * 2));
        part.suffocation = (part.suffocation || 0) + amount;
        part.hp = Math.max(0, part.hp - amount);
    } else {
        // Apply damage to limb sub-type tracking & HP
        if (damageType === 'brute') part.brute = (part.brute || 0) + amount;
        if (damageType === 'burn') part.burn = (part.burn || 0) + amount;
        if (damageType === 'toxin') part.toxin = (part.toxin || 0) + amount;

        part.hp = Math.max(0, part.hp - amount);
    }
    newLimbHp = part.hp;
    const maxLimbHp = part.maxHp || 100;
    const deficitRatio = Math.max(0, (maxLimbHp - newLimbHp) / maxLimbHp);

    // Condition Trigger Checks: Dynamic Probability scaling based on Limb HP
    // 1. Bleeding probability (Guaranteed at HP <= 30)
    const defaultBleedMult = (rawDamageType.includes('slash') || rawDamageType.includes('pierce') || rawDamageType.includes('cut') || rawDamageType.includes('glass')) ? 1.5 : 0.4;
    const bleedMult = typeof options.bleedMult === 'number' ? options.bleedMult : defaultBleedMult;
    if (bleedMult > 0) {
        const bleedProb = newLimbHp <= 30 ? 1.0 : Math.min(1.0, Math.pow(deficitRatio, 1.5) * 1.5 * bleedMult);
        if (Math.random() < bleedProb) {
            bleedingTriggered = true;
            part.bleeding = Math.min(3.0, (part.bleeding || 0) + 0.5); // Add 0.5 mL/s bleed per cut (max 3.0 mL/s per limb)
        }
    }

    // 2. Bone Fracture check on Arms/Legs/Tail (Guaranteed at HP <= 30 if fractureMult > 0)
    const defaultFractureMult = damageType === 'brute' ? 1.0 : 0.0;
    const fractureMult = typeof options.fractureMult === 'number' ? options.fractureMult : defaultFractureMult;
    if (FRACTURABLE_LIMBS.has(bodyPart) && !part.fractured && fractureMult > 0) {
        const fractureProb = newLimbHp <= 30 ? 1.0 : Math.min(1.0, Math.pow(deficitRatio, 1.8) * 1.5 * fractureMult);
        if (Math.random() < fractureProb) {
            part.fractured = true;
            fractured = true;
            log.info(`[AnatomyDamage] ${target.firstName || target.Username}'s ${bodyPart} has been FRACTURED.`);
        }
    }

    // 3. Hand / Arm heavy hit item drop check
    if (['leftHand', 'rightHand', 'leftArm', 'rightArm'].includes(bodyPart) && damageType === 'brute' && amount >= 15) {
        itemDropped = true;
    }

    // 4. Head hits affect sensory channels (Eyes / Ears)
    if (bodyPart === 'head') {
        if (damageType === 'burn' || damageType === 'brute') {
            target.stats.sensory.eyeDamage = Math.min(100, target.stats.sensory.eyeDamage + Math.round(amount * 0.5));
        }
        if (damageType === 'brute' || rawDamageType.includes('explosion') || rawDamageType.includes('thunder')) {
            target.stats.sensory.earDamage = Math.min(100, target.stats.sensory.earDamage + Math.round(amount * 0.5));
        }
    }

    // Recalculate composite total health & cumulative bleeding
    const newTotalHealth = recalculateTotalHealth(target);
    const dead = newTotalHealth <= 0;

    if (dead) {
        target.isDead = true;
        target.stats.health = 0;
    }

    log.info(`[AnatomyDamage] ${target.firstName || target.Username} took ${amount} ${damageType} to ${bodyPart}. Limb HP: ${newLimbHp}/${part.maxHp}. Total Health: ${newTotalHealth}. Fractured: ${fractured}, BleedingRate: ${target.stats.bleedingRate}`);

    return {
        success: true,
        damageType,
        bodyPart,
        amountApplied: amount,
        newLimbHp,
        newTotalHealth,
        dead,
        fractured,
        itemDropped,
        bleedingTriggered,
        bleedingRate: target.stats.bleedingRate
    };
}

/**
 * Applies burn damage across limbs proportional to accumulated digestion progress upon release.
 * Does NOT trigger active bleeding (per user design guidance).
 * 
 * @param {Object} target - The prey player character object.
 * @param {number} digestionProgressPct - Digestion progress percentage (0.0 to 1.0).
 */
function applyDigestionReleaseBurn(target, digestionProgressPct = 0) {
    ensureAnatomyStats(target);
    if (!digestionProgressPct || digestionProgressPct <= 0) return;

    const parts = target.stats.bodyParts;
    // Burn amount per limb based on digestion progress (e.g. 50% progress = up to 50 burn damage per limb)
    const burnAmountPerLimb = Math.round(digestionProgressPct * 60);

    for (const partKey of BODY_PARTS) {
        const part = parts[partKey];
        if (part && part.hp > 0) {
            const actualBurn = Math.min(part.hp - 10, burnAmountPerLimb); // Keep at least 10 HP per limb on release
            if (actualBurn > 0) {
                part.burn = (part.burn || 0) + actualBurn;
                part.hp = Math.max(10, part.hp - actualBurn);
            }
        }
    }

    recalculateTotalHealth(target);
    log.info(`[AnatomyDamage] Applied post-digestion release burn (${Math.round(digestionProgressPct * 100)}% progress) to ${target.firstName || target.Username}. Health: ${target.stats.health}`);
}

/**
 * Processes passive natural regeneration for blood volume and limb HP over time.
 * - Blood Volume: +10 mL/s when bleeding is 0.
 * - Limb HP: Out-of-combat buffer (15s). 1 HP per 10s baseline (or 6.6s if well-fed).
 * - Severe Wound Soft Cap: Limbs with HP <= 50 naturally cap at 75 HP max.
 * 
 * @param {Object} target - The player character object reference.
 * @returns {boolean} True if stats changed.
 */
function processPassiveRegeneration(target) {
    if (!target || target.isDead || !target.stats) return false;
    ensureAnatomyStats(target);

    let statsChanged = false;
    const now = Date.now();

    // 1. Natural Blood Volume Regeneration (+10 mL per second when bleeding is 0)
    const bleedingRate = target.stats.bleedingRate || 0;
    const maxVol = target.stats.maxBloodVolume || 5000;
    const curVol = typeof target.stats.bloodVolume === 'number' ? target.stats.bloodVolume : maxVol;

    if (bleedingRate === 0 && curVol < maxVol) {
        target.stats.bloodVolume = Math.min(maxVol, curVol + 10);
        statsChanged = true;
    }

    // 2. Out-of-Combat Buffer Check (Must take no damage for 15 seconds)
    const lastHit = target.lastDamageTakenTime || 0;
    const isOutOfCombat = (now - lastHit) >= 15000;

    if (!isOutOfCombat) {
        if (statsChanged) recalculateTotalHealth(target);
        return statsChanged;
    }

    // Exit Combat state transition
    if (target.inCombat) {
        target.inCombat = false;
        log.info(`[AnatomyDamage] ${target.firstName || target.Username} has exited combat (out of combat buffer reached).`);
    }

    // 2b. Bone Mending Countdown for Splinted Limbs (1s tick out-of-combat)
    const parts = target.stats.bodyParts;
    if (parts) {
        for (const partKey of BODY_PARTS) {
            const part = parts[partKey];
            if (part && part.splinted && part.fractured) {
                part.mendTimer = Math.max(0, (part.mendTimer || 600) - 1);
                statsChanged = true;

                if (part.mendTimer <= 0) {
                    part.fractured = false;
                    part.splinted = false;
                    part.hadSevereWound = false;
                    part.mendTimer = 0;
                    log.info(`[AnatomyDamage] ${target.firstName || target.Username}'s ${partKey} bone has fully MENDED! Status restored to OK.`);
                }
            }
        }
    }

    // 3. Passive Limb HP Regeneration Tick (Every 10 seconds baseline, or 6.6 seconds if Well-Fed)
    const regenInterval = target.isWellFed ? 6600 : 10000;
    const lastRegen = target.lastHpRegenTime || 0;

    if (now - lastRegen >= regenInterval) {
        target.lastHpRegenTime = now;

        for (const partKey of BODY_PARTS) {
            const part = parts[partKey];
            if (!part) continue;

            const maxHp = part.maxHp || 100;

            // Poisoned limbs cannot regenerate HP
            if (part.toxin && part.toxin > 0) continue;

            // Determine Natural Soft Cap: 100 HP for minor wounds, 75 HP for severe wounds (HP <= 50)
            if (part.hp <= 50) part.hadSevereWound = true;
            const softCap = part.hadSevereWound ? 75 : maxHp;

            if (part.hp < softCap) {
                part.hp = Math.min(softCap, part.hp + 1);

                // Heal brute damage proportionally
                if (part.brute && part.brute > 0) {
                    part.brute = Math.max(0, part.brute - 1);
                }
                statsChanged = true;
            }
        }
    }

    if (statsChanged) {
        recalculateTotalHealth(target);
    }

    return statsChanged;
}

module.exports = {
    createDefaultBodyParts,
    ensureAnatomyStats,
    normalizeDamageType,
    recalculateTotalHealth,
    applyAnatomyDamage,
    applyDigestionReleaseBurn,
    processPassiveRegeneration,
    BODY_PARTS
};


