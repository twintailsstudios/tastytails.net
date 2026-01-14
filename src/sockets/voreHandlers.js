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
                log.info(`${playerName} edited the settings for ${data.destination}.`);

                // Update in-memory
                const voreIndex = player.voreTypes.findIndex(v => v._id.toString() === data.id);
                if (voreIndex > -1) {
                    player.voreTypes[voreIndex] = { ...player.voreTypes[voreIndex], ...data };
                }

                // Update Database
                try {
                    const user = await User.findOne({ 'characters._id': player._id });
                    if (user) {
                        const character = user.characters.id(player._id);
                        if (character) {
                            const voreType = character.voreTypes.id(data.id);
                            if (voreType) {
                                voreType.destination = data.destination;
                                voreType.verb = data.verb;
                                voreType.digestionTimer = data.digestionTimer;
                                voreType.animation = data.animation;
                                voreType.mode = data.mode;
                                voreType.destinationDescrip = data.destinationDescrip;
                                voreType.examineMsgDescrip = data.examineMsgDescrip;
                                voreType.struggleInsideMsgDescrip = data.struggleInsideMsgDescrip;
                                voreType.struggleOutsideMsgDescrip = data.struggleOutsideMsgDescrip;
                                voreType.digestionInsideMsgDescrip = data.digestionInsideMsgDescrip;
                                voreType.digestionOutsideMsgDescrip = data.digestionOutsideMsgDescrip;
                                voreType.audioEntry = data.audioEntry;
                                voreType.audioAmbient = data.audioAmbient;
                                voreType.audioStruggle = data.audioStruggle;
                                voreType.audioExit = data.audioExit;

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
                                digestionTimer: data.digestionTimer,
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
                                audioExit: data.audioExit
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

                // --- NEW LOGIC: Sync voreTypes from Anatomy Data ---
                let newVoreTypes = [];
                let syncSuccess = false;

                try {
                    const parsed = JSON.parse(data.anatomyData || '{}');
                    if (parsed.nodes && Array.isArray(parsed.nodes)) {
                        // Filter for destinations ONLY (Entrances/Paths don't need vore settings/storage)
                        const relevantNodes = parsed.nodes.filter(n => n.type === 'destination');

                        // Map to voreType objects
                        newVoreTypes = relevantNodes.map(node => {
                            const props = node.properties || {};
                            // Try to find existing voreType to preserve state (contents, _id)
                            // We match by graphNodeId if available, else name (legacy fallback)
                            const existing = player.voreTypes.find(v => v.graphNodeId === String(node.id) || v.destination === props.name);

                            return {
                                _id: existing ? existing._id : undefined, // Let Mongoose generate if new
                                destination: props.name || 'Unknown',
                                verb: props.verb || 'eats',
                                digestionTimer: parseInt(props.digestionTimer) || 0,
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
                                contents: existing ? existing.contents : [],
                                isEntrance: node.type === 'entrance',
                                graphNodeId: String(node.id)
                            };
                        });
                        syncSuccess = true;
                    }
                } catch (parseErr) {
                    log.error(`Failed to parse anatomyData for ${playerName}:`, parseErr);
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
