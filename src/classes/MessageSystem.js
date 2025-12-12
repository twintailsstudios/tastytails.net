const Chats = require('../model/Chat');
const jwt = require('jsonwebtoken');
const log = require('../logger');
const serverGame = require('../server-loop'); // Import to access player lookup

class MessageSystem {
    constructor(io) {
        this.io = io;
    }

    /**
     * Main entry point for handling incoming user messages from the socket.
     */
    async handleIncomingMessage(socket, data) {
        try {
            // 1. Validate Token
            const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
            if (!verified) {
                log.warn('Invalid token in handleIncomingMessage');
                return;
            }

            // 2. Validate Message Length
            const cleanMessage = this.removeTags(data.message);
            if (cleanMessage.length > 10000) {
                return socket.emit('tooManyChars', cleanMessage.length, data.message);
            }

            // 3. Classify Message
            const { type, content, targetName } = this.classifyMessage(data.message);

            // 4. Resolve Target (if any)
            let visibleTo = [];
            if (type === 'Unique' && targetName) {
                const targetPlayer = serverGame.findPlayerByName(targetName);
                if (targetPlayer) {
                    // Add target and sender to visibleTo
                    // Note: We need the Character ID (not socket ID) for persistence
                    if (targetPlayer.playerId) visibleTo.push(targetPlayer.playerId.toString());
                    if (data.charId) visibleTo.push(data.charId.toString());
                } else {
                    // Target not found
                    socket.emit('output', [{
                        name: 'System',
                        type: 'Environmental',
                        message: [{ content: `Player '${targetName}' not found.`, time: new Date().toUTCString() }],
                        identifier: { account: 'SYSTEM', character: 'SYSTEM' }
                    }]);
                    return;
                }
            }

            // 5. Create and Save Message
            const chatMessage = new Chats({
                name: data.name,
                type: type,
                message: [{ content: this.urlify(content), time: new Date().toUTCString() }],
                spoiler: { status: data.spoiler || 'none', votes: { watersports: 0, disposal: 0, gore: 0 } },
                deleted: { status: false, deletionTime: null },
                identifier: { account: verified._id, character: data.charId },
                visibleTo: visibleTo
            });

            await chatMessage.save();

            // 6. Broadcast Message
            this.broadcastMessage(chatMessage, visibleTo);

        } catch (e) {
            log.error('Error in handleIncomingMessage:', e);
        }
    }

    /**
     * Classifies the message based on content (slash commands).
     * @returns {Object} { type, content, targetName }
     */
    classifyMessage(rawContent) {
        let content = rawContent.trim();
        let type = 'Default';
        let targetName = null;

        if (content.startsWith('/ooc ')) {
            type = 'OOC';
            content = content.substring(5).trim();
        } else if (content.startsWith('/me ')) {
            type = 'Say';
            content = content.substring(4).trim();
        } else if (content.startsWith('/w ')) {
            type = 'Unique';
            const parts = content.substring(3).trim().split(' ');
            if (parts.length > 1) {
                targetName = parts[0];
                content = parts.slice(1).join(' ');
            } else {
                content = content.substring(3).trim();
            }
        }

        return { type, content, targetName };
    }

    /**
     * Broadcasts the message object to the appropriate recipients.
     * @param {Object} messageObject - The saved mongoose document.
     * @param {Array} visibleTo - Array of Character IDs to restrict visibility.
     * @param {Array} excludedPlayers - Array of Character IDs to exclude.
     */
    broadcastMessage(messageObject, visibleTo = [], excludedPlayers = []) {
        try {
            // Ensure excludedPlayers are strings for comparison
            excludedPlayers = excludedPlayers.map(id => id.toString());

            // log.debug(`Broadcasting message: ${messageObject._id} Type: ${messageObject.type} VisibleTo: ${JSON.stringify(visibleTo)} Excluded: ${JSON.stringify(excludedPlayers)}`);

            const clientMsg = {
                _id: messageObject._id,
                name: messageObject.name,
                type: messageObject.type,
                message: messageObject.message,
                spoiler: messageObject.spoiler,
                deleted: messageObject.deleted,
                identifier: messageObject.identifier.character,
                visibleTo: messageObject.visibleTo,
                excludedPlayers: messageObject.excludedPlayers
            };

            const connectedSockets = this.io.sockets.sockets;

            // If visibleTo is set, we only send to those (minus excluded)
            if (visibleTo && visibleTo.length > 0) {
                visibleTo.forEach(charId => {
                    if (excludedPlayers && excludedPlayers.includes(charId)) return; // Skip excluded

                    const sId = serverGame.getSocketIdByCharId(charId);
                    // log.debug(`Checking charId: ${charId} -> SocketId: ${sId}`);

                    if (sId) {
                        // Check if socket is actually connected in io
                        const socket = connectedSockets.get(sId);
                        if (socket) {
                            socket.emit('output', [clientMsg]);
                            // log.debug(`Sent to socket: ${sId}`);
                        } else {
                            log.warn(`Socket ${sId} found in game state but not in io.sockets`);
                        }
                    } else {
                        log.warn(`No socket found for charId: ${charId}`);
                    }
                });
            } else {
                // Public message, but might have exclusions
                if (excludedPlayers && excludedPlayers.length > 0) {
                    // We must iterate all sockets to check if they are excluded
                    for (const [socketId, socket] of connectedSockets) {
                        const charId = serverGame.getCharIdBySocketId(socketId);
                        if (charId && excludedPlayers.includes(charId.toString())) {
                            continue; // Skip excluded
                        }
                        socket.emit('output', [clientMsg]);
                    }
                } else {
                    // Truly public, no exclusions
                    this.io.emit('output', [clientMsg]);
                }
            }
        } catch (e) {
            log.error('Error in broadcastMessage:', e);
        }
    }

    /**
     * Sends a system generated message.
     * @param {string} type
     * @param {string} content
     * @param {Object|null} targetSocket
     * @param {Array} excludedPlayers - Array of Character IDs to exclude
     */
    async sendSystemMessage(type, content, targetSocket = null, excludedPlayers = []) {
        try {
            let visibleTo = [];
            if (targetSocket) {
                const charId = serverGame.getCharIdBySocketId(targetSocket.id);
                if (charId) {
                    visibleTo.push(charId.toString());
                } else {
                    log.warn(`sendSystemMessage: Could not find charId for socket ${targetSocket.id}`);
                }
            }

            const chatMessage = new Chats({
                name: 'System',
                type: type,
                message: [{ content: this.urlify(content), time: new Date().toUTCString() }],
                spoiler: { status: 'none', votes: { watersports: 0, disposal: 0, gore: 0 } },
                deleted: { status: false, deletionTime: null },
                identifier: { account: 'SYSTEM', character: 'SYSTEM' },
                visibleTo: visibleTo,
                excludedPlayers: excludedPlayers
            });

            await chatMessage.save();

            // Delegate to broadcastMessage for consistent logic
            this.broadcastMessage(chatMessage, visibleTo, excludedPlayers);

        } catch (e) {
            log.error('Error in sendSystemMessage:', e);
        }
    }

    removeTags(str) {
        if (!str) return '';
        return str.toString().replace(/(<([^>]+)>)/ig, '');
    }

    urlify(text) {
        if (!text) return '';
        var urlRegex = /((?:(http|https|Http|Https|rtsp|Rtsp):\/\/(?:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,64}(?:\:(?:[a-zA-Z0-9\$\-\_\.\+\!\*\'\(\)\,\;\?\&\=]|(?:\%[a-fA-F0-9]{2})){1,25})?\@)?)?((?:(?:[a-zA-Z0-9][a-zA-Z0-9\-]{0,64}\.)+(?:(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])|(?:biz|b[abdefghijmnorstvwyz])|(?:cat|com|coop|c[acdfghiklmnoruvxyz])|d[ejkmoz]|(?:edu|e[cegrstu])|f[ijkmor]|(?:gov|g[abdefghilmnpqrstuwy])|h[kmnrtu]|(?:info|int|i[delmnoqrst])|(?:jobs|j[emop])|k[eghimnrwyz]|l[abcikrstuvy]|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])|(?:name|net|n[acefgilopruz])|(?:org|om)|(?:pro|p[aefghklmnrstwy])|qa|r[eouw]|s[abcdeghijklmnortuvyz]|(?:tel|travel|t[cdfghjklmnoprtvwz])|u[agkmsyz]|v[aceginu]|w[fs]|y[etu]|z[amw]))|(?:(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}|[1-9][0-9]|[0-9])))(?:\:\d{1,5})?)(\/(?:(?:[a-zA-Z0-9\;\/\?\:\@\&\=\#\~\-\.\+\!\*\'\(\)\,\_])|(?:\%[a-fA-F0-9]{2}))*)?(?:\b|$)+/gi;
        return text.replace(urlRegex, function (url) {
            const r = new RegExp('^(?:[a-z]+:)?//', 'i');
            if (r.test(url)) {
                return `<a href="${url}" target="_blank">${url}</a>`;
            } else {
                return `<a href="//${url}" target="_blank">${url}</a>`;
            }
        });
    }
}

module.exports = MessageSystem;
