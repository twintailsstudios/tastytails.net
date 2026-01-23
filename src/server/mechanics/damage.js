/**
 * damage.js
 * 
 * Handles damage calculation and application for players (and potentially NPCs).
 * Updates server state and persists changes to the database.
 */

const log = require('../../logger');
const DatabaseResilience = require('../../classes/DatabaseResilience');

/**
 * Applies damage to a player.
 * 
 * @param {Object} players - The global players object (reference).
 * @param {Object} User - The Mongoose User model (for critical updates).
 * @param {string} targetId - The socket ID of the victim.
 * @param {number} amount - The amount of damage to deal.
 * @param {string} sourceId - The socket ID of the attacker (optional).
 * @param {string} damageType - The type of damage (e.g., 'physical', 'magical') (optional).
 * 
 * @returns {Object} Result - { success: boolean, newHealth: number, dead: boolean }
 */
async function applyDamage(players, User, targetId, amount, sourceId = null, damageType = 'generic', addCorpse = null, io = null) {
    const target = players[targetId];
    if (!target) {
        log.error(`[Damage] Target player ${targetId} not found.`);
        return { success: false, error: 'Target not found' };
    }

    if (!target.stats) {
        // Initialize if missing (defensive)
        target.stats = { health: 100, maxHealth: 100 };
    }

    // Calculate actual damage (extensible for armor/resistances later)
    // For now, raw damage.
    const finalAmount = amount;

    // Apply Damage
    target.stats.health -= finalAmount;

    // Clamp to 0
    if (target.stats.health < 0) target.stats.health = 0;

    // Clamp to Max (in case of negative damage/healing)
    if (target.stats.health > target.stats.maxHealth) target.stats.health = target.stats.maxHealth;

    const dead = target.stats.health <= 0;

    // Check for Death Transition
    if (dead && !target.isDead) { // Only trigger on first death frame
        target.isDead = true;

        // Spawn Corpse
        if (addCorpse) {
            const corpseData = {
                x: target.position.x,
                y: target.position.y,
                rotation: target.rotation,
                name: target.Username,
                firstName: target.firstName,
                lastName: target.lastName,
                // Appearance Snapshot
                head: JSON.parse(JSON.stringify(target.head)),
                body: JSON.parse(JSON.stringify(target.body)),
                hands: JSON.parse(JSON.stringify(target.hands)),
                feet: JSON.parse(JSON.stringify(target.feet)),
                tail: JSON.parse(JSON.stringify(target.tail)),
                eyes: JSON.parse(JSON.stringify(target.eyes)),
                hair: JSON.parse(JSON.stringify(target.hair)),
                ear: JSON.parse(JSON.stringify(target.ear)),
                genitles: JSON.parse(JSON.stringify(target.genitles)),
                beak: JSON.parse(JSON.stringify(target.beak)),
                headAccessories: JSON.parse(JSON.stringify(target.headAccessories)),
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
    } else if (!dead && target.isDead) {
        // Revived?
        target.isDead = false;
    }

    log.info(`[Damage] ${target.Username || 'Player'} took ${finalAmount} damage. Health: ${target.stats.health}/${target.stats.maxHealth}. Dead: ${dead}`);

    // Persist to Database immediately for critical state change (Health)
    // We use a specific update to avoid overwriting other concurrent save operations if possible,
    // [RESILIENCE] Queue Update instead of Direct Write
    try {
        await DatabaseResilience.queueUpdate(
            User,
            { 'characters._id': target._id },
            {
                $set: {
                    'characters.$.stats.health': target.stats.health,
                    'characters.$.isDead': target.isDead
                }
            }
        );
    } catch (err) {
        log.error(`[Damage] Database persistence failed for ${targetId}:`, err);
    }

    return {
        success: true,
        newHealth: target.stats.health,
        dead: dead,
        targetId: targetId,
        sourceId: sourceId
    };
}

module.exports = { applyDamage };
