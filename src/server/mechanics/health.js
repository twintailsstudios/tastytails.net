/**
 * health.js
 * 
 * Handles healing and revival of players with support for anatomical limb restoration.
 */

const log = require('../../logger');
const DatabaseResilience = require('../../classes/DatabaseResilience');
const { ensureAnatomyStats, recalculateTotalHealth } = require('./anatomyDamage');

/**
 * Heals a player by a specified amount, distributing healing across body parts.
 * 
 * @param {Object} players - The global players object.
 * @param {Object} User - The Mongoose User model.
 * @param {string} targetId - The socket ID of the player to heal.
 * @param {number} amount - The amount of health to restore.
 * @returns {Object} Result - { success: boolean, newHealth: number }
 */
async function healPlayer(players, User, targetId, amount) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Health] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    ensureAnatomyStats(target);

    // Distribute healing across damaged limbs
    const parts = target.stats.bodyParts;
    const healPerLimb = amount / 4; // Share healing across damaged parts

    for (const pKey in parts) {
        const part = parts[pKey];
        if (part && part.hp < part.maxHp) {
            part.hp = Math.min(part.maxHp, part.hp + healPerLimb);
            part.brute = Math.max(0, (part.brute || 0) - healPerLimb);
            part.burn = Math.max(0, (part.burn || 0) - healPerLimb);
            part.toxin = Math.max(0, (part.toxin || 0) - healPerLimb);
            part.suffocation = Math.max(0, (part.suffocation || 0) - healPerLimb);
        }
    }

    // Restore blood volume proportional to heal
    target.stats.bloodVolume = Math.min(target.stats.maxBloodVolume, target.stats.bloodVolume + (amount * 20));

    const finalHealth = recalculateTotalHealth(target);
    log.info(`[Health] ${target.firstName || target.Username} healed for ${amount}. Health: ${finalHealth}/${target.stats.maxHealth}`);

    // Persist to Database
    try {
        await DatabaseResilience.queueUpdate(
            User,
            { 'characters._id': target._id },
            {
                $set: {
                    'characters.$.stats': target.stats
                }
            }
        );
    } catch (err) {
        log.error(`[Health] Database persistence failed for ${targetId}:`, err);
    }

    return {
        success: true,
        newHealth: finalHealth
    };
}

/**
 * Revives a dead player.
 * Resets health and body parts to 25%, clears bleeding, and sets isDead to false.
 * 
 * @param {Object} players - The global players object.
 * @param {Object} User - The Mongoose User model.
 * @param {string} targetId - The socket ID of the player to revive.
 * @param {Object} io - Socket instance.
 * @returns {Object} Result - { success: boolean }
 */
async function revivePlayer(players, User, targetId, io) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Revive] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    if (!target.isDead) {
        log.warn(`[Revive] Player ${target.firstName || target.Username} is already alive.`);
        return { success: false, error: 'Player is not dead' };
    }

    // Reset State
    target.isDead = false;
    ensureAnatomyStats(target);

    // Restore body parts to at least 25 HP
    const parts = target.stats.bodyParts;
    for (const pKey in parts) {
        if (parts[pKey].hp < 25) parts[pKey].hp = 25;
        parts[pKey].suffocation = 0;
    }
    target.stats.bleedingRate = 0;
    target.stats.bloodVolume = Math.max(1000, target.stats.bloodVolume);

    const finalHealth = recalculateTotalHealth(target);
    log.info(`[Revive] ${target.firstName || target.Username} has been revived. Health: ${finalHealth}`);

    // Persist to Database
    try {
        await DatabaseResilience.queueUpdate(
            User,
            { 'characters._id': target._id },
            {
                $set: {
                    'characters.$.stats': target.stats,
                    'characters.$.isDead': false
                }
            }
        );
    } catch (err) {
        log.error(`[Revive] Database persistence failed for ${targetId}:`, err);
    }

    if (io) {
        io.emit('playerRevived', { playerId: targetId });
    }

    return { success: true, newHealth: finalHealth };
}

module.exports = { healPlayer, revivePlayer };
