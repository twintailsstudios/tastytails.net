/**
 * @fileoverview remedies.js - First-Aid & Medieval Alchemical Fantasy Remedy Engine
 * 
 * @description
 * Server-side mechanics module for applying localized first-aid (bandages, splints, salves)
 * and system-wide alchemical remedies (antidotes, smelling salts, blood elixirs).
 * Operates on player anatomical body parts (`bodyParts`) and global vital stats (bleeding rate, stamina, blood volume).
 * 
 * Triggered by:
 * - Chat slash commands (/remedy) in MessageSystem.js
 * - Active consumable item usage in itemActions.js
 * 
 * Invariants:
 * - Localized remedies automatically fall back to the worst damaged limb if the specified limb is uninjured.
 * - Always returns `{ success: false, ... }` when no relevant injury exists, preserving item charges in itemActions.js.
 */

const log = require('../../logger');
const { ensureAnatomyStats, recalculateTotalHealth } = require('./anatomyDamage');

// OPTIMIZATION: Module-scoped static Set prevents array allocations during splint checks in high-concurrency situations.
/** Set of anatomical body part keys that can be splinted. */
const SPLINTABLE_LIMBS = new Set(['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'tail']);

// OPTIMIZATION: Zero-allocation helper avoids Object.entries() heap array allocations during fallback limb searches.
/**
 * Finds the body part key with the highest value for a specific damage property.
 * 
 * @param {Object.<string, Object>} parts - Body parts dictionary.
 * @param {string} damageProp - Damage property name ('brute', 'burn', etc.).
 * @returns {string|null} Key of worst damaged limb or null.
 */
function findWorstDamagedLimb(parts, damageProp) {
    let bestKey = null;
    let maxVal = 0;
    for (const key in parts) {
        const val = parts[key][damageProp] || 0;
        if (val > maxVal) {
            maxVal = val;
            bestKey = key;
        }
    }
    return bestKey;
}

/**
 * Applies a remedy item or first-aid action to a target player.
 * 
 * @param {Object} target - The player target object.
 * @param {string} remedyType - Remedy key ('bandage', 'splint', 'salve', 'antidote', 'smellingSalts', 'bloodElixir').
 * @param {string} [bodyPart='torso'] - Initial target body part key for localized remedies.
 * @returns {{
 *   success: boolean,
 *   remedyType: string,
 *   bodyPart: string,
 *   message: string,
 *   healedAmount: number,
 *   newHealth: number,
 *   stats: Object
 * }} Structured outcome payload.
 */
function applyRemedy(target, remedyType, bodyPart = 'torso') {
    ensureAnatomyStats(target);

    const parts = target.stats.bodyParts;
    let part = parts[bodyPart] || parts.torso;
    let message = '';
    let healedAmount = 0;

    switch (remedyType) {
        case 'bandage':
        case 'gauze': {
            const hasBleeding = target.stats.bleedingRate > 0;
            const hasBruteOnPart = part && (part.brute || 0) > 0;

            if (!hasBleeding && !hasBruteOnPart) {
                // OPTIMIZATION: Fallback search uses zero-allocation helper instead of Object.entries()
                const bestPartKey = findWorstDamagedLimb(parts, 'brute');

                if (bestPartKey) {
                    bodyPart = bestPartKey;
                    part = parts[bodyPart];
                } else if (!hasBleeding) {
                    return {
                        success: false,
                        remedyType,
                        bodyPart,
                        message: `${target.firstName || target.Username} has no bleeding or wounds to bandage.`
                    };
                }
            }

            if (part) {
                part.bleeding = Math.max(0, (part.bleeding || 0) - 2.0);
            }

            if (target.stats.bleedingRate > 0) {
                target.stats.bleedingRate = Math.max(0, target.stats.bleedingRate - 2.0);
                if (part && (part.brute || 0) > 0) {
                    const healAmt = Math.min(15, part.brute);
                    part.brute = Math.max(0, part.brute - healAmt);
                    part.hp = Math.min(part.maxHp, part.hp + healAmt);
                    healedAmount = healAmt;
                    message = `Applied clean linen bandages to ${target.firstName || target.Username}'s ${bodyPart}, slowing bleeding and dressing wounds.`;
                } else {
                    message = `Applied clean linen bandages to ${target.firstName || target.Username}'s ${bodyPart}, slowing bleeding.`;
                }
            } else {
                const healAmt = Math.min(15, part.brute || 15);
                part.brute = Math.max(0, (part.brute || 0) - healAmt);
                part.hp = Math.min(part.maxHp, part.hp + healAmt);
                healedAmount = healAmt;
                message = `Dressed wounds on ${target.firstName || target.Username}'s ${bodyPart} with bandages.`;
            }
            break;
        }

        case 'splint': {
            const isSplintable = SPLINTABLE_LIMBS.has(bodyPart);
            if (!isSplintable || !part || !part.fractured || part.splinted) {
                // Look for any fractured & unsplinted limb
                let foundLimb = null;
                for (const limbKey of SPLINTABLE_LIMBS) {
                    if (parts[limbKey] && parts[limbKey].fractured && !parts[limbKey].splinted) {
                        foundLimb = limbKey;
                        break;
                    }
                }
                if (foundLimb) {
                    bodyPart = foundLimb;
                    part = parts[bodyPart];
                } else {
                    return {
                        success: false,
                        remedyType,
                        bodyPart,
                        message: `${target.firstName || target.Username} has no unsplinted fractures.`
                    };
                }
            }

            part.splinted = true;
            if (part.hp <= 10) {
                const hpGain = 15 - part.hp;
                part.hp = 15;
                // SYNCHRONIZATION: Reduce brute damage by equivalent hpGain so recalculateTotalHealth() stays in sync
                if ((part.brute || 0) > 0) {
                    part.brute = Math.max(0, part.brute - hpGain);
                }
            }
            message = `Bound a bone-mending splint to ${target.firstName || target.Username}'s ${bodyPart}, stabilizing the fracture.`;
            break;
        }

        case 'salve':
        case 'ointment': {
            const hasBurnOnPart = part && (part.burn || 0) > 0;

            if (!hasBurnOnPart) {
                const bestPartKey = findWorstDamagedLimb(parts, 'burn');

                if (bestPartKey) {
                    bodyPart = bestPartKey;
                    part = parts[bodyPart];
                } else {
                    return {
                        success: false,
                        remedyType,
                        bodyPart,
                        message: `${target.firstName || target.Username} has no burns to treat with Sovereign Salve.`
                    };
                }
            }

            const healAmt = Math.min(25, part.burn || 25);
            part.burn = Math.max(0, (part.burn || 0) - healAmt);
            part.hp = Math.min(part.maxHp, part.hp + healAmt);
            healedAmount = healAmt;
            message = `Applied sovereign salve to soothe burns on ${target.firstName || target.Username}'s ${bodyPart}.`;
            break;
        }

        case 'antidote':
            // Cleanses toxin damage across limbs and restores stamina
            for (const pKey in parts) {
                // DEFENSIVE GUARD: Avoid undefined - 20 = NaN on limbs lacking default toxin properties
                if (parts[pKey].toxin !== undefined) {
                    parts[pKey].toxin = Math.max(0, parts[pKey].toxin - 20);
                }
                parts[pKey].hp = Math.min(parts[pKey].maxHp, parts[pKey].hp + 10);
            }
            target.stats.stamina = Math.min(target.stats.maxStamina, target.stats.stamina + 20);
            message = `Drank purifying alchemical antidote, cleansing toxins.`;
            break;

        case 'smellingSalts':
        case 'spiritAir':
            // Restores suffocation and stamina
            for (const pKey in parts) {
                parts[pKey].suffocation = Math.max(0, (parts[pKey].suffocation || 0) - 40);
                parts[pKey].hp = Math.min(parts[pKey].maxHp, parts[pKey].hp + 15);
            }
            target.stats.stamina = Math.min(target.stats.maxStamina, target.stats.stamina + 40);
            message = `Inhaled spirit-air smelling salts, clearing airways and reviving energy.`;
            break;

        case 'bloodElixir':
            // Restores blood volume
            target.stats.bloodVolume = Math.min(target.stats.maxBloodVolume, target.stats.bloodVolume + 1500);
            message = `Drank blood-replenishing elixir, restoring vital blood reserve.`;
            break;

        default:
            message = `Applied ${remedyType} to ${bodyPart}.`;
            break;
    }

    const newHealth = recalculateTotalHealth(target);

    // RECOVERY TIMING: Revive target if smelling salts restored positive total health (evaluated after recalculateTotalHealth)
    if ((remedyType === 'smellingSalts' || remedyType === 'spiritAir') && target.isDead && newHealth > 0) {
        target.isDead = false;
    }

    log.info(`[Remedies] ${target.firstName || target.Username} used ${remedyType} on ${bodyPart}. New Health: ${newHealth}`);

    return {
        success: true,
        remedyType,
        bodyPart,
        message,
        healedAmount,
        newHealth,
        stats: target.stats
    };
}

module.exports = { applyRemedy };

