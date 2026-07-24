/**
 * damage.js
 * 
 * Handles damage calculation and application for players (and potentially NPCs).
 * Integrates multi-typed anatomical limb damage and updates server state.
 */

const log = require('../../logger');
const DatabaseResilience = require('../../classes/DatabaseResilience');
const { applyAnatomyDamage } = require('./anatomyDamage');

/**
 * Applies damage to a player.
 * 
 * @param {Object} players - The global players object (reference).
 * @param {Object} User - The Mongoose User model (for critical updates).
 * @param {string} targetId - The socket ID of the victim.
 * @param {number} amount - The amount of damage to deal.
 * @param {string} sourceId - The socket ID of the attacker (optional).
 * @param {string} damageType - The type of damage (e.g., 'brute', 'burn', 'toxin', 'suffocation') (optional).
 * @param {Function} addCorpse - Function to spawn corpse.
 * @param {Object} io - Socket.io instance for broadcasting.
 * @param {string|null} targetPart - Body part target ('leftFoot', 'head', etc.)
 * 
 * @returns {Object} Result - { success: boolean, newHealth: number, dead: boolean, bodyPart: string, damageType: string }
 */
async function applyDamage(players, User, targetId, amount, sourceId = null, damageType = 'generic', addCorpse = null, io = null, targetPart = null, messageSystem = null) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Damage] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    // Apply multi-typed anatomical damage engine
    const outcome = applyAnatomyDamage(target, amount, damageType, targetPart);
    const dead = outcome.dead;

    // Check for Death Transition
    const isVictimDead = dead || (target.stats && target.stats.health <= 0);

    if (isVictimDead) {
        // If victim is consumed by a predator, trigger digestion death & UI release pipeline
        if (target.consumedBy) {
            try {
                const { processDigestionDeath } = require('./digestion');
                const predatorSocketId = Object.keys(players).find(sid => players[sid].playerId === target.consumedBy);
                const predator = players[predatorSocketId];
                await processDigestionDeath(target, predator, players, User, io, addCorpse, messageSystem);
            } catch (err) {
                log.error(`[Damage] Error processing digestion death for ${target.Username}:`, err);
            }
        }

        if (!target.isDead) { // Only trigger corpse spawn on first death frame
            target.isDead = true;

            // Spawn Corpse
            if (addCorpse) {
                const corpseData = {
                    x: target.position ? target.position.x : 0,
                    y: target.position ? target.position.y : 0,
                    rotation: target.rotation || 0,
                    name: target.Username,
                    firstName: target.firstName,
                    lastName: target.lastName,
                    // Appearance Snapshot
                    head: target.head ? JSON.parse(JSON.stringify(target.head)) : {},
                    body: target.body ? JSON.parse(JSON.stringify(target.body)) : {},
                    hands: target.hands ? JSON.parse(JSON.stringify(target.hands)) : {},
                    feet: target.feet ? JSON.parse(JSON.stringify(target.feet)) : {},
                    tail: target.tail ? JSON.parse(JSON.stringify(target.tail)) : {},
                    eyes: target.eyes ? JSON.parse(JSON.stringify(target.eyes)) : {},
                    hair: target.hair ? JSON.parse(JSON.stringify(target.hair)) : {},
                    ear: target.ear ? JSON.parse(JSON.stringify(target.ear)) : {},
                    genitles: target.genitles ? JSON.parse(JSON.stringify(target.genitles)) : {},
                    beak: target.beak ? JSON.parse(JSON.stringify(target.beak)) : {},
                    headAccessories: target.headAccessories ? JSON.parse(JSON.stringify(target.headAccessories)) : {},
                    // Equipment
                    equipment: target.equipment ? JSON.parse(JSON.stringify(target.equipment)) : {}
                };

                const corpseId = addCorpse(corpseData);
                log.info(`[Damage] Spawning corpse for ${target.firstName} (ID: ${corpseId})`);

                // Broadcast Corpse Spawn
                if (io) {
                    io.emit('corpseSpawned', { ...corpseData, id: corpseId });
                }
            }
        }
    } else if (!dead && target.isDead) {
        target.isDead = false;
    }

    log.info(`[Damage] ${target.Username || 'Player'} took ${amount} (${outcome.damageType}) to ${outcome.bodyPart}. Health: ${target.stats.health}/${target.stats.maxHealth}. Dead: ${dead}`);

    // Persist to Database asynchronously via Resilience Queue
    try {
        if (User && target._id) {
            await DatabaseResilience.queueUpdate(
                User,
                { 'characters._id': target._id },
                {
                    $set: {
                        'characters.$.stats': target.stats,
                        'characters.$.isDead': target.isDead
                    }
                }
            );
        }
    } catch (err) {
        log.error(`[Damage] Database persistence failed for ${targetId}:`, err);
    }

    // Broadcast anatomical status update to target socket if io exists
    if (io) {
        const socketObj = io.sockets.sockets.get(targetId);
        if (socketObj) {
            socketObj.emit('anatomyStatsUpdate', {
                stats: target.stats,
                isDead: target.isDead,
                lastOutcome: outcome
            });
        }
    }

    return {
        success: true,
        newHealth: target.stats.health,
        dead: dead,
        targetId: targetId,
        sourceId: sourceId,
        bodyPart: outcome.bodyPart,
        damageType: outcome.damageType,
        fractured: outcome.fractured,
        itemDropped: outcome.itemDropped
    };
}

module.exports = { applyDamage };
