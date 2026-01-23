/**
 * digestion.js
 * 
 * Handles periodic digestion damage for players trapped inside a "Digest" vore destination.
 */

const log = require('../../logger');
const { applyDamage } = require('./damage');

// Damage values based on Digestive Intensity (Power)
const DAMAGE_VALUES = {
    'Very Low': 1,
    'Low': 2,
    'Normal': 3,
    'High': 4,
    'Very High': 5
};

// Probability of damage occurring (0.0 - 1.0)
const DAMAGE_CHANCE = {
    'Very Low': 0.10,
    'Low': 0.20,
    'Normal': 0.30,
    'High': 0.40,
    'Very High': 0.50
};

/**
 * Iterates through all players and applies digestion damage if applicable.
 * 
 * @param {Object} players - The global players object.
 * @param {Object} User - The Mongoose User model.
 * @param {Object} io - The Socket.io instance for emitting events.
 */
const activeDigestions = new Set();
const digestionTimers = new Map(); // Stores next eligible process time for each victim


/**
 * Adds a player to the active digestion list.
 * @param {string} victimSocketId 
 */
function trackVictim(victimSocketId) {
    if (victimSocketId) {
        activeDigestions.add(victimSocketId);
        // Initialize timer for 5 seconds from now (standard tick rate)
        digestionTimers.set(victimSocketId, Date.now() + 5000);
        // log.debug(`[Digestion] Tracking ${victimSocketId}. Total: ${activeDigestions.size}`);
    }
}

/**
 * Removes a player from the active digestion list.
 * @param {string} victimSocketId 
 */
function untrackVictim(victimSocketId) {
    if (victimSocketId) {
        activeDigestions.delete(victimSocketId);
        digestionTimers.delete(victimSocketId);
        // log.debug(`[Digestion] Untracked ${victimSocketId}. Total: ${activeDigestions.size}`);
    }
}

/**
 * Iterates through all players and applies digestion damage if applicable.
 * 
 * @param {Object} players - The global players object.
 * @param {Object} User - The Mongoose User model.
 * @param {Object} io - The Socket.io instance for emitting events.
 * @param {Function} addCorpse - Function to add a corpse.
 * @param {Object} messageSystem - The message system.
 * @param {number} delta - Time since last update (in seconds).
 */
async function processDigestion(players, User, io, addCorpse, messageSystem, delta) {
    // log.debug(`[Digestion] Running digestion cycle (O(K)). Active: ${activeDigestions.size}, Delta: ${delta}`);

    const victimsToRemove = [];
    const now = Date.now();

    for (const victimId of activeDigestions) {
        // Check Timer
        const nextCheck = digestionTimers.get(victimId) || 0;
        if (now < nextCheck) {
            continue; // Not yet time for this victim
        }

        const victim = players[victimId];

        // Validation: If player disconnected or is no longer consumed
        if (!victim || !victim.consumedBy || !victim.isInGame) {
            victimsToRemove.push(victimId);
            continue;
        }

        // Update Timer irrespective of outcome (probabilistic check should happen every 5s)
        digestionTimers.set(victimId, now + 5000);

        // Find the Predator
        // consumedBy stores the predator's 'playerId' (string), NOT socketId.
        const predatorSocketId = Object.keys(players).find(sid => players[sid].playerId === victim.consumedBy);
        const predator = players[predatorSocketId];

        if (!predator) {
            // Predator disconnected? Release victim?
            // For now, just stop digesting. Cleanup handled elsewhere.
            victimsToRemove.push(victimId);
            continue;
        }

        // Check Anatomy / Vore Mode
        const currentNodeId = victim.currentVoreNodeId;

        if (!currentNodeId) {
            continue;
        }

        let digestivePower = 'Normal';
        let shouldDigest = false;
        let nodeName = 'Stomach';
        let internalFate = "You have been digested.";
        let externalOutcome = null;

        // OPTIMIZATION: Rely ONLY on voreTypes (Runtime Array)
        if (predator.voreTypes) {
            const vt = predator.voreTypes.find(v => String(v.graphNodeId) === String(currentNodeId) || String(v.id) === String(currentNodeId));

            if (vt) {
                // Check if it's a destination that digests
                if (vt.type === 'destination' && vt.mode === 'Digest') {
                    shouldDigest = true;
                    digestivePower = vt.digestivePower || 'Normal';
                    nodeName = vt.destination;
                    if (vt.digestionInsideMsgDescrip) internalFate = vt.digestionInsideMsgDescrip;
                    if (vt.digestionOutsideMsgDescrip) externalOutcome = vt.digestionOutsideMsgDescrip;
                }
            }
        }

        if (shouldDigest) {
            // Probability Check
            const chance = DAMAGE_CHANCE[digestivePower] || 0.30;
            const roll = Math.random();

            if (roll < chance) {
                const damageAmount = DAMAGE_VALUES[digestivePower] || 3;

                // Check death state BEFORE damage
                const wasDead = victim.isDead;

                // Apply Damage
                const result = await applyDamage(players, User, victimId, damageAmount, predatorSocketId, 'acid', null, io);

                if (result.success) {
                    // Log / Message
                    log.info(`[Digestion] ${predator.firstName} digested ${victim.firstName} for ${damageAmount} damage (${digestivePower}). Health: ${result.newHealth}`);

                    // Check for Death Transition
                    if (!wasDead && result.dead) {
                        log.info(`[Digestion] ${victim.firstName} has been digested by ${predator.firstName}. Processing death release...`);

                        // Stop tracking this victim as they are dead/processed
                        victimsToRemove.push(victimId);

                        // --- 1. Release Spirit to Map ---
                        // Position ghost at predator's location
                        victim.position.x = predator.position.x;
                        victim.position.y = predator.position.y;

                        // Clear Consumed/Held State
                        victim.consumedBy = null;
                        victim.voreStage = 0;
                        victim.currentVoreNodeId = null;
                        victim.isHeld = false;
                        victim.heldBy = null;
                        victim.heldBySocketId = null;
                        victim.grippedFirmly = false;
                        victim.grippedBy = null;
                        victim.struggleCount = 0;

                        // Predator state update (if holding target)
                        if (predator.holding === victimId) {
                            predator.holding = null;
                        }

                        // --- 2. Update Predator Contents (Legacy list) ---
                        if (predator.voreTypes) {
                            predator.voreTypes.forEach(vt => {
                                if (vt.contents) {
                                    const tName = victim.Username || (victim.firstName + ' ' + victim.lastName);
                                    const idx = vt.contents.indexOf(tName);
                                    if (idx > -1) vt.contents.splice(idx, 1);
                                }
                            });
                        }

                        // --- 3. Emit UI Updates ---
                        io.emit('voreStageUpdate', {
                            playerId: victim.playerId,
                            predatorId: predator.playerId,
                            stage: 0,
                            nodeName: null
                        });

                        // --- 4. Chat Messages (Refactored) ---
                        if (messageSystem) {
                            const predName = (predator.firstName + ' ' + predator.lastName);
                            const preyName = (victim.firstName + ' ' + victim.lastName);

                            // Helper: processTags (Inlined to avoid dependency issues)
                            const processTags = (text, isPrey, isPred) => {
                                let processed = text || '';
                                processed = processed
                                    .replace(/<pred>/gi, isPred ? 'You' : predName)
                                    .replace(/<prey>/gi, isPrey ? 'you' : preyName)
                                    .replace(/<node>/gi, nodeName);

                                if (isPred) {
                                    const nameRegex = new RegExp(`\\b${predName}\\b`, 'gi');
                                    processed = processed.replace(nameRegex, 'You');
                                    processed = processed.replace(/\btheir\b/gi, 'your');
                                    processed = processed.replace(/\btheirs\b/gi, 'yours');
                                    processed = processed.replace(/\bYou's\b/gi, 'Your');
                                }
                                if (isPrey) {
                                    const nameRegex = new RegExp(`\\b${preyName}\\b`, 'gi');
                                    processed = processed.replace(nameRegex, 'you');
                                }
                                return processed;
                            };

                            const preyMsg = processTags(internalFate, true, false);
                            const rawPredMsg = externalOutcome || `<pred>'s ${nodeName} churns as <prey> is fully digested.`;
                            const predMsg = processTags(rawPredMsg, false, true);
                            const externalMsg = processTags(rawPredMsg, false, false);

                            const victimSocket = io.sockets.sockets.get(victimId);
                            const predatorSocket = io.sockets.sockets.get(predatorSocketId);

                            // 1. Prey Message
                            if (victimSocket) {
                                messageSystem.sendSystemMessage('Interactional', preyMsg, victimSocket, [], 'local', predatorSocket);
                            }

                            // 2. Predator Message
                            if (predatorSocket) {
                                messageSystem.sendSystemMessage('Interactional', predMsg, predatorSocket, [], 'local', predatorSocket);
                            }

                            // 3. External (Observers)
                            const excludedIds = [];
                            if (victim._id) excludedIds.push(String(victim._id));
                            if (predator._id) excludedIds.push(String(predator._id));

                            if (externalMsg) {
                                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excludedIds, 'local', predatorSocket);
                                io.emit('voreLog', externalMsg);
                            }
                        }
                    }
                }
            }
        }
    }

    // Cleanup Stale Entries
    victimsToRemove.forEach(id => {
        activeDigestions.delete(id);
        digestionTimers.delete(id);
    });
}

module.exports = { processDigestion, trackVictim, untrackVictim };
