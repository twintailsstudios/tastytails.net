const Chats = require('../model/Chat');
const jwt = require('jsonwebtoken');
const log = require('../logger');
const serverGame = require('../server-loop'); // Import to access player lookup
const { marked } = require('marked');

const sanitizeHtml = require('sanitize-html');

// Configure marked to handle breaks correctly if needed, but default is usually fine.
// We want to ensure it doesn't try to sanitize, we let DOMPurify do that.
marked.setOptions({
    breaks: true, // Render <br> on single line breaks
    gfm: true
});

class MessageSystem {
    constructor(io) {
        this.io = io;
        this.lastMessageTimes = new Map(); // SocketID -> Timestamp
    }

    /**
     * Main entry point for handling incoming user messages from the socket.
     */
    setupSocketListeners(socket) {
        socket.on('getAllChats', (data) => this.getAllChats(data, socket));
        socket.on('input', (data) => this.handleIncomingMessage(socket, data));
        socket.on('inputEdit', (data) => this.editMessage(data, socket));
        socket.on('deleteMessage', (data) => this.deleteMessage(data, socket));
        socket.on('sendSpoilEdit', (data) => this.changeSpoilerLabel(data, socket));
        socket.on('getOlderChats', (data) => this.getOlderChats(data, socket));

        // Typing is a bit special as it broadcasts but doesn't persist.
        // We can leave it here or move logic. For now, let's keep the listener attachment here.
        socket.on('typing', (data) => {
            // We need access to serverGame for broadcasting to visible, 
            // but MessageSystem imports serverGame, so we can use it.
            serverGame.broadcastToVisible(this.io, socket.id, 'typing', data);
        });
    }

    async getAllChats(data, socket) {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const chats = await Chats.find({
                "message.time": { $gte: oneDayAgo },
                $and: [
                    { excludedPlayers: { $ne: data.charId } },
                    {
                        $or: [
                            { visibleTo: { $size: 0 } }, // Public messages
                            { visibleTo: data.charId }   // Messages visible to this character
                        ]
                    }
                ]
            })
                .sort({ 'message.time': -1 })
                .limit(50);

            const allMsgs = chats.map(chat => ({
                _id: chat._id,
                name: chat.name,
                type: chat.type,
                scope: chat.scope,
                message: [chat.message[chat.message.length - 1]], // Send only the latest version
                spoiler: chat.spoiler,
                deleted: chat.deleted,
                identifier: chat.identifier.character,
                visibleTo: chat.visibleTo,
                excludedPlayers: chat.excludedPlayers
            }));
            socket.emit('output', allMsgs.reverse());
        } catch (e) {
            log.error('Error fetching all chats:', e);
        }
    }

    async getOlderChats(data, socket) {
        try {
            const beforeTime = new Date(data.beforeTime);
            // Optimization: Match the limit and structure of getAllChats
            const chats = await Chats.find({
                "message.time": { $lt: beforeTime },
                $and: [
                    { excludedPlayers: { $ne: data.charId } },
                    {
                        $or: [
                            { visibleTo: { $size: 0 } },
                            { visibleTo: data.charId }
                        ]
                    }
                ]
            })
                .sort({ 'message.time': -1 })
                .limit(50);

            const olderMsgs = chats.map(chat => ({
                _id: chat._id,
                name: chat.name,
                type: chat.type,
                scope: chat.scope,
                message: [chat.message[chat.message.length - 1]],
                spoiler: chat.spoiler,
                deleted: chat.deleted,
                identifier: chat.identifier.character,
                visibleTo: chat.visibleTo,
                excludedPlayers: chat.excludedPlayers
            }));
            socket.emit('olderChatsOutput', olderMsgs.reverse());
        } catch (e) {
            log.error('Error fetching older chats:', e);
        }
    }

    async editMessage(data, socket) {
        try {
            const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
            const result = await Chats.findById(data._id);

            if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
                result.message.push({
                    content: this.parseAndSanitize(data.message),
                    time: new Date().toUTCString()
                });
                await result.save();
                this.io.emit('editOutput', result);
            } else {
                log.warn('Attempt to edit unauthorized message denied.');
            }
        } catch (e) {
            log.error('Error editing message:', e);
        }
    }

    async deleteMessage(data, socket) {
        try {
            const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
            const result = await Chats.findById(data._id);

            if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
                result.deleted = {
                    status: true,
                    deletionTime: new Date().toUTCString()
                };
                await result.save();
                this.io.emit('editOutput', result);
            } else {
                log.warn('Attempt to delete unauthorized message denied.');
            }
        } catch (e) {
            log.error('Error deleting message:', e);
        }
    }

    async changeSpoilerLabel(data, socket) {
        try {
            const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
            const result = await Chats.findById(data._id);

            if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
                result.spoiler.status = data.spoiler;
                await result.save();
                this.io.emit('editSpoilerOutput', result);
            } else {
                log.warn('Spoiler vote/change from unauthorized user.');
            }
        } catch (e) {
            log.error('Error changing spoiler label:', e);
        }
    }

    async handleIncomingMessage(socket, data) {
        try {
            // 0. Rate Limiting
            const now = Date.now();
            const lastTime = this.lastMessageTimes.get(socket.id) || 0;
            if (now - lastTime < 500) {
                // Too fast!
                socket.emit('output', [{
                    name: 'System',
                    type: 'Environmental',
                    message: [{ content: `You are typing too fast!`, time: new Date().toUTCString() }],
                    identifier: { account: 'SYSTEM', character: 'SYSTEM' }
                }]);
                return;
            }
            this.lastMessageTimes.set(socket.id, now);

            // 1. Validate Token
            const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);
            if (!verified) {
                log.warn('Invalid token in handleIncomingMessage');
                return;
            }

            // 2. Validate Message Length & Parse Content
            // We do NOT use removeTags anymore. We parse Markdown -> HTML, allow existing HTML, then SANITIZE everything.
            let cleanMessage = this.parseAndSanitize(data.message);

            if (cleanMessage.length > 10000) {
                return socket.emit('tooManyChars', cleanMessage.length, data.message);
            }

            // 3. Classify Message (using the CLEAN parsed version for safety in logs, but maybe raw for command checks?)
            // Actually, commands like /me should be checked on the raw text BEFORE parsing markdown.
            // But 'data.message' is the raw input.
            let { type, content, targetName } = this.classifyMessage(data.message);

            // Refine content: If it was a command, 'content' is the trimmed body.
            // We need to parse/sanitize THAT specific body content now.
            // Re-sanitizing is cheap.
            const parsedContent = this.parseAndSanitize(content);

            // Update the content variable to be the fully processed HTML
            content = parsedContent;

            // 4. Mention Processing
            // Simple regex for @Word Word or @Word
            // We'll iterate through all players to find matches if @ is present to be accurate, 
            // or use a regex to extract candidates.
            // Let's try to find @Name candidates.
            if (content.includes('@')) {
                const mentionRegex = /@([a-zA-Z0-9_\- ']+)/g;
                // We need to be careful not to replace things that aren't names.
                // Strategy: find all matches, check if valid player, if so, replace.

                // We cannot use async replace easily with string.replace, so we find matches first.
                let matches = [];
                let match;
                while ((match = mentionRegex.exec(content)) !== null) {
                    matches.push({ full: match[0], name: match[1].trim(), index: match.index });
                }

                // Process in reverse order to not mess up indices when replacing
                for (let i = matches.length - 1; i >= 0; i--) {
                    const m = matches[i];
                    const player = serverGame.findPlayerByName(m.name);
                    if (player) {
                        // Valid player found!
                        const replacement = `<span class="mention" data-id="${player.playerId}">@${m.name}</span>`;
                        content = content.substring(0, m.index) + replacement + content.substring(m.index + m.full.length);

                        // Optional: Add notification logic here if we wanted to ping them specifically.
                    }
                }
            }

            // 5. Resolve Target (if any)
            let visibleTo = [];
            const scope = data.scope || 'global';

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
            } else if (scope === 'local') {
                // Local Chat Logic: Only visible to players who can see the sender
                const senderSocketId = socket.id;
                const connectedSockets = this.io.sockets.sockets;

                // Always add sender
                if (data.charId) visibleTo.push(data.charId.toString());

                for (const [sId, s] of connectedSockets) {
                    // checkVisibility(observer, target) -> observer=Receiver, target=Sender
                    if (serverGame.checkVisibility(sId, senderSocketId)) {
                        const charIdReceiver = serverGame.getCharIdBySocketId(sId);
                        if (charIdReceiver) visibleTo.push(charIdReceiver.toString());
                    }
                }

                // Deduplicate just in case
                visibleTo = [...new Set(visibleTo)];
            }

            // 5. Create and Save Message
            const chatMessage = new Chats({
                name: data.name,
                type: type,
                scope: scope,
                message: [{ content: content, time: new Date().toUTCString() }],
                spoiler: { status: data.spoiler || 'none', votes: { watersports: 0, disposal: 0, gore: 0 } },
                deleted: { status: false, deletionTime: null },
                identifier: { account: verified._id, character: data.charId },
                visibleTo: visibleTo
            });

            await chatMessage.save();

            // 6. Broadcast Message
            // Pass clientMsgId (if any) to broadcast so client can reconcile ghost message
            this.broadcastMessage(chatMessage, visibleTo, [], data.clientMsgId);

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
    broadcastMessage(messageObject, visibleTo = [], excludedPlayers = [], clientMsgId = null) {
        try {
            // Ensure excludedPlayers are strings for comparison
            excludedPlayers = excludedPlayers.map(id => id.toString());

            // log.debug(`Broadcasting message: ${messageObject._id} Type: ${messageObject.type} VisibleTo: ${JSON.stringify(visibleTo)} Excluded: ${JSON.stringify(excludedPlayers)}`);

            const clientMsg = {
                _id: messageObject._id,
                name: messageObject.name,
                type: messageObject.type,
                scope: messageObject.scope,
                message: [messageObject.message[messageObject.message.length - 1]], // Send only the latest version
                spoiler: messageObject.spoiler,
                deleted: messageObject.deleted,
                identifier: messageObject.identifier.character,
                visibleTo: messageObject.visibleTo,
                excludedPlayers: messageObject.excludedPlayers,
                clientMsgId: clientMsgId // Return transient ID for optimistic UI
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
    async sendSystemMessage(type, content, targetSocket = null, excludedPlayers = [], scope = 'global', sourceSocket = null) {
        try {
            let visibleTo = [];
            if (targetSocket) {
                const charId = serverGame.getCharIdBySocketId(targetSocket.id);
                if (charId) {
                    visibleTo.push(charId.toString());
                } else {
                    log.warn(`sendSystemMessage: Could not find charId for socket ${targetSocket.id}`);
                }
            } else if (scope === 'local' && sourceSocket) {
                // Local System Message (e.g. Interaction): Visible to those who see sourceSocket
                const senderSocketId = sourceSocket.id;
                const connectedSockets = this.io.sockets.sockets;

                // Add sender (source)
                const senderCharId = serverGame.getCharIdBySocketId(senderSocketId);
                if (senderCharId) visibleTo.push(senderCharId.toString());

                for (const [sId, s] of connectedSockets) {
                    // checkVisibility(observer, target)
                    if (serverGame.checkVisibility(sId, senderSocketId)) {
                        const charIdReceiver = serverGame.getCharIdBySocketId(sId);
                        if (charIdReceiver) visibleTo.push(charIdReceiver.toString());
                    }
                }
                visibleTo = [...new Set(visibleTo)];
            }

            const chatMessage = new Chats({
                name: 'System',
                type: type,
                scope: scope,
                message: [{ content: this.parseAndSanitize(content), time: new Date().toUTCString() }],
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

    parseAndSanitize(str) {
        if (!str) return '';
        // 1. Process Markdown (this converts **text** to <strong>text</strong>, etc.)
        const markdownHtml = marked.parseInline(str); // parseInline avoids wrapping in <p> tags

        // 2. Sanitize (strip <script>, allow safe tags like <b>, <i>, <span>, etc.)
        const clean = sanitizeHtml(markdownHtml, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'del', 'strike', 's']),
            allowedAttributes: {
                'a': ['href', 'name', 'target'],
                'img': ['src', 'alt'],
                'span': ['class', 'data-id'] // For mentions!
            }
        });

        return clean;
    }

    // Deprecated urlify (marked handles this now)
    // urlify(text) { ... }
}

module.exports = MessageSystem;
