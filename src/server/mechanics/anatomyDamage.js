/**
 * anatomyDamage.js
 * 
 * Server-side engine for multi-typed anatomical damage in TastyTails.net.
 * Supports 4 primary damage domains: Brute, Burn, Toxin, Suffocation.
 * Target zones: head, torso, leftArm, rightArm, leftHand, rightHand, leftLeg, rightLeg, leftFoot, rightFoot, tail.
 */

const log = require('../../logger');

// Available external body parts
const BODY_PARTS = [
    'head', 'torso', 'leftArm', 'rightArm', 'leftHand', 'rightHand',
    'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot', 'tail'
];

/**
 * Creates default bodyParts state object.
 */
function createDefaultBodyParts() {
    return {
        head: { hp: 100, maxHp: 100, brute: 0, burn: 0, toxin: 0, suffocation: 0 },
        torso: { hp: 100, maxHp: 100, brute: 0, burn: 0, toxin: 0, suffocation: 0 },
        leftArm: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false },
        rightArm: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false },
        leftHand: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
        rightHand: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
        leftLeg: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, splinted: false },
        rightLeg: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, splinted: false },
        leftFoot: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
        rightFoot: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
        tail: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false }
    };
}

/**
 * Ensures player stats object has complete anatomical fields initialized.
 * Handles lazy migration of legacy character records.
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
        // Guard against any missing individual part
        const defaults = createDefaultBodyParts();
        for (const part of BODY_PARTS) {
            if (!target.stats.bodyParts[part]) {
                target.stats.bodyParts[part] = defaults[part];
            }
        }
    }
}

/**
 * Maps raw damage type strings to one of the 4 primary domains:
 * 'brute', 'burn', 'toxin', 'suffocation'.
 */
function normalizeDamageType(type = 'brute') {
    const lower = String(type).toLowerCase();
    if (['burn', 'fire', 'frost', 'cold', 'acid', 'plasma', 'lightning'].some(k => lower.includes(k))) return 'burn';
    if (['toxin', 'poison', 'venom', 'spores', 'chemical'].some(k => lower.includes(k))) return 'toxin';
    if (['suffocation', 'drowning', 'asphyxiation', 'choking', 'void'].some(k => lower.includes(k))) return 'suffocation';
    return 'brute'; // Default domain
}

/**
 * Selects a random external body part weighted by natural exposure.
 */
function getRandomBodyPart() {
    const weights = {
        torso: 35,
        leftLeg: 12, rightLeg: 12,
        leftArm: 10, rightArm: 10,
        leftFoot: 5, rightFoot: 5,
        leftHand: 4, rightHand: 4,
        head: 2, tail: 1
    };
    let roll = Math.random() * 100;
    for (const [part, weight] of Object.entries(weights)) {
        if (roll < weight) return part;
        roll -= weight;
    }
    return 'torso';
}

/**
 * Recalculates composite total health percentage based on body parts & blood volume.
 */
/**
 * Recalculates composite total health percentage based on body parts & blood volume.
 * Dynamically computes cumulative bleeding rate from all limbs with HP <= 50.
 */
function recalculateTotalHealth(target) {
    ensureAnatomyStats(target);
    const parts = target.stats.bodyParts;
    let totalHpSum = 0;
    let totalMaxHpSum = 0;
    let cumulativeLimbBleed = 0;

    for (const partKey of BODY_PARTS) {
        const part = parts[partKey];
        if (part) {
            const currentHp = Math.max(0, part.hp);
            totalHpSum += currentHp;
            totalMaxHpSum += (part.maxHp || 100);

            // Per-Limb Bleeding Threshold: Limbs with HP <= 50 generate proportional bleeding
            if (currentHp <= 50) {
                const limbDeficitRatio = (50 - currentHp) / 50; // 0.0 at 50 HP -> 1.0 at 0 HP
                const limbBleedRate = limbDeficitRatio * 0.8; // Up to 0.8 mL/s per destroyed limb
                cumulativeLimbBleed += limbBleedRate;
            }
        }
    }

    // Update cumulative bleeding rate (rounded to 1 decimal place)
    target.stats.bleedingRate = Math.round(cumulativeLimbBleed * 10) / 10;

    // Composite Total Health Calculation (80% Limb HP + 20% Blood Volume)
    const bodyPercent = totalMaxHpSum > 0 ? (totalHpSum / totalMaxHpSum) : 0;
    const bloodPercent = target.stats.maxBloodVolume > 0 ? Math.max(0, target.stats.bloodVolume / target.stats.maxBloodVolume) : 0;

    let combinedPercent = Math.max(0, Math.min(1, (bodyPercent * 0.8) + (bloodPercent * 0.2)));
    let finalHealth = Math.round(combinedPercent * (target.stats.maxHealth || 100));

    target.stats.health = finalHealth;
    return finalHealth;
}

/**
 * Applies anatomical multi-typed damage to a target player.
 * 
 * @param {Object} target - The player object reference.
 * @param {number} amount - Raw damage amount.
 * @param {string} rawDamageType - Damage type ('brute', 'burn', 'toxin', 'suffocation', etc.)
 * @param {string|null} targetPart - Specified body part ('leftFoot', 'head', etc.) or null for random.
 * @returns {Object} Outcome details.
 */
function applyAnatomyDamage(target, amount, rawDamageType = 'brute', targetPart = null) {
    ensureAnatomyStats(target);
    
    const damageType = normalizeDamageType(rawDamageType);
    let bodyPart = targetPart && BODY_PARTS.includes(targetPart) ? targetPart : null;

    // Environmental / context defaults if no target part specified
    if (!bodyPart) {
        if (damageType === 'suffocation') {
            bodyPart = 'torso';
        } else if (rawDamageType.includes('acid') || rawDamageType.includes('digestion')) {
            const activeLimbs = BODY_PARTS.filter(p => target.stats && target.stats.bodyParts && target.stats.bodyParts[p] && target.stats.bodyParts[p].hp > 0);
            bodyPart = activeLimbs.length > 0 ? activeLimbs[Math.floor(Math.random() * activeLimbs.length)] : BODY_PARTS[Math.floor(Math.random() * BODY_PARTS.length)];
        } else if (rawDamageType.includes('glass') || rawDamageType.includes('step')) {
            bodyPart = Math.random() < 0.5 ? 'leftFoot' : 'rightFoot';
        } else {
            bodyPart = getRandomBodyPart();
        }
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

    // Condition Trigger Checks
    // 1. Slashing/Sharp brute hit triggers bonus bleeding
    if (damageType === 'brute' && (rawDamageType.includes('slash') || rawDamageType.includes('cut') || rawDamageType.includes('glass') || Math.random() < 0.35)) {
        bleedingTriggered = true;
    }

    // 2. Bone Fracture check on Arms/Legs/Tail
    if (['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'tail'].includes(bodyPart)) {
        if (part.hp <= 30 && !part.fractured) {
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

module.exports = {
    createDefaultBodyParts,
    ensureAnatomyStats,
    normalizeDamageType,
    recalculateTotalHealth,
    applyAnatomyDamage,
    BODY_PARTS
};
