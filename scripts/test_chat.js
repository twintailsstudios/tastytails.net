
const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';

// Latency & Timeout Config
const TIMEOUT_MS = 5000;

class Bot {
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
                this.events.push({ name: eventName, args, time: Date.now() });

                // Check expectations
                if (this.expectedEvents[eventName]) {
                    const resolver = this.expectedEvents[eventName];
                    // We don't delete immediately if we want to catch multiple, 
                    // but for simple 'waitForEvent', we usually consume it.
                    // For now, let's consume it.
                    delete this.expectedEvents[eventName];
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

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }

    async waitForEvent(eventName, timeout = TIMEOUT_MS, predicate = null) {
        return new Promise((resolve, reject) => {
            // Check if already happened recently (last 1 second?)
            // For chat tests, it's safer to wait for NEW events usually, 
            // but let's allow checking recent history to avoid race conditions.
            const startCheckTime = Date.now();

            // Check existing buffer first
            const checkBuffer = () => {
                const recent = this.events.filter(e => e.name === eventName && e.time > startCheckTime - 100);
                // -100ms tolerance if event came just before call
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

            this.expectedEvents[eventName] = (args) => {
                if (!predicate || predicate(args)) {
                    resolve(args);
                }
            };

            setTimeout(() => {
                if (this.expectedEvents[eventName]) {
                    delete this.expectedEvents[eventName];
                    reject(new Error(`[${this.name}] Timeout waiting for event '${eventName}'`));
                }
            }, timeout);
        });
    }

    emit(event, ...args) {
        this.socket.emit(event, ...args);
    }

    sendMessage(content, scope = 'global', type = 'Default') {
        // Message structure based on ChatInput.js logic
        // We typically emit: 'input', { message: rawText, scope: 'global'|'local', token: ... }
        // BUT we need a token. The automated test usually bypasses auth or mocks it?
        // Wait, MessageSystem.js verify(data.token).
        // The robots don't have real tokens! 
        // We might need to generate a fake signed token if the server requires it.
        // User rules: "The USER will send you requests...".
        // Checking MessageSystem.js: `const verified = jwt.verify(data.token, process.env.TOKEN_SECRET);`
        // We need a way to generate a valid token for the test bots.
        // OR we can make the server accept a debug token?
        // No, let's try to sign one. We need the secret.
        // The secret is in .env. We can read .env in this script since it runs on the server Node environment.
        return this.socket.emit('input', {
            message: content,
            scope: scope,
            type: type, // 'input' event usually just takes message/scope, type inferred? 
            // MessageSystem classifyMessage: /ooc, /me, /w determine type. 
            // So if we want 'Default', just send text.
            token: this.generateToken(),
            charId: this.charId,
            name: this.name,
            spoiler: 'none'
        });
    }

    sendSpoiler(content, scope = 'global') {
        return this.socket.emit('input', {
            message: content,
            scope: scope,
            token: this.generateToken(),
            charId: this.charId,
            name: this.name,
            spoiler: 'warning' // or 'content' ? ChatUI uses 'spoiled-warning' etc. 
            // MessageSystem: spoiler: { status: data.spoiler || 'none' }
        });
    }

    editMessage(msgId, newContent) {
        this.socket.emit('inputEdit', {
            _id: msgId,
            message: newContent,
            token: this.generateToken(),
            charId: this.charId
        });
    }

    generateToken() {
        const jwt = require('jsonwebtoken'); // Assuming installed
        const dotenv = require('dotenv');
        dotenv.config();

        // Mock User Object
        const payload = {
            _id: 'TEST_ACCOUNT_ID_' + this.name, // Account ID
            username: this.name
        };
        return jwt.sign(payload, process.env.TOKEN_SECRET || 'testsecret');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// TEST SUITE
// ==========================================

async function runTests() {
    console.log("=== Starting Message System Tests ===");

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

        // Verify Receiver
        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000, (args) => {
                // args[0] is the array of messages [msg1, msg2]
                return args[0][0].message[0].content.includes(globalMsg);
            });
            console.log("✅ Receiver saw Global message.");
        } catch (e) { console.error("❌ Receiver failed to see Global message", e); }

        // Verify FarBot
        try {
            const [msgs] = await FarBot.waitForEvent('output', 3000, (args) => {
                return args[0][0].message[0].content.includes(globalMsg);
            });
            console.log("✅ FarBot saw Global message.");
        } catch (e) { console.error("❌ FarBot failed to see Global message", e); }


        await sleep(2000); // Wait for Rate Limit (500ms)


        // -------------------------------------------------------------
        // Test 2: Local Message (Range Check)
        // -------------------------------------------------------------
        console.log("\n--- Test 2: Local Message (Range) ---");
        const localMsg = "Hello Local Neighbors " + Date.now();
        console.log("Sending Local...");
        Sender.sendMessage(localMsg, 'local');

        // Verify Receiver (Close)
        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000, (args) => {
                return args[0][0].scope === 'local' && args[0][0].message[0].content.includes(localMsg);
            });
            console.log("✅ Receiver saw Local message.");
        } catch (e) { console.error("❌ Receiver failed to see Local message", e); }

        // Verify FarBot (Far) - SHOULD NOT SEE
        let farSawIt = false;
        try {
            await FarBot.waitForEvent('output', 1000, (args) => {
                return args[0][0].scope === 'local' && args[0][0].message[0].content.includes(localMsg);
            });
            farSawIt = true;
        } catch (e) { /* Expected Timeout */ }

        if (!farSawIt) console.log("✅ FarBot did NOT see Local message (Correct).");
        else console.error("❌ FarBot saw Local message (Range Fail).");


        await sleep(2000); // Wait for Rate Limit


        // -------------------------------------------------------------
        // Test 3: Formatting (HTML/Sanitization)
        // -------------------------------------------------------------
        console.log("\n--- Test 3: Formatting ---");
        const boldMsg = "**Bold Text**";
        Sender.sendMessage(boldMsg, 'global');

        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000, (args) => {
                return args[0][0].message[0].content.includes('<strong>Bold Text</strong>');
            });
            // The wait returns the 'args' array: [ [msg] ]
            // so msgs is [msg]
            const content = msgs[0].message[0].content;
            if (content.includes('<strong>Bold Text</strong>')) {
                console.log("✅ Bold formatting verified.");
            } else {
                console.error(`❌ Formatting mismatch. Got: ${content}`);
            }
        } catch (e) { console.error("❌ Formatting test timed out", e); }


        await sleep(2000); // Wait for Rate Limit


        // -------------------------------------------------------------
        // Test 4: Spoilers
        // -------------------------------------------------------------
        console.log("\n--- Test 4: Spoilers ---");
        const spoilerMsg = "Secret Content";
        Sender.sendSpoiler(spoilerMsg, 'global');

        let msgIdToEdit = null;

        try {
            const [msgs] = await Receiver.waitForEvent('output', 3000); // Wait for ANY output
            // Should verify it's the spoiler one
            const msg = msgs[0];
            if (msg.spoiler && (msg.spoiler.status === 'warning' || msg.spoiler.status === 'content')) {
                console.log("✅ Spoiler flag received.");
                msgIdToEdit = msg._id;
            } else {
                console.log(`⚠️ Msg received but not spoiler: ${JSON.stringify(msg.spoiler)}`);
                // Maybe it is the spoiler msg but default status?
            }
        } catch (e) { console.error("❌ Spoiler test timed out", e); }


        // -------------------------------------------------------------
        // Test 5: Editing
        // -------------------------------------------------------------
        console.log("\n--- Test 5: Message Editing ---");
        if (msgIdToEdit) {
            const newText = "Edited Content";
            Sender.editMessage(msgIdToEdit, newText);

            try {
                const [result] = await Receiver.waitForEvent('editOutput', 2000, (args) => {
                    return args[0]._id === msgIdToEdit;
                });

                // Check content
                const history = result.message;
                const latest = history[history.length - 1];
                if (latest.content.includes(newText)) {
                    console.log("✅ Edit received and content updated.");
                } else {
                    console.error("❌ Edit received but content mismatch.");
                }

            } catch (e) { console.error("❌ Edit test timed out"); }
        } else {
            console.warn("⚠️ Skipping Edit Test (Dependencies failed)");
        }

        // -------------------------------------------------------------
        // Test 6: Reactions
        // -------------------------------------------------------------
        console.log("\n--- Test 6: Reactions ---");
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

                if (result.reactions && result.reactions.heart && result.reactions.heart.includes(Sender.charId)) {
                    console.log("✅ Reaction added successfully.");
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
                if (!result2.reactions.heart.includes(Sender.charId)) {
                    console.log("✅ Reaction removed successfully.");
                } else {
                    console.error("❌ Reaction removal failed.");
                }

            } catch (e) { console.error("❌ Reaction test timed out", e); }
        }


    } catch (err) {
        console.error("CRITICAL TEST FAILURE:", err);
    } finally {
        console.log("Cleaning up...");
        Sender.disconnect();
        Receiver.disconnect();
        FarBot.disconnect();
        process.exit(0);
    }
}

runTests();
