/**
 * @fileoverview health.js - Anatomical Player Healing & Revival Server Mechanics Engine
 * 
 * @description
 * Server-side mechanics module for multi-limb player healing distribution, blood volume restoration,
 * and deceased player revival. Integrates with DatabaseResilience write-behind caching and Socket.IO real-time updates.
 * 
 * Triggered by: Chat slash commands (/heal, /revive) via MessageSystem.js, medical items (remedies.js), and spell effects.
 */

const log = require('../../logger');
const DatabaseResilience = require('../../classes/DatabaseResilience');
const { ensureAnatomyStats, recalculateTotalHealth } = require('./anatomyDamage');

/**
 * Heals a target player by a specified amount, distributing health across body parts
 * and replenishing blood volume.
 * 
 * @param {Object} players - Global in-memory dictionary of active player objects indexed by socket ID.
 * @param {Object} User - Mongoose User database model.
 * @param {string} targetId - Socket ID of the player to heal.
 * @param {number|string} amount - Health restoration value.
 * @param {Object} [io=null] - Optional Socket.IO instance for real-time client UI state updates.
 * @returns {Promise<{success: boolean, newHealth?: number, error?: string}>} Operation result payload.
 */
async function healPlayer(players, User, targetId, amount, io = null) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Health] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    // SAFEGUARD: Coerce and validate heal amount to prevent NaN/infinite/negative stat corruption
    const healAmount = Number(amount);
    if (isNaN(healAmount) || healAmount <= 0 || !isFinite(healAmount)) {
        log.warn(`[Health] Invalid heal amount '${amount}' requested for ${targetId}.`);
        return { success: false, error: 'Invalid heal amount' };
    }
    const safeAmount = Math.min(10000, Math.floor(healAmount));

    // DEFENSIVE PATTERN: Ensure character object possesses all required anatomical stat fields
    ensureAnatomyStats(target);

    // OPTIMIZATION: Use Object.values array iteration instead of for...in to prevent prototype chain traversals
    const parts = target.stats?.bodyParts || {};
    const healPerLimb = safeAmount / 4; // Share healing across damaged parts
    const partList = Object.values(parts);

    for (let i = 0; i < partList.length; i++) {
        const part = partList[i];
        if (part && part.hp < part.maxHp) {
            part.hp = Math.min(part.maxHp, part.hp + healPerLimb);
            part.brute = Math.max(0, (part.brute || 0) - healPerLimb);
            part.burn = Math.max(0, (part.burn || 0) - healPerLimb);
            part.toxin = Math.max(0, (part.toxin || 0) - healPerLimb);
            part.suffocation = Math.max(0, (part.suffocation || 0) - healPerLimb);
        }
    }

    // Restore blood volume proportional to heal (20x factor) capped at max blood volume
    target.stats.bloodVolume = Math.min(target.stats.maxBloodVolume, target.stats.bloodVolume + (safeAmount * 20));

    const finalHealth = recalculateTotalHealth(target);
    log.info(`[Health] ${target.firstName || target.Username} healed for ${safeAmount}. Health: ${finalHealth}/${target.stats.maxHealth}`);

    // OPTIMIZATION: Non-blocking write-behind database queue (avoids microtask promise tick overhead)
    try {
        DatabaseResilience.queueUpdate(
            User,
            { 'characters._id': target._id },
            {
                $set: {
                    'characters.$.stats': target.stats
                }
            }
        );
    } catch (err) {
        log.error(`[Health] Database persistence queue failed for ${targetId}:`, err);
    }

    // REAL-TIME SYNC: Emit targeted anatomy update to the client's socket if connected
    if (io) {
        const targetSocket = io.sockets?.sockets?.get ? io.sockets.sockets.get(targetId) : null;
        if (targetSocket) {
            targetSocket.emit('anatomyStatsUpdate', {
                stats: target.stats,
                isDead: target.isDead
            });
        }
    }

    return {
        success: true,
        newHealth: finalHealth
    };
}

/**
 * Revives a deceased player, resetting limb health, clearing bleeding/suffocation,
 * and broadcasting state synchronization events.
 * 
 * @param {Object} players - Global in-memory dictionary of active player objects indexed by socket ID.
 * @param {Object} User - Mongoose User database model.
 * @param {string} targetId - Socket ID of the player to revive.
 * @param {Object} [io=null] - Socket.IO instance for real-time client broadcasts.
 * @returns {Promise<{success: boolean, newHealth?: number, error?: string}>} Operation result payload.
 */
async function revivePlayer(players, User, targetId, io = null) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Revive] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    if (!target.isDead) {
        log.warn(`[Revive] Player ${target.firstName || target.Username} is already alive.`);
        return { success: false, error: 'Player is not dead' };
    }

    // Reset living state flag
    target.isDead = false;
    ensureAnatomyStats(target);

    // OPTIMIZATION & SAFEGUARD: Object.values loop ensures all body parts meet minimum HP floor (25 HP) & resets wound bleeding/suffocation
    const parts = target.stats?.bodyParts || {};
    const partList = Object.values(parts);
    for (let i = 0; i < partList.length; i++) {
        const part = partList[i];
        if (part) {
            if (part.hp < 25) part.hp = 25;
            part.suffocation = 0;
            part.bleeding = 0;
        }
    }
    target.stats.bleedingRate = 0;
    target.stats.bloodVolume = Math.max(1000, target.stats.bloodVolume);

    const finalHealth = recalculateTotalHealth(target);
    log.info(`[Revive] ${target.firstName || target.Username} has been revived. Health: ${finalHealth}`);

    // OPTIMIZATION: Non-blocking write-behind database queue for revived state persistence
    try {
        DatabaseResilience.queueUpdate(
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
        log.error(`[Revive] Database persistence queue failed for ${targetId}:`, err);
    }

    // SCALING OPTIMIZATION: Target specific player socket and local room scope to avoid O(N) server-wide socket broadcasts
    if (io) {
        const targetSocket = io.sockets?.sockets?.get ? io.sockets.sockets.get(targetId) : null;
        if (targetSocket) {
            targetSocket.emit('playerRevived', { playerId: targetId });
            targetSocket.emit('anatomyStatsUpdate', {
                stats: target.stats,
                isDead: false
            });
            if (target.currentRoom) {
                targetSocket.to(target.currentRoom).emit('playerRevived', { playerId: targetId });
            } else if (io.emit) {
                io.emit('playerRevived', { playerId: targetId });
            }
        } else if (io.emit) {
            io.emit('playerRevived', { playerId: targetId });
        }
    }

    return { success: true, newHealth: finalHealth };
}

module.exports = { healPlayer, revivePlayer };
