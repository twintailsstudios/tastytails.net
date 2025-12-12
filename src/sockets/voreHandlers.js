const log = require('../logger');

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

                                await user.save();
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
                            await user.save();

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
}
