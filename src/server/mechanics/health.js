/**
 * health.js
 * 
 * Handles healing and revival of players.
 */

const log = require('../../logger');

/**
 * Heals a player by a specified amount.
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

    if (!target.stats) {
        target.stats = { health: 100, maxHealth: 100 };
    }

    // Default to a sane max health if missing (e.g. legacy data)
    const maxHealth = target.stats.maxHealth || 100;

    // Apply Healing
    target.stats.health += amount;

    // Clamp to Max Health
    if (target.stats.health > maxHealth) {
        target.stats.health = maxHealth;
    }

    // Ensure not negative (just in case amount is negative, though damage.js handles damage)
    if (target.stats.health < 0) {
        target.stats.health = 0;
    }

    log.info(`[Health] ${target.firstName} healed for ${amount}. Health: ${target.stats.health}/${maxHealth}`);

    // Persist to Database
    try {
        await User.updateOne(
            { 'characters._id': target._id },
            {
                $set: {
                    'characters.$.stats.health': target.stats.health
                }
            }
        );
    } catch (err) {
        log.error(`[Health] Database persistence failed for ${targetId}:`, err);
    }

    return {
        success: true,
        newHealth: target.stats.health
    };
}

/**
 * Revives a dead player.
 * Resets health to 1, sets isDead to false, and handles sprite restoration logic (handled by client on state change).
 * 
 * @param {Object} players - The global players object.
 * @param {Object} User - The Mongoose User model.
 * @param {string} targetId - The socket ID of the player to revive.
 * @returns {Object} Result - { success: boolean }
 */
async function revivePlayer(players, User, targetId, io) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Revive] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    if (!target.isDead) {
        log.warn(`[Revive] Player ${target.firstName} is already alive.`);
        return { success: false, error: 'Player is not dead' };
    }

    // Reset State
    target.isDead = false;

    // Set Health to 1 (or could be configurable)
    if (!target.stats) target.stats = { health: 100, maxHealth: 100 };
    target.stats.health = 1;

    // Remove Corpse?
    // The requirement says "return them to 1 health point... replacing the spiritSprite properties with the normal player character sprite".
    // Client-side, 'isDead: false' triggers the normal sprite rendering.

    // We might need to notify clients explicitly if simple state/delta updates aren't enough, 
    // but server-loop delta compression should pick up 'isDead' change.

    // If we want to remove the corpse, we'd need to know the corpse ID.
    // Currently corpses are just spawned fire-and-forget in damage.js.
    // Ideally, we'd delete the corpse near the player, but for now we'll focus on the player state.

    log.info(`[Revive] ${target.firstName} has been revived.`);

    // Persist to Database
    try {
        await User.updateOne(
            { 'characters._id': target._id },
            {
                $set: {
                    'characters.$.stats.health': target.stats.health,
                    'characters.$.isDead': false
                }
            }
        );
    } catch (err) {
        log.error(`[Revive] Database persistence failed for ${targetId}:`, err);
    }

    // Force a full update or specific event if needed, but standard loop should handle it.
    // If 'io' is passed, we could emit a special effect event.
    if (io) {
        io.emit('playerRevived', { playerId: targetId });
        // Client can listen to this to play a sound or particle effect if implemented.
    }

    return { success: true };
}

module.exports = { healPlayer, revivePlayer };
