
/**
 * @fileoverview test_chat.js - Automated End-to-End Chat Subsystem Diagnostic Suite
 * 
 * @description
 * Simulates multiple headless Socket.IO bot clients to conduct automated integration testing
 * for TastyTails.net real-time chat features, including global/local spatial scoping, Markdown
 * parsing, HTML sanitization, spoiler flags, message editing, and emoji reaction toggles.
 * 
 * Triggered by: Manual CLI execution (`node scripts/test_chat.js`) or automated test scripts.
 */

const io = require('socket.io-client');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

// Configuration
const SERVER_URL = process.env.TEST_SERVER_URL || process.env.SERVER_URL || 'http://localhost:3000';

// Latency & Timeout Config
const TIMEOUT_MS = parseInt(process.env.TEST_TIMEOUT_MS, 10) || 5000;

/**
 * Headless Socket.IO Bot Client wrapper for automated chat verification.
 */
class Bot {
    /**
     * Constructs a new Bot instance with initial spatial coordinates.
     * @param {string} name - Human-readable name for logging & identification.
     * @param {{x: number, y: number}} startPos - Initial world position coordinates.
     */
    constructor(name, startPos) {
        this.name = name;
        this.socket = null;
        this.id = null;
        this.charId = null; // Important for chat visibility checks
        this.pos = { x: startPos.x, y: startPos.y };
        this.connected = false;
        this.events = [];
        this.expectedEvents = {};
        this.chatHistory = [];
    }

    /**
     * Establishes a WebSocket connection to the game server, registers the bot in the spatial grid,
     * and sets up wildcard event listeners and buffer pruning.
     * @returns {Promise<void>} Resolves when connection and initial spawn packet registration complete.
     */
    async connect() {
        return new Promise((resolve, reject) => {
            // Generate random Char ID (Mongodb ObjectId-ish)
            const randomHex = Math.floor(Math.random() * 16777215).toString(16).padStart(24, '0');
            this.charId = randomHex;

            this.socket = io(SERVER_URL, {
                query: { charId: randomHex, isBot: true },
                reconnection: false,
                transports: ['websocket'],
                forceNew: true,
            });

            this.socket.on('connect', () => {
                this.id = this.socket.id;
                this.connected = true;
                console.log(`[${this.name}] Connected with Socket ID ${this.id} / Char ID ${this.charId}`);

                // Initial Spawn
                this.socket.emit('characterUpdate', {
                    x: this.pos.x,
                    y: this.pos.y,
                    firstName: this.name,
                    lastName: 'Bot',
                    isInGame: true
                });

                // Send dummy input to register in Spatial Grid
                this.socket.emit('playerInput', {
                    left: false, right: false, up: false, down: false,
                    delta: 0.016,
                    clientTimestamp: Date.now()
                });

                resolve();
            });

            this.socket.on('connect_error', (err) => {
                console.error(`[${this.name}] Connection Error:`, err.message);
                reject(err);
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
                console.log(`[${this.name}] Disconnected`);
            });

            this.socket.onAny((eventName, ...args) => {
                const now = Date.now();
                this.events.push({ name: eventName, args, time: now });

                // OPTIMIZATION: Event Buffer Pruning (500-item cap & 10s TTL to prevent memory leaks while preserving lookbacks)
                if (this.events.length > 500) {
                    const cutoff = now - 10000;
                    this.events = this.events.filter(e => e.time > cutoff);
                }

                // Check expectations
                if (this.expectedEvents[eventName]) {
                    const resolver = this.expectedEvents[eventName];
                    resolver(args);
                }

                // Internal State Updates
                if (eventName === 'output') {
                    const msgs = args[0];
                    if (msgs && msgs.length > 0) {
                        msgs.forEach(m => {
                            const content = m.message[m.message.length - 1].content;
                            console.log(`[${this.name}] CHAT PREVIEW: "${content.substring(0, 50)}..." [Scope: ${m.scope}]`);
                            this.chatHistory.push(m);
                        });
                    }
                }

                if (eventName === 'editOutput') {
                    const msg = args[0];
                    console.log(`[${this.name}] CHAT EDITED: ID ${msg._id}`);
                }

                if (eventName === 'editSpoilerOutput') {
                    const msg = args[0];
                    console.log(`[${this.name}] SPOILER UPDATED: ID ${msg._id} -> ${msg.spoiler.status}`);
                }

                if (eventName === 'messageReactionUpdate') {
                    const msg = args[0];
                    console.log(`[${this.name}] REACTION UPDATE: ID ${msg._id}`);
                }
            });
        });
    }

    /**
     * Gracefully disconnects the bot's Socket.IO socket instance.
     */
    disconnect() {
        if (this.socket) this.socket.disconnect();
    }

    /**
     * Asynchronously awaits an incoming socket event matching eventName and an optional predicate filter.
     * @param {string} eventName - Name of the expected socket event (e.g. 'output', 'editOutput').
     * @param {number} [timeout=TIMEOUT_MS] - Timeout duration in milliseconds before rejecting.
     * @param {Function|null} [predicate=null] - Optional filter function returning boolean when args match.
     * @returns {Promise<Array>} Resolves with the event arguments array when matched.
     */
    async waitForEvent(eventName, timeout = TIMEOUT_MS, predicate = null) {
        return new Promise((resolve, reject) => {
            const startCheckTime = Date.now();

            // SAFEGUARD: Check existing event buffer first to eliminate race condition misses
            const checkBuffer = () => {
                const recent = this.events.filter(e => e.name === eventName && e.time > startCheckTime - 100);
                if (recent.length > 0) {
                    const last = recent[recent.length - 1];
                    if (!predicate || predicate(last.args)) {
                        return last.args;
                    }
                }
                return null;
            };

            const found = checkBuffer();
            if (found) {
                resolve(found);
                return;
            }

            const resolver = (args) => {
                if (!predicate || predicate(args)) {
                    if (this.expectedEvents[eventName] === resolver) {
                        delete this.expectedEvents[eventName];
                    }
                    resolve(args);
                }
            };
            this.expectedEvents[eventName] = resolver;

            setTimeout(() => {
                if (this.expectedEvents[eventName] === resolver) {
                    delete this.expectedEvents[eventName];
                    reject(new Error(`[${this.name}] Timeout waiting for event '${eventName}'`));
                }
            }, timeout);
        });
    }

    /**
     * Emits an arbitrary socket event with args directly over the WebSocket connection.
     * @param {string} event - Event name to emit.
     * @param {...*} args - Payload arguments.
     */
    emit(event, ...args) {
        this.socket.emit(event, ...args);
    }

    /**
     * Sends a chat message payload to the server.
     * @param {string} content - Raw text content of the message.
     * @param {string} [scope='global'] - Chat scope ('global' or 'local').
     * @param {string} [type='Default'] - Message classification type.
     */
    sendMessage(content, scope = 'global', type = 'Default') {
        return this.socket.emit('input', {
            message: content,
            scope: scope,
            type: type,
            token: this.generateToken(),
            charId: this.charId,
            name: this.name,
            spoiler: 'none'
        });
    }

    /**
     * Sends a chat message flagged as a spoiler.
     * @param {string} content - Content of the spoiler message.
     * @param {string} [scope='global'] - Chat scope ('global' or 'local').
     */
    sendSpoiler(content, scope = 'global') {
        return this.socket.emit('input', {
            message: content,
            scope: scope,
            token: this.generateToken(),
            charId: this.charId,
            name: this.name,
            spoiler: 'warning'
        });
    }

    /**
     * Emits an edit payload for an existing message.
     * @param {string} msgId - Database ID (_id) of the target message.
     * @param {string} newContent - Replacement message text.
     */
    editMessage(msgId, newContent) {
        this.socket.emit('inputEdit', {
            _id: msgId,
            message: newContent,
            token: this.generateToken(),
            charId: this.charId
        });
    }

    /**
     * Generates a signed JWT token using TOKEN_SECRET for bot socket authentication.
     * @returns {string} Signed JWT token string.
     */
    generateToken() {
        const payload = {
            _id: 'TEST_ACCOUNT_ID_' + this.name,
            username: this.name
        };
        return jwt.sign(payload, process.env.TOKEN_SECRET || 'testsecret');
    }
}

/**
 * Utility helper returning a promise that resolves after the specified delay.
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// TEST SUITE
// ==========================================

/**
 * Main async test suite execution function orchestrating 6 chat feature tests:
 * 1. Global message delivery
 * 2. Local message spatial range limits
 * 3. Markdown bold formatting & HTML sanitization
 * 4. Spoiler flags & warning status
 * 5. In-place message editing via inputEdit
 * 6. Emoji reaction addition and removal via toggleReaction
 * @returns {Promise<void>} Exits process with code 0 on clean pass or 1 on failure.
 */
async function runTests() {
    console.log("=== Starting Message System Tests ===");
    let testFailed = false;

    // Position Setup
    // Center: 3300, 4300
    // Close: 3350, 4300 (50px away)
    // Far: 0, 0 (>3000px away)

    const Sender = new Bot('Sender', { x: 3300, y: 4300 });
    const Receiver = new Bot('Receiver', { x: 3350, y: 4300 });
    const FarBot = new Bot('FarBot', { x: 50, y: 50 });

    try {
        await Promise.all([Sender.connect(), Receiver.connect(), FarBot.connect()]);
        await sleep(1000);

        // Ensure FarBot is actually far (override spawn)
        FarBot.emit('characterUpdate', { x: 50, y: 50 });
        FarBot.emit('playerInput', { delta: 0.016 });
        await sleep(500);

        // -------------------------------------------------------------
        // Test 1: Global Message (Everyone Receives)
        // -------------------------------------------------------------
        console.log("\n--- Test 1: Global Message ---");
        const globalMsg = "Hello Global World " + Date.now();
        console.log("Sending Global...");
        Sender.sendMessage(globalMsg, 'global');

        let globalSuccess = false;
        let receiverSaw = false;
        let farSaw = false;
        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000, (args) => {
                const content = args?.[0]?.[0]?.message?.[0]?.content;
                return content && content.includes(globalMsg);
            });
            console.log("✅ Receiver saw Global message.");
            receiverSaw = true;
        } catch (e) {
            console.error("❌ Receiver failed to see Global message", e);
            testFailed = true;
        }

        try {
            const [msgs] = await FarBot.waitForEvent('output', 3000, (args) => {
                const content = args?.[0]?.[0]?.message?.[0]?.content;
                return content && content.includes(globalMsg);
            });
            console.log("✅ FarBot saw Global message.");
            farSaw = true;
        } catch (e) {
            console.error("❌ FarBot failed to see Global message", e);
            testFailed = true;
        }
        globalSuccess = receiverSaw && farSaw;
        Sender.emit('reportAction', { actionType: 'test: chat global delivery', success: globalSuccess });

        await sleep(2000); // Wait for Rate Limit (500ms)


        // -------------------------------------------------------------
        // Test 2: Local Message (Range Check)
        // -------------------------------------------------------------
        console.log("\n--- Test 2: Local Message (Range) ---");
        const localMsg = "Hello Local Neighbors " + Date.now();
        console.log("Sending Local...");
        Sender.sendMessage(localMsg, 'local');

        let localSuccess = false;
        let receiverLocalSaw = false;
        let farLocalSaw = false;
        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000, (args) => {
                const content = args?.[0]?.[0]?.message?.[0]?.content;
                return args?.[0]?.[0]?.scope === 'local' && content && content.includes(localMsg);
            });
            console.log("✅ Receiver saw Local message.");
            receiverLocalSaw = true;
        } catch (e) {
            console.error("❌ Receiver failed to see Local message", e);
            testFailed = true;
        }

        let farSawIt = false;
        try {
            await FarBot.waitForEvent('output', 1000, (args) => {
                const content = args?.[0]?.[0]?.message?.[0]?.content;
                return args?.[0]?.[0]?.scope === 'local' && content && content.includes(localMsg);
            });
            farSawIt = true;
        } catch (e) { /* Expected Timeout */ }

        if (!farSawIt) {
            console.log("✅ FarBot did NOT see Local message (Correct).");
            farLocalSaw = true;
        } else {
            console.error("❌ FarBot saw Local message (Range Fail).");
        }
        localSuccess = receiverLocalSaw && farLocalSaw;
        Sender.emit('reportAction', { actionType: 'test: chat local scope limits', success: localSuccess });

        await sleep(2000); // Wait for Rate Limit


        // -------------------------------------------------------------
        // Test 3: Formatting (HTML/Sanitization)
        // -------------------------------------------------------------
        console.log("\n--- Test 3: Formatting ---");
        const boldMsg = "**Bold Text**";
        Sender.sendMessage(boldMsg, 'global');

        let formattingSuccess = false;
        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000, (args) => {
                const content = args?.[0]?.[0]?.message?.[0]?.content;
                return content && content.includes('<strong>Bold Text</strong>');
            });
            const content = msgs?.[0]?.[0]?.message?.[0]?.content || '';
            if (content.includes('<strong>Bold Text</strong>')) {
                console.log("✅ Bold formatting verified.");
                formattingSuccess = true;
            } else {
                console.error(`❌ Formatting mismatch. Got: ${content}`);
                testFailed = true;
            }
        } catch (e) {
            console.error("❌ Formatting test timed out", e);
            testFailed = true;
        }
        Sender.emit('reportAction', { actionType: 'test: chat md bold formatting', success: formattingSuccess });

        await sleep(2000); // Wait for Rate Limit


        // -------------------------------------------------------------
        // Test 4: Spoilers
        // -------------------------------------------------------------
        console.log("\n--- Test 4: Spoilers ---");
        const spoilerMsg = "Secret Content";
        Sender.sendSpoiler(spoilerMsg, 'global');

        let msgIdToEdit = null;
        let spoilerSuccess = false;

        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000); // Wait for ANY output
            const msg = msgs[0];
            if (msg.spoiler && (msg.spoiler.status === 'warning' || msg.spoiler.status === 'content')) {
                console.log("✅ Spoiler flag received.");
                msgIdToEdit = msg._id;
                spoilerSuccess = true;
            } else {
                console.log(`⚠️ Msg received but not spoiler: ${JSON.stringify(msg.spoiler)}`);
            }
        } catch (e) { console.error("❌ Spoiler test timed out", e); }
        Sender.emit('reportAction', { actionType: 'test: chat spoilers flag', success: spoilerSuccess });


        // -------------------------------------------------------------
        // Test 5: Editing
        // -------------------------------------------------------------
        console.log("\n--- Test 5: Message Editing ---");
        let editSuccess = false;
        if (msgIdToEdit) {
            const newText = "Edited Content";
            Sender.editMessage(msgIdToEdit, newText);

            try {
                const [result] = await Receiver.waitForEvent('editOutput', 2000, (args) => {
                    return args[0]._id === msgIdToEdit;
                });

                const history = result.message;
                const latest = history[history.length - 1];
                if (latest.content.includes(newText)) {
                    console.log("✅ Edit received and content updated.");
                    editSuccess = true;
                } else {
                    console.error("❌ Edit received but content mismatch.");
                }

            } catch (e) { console.error("❌ Edit test timed out"); }
        } else {
            console.warn("⚠️ Skipping Edit Test (Dependencies failed)");
        }
        Sender.emit('reportAction', { actionType: 'test: chat message editing', success: editSuccess });

        // -------------------------------------------------------------
        // Test 6: Reactions
        // -------------------------------------------------------------
        console.log("\n--- Test 6: Reactions ---");
        let reactionSuccess = false;
        if (msgIdToEdit) {
            Sender.emit('toggleReaction', {
                _id: msgIdToEdit,
                reaction: 'heart',
                token: Sender.generateToken(),
                charId: Sender.charId
            });

            try {
                const [result] = await Receiver.waitForEvent('messageReactionUpdate', 2000, (args) => {
                    return args[0]._id === msgIdToEdit;
                });

                let added = false;
                if (result.reactions && result.reactions.heart && result.reactions.heart.includes(Sender.charId)) {
                    console.log("✅ Reaction added successfully.");
                    added = true;
                } else {
                    console.log("❌ Reaction update received but data mismatch.");
                }

                // Remove Reaction
                await sleep(500);
                Sender.emit('toggleReaction', {
                    _id: msgIdToEdit,
                    reaction: 'heart',
                    token: Sender.generateToken(),
                    charId: Sender.charId
                });

                const [result2] = await Receiver.waitForEvent('messageReactionUpdate', 2000);
                let removed = false;
                if (!result2.reactions.heart.includes(Sender.charId)) {
                    console.log("✅ Reaction removed successfully.");
                    removed = true;
                } else {
                    console.error("❌ Reaction removal failed.");
                }
                reactionSuccess = added && removed;

            } catch (e) { console.error("❌ Reaction test timed out", e); }
        }
        Sender.emit('reportAction', { actionType: 'test: chat message reactions', success: reactionSuccess });


    } catch (err) {
        console.error("CRITICAL TEST FAILURE:", err);
        testFailed = true;
    } finally {
        console.log("Cleaning up...");
        Sender.disconnect();
        Receiver.disconnect();
        FarBot.disconnect();
        process.exit(testFailed ? 1 : 0);
    }
}

runTests();
