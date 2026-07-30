/**
 * @fileoverview Vore & Anatomy Settings Socket Event Handlers
 * 
 * @description
 * Manages WebSocket communication for custom character anatomy, vore destinations,
 * and organ settings in TastyTails.net. Synchronizes Anatomy Forge node graph state
 * between client-side UI, active server in-memory player state (`players`), and MongoDB.
 * 
 * @module sockets/voreHandlers
 * @requires ../logger
 * @requires ../classes/DatabaseResilience
 */

const log = require('../logger');
const DatabaseResilience = require('../classes/DatabaseResilience');

/**
 * Binds vore-related socket event listeners to an active client connection.
 * 
 * @param {import('socket.io').Server} io - Socket.IO Server instance for room broadcasting
 * @param {import('socket.io').Socket} socket - Connected client WebSocket socket instance
 * @param {Object<string, Object>} players - Global server map of socket.id -> player state objects
 * @param {import('mongoose').Model} User - Mongoose User schema model
 * @param {Function} saveCharacter - Legacy character save callback (superseded by DatabaseResilience)
 */
module.exports = function (io, socket, players, User, saveCharacter) {
    const logPrefix = `[Vore:${socket.id}]`;

    // --- Vore Settings Handlers ---

    /**
     * Handles incremental updates to a single vore destination node's settings.
     * 
     * @event updateVoreType
     * @param {Object} data - Payload containing node ID and modified settings
     * @param {string} data.id - MongoDB ObjectId string of the vore destination
     * @param {string} [data.destination] - Destination display name
     * @param {string} [data.verb] - Action verb (e.g. "swallows", "eats")
     * @param {string} [data.digestivePower] - Digestion mode ("Normal", "Soft", "Fatal")
     * @param {string} [data.mode] - Behavior mode ("Hold", "Digest")
     */
    socket.on('updateVoreType', async function (data) {
        try {
            const player = players[socket.id];
            if (player && player._id) {
                const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';

                // SAFETIES: Safe optional chaining for in-memory array search to prevent TypeError on un-synced nodes
                const voreIndex = player.voreTypes.findIndex(v => v._id && (v._id.toString() === data.id || String(v._id) === data.id));
                if (voreIndex > -1) {
                    // Safe Partial Update in-memory (Avoid spreading Mongoose docs)
                    const current = player.voreTypes[voreIndex];
                    Object.keys(data).forEach(key => {
                        if (key !== 'id' && data[key] !== undefined) {
                            current[key] = data[key];
                        }
                    });
                }

                // Update Database
                try {
                    const user = await User.findOne({ 'characters._id': player._id });
                    if (user) {
                        const character = user.characters.id(player._id);
                        if (character) {
                            const voreType = character.voreTypes.id(data.id);
                            if (voreType) {
                                // Conditional updates ONLY
                                if (data.destination !== undefined) voreType.destination = data.destination;
                                if (data.verb !== undefined) voreType.verb = data.verb;
                                if (data.digestivePower !== undefined) voreType.digestivePower = data.digestivePower;
                                if (data.animation !== undefined) voreType.animation = data.animation;
                                if (data.mode !== undefined) voreType.mode = data.mode;
                                if (data.destinationDescrip !== undefined) voreType.destinationDescrip = data.destinationDescrip;
                                if (data.examineMsgDescrip !== undefined) voreType.examineMsgDescrip = data.examineMsgDescrip;
                                if (data.struggleInsideMsgDescrip !== undefined) voreType.struggleInsideMsgDescrip = data.struggleInsideMsgDescrip;
                                if (data.struggleOutsideMsgDescrip !== undefined) voreType.struggleOutsideMsgDescrip = data.struggleOutsideMsgDescrip;
                                if (data.digestionInsideMsgDescrip !== undefined) voreType.digestionInsideMsgDescrip = data.digestionInsideMsgDescrip;
                                if (data.digestionOutsideMsgDescrip !== undefined) voreType.digestionOutsideMsgDescrip = data.digestionOutsideMsgDescrip;
                                if (data.audioEntry !== undefined) voreType.audioEntry = data.audioEntry;
                                if (data.audioAmbient !== undefined) voreType.audioAmbient = data.audioAmbient;
                                if (data.audioStruggle !== undefined) voreType.audioStruggle = data.audioStruggle;
                                if (data.audioExit !== undefined) voreType.audioExit = data.audioExit;

                                // OPTIMIZATION: Asynchronously queue DB write via DatabaseResilience
                                await DatabaseResilience.save(user);
                                log.success(`Saved updated vore settings for ${playerName} to DB.`);

                                // OPTIMIZATION: Send targeted socket emission to updating client to prevent server-wide packet fanout
                                socket.emit('voreSettingsUpdated', {
                                    playerId: player.playerId,
                                    voreTypes: player.voreTypes
                                });
                            }
                        }
                    }
                } catch (err) {
                    log.error(`Error saving vore settings for ${playerName}:`, err);
                }
            }
        } catch (e) {
            log.error(`Error handling updateVoreType for ${socket.id}:`, e);
        }
    });

    /**
     * Handles creation of a single new vore destination node.
     * 
     * @event addVoreType
     * @param {Object} data - Initial vore node properties (destination, verb, descriptions, sounds)
     */
    socket.on('addVoreType', async function (data) {
        try {
            const player = players[socket.id];
            if (player && player._id) {
                const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';
                log.info(`${playerName} added a new vore destination: ${data.destination}.`);

                try {
                    const user = await User.findOne({ 'characters._id': player._id });
                    if (user) {
                        const character = user.characters.id(player._id);
                        if (character) {
                            const newVore = {
                                destination: data.destination,
                                verb: data.verb,
                                digestivePower: data.digestivePower,
                                animation: data.animation,
                                mode: data.mode,
                                destinationDescrip: data.destinationDescrip,
                                examineMsgDescrip: data.examineMsgDescrip,
                                struggleInsideMsgDescrip: data.struggleInsideMsgDescrip,
                                struggleOutsideMsgDescrip: data.struggleOutsideMsgDescrip,
                                digestionInsideMsgDescrip: data.digestionInsideMsgDescrip,
                                digestionOutsideMsgDescrip: data.digestionOutsideMsgDescrip,
                                audioEntry: data.audioEntry,
                                audioAmbient: data.audioAmbient,
                                audioStruggle: data.audioStruggle,
                                audioExit: data.audioExit,
                                type: 'destination', // Default type for singular add
                                graphNodeId: 'node_' + Date.now() // provisional ID
                            };

                            character.voreTypes.push(newVore);
                            await DatabaseResilience.save(user);

                            // Get the newly created item with generated DB _id
                            const savedVore = character.voreTypes[character.voreTypes.length - 1];

                            // Update in-memory player state
                            player.voreTypes.push(savedVore);

                            log.success(`Saved new vore destination for ${playerName} to DB.`);
                        }
                    }
                } catch (err) {
                    log.error(`Error adding vore settings for ${playerName}:`, err);
                }
            }
        } catch (e) {
            log.error(`Error handling addVoreType for ${socket.id}:`, e);
        }
    });

    /**
     * Handles full Anatomy Forge node graph saves, synchronizing graph node structures
     * into active `voreTypes` runtime objects while preserving active occupants (`contents`).
     * 
     * @event updateVoreSettings
     * @param {Object} data - Full graph payload
     * @param {string} data.anatomyData - Stringified JSON representing visual node graph
     * @param {Array<Object>} [data.voreTypes] - Authoritative array of rich voreType objects from client
     */
    socket.on('updateVoreSettings', async function (data) {
        try {
            const player = players[socket.id];
            if (player && player._id) {
                const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';

                // SAFETIES: Scope local variables to prevent cross-player state pollution on global object
                let newVoreTypes = [];
                let syncSuccess = false;

                // Update in-memory anatomyData layout
                if (data.anatomyData) {
                    player.anatomyData = data.anatomyData;
                }

                // --- VoreTypes Synchronization ---
                // 1. Primary Strategy: Trust Client Authoritative List (Optimized Payload)
                if (data.voreTypes && Array.isArray(data.voreTypes)) {
                    newVoreTypes = data.voreTypes.map(incoming => {
                        // SAFETIES: Preserve existing trapped occupants (contents) & MongoDB _id
                        const existing = player.voreTypes.find(v => String(v.graphNodeId) === String(incoming.graphNodeId));
                        return {
                            ...incoming,
                            contents: existing ? (existing.contents || []) : [], // Preserve contents
                            _id: existing ? existing._id : undefined // Persist ID
                        };
                    });
                    syncSuccess = true;
                }
                // 2. Fallback Strategy: Regenerate from stringified AnatomyData (Legacy Clients)
                else {
                    try {
                        const parsed = JSON.parse(data.anatomyData || '{}');
                        if (parsed.nodes && Array.isArray(parsed.nodes)) {
                            const relevantNodes = parsed.nodes;

                            newVoreTypes = relevantNodes.map(node => {
                                const props = node.properties || {};

                                // Robust Matching: Try ID first, then fallback to destination name (self-healing)
                                let existing = player.voreTypes.find(v => v.graphNodeId === String(node.id));

                                if (!existing) {
                                    const searchName = props.name || 'Unknown';
                                    existing = player.voreTypes.find(v => v.destination === searchName);
                                }

                                const destName = props.name || (existing ? existing.destination : 'Unknown');

                                return {
                                    _id: existing ? existing._id : undefined,
                                    destination: destName,
                                    verb: props.verb || 'eats',
                                    digestivePower: props.digestivePower || 'Normal',
                                    animation: existing ? existing.animation : 0,
                                    mode: existing ? existing.mode : (props.mode || 'Hold'),
                                    destinationDescrip: props.destinationDescrip || '',
                                    examineMsgDescrip: props.examineMsgDescrip || '',
                                    struggleInsideMsgDescrip: props.struggleInsideMsgDescrip || '',
                                    struggleOutsideMsgDescrip: props.struggleOutsideMsgDescrip || '',
                                    digestionInsideMsgDescrip: props.digestionInsideMsgDescrip || '',
                                    digestionOutsideMsgDescrip: props.digestionOutsideMsgDescrip || '',
                                    audioEntry: props.enterSound || 'none',
                                    audioAmbient: props.ambientSound || 'none',
                                    audioStruggle: props.struggleSound || 'none',
                                    audioExit: props.exitSound || 'none',
                                    contents: existing ? (existing.contents || []) : [], // CRITICAL: Preserve occupants
                                    isEntrance: node.type === 'entrance',
                                    type: node.type,
                                    graphNodeId: String(node.id)
                                };
                            });
                            syncSuccess = true;
                        }
                    } catch (parseErr) {
                        log.error(`Failed to parse anatomyData for ${playerName}:`, parseErr);
                    }
                }

                // Update Database
                try {
                    const user = await User.findOne({ 'characters._id': player._id });
                    if (user) {
                        const character = user.characters.id(player._id);
                        if (character) {
                            if (data.anatomyData) character.anatomyData = data.anatomyData;

                            if (syncSuccess) {
                                character.voreTypes = newVoreTypes;
                            }

                            await DatabaseResilience.save(user);
                            log.success(`Saved Anatomy Forge data & Synced voreTypes for ${playerName}`);

                            // Re-fetch to get newly generated MongoDB subdocument _ids
                            const savedChar = user.characters.id(player._id);

                            // Update live in-memory player object
                            player.voreTypes = savedChar.voreTypes;

                            // OPTIMIZATION: Send targeted update emission to requesting client
                            socket.emit('voreSettingsUpdated', {
                                playerId: player.playerId,
                                voreTypes: player.voreTypes
                            });
                        }
                    }
                } catch (err) {
                    log.error(`Error saving anatomy data for ${playerName}:`, err);
                }
            }
        } catch (e) {
            log.error(`Error handling updateVoreSettings for ${socket.id}:`, e);
        }
    });
};
