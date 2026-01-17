const log = require('../logger');
const DatabaseResilience = require('../classes/DatabaseResilience');

module.exports = function (io, socket, players, User, saveCharacter) {
    const logPrefix = `[Vore:${socket.id}]`;

    // --- Vore Settings Handlers ---
    socket.on('updateVoreType', async function (data) {
        try {
            const player = players[socket.id];
            if (player && player._id) {
                const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';
                // log.info(`${playerName} edited the settings for ${data.destination || 'a node'}.`);

                // Update in-memory
                const voreIndex = player.voreTypes.findIndex(v => v._id.toString() === data.id);
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

                                // Use DatabaseResilience to ensure it saves/queues
                                await DatabaseResilience.save(user);
                                log.success(`Saved updated vore settings for ${playerName} to DB.`);

                                // Broadcast update to all clients
                                io.emit('voreSettingsUpdated', {
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
                            // Use DatabaseResilience
                            await DatabaseResilience.save(user);

                            // Get the newly created item with _id
                            const savedVore = character.voreTypes[character.voreTypes.length - 1];

                            // Update in-memory
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

    // --- Anatomy Forge Full Save ---
    socket.on('updateVoreSettings', async function (data) {
        try {
            const player = players[socket.id];
            if (player && player._id) {
                const playerName = player.Username || (player.firstName + ' ' + player.lastName) || 'Unknown Player';

                // Update in-memory anatomyData
                if (data.anatomyData) {
                    player.anatomyData = data.anatomyData;
                }

                // --- NEW LOGIC: Sync voreTypes ---
                // 1. Trust Client (Optimized/Separate Payload)
                if (data.voreTypes && Array.isArray(data.voreTypes)) {
                    // Client sent authoritative rich list. Use it, but preserve specific server-side fields (occupants)
                    newVoreTypes = data.voreTypes.map(incoming => {
                        // Find existing to preserve occupants
                        const existing = player.voreTypes.find(v => String(v.graphNodeId) === String(incoming.graphNodeId));
                        return {
                            ...incoming,
                            contents: existing ? existing.contents : [], // Preserve contents
                            _id: existing ? existing._id : undefined // Persist ID
                        };
                    });
                    syncSuccess = true;
                }
                // 2. Fallback: Regenerate from AnatomyData (Legacy/Single Payload)
                // This will only run if client DIDN'T send voreTypes (old client)
                else {
                    try {
                        const parsed = JSON.parse(data.anatomyData || '{}');
                        if (parsed.nodes && Array.isArray(parsed.nodes)) {
                            // Filter: NOW we include ALL relevant nodes (Destinations, Entrances, Paths, Exits)
                            // This allows the server to know about "Mouth" (Entrance) messages/verbs.
                            const relevantNodes = parsed.nodes; // No longer .filter(n => n.type === 'destination')

                            // Map to voreType objects
                            newVoreTypes = relevantNodes.map(node => {
                                const props = node.properties || {};

                                // Robust Matching:
                                // 1. Try match by ID (Best)
                                // 2. Try match by Name (Legacy/Fallback)
                                let existing = player.voreTypes.find(v => v.graphNodeId === String(node.id));

                                if (!existing) {
                                    const searchName = props.name || 'Unknown';
                                    existing = player.voreTypes.find(v => v.destination === searchName);

                                    // Self-Healing: If matched by name but ID was missing/different, allow it and update ID
                                    if (existing) {
                                        // console.log(`[VoreSync] Matched legacy node "${searchName}" to ID ${node.id}`);
                                    }
                                }

                                // Safeguard Name: Use new name > existing name > default
                                // This fixes the "undefined" destination bug if props.name is missing
                                const destName = props.name || (existing ? existing.destination : 'Unknown');

                                return {
                                    _id: existing ? existing._id : undefined, // Let Mongoose generate if new
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
                                    contents: existing ? existing.contents : [], // CRITICAL: Preserve occupants
                                    isEntrance: node.type === 'entrance',
                                    type: node.type, // Map type so client filter works
                                    graphNodeId: String(node.id) // Ensure ID is saved
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

                            // Replace voreTypes list if sync was successful
                            if (syncSuccess) {
                                character.voreTypes = newVoreTypes;
                            }

                            await DatabaseResilience.save(user);
                            log.success(`Saved Anatomy Forge data & Synced voreTypes for ${playerName}`);

                            // Re-fetch to get new _ids/proper objects
                            const savedChar = user.characters.id(player._id);

                            // Update in-memory player object
                            player.voreTypes = savedChar.voreTypes;

                            // Broadcast update to all clients
                            io.emit('voreSettingsUpdated', {
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
