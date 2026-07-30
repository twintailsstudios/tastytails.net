/**
 * @fileoverview MessageSystem.js - Real-Time Chat Engine & System Message Dispatcher
 * 
 * @description
 * Manages real-time chat input, slash commands (/damage, /remedy, /heal, /revive, /tag),
 * Markdown parsing, HTML sanitization, game state snapshotting, write-behind DB buffering,
 * and scoped Socket.IO message broadcasting for TastyTails.net.
 * 
 * Triggered by: Socket.IO client chat events, system/environmental game events, mechanics callbacks.
 */

const Chats = require('../model/Chat');
const User = require('../model/User'); // Required for damage persistence
const jwt = require('jsonwebtoken');
const log = require('../logger');
const serverGame = require('../server-loop'); // Import to access player lookup
const { marked } = require('marked');
const SemanticMapper = require('../server/SemanticMapper');
const DatabaseResilience = require('./DatabaseResilience');
const { applyDamage } = require('../server/mechanics/damage');
const { healPlayer, revivePlayer } = require('../server/mechanics/health');
const { applyRemedy } = require('../server/mechanics/remedies');

const sanitizeHtml = require('sanitize-html');

// Configure marked to handle breaks correctly if needed, but default is usually fine.
// We want to ensure it doesn't try to sanitize, we let DOMPurify do that.
marked.setOptions({
    breaks: true, // Render <br> on single line breaks
    gfm: true
});

class MessageSystem {
    /**
     * Creates an instance of MessageSystem.
     * @param {Object} io - The Socket.IO server instance.
     */
    constructor(io) {
        this.io = io;
        this.lastMessageTimes = new Map(); // SocketID -> Timestamp
        this.chatBuffer = []; // Buffer for batched inserts
        this.flushingBatch = null; // Reference to currently flushing batch

        // OPTIMIZATION: Flush chat buffer every 2 seconds to decouple real-time socket delivery from DB writes
        setInterval(() => this.flushChatBuffer(), 2000);
    }

    /**
     * Checks if a connecting socket represents an automated bot account.
     * @param {Object} socket - The Socket.IO connection instance.
     * @returns {boolean} True if the socket query flags isBot === 'true'.
     */
    isBotSocket(socket) {
        return socket && socket.handshake && socket.handshake.query && socket.handshake.query.isBot === 'true';
    }

    /**
     * Extracts the JWT authentication token from socket request cookies or handshake HTTP headers.
     * Needed when session cookies use httpOnly: true (which prevents client JS from reading document.cookie).
     * @param {Object} socket - The Socket.IO socket instance.
     * @returns {string|null} Extracted JWT token string or null if missing.
     */
    extractTokenFromSocket(socket) {
        if (!socket) return null;
        if (socket.request && socket.request.cookies && socket.request.cookies.TastyTails) {
            return socket.request.cookies.TastyTails;
        }
        const cookieHeader = socket.handshake && socket.handshake.headers && socket.handshake.headers.cookie;
        if (cookieHeader) {
            const match = cookieHeader.match(/(?:^|;\s*)TastyTails=([^;]+)/);
            if (match) return match[1];
        }
        return null;
    }

    /**
     * Centralized token authentication helper for socket events.
     * @param {Object} socket - The Socket.IO socket instance.
     * @param {string} token - The JWT token submitted with data.
     * @returns {Object|null} Decoded token payload object or null if invalid.
     */
    verifySocketToken(socket, token) {
        if (this.isBotSocket(socket)) {
            return { _id: 'BOT_ACCOUNT' };
        }
        let tokenToVerify = token;
        if (!tokenToVerify && socket) {
            tokenToVerify = this.extractTokenFromSocket(socket);
        }
        if (!tokenToVerify) return null;
        try {
            return jwt.verify(tokenToVerify, process.env.TOKEN_SECRET);
        } catch (err) {
            return null;
        }
    }

    /**
     * Resolves a message document across active buffer, in-flight flushing batch, or database query.
     * OPTIMIZATION: Safeguards against race conditions when mutating recently created un-flushed messages.
     * @param {string|Object} messageId - The target message ID.
     * @returns {Promise<{doc: Object|null, inBuffer: boolean}>} Resolved document and buffer state flag.
     */
    async findMessageForMutation(messageId) {
        if (!messageId) return { doc: null, inBuffer: false };
        const idStr = messageId.toString();

        // 1. Check active buffer
        let result = this.chatBuffer.find(c => c._id && c._id.toString() === idStr);
        if (result) return { doc: result, inBuffer: true };

        // 2. Check in-flight flushing batch
        if (this.flushingBatch) {
            result = this.flushingBatch.find(c => c._id && c._id.toString() === idStr);
            if (result) return { doc: result, inBuffer: true };
        }

        // 3. Fallback to Mongoose database query
        result = await Chats.findById(messageId);
        return { doc: result, inBuffer: false };
    }

    /**
     * Flushes accumulated chat messages from memory buffer to MongoDB using raw bulk operations.
     * OPTIMIZATION: Uses raw collection.insertMany to bypass Mongoose schema validation overhead.
     */
    async flushChatBuffer() {
        if (this.chatBuffer.length === 0) return;

        const batch = [...this.chatBuffer];
        this.chatBuffer = []; // Clear immediately to prevent double swipe
        this.flushingBatch = batch;

        try {
            // Bulk insert via raw MongoDB collection to bypass Mongoose validation overhead
            await Chats.collection.insertMany(batch, { ordered: false });
            // log.debug(`[ChatSystem] Flushed ${batch.length} messages.`);
        } catch (e) {
            log.error('[ChatSystem] Error flushing chat buffer:', e);
        } finally {
            this.flushingBatch = null;
        }
    }

    /**
     * Attaches Socket.IO listeners for all chat-related client events.
     * @param {Object} socket - The connected client Socket.IO instance.
     */
    setupSocketListeners(socket) {
        socket.on('getAllChats', (data) => this.getAllChats(data, socket));
        socket.on('input', (data) => this.handleIncomingMessage(socket, data));
        socket.on('inputEdit', (data) => this.editMessage(data, socket));
        socket.on('deleteMessage', (data) => this.deleteMessage(data, socket));
        socket.on('sendSpoilEdit', (data) => this.changeSpoilerLabel(data, socket));
        socket.on('getOlderChats', (data) => this.getOlderChats(data, socket));
        socket.on('toggleReaction', (data) => this.toggleReaction(data, socket));


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
                createdAt: { $gte: oneDayAgo },
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
                .sort({ createdAt: -1 })
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
                excludedPlayers: chat.excludedPlayers,
                reactions: chat.reactions,
                senderProfile: chat.senderProfile // Include avatar profile
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
                createdAt: { $lt: beforeTime },
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
                .sort({ createdAt: -1 })
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
                excludedPlayers: chat.excludedPlayers,
                reactions: chat.reactions,
                senderProfile: chat.senderProfile // Include avatar profile
            }));
            socket.emit('olderChatsOutput', olderMsgs.reverse());
        } catch (e) {
            log.error('Error fetching older chats:', e);
        }
    }

    async editMessage(data, socket) {
        try {
            const verified = this.verifySocketToken(socket, data.token);
            if (!verified) return;

            const { doc: result, inBuffer } = await this.findMessageForMutation(data._id);

            if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
                result.message.push({
                    content: this.parseAndSanitize(data.message),
                    time: new Date().toUTCString()
                });
                if (!inBuffer) {
                    await DatabaseResilience.save(result);
                }
                this.io.emit('editOutput', result);
            } else {
                log.warn(`Attempt to edit unauthorized message denied. result: ${!!result}, result.identifier: ${result ? JSON.stringify(result.identifier) : 'N/A'}, verified: ${JSON.stringify(verified)}, data.charId: ${data.charId}`);
            }
        } catch (e) {
            log.error('Error editing message:', e);
        }
    }

    async deleteMessage(data, socket) {
        try {
            const verified = this.verifySocketToken(socket, data.token);
            if (!verified) return;

            const { doc: result, inBuffer } = await this.findMessageForMutation(data._id);

            if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
                result.deleted = {
                    status: true,
                    deletionTime: new Date().toUTCString()
                };
                if (!inBuffer) {
                    await DatabaseResilience.save(result);
                }
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
            const verified = this.verifySocketToken(socket, data.token);
            if (!verified) return;

            const { doc: result, inBuffer } = await this.findMessageForMutation(data._id);

            if (result && result.identifier.account == verified._id && result.identifier.character == data.charId) {
                result.spoiler.status = data.spoiler;
                if (!inBuffer) {
                    await DatabaseResilience.save(result);
                }
                this.io.emit('editSpoilerOutput', result);
            } else {
                log.warn('Spoiler vote/change from unauthorized user.');
            }
        } catch (e) {
            log.error('Error changing spoiler label:', e);
        }
    }

    async toggleReaction(data, socket) {
        try {
            // data: { _id, reaction: 'heart'|'blush'|... , token, charId }
            const verified = this.verifySocketToken(socket, data.token);
            if (!verified) return;

            const { doc: message } = await this.findMessageForMutation(data._id);
            if (!message) return;

            // Visibility Check
            // User must be able to see the message to react to it
            // 1. If visibleTo is empty, it's public (or global)
            // 2. If visibleTo has entries, user must be in it
            const isVisible = (!message.visibleTo || message.visibleTo.length === 0) || (message.visibleTo.includes(data.charId));

            // Also need to check if user is excluded
            const isExcluded = message.excludedPlayers && message.excludedPlayers.includes(data.charId);

            if (!isVisible || isExcluded) {
                log.warn(`User ${data.charId} attempted to react to invisible message ${data._id}`);
                return;
            }

            // Initialization safety
            if (!message.reactions) {
                message.reactions = { heart: [], blush: [], laugh: [], thumbsup: [], thumbsdown: [] };
            }

            const validReactions = ['heart', 'blush', 'laugh', 'thumbsup', 'thumbsdown'];
            if (!validReactions.includes(data.reaction)) return;

            // Toggle Logic
            const reactorId = data.charId;
            const currentReactorList = message.reactions[data.reaction] || [];

            if (currentReactorList.includes(reactorId)) {
                // Remove
                message.reactions[data.reaction] = currentReactorList.filter(id => id !== reactorId);
            } else {
                // Add
                message.reactions[data.reaction] = [...currentReactorList, reactorId];
            }

            // Mongoose might not detect deep change in Mixed type if schema wasn't explicit enough, 
            // but we defined it explicitly in Chat.js so 'markModified' shouldn't be strictly necessary 
            // if we assign the array back.
            // message.markModified('reactions'); // Safety net if needed

            await DatabaseResilience.save(message);

            // Broadcast Update
            this.broadcastReactionUpdate(message);

        } catch (e) {
            log.error('Error toggling reaction:', e);
        }
    }

    broadcastReactionUpdate(message) {
        try {
            const payload = {
                _id: message._id,
                reactions: message.reactions
            };

            const connectedSockets = this.io.sockets.sockets;
            const visibleTo = message.visibleTo || [];
            const excludedPlayers = message.excludedPlayers || [];

            if (visibleTo.length > 0) {
                // Private/Scoped Message
                visibleTo.forEach(charId => {
                    if (excludedPlayers.includes(charId)) return;
                    const sId = serverGame.getSocketIdByCharId(charId);
                    if (sId) {
                        const socket = connectedSockets.get(sId);
                        if (socket) socket.emit('messageReactionUpdate', payload);
                    }
                });
            } else {
                // Public Message
                this.io.emit('messageReactionUpdate', payload);
            }

        } catch (e) {
            log.error('Error broadcasting reaction update:', e);
        }
    }



    async handleIncomingMessage(socket, data) {
        try {
            // 0. Rate Limiting
            const now = Date.now();
            const lastTime = this.lastMessageTimes.get(socket.id) || 0;
            if (now - lastTime < 500) {
                // Too fast!
                require('../server/monitoring').recordAction('chat', false);
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
            const verified = this.verifySocketToken(socket, data.token);

            if (!verified) {
                log.warn('Invalid token in handleIncomingMessage');
                require('../server/monitoring').recordAction('chat', false);
                return;
            }

            let cleanMessage = this.parseAndSanitize(data.message);

            if (cleanMessage.length > 10000) {
                require('../server/monitoring').recordAction('chat', false);
                return socket.emit('tooManyChars', cleanMessage.length, data.message);
            }


            // 2.5 Tagging Command (State-Augmented Dataset)
            if (cleanMessage.startsWith('/tag ')) {
                const tagContent = cleanMessage.substring(5).trim();
                // ... existing tag logic ...
            }

            // 2.6 Damage Command (Verification & Environmental Simulation)
            if (cleanMessage.startsWith('/damage ')) {
                const parts = cleanMessage.split(' ');
                const amount = parseInt(parts[1]);
                const damageType = parts[2] || 'brute';
                const bodyPart = parts[3] || null;

                if (!isNaN(amount)) {
                    const players = serverGame.getAllPlayers();
                    const result = await applyDamage(players, User, socket.id, amount, socket.id, damageType, serverGame.addCorpse, this.io, bodyPart);

                    if (result.success) {
                        this.sendSystemMessage(
                            'Environmental',
                            `Took ${amount} ${result.damageType} to ${result.bodyPart}. New Health: ${result.newHealth}`,
                            socket
                        );
                    }
                }
                return;
            }

            // 2.6.5 Remedy Command (First Aid & Healing)
            if (cleanMessage.startsWith('/remedy ')) {
                const parts = cleanMessage.split(' ');
                const remedyType = parts[1] || 'bandage';
                const bodyPart = parts[2] || 'torso';
                const players = serverGame.getAllPlayers();
                const target = players[socket.id];

                if (target) {
                    const result = applyRemedy(target, remedyType, bodyPart);
                    this.sendSystemMessage(
                        'Environmental',
                        result.message,
                        socket
                    );
                    socket.emit('anatomyStatsUpdate', {
                        stats: target.stats,
                        isDead: target.isDead
                    });
                }
                return;
            }

            // 2.7 Heal Command
            if (cleanMessage.startsWith('/heal ')) {
                const parts = cleanMessage.split(' ');
                const amount = parseInt(parts[1]);
                if (!isNaN(amount)) {
                    const players = serverGame.getAllPlayers();
                    const result = await healPlayer(players, User, socket.id, amount, this.io);

                    if (result.success) {
                        this.sendSystemMessage(
                            'Environmental',
                            `You healed yourself for ${amount}. New Health: ${result.newHealth}`,
                            socket
                        );
                    }
                }
                return;
            }

            // 2.8 Revive Command
            if (cleanMessage.trim() === '/revive') {
                const players = serverGame.getAllPlayers();
                const result = await revivePlayer(players, User, socket.id, this.io);

                if (result.success) {
                    this.sendSystemMessage(
                        'Environmental',
                        `You have been revived!`,
                        socket
                    );
                } else if (result.error === 'Player is not dead') {
                    this.sendSystemMessage(
                        'Environmental',
                        `You are not dead!`,
                        socket
                    );
                }
                return;
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

                // Fast-path: use spatial range if available on serverGame
                const nearbySocketIds = serverGame.getSocketsInRange ? serverGame.getSocketsInRange(senderSocketId, 500) : null;
                const socketIterable = nearbySocketIds
                    ? nearbySocketIds.map(sId => [sId, connectedSockets.get(sId)]).filter(([_, s]) => !!s)
                    : connectedSockets;

                for (const [sId, s] of socketIterable) {
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
            // Extract Sender Profile for Avatar Display
            const players = serverGame.getAllPlayers();
            let senderPlayer = players[socket.id];
            if (!senderPlayer && data.charId) {
                const sId = serverGame.getSocketIdByCharId(data.charId);
                if (sId && players[sId]) {
                    senderPlayer = players[sId];
                }
            }
            let senderProfile = this.extractSenderProfile(senderPlayer);
            if ((!senderProfile || !senderProfile.head) && data.senderProfile) {
                senderProfile = data.senderProfile;
            }

            const isBot = socket.handshake && socket.handshake.query && socket.handshake.query.isBot === 'true';
            const chatMessage = new Chats({
                name: data.name,
                type: type,
                scope: scope,
                message: [{ content: content, time: new Date().toUTCString() }],
                spoiler: { status: data.spoiler || 'none', votes: { watersports: 0, disposal: 0, gore: 0 } },
                deleted: { status: false, deletionTime: null },
                identifier: { account: verified._id, character: data.charId },
                senderProfile: senderProfile, // New Field
                visibleTo: visibleTo,
                gameState: isBot ? null : this.captureGameState(socket, 'talk', (type === 'Unique' && targetName) ?
                    (serverGame.findPlayerByName(targetName) ? serverGame.findPlayerByName(targetName).playerId : null)
                    : null)
            });

            // Queue for Bulk Insert (Buffered)
            this.chatBuffer.push(chatMessage.toObject());

            // Debug Log for State-Augmented Dataset Verification
            if (chatMessage.gameState) {
                log.info(`[GameState] Captured Snapshot for message ${chatMessage._id}`);
            }

            // 6. Broadcast Message (Immediate)
            // Pass clientMsgId (if any) to broadcast so client can reconcile ghost message
            this.broadcastMessage(chatMessage, visibleTo, [], data.clientMsgId, socket.id);
            require('../server/monitoring').recordAction('chat', true);
        } catch (e) {
            log.error('Error in handleIncomingMessage:', e);
            require('../server/monitoring').recordAction('chat', false);
        }
    }

    /**
     * Extracts visual profile data from the player object.
     * @param {Object} player - The runtime player object.
     * @returns {Object} The lightweight profile for avatars.
     */
    extractSenderProfile(player) {
        if (!player) return {};
        // List of cosmetic parts to include
        const parts = ['head', 'eyes', 'ear', 'body', 'hands', 'feet', 'tail', 'hair', 'headAccessories', 'beak'];
        const profile = {};

        parts.forEach(part => {
            if (player[part]) {
                profile[part] = player[part];
            }
        });
        return profile;
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
     * @param {string} clientMsgId - The transient ID for the sender.
     * @param {string} senderSocketId - The socket ID of the sender.
     */
    broadcastMessage(messageObject, visibleTo = [], excludedPlayers = [], clientMsgId = null, senderSocketId = null) {
        try {
            // Ensure excludedPlayers are strings for comparison
            excludedPlayers = excludedPlayers.map(id => id.toString());

            // Base client message
            const clientMsg = {
                _id: messageObject._id,
                name: messageObject.name,
                type: messageObject.type,
                scope: messageObject.scope,
                message: [messageObject.message[messageObject.message.length - 1]], // Send only the latest version
                spoiler: messageObject.spoiler,
                deleted: messageObject.deleted,
                identifier: messageObject.identifier.character,
                senderProfile: messageObject.senderProfile, // Include in broadcast
                visibleTo: messageObject.visibleTo,
                excludedPlayers: messageObject.excludedPlayers,
                reactions: messageObject.reactions, // Include reactions in initial load/broadcast
                clientMsgId: clientMsgId // Return transient ID for optimistic UI (will be stripped for others)
            };

            const connectedSockets = this.io.sockets.sockets;

            // If visibleTo is set, we only send to those (minus excluded)
            if (visibleTo && visibleTo.length > 0) {
                visibleTo.forEach(charId => {
                    if (excludedPlayers && excludedPlayers.includes(charId)) return; // Skip excluded

                    const sId = serverGame.getSocketIdByCharId(charId);

                    if (sId) {
                        const socket = connectedSockets.get(sId);
                        if (socket && !this.isBotSocket(socket)) {
                            // Only include clientMsgId if this is the sender
                            const payload = { ...clientMsg };
                            if (sId !== senderSocketId) {
                                delete payload.clientMsgId;
                            }
                            socket.emit('output', [payload]);
                        }
                    } else {
                        // log.warn(`No socket found for charId: ${charId}`);
                    }
                });
            } else if (!excludedPlayers || excludedPlayers.length === 0) {
                // Public Message (Fast-Path Broadcast)
                const payloadNoId = { ...clientMsg };
                delete payloadNoId.clientMsgId;

                const senderSocket = senderSocketId ? connectedSockets.get(senderSocketId) : null;

                if (senderSocket && !this.isBotSocket(senderSocket)) {
                    // Broadcast to all other sockets except sender
                    senderSocket.broadcast.emit('output', [payloadNoId]);
                    // Send transient clientMsgId back to original sender socket for ghost reconciliation
                    senderSocket.emit('output', [clientMsg]);
                } else {
                    // No sender socket or sender is bot, broadcast to all sockets
                    this.io.emit('output', [payloadNoId]);
                }
            } else {
                // Public Message (With Excluded Players Filtering)
                const payloadNoId = { ...clientMsg };
                delete payloadNoId.clientMsgId;

                for (const [socketId, socket] of connectedSockets) {
                    if (this.isBotSocket(socket)) continue;

                    const charId = serverGame.getCharIdBySocketId(socketId);
                    if (charId && excludedPlayers.includes(charId.toString())) {
                        continue; // Skip excluded
                    }

                    if (socketId === senderSocketId) {
                        socket.emit('output', [clientMsg]);
                    } else {
                        socket.emit('output', [payloadNoId]);
                    }
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
                    log.debug(`sendSystemMessage: Could not find charId for socket ${targetSocket.id}`);
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

            // Queue for Bulk Insert (Buffered)
            this.chatBuffer.push(chatMessage.toObject());

            // Delegate to broadcastMessage for consistent logic
            this.broadcastMessage(chatMessage, visibleTo, excludedPlayers);

        } catch (e) {
            log.error('Error in sendSystemMessage:', e);
        }
    }

    captureGameState(socket, intent = 'talk', targetSocketId = null) {
        try {
            const senderId = socket.id;
            const players = serverGame.getAllPlayers();
            const senderPlayer = players[senderId];

            if (!senderPlayer) return null;

            // 1. Snapshot Speaker Context (Optimized)
            // Use selective cloning instead of full JSON stringify
            const speakerContext = this.getLightweightContext(senderPlayer);

            // 2. Snapshot Listener Context (Optimized)
            let listenerContext = {};
            if (targetSocketId) {
                const targetPlayer = players[targetSocketId];
                if (targetPlayer) {
                    listenerContext = this.getLightweightContext(targetPlayer);
                }
            }

            // 3. Snapshot Location Context
            const locationContext = {
                title: 'Demo Map',
                surrounding_tiles: [],
                nearby_objects: []
            };

            const pX = senderPlayer.position.x;
            const pY = senderPlayer.position.y;
            const TILE_SIZE = 32;
            const range = 2; // +/- 2 tiles

            for (let yOffset = -range; yOffset <= range; yOffset++) {
                for (let xOffset = -range; xOffset <= range; xOffset++) {
                    const checkX = pX + (xOffset * TILE_SIZE);
                    const checkY = pY + (yOffset * TILE_SIZE);
                    const tileData = serverGame.getMapDataAt(checkX, checkY);
                    if (tileData) {
                        locationContext.surrounding_tiles.push({
                            rel_x: xOffset,
                            rel_y: yOffset,
                            type: tileData.type,
                            // Only essential fields
                        });
                    }
                }
            }

            // Capture Nearby Objects (Use Spatial Hash)
            const visibleItems = serverGame.getWorldItemsInArea(pX, pY, 500);

            locationContext.nearby_objects = visibleItems.map(item => {
                const tags = SemanticMapper.getNearbyObjectTags ? SemanticMapper.getNearbyObjectTags([item]) : [];
                return {
                    name: item.name || 'Unknown Item',
                    uid: item.uid,
                    x: item.x,
                    y: item.y,
                    semantic_tags: tags[0] || null
                };
            });



            // Re-assign to match structure if I broke it in variable usage above
            // Actually, let's just add the property to the object we created.
            locationContext.zone = serverGame.getZoneAt(pX, pY) || 'Unknown';

            return {
                speaker_context: speakerContext,
                intendedListener_context: listenerContext,
                location_context: locationContext
            };

        } catch (e) {
            log.error('Error in captureGameState:', e);
            return null;
        }
    }

    getLightweightContext(p) {
        if (!p) return null;
        // Construct visual tags first
        const tags = SemanticMapper.getVisualContext(p);

        return {
            Username: p.Username,
            firstName: p.firstName,
            lastName: p.lastName,
            description: p.icDescrip,
            position: { x: p.position.x, y: p.position.y },
            species: p.speciesName,
            visual_tags: tags,
            // Add stats or other AI-relevant fields if needed, but avoid massive equipment objects
            // unless strictly necessary for the AI to "see" them. 
            // Visual tags often cover "wearing a red shirt".
            stats: p.stats
        };
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
