/**
 * @fileoverview High-Level Damage Processing & Player Death Facade Module
 * 
 * @description
 * Primary server-side damage dispatcher for TastyTails.net.
 * Orchestrates multi-typed anatomical body part calculations, player death state transitions,
 * digestion release hooks, immutable corpse appearance snapshot creation, resilient database queueing,
 * and Socket.IO client updates.
 * 
 * Triggered by:
 * - Melee / Combat interactions (`src/sockets/interactionHandlers.js`)
 * - Environment / Hazard ticks (`src/server-loop.js`)
 * - Combat / System chat commands (`src/classes/MessageSystem.js`)
 * - Predator stomach acid digestion ticks (`src/server/mechanics/digestion.js`)
 */

const log = require('../../logger');
const DatabaseResilience = require('../../classes/DatabaseResilience');
const { applyAnatomyDamage } = require('./anatomyDamage');

/**
 * OPTIMIZATION: Safely deep-clones an object using structuredClone when available,
 * falling back to JSON serialization on error or environment incompatibility.
 * Prevents V8 Garbage Collection spikes from repeated stringify cycles.
 * 
 * @param {Object|null|undefined} obj - Object to clone.
 * @returns {Object} Deep clone of the object, or empty object if null/undefined.
 */
function safeClone(obj) {
    if (!obj) return {};
    try {
        return typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
    } catch (err) {
        return JSON.parse(JSON.stringify(obj));
    }
}

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
async function applyDamage(players, User, targetId, amount, sourceId = null, damageType = 'generic', addCorpse = null, io = null, targetPart = null, messageSystem = null, options = {}) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Damage] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    // Apply multi-typed anatomical damage engine
    const outcome = applyAnatomyDamage(target, amount, damageType, targetPart, options);
    const dead = outcome.dead;

    // Check for Death vs Downed Transition
    const healthDepleted = dead || (target.stats && target.stats.health <= 0);
    const isDigestionDeath = !!target.consumedBy;
    const isTimerExpired = target.isDowned && target.downedTimer <= 0;
    const isExecution = amount >= 100;

    const isVictimDead = healthDepleted && (isDigestionDeath || isTimerExpired || isExecution);

    if (healthDepleted && !isVictimDead && !target.isDead) {
        target.isDowned = true;
        if (!target.downedTimer || target.downedTimer <= 0) target.downedTimer = 90;
    }

    if (isVictimDead) {
        const wasAlreadyDead = target.isDead;
        target.isDead = true;
        target.isDowned = false;

        // If victim is consumed by a predator, trigger digestion death & UI release pipeline
        if (target.consumedBy) {
            try {
                const { processDigestionDeath } = require('./digestion');
                // OPTIMIZATION: Prefer direct O(1) socket ID reference before falling back to O(N) players array scan
                let predatorSocketId = target.consumedBySocketId;
                let predator = predatorSocketId ? players[predatorSocketId] : null;
                if (!predator || predator.playerId !== target.consumedBy) {
                    predatorSocketId = Object.keys(players).find(sid => players[sid] && players[sid].playerId === target.consumedBy);
                    predator = predatorSocketId ? players[predatorSocketId] : null;
                }
                await processDigestionDeath(target, predator, players, User, io, addCorpse, messageSystem);
            } catch (err) {
                log.error(`[Damage] Error processing digestion death for ${target.Username}:`, err);
                if (!wasAlreadyDead) target.isDead = false;
            }
        }

        if (!wasAlreadyDead) { // Only trigger corpse spawn on first death frame
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
                    head: safeClone(target.head),
                    body: safeClone(target.body),
                    hands: safeClone(target.hands),
                    feet: safeClone(target.feet),
                    tail: safeClone(target.tail),
                    eyes: safeClone(target.eyes),
                    hair: safeClone(target.hair),
                    ear: safeClone(target.ear),
                    genitals: safeClone(target.genitals || target.genitles),
                    beak: safeClone(target.beak),
                    headAccessories: safeClone(target.headAccessories),
                    // Equipment
                    equipment: safeClone(target.equipment)
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
