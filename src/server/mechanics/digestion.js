/**
 * @fileoverview digestion.js - Digestive Mechanics & Prey Death System
 * 
 * @description
 * Manages periodic digestion damage ticks, probabilistic limb targeting, real-time UI state sync,
 * and death/release pipelines for swallowed prey trapped in 'Digest' vore nodes on TastyTails.net.
 * 
 * Invoked continuously by the server tick loop (`src/server-loop.js`) using an O(K) active tracking set.
 */

const log = require('../../logger');
const { applyDamage } = require('./damage');

// Damage values based on Digestive Intensity (Power)
const DAMAGE_VALUES = {
    'Very Low': 10,
    'Low': 20,
    'Normal': 30,
    'High': 40,
    'Very High': 50
};

// Probability of damage occurring (0.0 - 1.0)
const DAMAGE_CHANCE = {
    'Very Low': 0.10,
    'Low': 0.20,
    'Normal': 0.30,
    'High': 0.40,
    'Very High': 0.50
};

// OPTIMIZATION: Module-scoped list of body parts to prevent per-tick object allocations in hot loops
const ALL_BODY_PARTS = Object.freeze([
    'head', 'torso', 'leftArm', 'rightArm', 'leftHand', 'rightHand',
    'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot', 'tail'
]);

/**
 * Escapes special regex characters in player names for safe dynamic RegExp creation.
 * @param {string} string - Raw player username or character name
 * @returns {string} Regex-escaped string
 */
function escapeRegExp(string) {
    return string ? string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
}

/**
 * Resolves a valid socketId from either a socketId or a playerId.
 * @param {string} id - Socket ID or character UUID
 * @param {Object} players - Global players object
 * @returns {string} Valid socket ID if found, or original ID
 */
function resolveSocketId(id, players) {
    if (!id || !players) return id;
    if (players[id]) return id;
    const foundSid = Object.keys(players).find(sid => players[sid] && players[sid].playerId === id);
    return foundSid || id;
}

/**
 * Global tracking set containing active victim socket IDs or player IDs.
 * Used to restrict digestion ticks to an O(K) subset of online players.
 */
const activeDigestions = new Set();

/**
 * Next eligible epoch execution timestamp (in ms) per victim ID.
 * Decouples digestion tick frequency (5s) from server frame rate.
 */
const digestionTimers = new Map();


/**
 * Registers a player into the active digestion loop.
 * @param {string} victimSocketId - Socket ID or Player UUID of swallowed victim
 */
function trackVictim(victimSocketId) {
    if (victimSocketId) {
        activeDigestions.add(victimSocketId);
        // Initialize timer for 5 seconds from now (standard tick rate)
        digestionTimers.set(victimSocketId, Date.now() + 5000);
    }
}

/**
 * Unregisters a player from the active digestion loop.
 * @param {string} victimSocketId - Socket ID or Player UUID of victim to untrack
 */
function untrackVictim(victimSocketId) {
    if (victimSocketId) {
        activeDigestions.delete(victimSocketId);
        digestionTimers.delete(victimSocketId);
    }
}

/**
 * Iterates through active digestion victims and applies periodic burn damage if applicable.
 * 
 * @param {Object} players - The global active players state map.
 * @param {Object} User - Mongoose User database model.
 * @param {Object} io - Socket.io server instance.
 * @param {Function} addCorpse - Global helper to spawn player corpses on map.
 * @param {Object} messageSystem - Central messaging system for chat channels.
 * @param {number} delta - Frame delta time in seconds.
 */
async function processDigestion(players, User, io, addCorpse, messageSystem, delta) {
    // log.debug(`[Digestion] Running digestion cycle (O(K)). Active: ${activeDigestions.size}, Delta: ${delta}`);

    const victimsToRemove = [];
    const now = Date.now();

    for (const victimId of activeDigestions) {
        try {
            // Check Timer
            const nextCheck = digestionTimers.get(victimId) || 0;
            if (now < nextCheck) {
                continue; // Not yet time for this victim
            }

            const victim = players[victimId] || players[resolveSocketId(victimId, players)];

            // Validation: If player disconnected or is no longer consumed
            if (!victim || !victim.consumedBy || !victim.isInGame) {
                victimsToRemove.push(victimId);
                continue;
            }

            // Update Timer irrespective of outcome (probabilistic check should happen every 5s)
            digestionTimers.set(victimId, now + 5000);

            // Find the Predator (Reconnection-Safe Cache with O(N) Fallback)
            let predatorSocketId = victim.consumedBySocketId;
            let predator = predatorSocketId ? players[predatorSocketId] : null;

            if (!predator || predator.playerId !== victim.consumedBy) {
                predatorSocketId = Object.keys(players).find(sid => players[sid] && players[sid].playerId === victim.consumedBy);
                predator = players[predatorSocketId];
                if (predator && predatorSocketId) {
                    victim.consumedBySocketId = predatorSocketId; // Cache for subsequent ticks
                }
            }

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
                // Suppress open wound bleeding inside the stomach
                if (victim.stats) {
                    victim.stats.bleedingRate = 0;
                }

                // Predictable Digestion Damage Values per 5s tick (scaled by digestivePower setting)
                const TICK_DAMAGE = {
                    'Very Low': 2,
                    'Low': 4,
                    'Normal': 6,
                    'High': 10,
                    'Very High': 15
                };

                const damageAmount = TICK_DAMAGE[digestivePower] || 6;

                // Select an active limb (>0 HP) to apply burn damage evenly
                let availableParts = ALL_BODY_PARTS;
                if (victim.stats && victim.stats.bodyParts) {
                    const activeLimbs = ALL_BODY_PARTS.filter(partKey => {
                        const pObj = victim.stats.bodyParts[partKey];
                        return pObj && typeof pObj.hp === 'number' && pObj.hp > 0;
                    });
                    if (activeLimbs.length > 0) {
                        availableParts = activeLimbs;
                    }
                }
                const randomTargetPart = availableParts[Math.floor(Math.random() * availableParts.length)];

                // Apply Burn Damage to randomly chosen active body part
                const result = await applyDamage(players, User, victimId, damageAmount, predatorSocketId, 'burn', null, io, randomTargetPart);

                if (result.success) {
                    const maxHp = victim.stats ? (victim.stats.maxHealth || 100) : 100;
                    const newHp = Math.max(0, result.newHealth);
                    const progressPct = Math.max(0, Math.min(1.0, (maxHp - newHp) / maxHp));
                    victim.digestionProgressPct = progressPct;

                    const secPerTick = 5;
                    const ticksRemaining = damageAmount > 0 ? Math.ceil(newHp / damageAmount) : 0;
                    const secondsRemaining = ticksRemaining * secPerTick;

                    log.info(`[Digestion] ${predator.firstName} digested ${victim.firstName} for ${damageAmount} burn damage (${digestivePower}). Health: ${newHp}/${maxHp} (${Math.round(progressPct * 100)}%). Est. Time Remaining: ${secondsRemaining}s`);

                    // Live update predator and victim Vore Controls UI with synchronized target health & progress
                    if (!result.dead && io) {
                        const targetSockets = [victimId, predatorSocketId].filter(sid => sid && io.sockets && io.sockets.sockets.has(sid));
                        targetSockets.forEach(sid => {
                            io.to(sid).emit('voreStageUpdate', {
                                playerId: victim.playerId,
                                predatorId: predator.playerId,
                                stage: victim.voreStage || 3,
                                nodeName: nodeName,
                                targetName: victim.Username || (victim.firstName + ' ' + victim.lastName),
                                targetHp: Math.round(newHp),
                                targetMaxHp: Math.round(maxHp),
                                digestionProgressPct: progressPct,
                                estimatedSecondsRemaining: secondsRemaining,
                                digestivePower: digestivePower,
                                destinationMode: 'Digest',
                                nodeVoreTypeId: currentNodeId,
                                clenchSuppressedUntil: victim.clenchSuppressedUntil || 0,
                                clenchCooldownUntil: predator.clenchCooldownUntil || 0
                            });
                        });
                    }

                    // Check for Death Transition
                    if (result.dead || victim.isDead || (victim.stats && victim.stats.health <= 0)) {
                        victimsToRemove.push(victimId);
                        await processDigestionDeath(
                            victim,
                            predator,
                            players,
                            User,
                            io,
                            addCorpse,
                            messageSystem,
                            nodeName,
                            internalFate,
                            externalOutcome
                        );
                    }
                }
            }
        } catch (err) {
            log.error(`[Digestion] Error processing digestion for victim ${victimId}:`, err);
            victimsToRemove.push(victimId);
        }
    }

    // Cleanup Stale Entries
    victimsToRemove.forEach(id => {
        untrackVictim(id);
    });
}

/**
 * Processes digestion death and release sequence for a victim player.
 * Resolves node descriptions, updates player/predator states, teleports victim spirit,
 * emits targeted UI events, and dispatches roleplay chat messages.
 * 
 * @param {Object} victim - Victim player object
 * @param {Object} predator - Predator player object
 * @param {Object} players - Global players object
 * @param {Object} User - Mongoose User model
 * @param {Object} io - Socket.io instance
 * @param {Function} addCorpse - Corpse addition function
 * @param {Object} messageSystem - Messaging system
 * @param {string} [customNodeName=null] - Optional destination node name override
 * @param {string} [customInternalFate=null] - Optional inside message override
 * @param {string} [customExternalOutcome=null] - Optional outside message override
 */
async function processDigestionDeath(victim, predator, players, User, io, addCorpse, messageSystem, customNodeName = null, customInternalFate = null, customExternalOutcome = null) {
    if (!victim) return;
    const victimId = Object.keys(players).find(sid => players[sid] === victim) || victim.playerId;
    const predatorSocketId = predator ? (Object.keys(players).find(sid => players[sid] === predator) || predator.playerId) : null;

    log.info(`[Digestion] ${victim.firstName || victim.Username} has been digested by ${predator ? (predator.firstName || predator.Username) : 'Predator'}. Processing death release...`);

    // 1. Resolve destination node properties from predator.voreTypes or predator.graphNodes
    let nodeName = customNodeName;
    let internalFate = customInternalFate;
    let externalOutcome = customExternalOutcome;

    const currentNodeId = victim.currentVoreNodeId;
    let vt = null;

    if (predator && predator.voreTypes && currentNodeId) {
        vt = predator.voreTypes.find(v => 
            String(v.graphNodeId) === String(currentNodeId) || 
            String(v.id) === String(currentNodeId) ||
            String(v._id) === String(currentNodeId) ||
            v.destination === currentNodeId ||
            v.name === currentNodeId
        );
    }

    if (!vt && predator && predator.voreTypes) {
        vt = predator.voreTypes.find(v => v.mode === 'Digest' && (v.type === 'destination' || v.isDestination));
    }

    if (vt) {
        if (!nodeName || nodeName === 'Stomach') {
            nodeName = vt.destination || vt.name || (vt.properties && vt.properties.name) || 'Stomach';
        }
        if (!internalFate || internalFate === 'You have been digested.') {
            internalFate = vt.digestionInsideMsgDescrip || (vt.properties && vt.properties.digestionInsideMsgDescrip) || 'You feel your body softening in the acids...';
        }
        if (!externalOutcome) {
            externalOutcome = vt.digestionOutsideMsgDescrip || (vt.properties && vt.properties.digestionOutsideMsgDescrip) || `<pred>'s ${nodeName} churns as <prey> is fully digested.`;
        }
    }

    if (!nodeName) nodeName = 'Stomach';
    if (!internalFate) internalFate = 'You feel your body softening in the acids...';
    if (!externalOutcome) externalOutcome = `<pred>'s ${nodeName} churns as <prey> is fully digested.`;

    // Ensure victim is marked dead
    victim.isDead = true;
    if (victim.stats) victim.stats.health = 0;

    // Release Spirit to Map at predator's location
    if (predator && predator.position && victim.position) {
        victim.position.x = predator.position.x;
        victim.position.y = predator.position.y;
    }

    // Clear Consumed / Held State
    victim.consumedBy = null;
    victim.voreStage = 0;
    victim.currentVoreNodeId = null;
    victim.isHeld = false;
    victim.heldBy = null;
    victim.heldBySocketId = null;
    victim.grippedFirmly = false;
    victim.grippedBy = null;
    victim.struggleCount = 0;

    // Predator state update
    if (predator) {
        if (predator.holding === victimId || predator.holding === victim.playerId) {
            predator.holding = null;
        }

        // Update Predator Contents
        if (predator.voreTypes) {
            predator.voreTypes.forEach(nodeItem => {
                if (nodeItem.contents) {
                    const tName = victim.Username || (victim.firstName + ' ' + victim.lastName);
                    const idx = nodeItem.contents.indexOf(tName);
                    if (idx > -1) nodeItem.contents.splice(idx, 1);
                }
            });
        }
    }

    // Emit UI updates to close Vore Controls Window (Targeted Socket Emission)
    if (io) {
        const targetSockets = [victimId, predatorSocketId].filter(sid => sid && io.sockets && io.sockets.sockets.has(sid));
        targetSockets.forEach(sid => {
            io.to(sid).emit('voreStageUpdate', {
                playerId: victim.playerId,
                predatorId: predator ? predator.playerId : null,
                stage: 0,
                nodeName: null
            });
        });
    }

    // Chat Message Formatting & Delivery
    if (predator) {
        const predName = (predator.firstName + ' ' + predator.lastName).trim() || predator.Username || 'Predator';
        const preyName = (victim.firstName + ' ' + victim.lastName).trim() || victim.Username || 'Prey';

        const processTags = (text, isPrey, isPred) => {
            let processed = text || '';
            const predPronouns = predator.pronouns || 'She/Her';
            const preyPronouns = victim.pronouns || 'He/Him';
            processed = processed
                .replace(/<pred>/gi, isPred ? 'You' : predName)
                .replace(/<pred_name>/gi, isPred ? 'You' : predName)
                .replace(/<prey>/gi, isPrey ? 'you' : preyName)
                .replace(/<prey_name>/gi, isPrey ? 'you' : preyName)
                .replace(/<node>/gi, nodeName)
                .replace(/<organ>/gi, nodeName)
                .replace(/<pred_pronouns>/gi, isPred ? 'your' : predPronouns)
                .replace(/<prey_pronouns>/gi, isPrey ? 'your' : preyPronouns)
                .replace(/<pronouns>/gi, isPred ? 'your' : predPronouns)
                .replace(/<he\/she>/gi, isPred ? 'You' : (predator.pronounSubject || 'she'))
                .replace(/<his\/her>/gi, isPred ? 'your' : (predator.pronounPossessive || 'her'))
                .replace(/<him\/her>/gi, isPred ? 'you' : (predator.pronounObject || 'her'));

            if (isPred) {
                const safePredName = escapeRegExp(predName);
                const nameRegex = new RegExp(`\\b${safePredName}\\b`, 'gi');
                processed = processed.replace(nameRegex, 'You');
                processed = processed.replace(/\btheir\b/gi, 'your');
                processed = processed.replace(/\btheirs\b/gi, 'yours');
                processed = processed.replace(/\bYou's\b/gi, 'Your');
            }
            if (isPrey) {
                const safePreyName = escapeRegExp(preyName);
                const nameRegex = new RegExp(`\\b${safePreyName}\\b`, 'gi');
                processed = processed.replace(nameRegex, 'you');
            }
            return processed;
        };

        const preyMsg = processTags(internalFate, true, false);
        const predMsg = processTags(externalOutcome, false, true);
        const externalMsg = processTags(externalOutcome, false, false);

        const victimSocket = io && victimId && io.sockets.sockets.get(victimId);
        const predatorSocket = io && predatorSocketId && io.sockets.sockets.get(predatorSocketId);

        if (messageSystem) {
            if (victimSocket) {
                messageSystem.sendSystemMessage('Interactional', preyMsg, victimSocket, [], 'local', predatorSocket);
            }
            if (predatorSocket) {
                messageSystem.sendSystemMessage('Interactional', predMsg, predatorSocket, [], 'local', predatorSocket);
            }

            const excludedIds = [];
            if (victim._id) excludedIds.push(String(victim._id));
            if (predator._id) excludedIds.push(String(predator._id));

            if (externalMsg) {
                messageSystem.sendSystemMessage('Interactional', externalMsg, null, excludedIds, 'local', predatorSocket);
                if (io) io.emit('voreLog', externalMsg);
            }
        } else {
            // Direct socket chat emission fallback if messageSystem instance is not provided
            const ts = new Date();
            if (victimSocket) {
                victimSocket.emit('chatMessage', { channel: 'Interactional', text: preyMsg, timestamp: ts });
            }
            if (predatorSocket) {
                predatorSocket.emit('chatMessage', { channel: 'Interactional', text: predMsg, timestamp: ts });
            }
            if (io) {
                io.emit('chatMessage', { channel: 'Interactional', text: externalMsg, timestamp: ts });
                io.emit('voreLog', externalMsg);
            }
        }
    }

    // Untrack victim from active digestion loop
    untrackVictim(victimId);
    if (victim.playerId) untrackVictim(victim.playerId);
}

module.exports = { processDigestion, processDigestionDeath, trackVictim, untrackVictim };
