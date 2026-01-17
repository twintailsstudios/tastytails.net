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
async function processDigestion(players, User, io, addCorpse, messageSystem) {
    // log.debug('[Digestion] Running digestion cycle...');

    const victimIds = Object.keys(players);

    for (const victimId of victimIds) {
        const victim = players[victimId];

        // Check if victim is consumed
        if (!victim.consumedBy) continue;
        if (!victim.isInGame) continue; // Skip guests/character creator

        // Find the Predator
        // consumedBy stores the predator's 'playerId' (string), NOT socketId.
        const predatorSocketId = Object.keys(players).find(sid => players[sid].playerId === victim.consumedBy);
        const predator = players[predatorSocketId];

        if (!predator) {
            // Predator disconnected or invalid?
            // Existing logic handles release on disconnect elsewhere.
            continue;
        }

        // Check Anatomy / Vore Mode
        // We need to know WHICH node the victim is in.
        const currentNodeId = victim.currentVoreNodeId;
        // log.debug(`[DigestionDebug] Checking ${victim.firstName}. ConsumedBy: ${predator.firstName}. NodeId: ${currentNodeId}`);

        if (!currentNodeId) {
            // Legacy fallback or Stage 1? 
            // Digestion usually only happens in Stage 3 (Destination).
            // If we don't know the node, we can't determine mode/power.
            // log.debug(`[DigestionDebug] Skipping ${victim.firstName} - No currentNodeId`);
            continue;
        }

        let digestivePower = 'Normal';
        let shouldDigest = false;
        let nodeName = 'Stomach';
        let internalFate = "You have been digested.";
        let externalOutcome = null;

        // OPTIMIZATION: Rely ONLY on voreTypes (Runtime Array)
        // We no longer parse anatomyData here because:
        // 1. It is slow (JSON.parse on every tick/check).
        // 2. anatomyData is now compressed and lacks semantic props (verbs/power).
        if (predator.voreTypes) {
            // log.debug(`[DigestionDebug] Pred has ${predator.voreTypes.length} voreTypes.`);
            // Try to find matching voreType by graphNodeId (preferred) or ID
            const vt = predator.voreTypes.find(v => String(v.graphNodeId) === String(currentNodeId) || String(v.id) === String(currentNodeId));

            if (vt) {
                // log.debug(`[DigestionDebug] Found VT: ${vt.destination} Type:${vt.type} Mode:${vt.mode}`);
                // Check if it's a destination that digests
                if (vt.type === 'destination' && vt.mode === 'Digest') {
                    shouldDigest = true;
                    digestivePower = vt.digestivePower || 'Normal';
                    nodeName = vt.destination;
                    if (vt.digestionInsideMsgDescrip) internalFate = vt.digestionInsideMsgDescrip;
                    if (vt.digestionOutsideMsgDescrip) externalOutcome = vt.digestionOutsideMsgDescrip;
                } else {
                    // log.debug(`[DigestionDebug] VT matched but Mode is ${vt.mode} (Expected 'Digest') or Type is ${vt.type}`);
                }
            } else {
                // log.debug(`[DigestionDebug] No matching VT found for NodeId ${currentNodeId} in Pred's list.`);
                // predator.voreTypes.forEach(v => log.debug(`   - Available: ${v.graphNodeId} / ${v.id} (${v.destination})`));
            }
        } else {
            // log.debug(`[DigestionDebug] Predator has NO voreTypes array.`);
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
                // Pass NULL for addCorpse to suppress standard corpse spawning (victim is inside predator)
                const result = await applyDamage(players, User, victimId, damageAmount, predatorSocketId, 'acid', null, io);

                if (result.success) {
                    // Log / Message
                    log.info(`[Digestion] ${predator.firstName} digested ${victim.firstName} for ${damageAmount} damage (${digestivePower}). Health: ${result.newHealth}`);

                    // Check for Death Transition
                    if (!wasDead && result.dead) {
                        log.info(`[Digestion] ${victim.firstName} has been digested by ${predator.firstName}. Processing death release...`);

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
                                    processed = processed.replace(/\bYou's\b/gi, 'Your'); // Catch <pred>'s -> You's
                                }
                                if (isPrey) {
                                    const nameRegex = new RegExp(`\\b${preyName}\\b`, 'gi');
                                    processed = processed.replace(nameRegex, 'you');
                                }
                                return processed;
                            };

                            const preyMsg = processTags(internalFate, true, false);
                            // Ensure we use external outcome description for predator/external, adapted
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
                            // Crucial: Exclude using _id (Character ID)
                            const excludedIds = [];
                            if (victim._id) excludedIds.push(String(victim._id));
                            if (predator._id) excludedIds.push(String(predator._id));

                            if (externalMsg) {
                                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excludedIds, 'local', predatorSocket);
                                io.emit('voreLog', externalMsg);
                            }
                        }

                        // Save State
                        // Just rely on server loop saves or eventual consistency, 
                        // but updating 'dead' status is critical, which applyDamage handled via DB update.
                    }
                }
            } else {
                // log.debug(`[Digestion] ${predator.firstName}'s ${nodeName} failed to digest (Roll: ${roll.toFixed(2)} vs Chance: ${chance})`);
            }
        }
    }
}

module.exports = { processDigestion };
