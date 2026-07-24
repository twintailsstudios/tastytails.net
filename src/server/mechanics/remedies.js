/**
 * remedies.js
 * 
 * Server-side logic for applying medieval magical fantasy remedies and first-aid items.
 */

const log = require('../../logger');
const { ensureAnatomyStats, recalculateTotalHealth } = require('./anatomyDamage');

/**
 * Applies a remedy item to a target player.
 * 
 * @param {Object} target - The player object.
 * @param {string} remedyType - Remedy key ('bandage', 'splint', 'salve', 'antidote', 'smellingSalts', 'bloodElixir').
 * @param {string|null} bodyPart - Target body part for localized remedies.
 * @returns {Object} Outcome details.
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
                // Find any limb with brute damage > 0
                let bestPartKey = null;
                let maxBrute = 0;
                for (const [k, p] of Object.entries(parts)) {
                    if ((p.brute || 0) > maxBrute) {
                        maxBrute = p.brute || 0;
                        bestPartKey = k;
                    }
                }

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
            const isSplintable = ['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'tail'].includes(bodyPart);
            if (!isSplintable || !part || !part.fractured || part.splinted) {
                // Look for any fractured & unsplinted limb
                let foundLimb = null;
                for (const limbKey of ['leftLeg', 'rightLeg', 'leftArm', 'rightArm', 'tail']) {
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
            if (part.hp <= 10) part.hp = 15;
            message = `Bound a bone-mending splint to ${target.firstName || target.Username}'s ${bodyPart}, stabilizing the fracture.`;
            break;
        }

        case 'salve':
        case 'ointment': {
            const hasBurnOnPart = part && (part.burn || 0) > 0;

            if (!hasBurnOnPart) {
                let bestPartKey = null;
                let maxBurn = 0;
                for (const [k, p] of Object.entries(parts)) {
                    if ((p.burn || 0) > maxBurn) {
                        maxBurn = p.burn || 0;
                        bestPartKey = k;
                    }
                }

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
                parts[pKey].toxin = Math.max(0, parts[pKey].toxin - 20);
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
            if (target.isDead && target.stats.health > 0) {
                target.isDead = false;
            }
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
