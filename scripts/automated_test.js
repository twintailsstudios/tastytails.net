
const io = require('socket.io-client');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const PLAYER_START_X = 3300;
const PLAYER_START_Y = 4300;

// Test Item Data (Matches what is in server-loop.js)
const TEST_ITEM_UID = 'test_scroll_unique';
const TEST_ITEM_POS = { x: 3350, y: 4300 };

// Latency & Timeout Config
const TIMEOUT_MS = 5000;

class Bot {
    constructor(name, startPos) {
        this.name = name;
        this.socket = null;
        this.id = null;
        this.pos = { x: startPos.x, y: startPos.y };
        this.connected = false;
        this.events = [];
        this.expectedEvents = {};
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const randomHex = Math.floor(Math.random() * 16777215).toString(16).padStart(24, '0');

            this.socket = io(SERVER_URL, {
                query: { charId: randomHex, isBot: true },
                reconnection: false,
                transports: ['websocket'],
                forceNew: true, // Ensure independent connections
            });

            this.socket.on('connect', () => {
                this.id = this.socket.id;
                this.connected = true;
                console.log(`[${this.name}] Connected with ID ${this.id}`);

                // Initial Spawn - We do this, but server might override from DB or Default Spawn
                this.socket.emit('characterUpdate', {
                    x: this.pos.x,
                    y: this.pos.y,
                    firstName: this.name,
                    lastName: 'Bot',
                    isInGame: true
                });

                // [FIX] Send a dummy input to register in the Spatial Grid 
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
                    delete this.expectedEvents[eventName];
                    resolver(args);
                }

                // Internal State Updates
                if (eventName === 'playerUpdates') {
                    const updates = args[0];
                    if (updates[this.id]) {
                        // Update local pos if self update
                        if (updates[this.id].position) {
                            this.pos.x = updates[this.id].position.x;
                            this.pos.y = updates[this.id].position.y;
                        }
                    }
                }

                if (eventName === 'output') {
                    const msgs = args[0];
                    if (msgs && msgs.length > 0) {
                        msgs.forEach(m => {
                             // Handle array of message segments if applicable, or just the last one
                             const content = m.message[m.message.length - 1].content;
                             console.log(`[${this.name}] MSG: "${content}"`);
                             
                             // If we have a pending expectation for 'systemMessage' (shim), check it
                             // This allows existing test logic (waitForEvent('systemMessage')) to work by synthesizing the event internally
                             // or we can just change the test logic. 
                             // Let's emit a synthetic internal event for clean testing code?
                             // No, better to update the test logic. But 'waitForEvent' waits for socket event.
                             // I will manually trigger the expected event resolver if it matches 'systemMessage' logic ?
                             // Actually, let's just make the bot emit 'systemMessage' locally when it gets 'output' so the test logic works.
                             
                             const validContent = m.message && m.message.length > 0 ? m.message[m.message.length-1].content : "";
                             // Emit local event for test script consumption
                             // properly unwrapping the complex structure
                             this.events.push({ name: 'systemMessage', args: [{ content: validContent }], time: Date.now() });
                             
                             if (this.expectedEvents['systemMessage']) {
                                this.expectedEvents['systemMessage']([{ content: validContent }]);
                                delete this.expectedEvents['systemMessage'];
                             }
                        });
                    }
                }
            });
        });
    }

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }

    async waitForEvent(eventName, timeout = TIMEOUT_MS, predicate = null) {
        return new Promise((resolve, reject) => {
            // Check if already happened recently?
            const checkAlreadyReceived = () => {
                const recent = this.events.filter(e => e.name === eventName && e.time > Date.now() - timeout);
                if (recent.length > 0) {
                    if (!predicate || predicate(recent[recent.length - 1].args)) {
                        return recent[recent.length - 1].args;
                    }
                }
                return null;
            };

            const recent = checkAlreadyReceived();
            if (recent) {
                resolve(recent);
                return;
            }

            this.expectedEvents[eventName] = (args) => {
                if (!predicate || predicate(args)) {
                    resolve(args);
                } else {
                    console.log(`[${this.name}] Ignored event '${eventName}' (predicate failed)`);
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

    async moveRight(durationMs = 500) {
        const steps = Math.floor(durationMs / 16);
        for (let i = 0; i < steps; i++) {
            this.socket.emit('playerInput', {
                left: false, right: true, up: false, down: false,
                delta: 0.016,
                clientTimestamp: Date.now()
            });
            await sleep(16);
        }
        // Stop
        this.socket.emit('playerInput', {
            left: false, right: false, up: false, down: false,
            delta: 0.016, clientTimestamp: Date.now()
        });
        await sleep(200); // Wait for sync
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// TEST SCENARIOS
// ==========================================

async function runTests() {
    console.log("=== Starting Automated Test Suite ===");
    console.log("Initializing Bots...");

    // Setup: Tester close to start, Target close by. Remote far away.
    const tester = new Bot('Tester', { x: PLAYER_START_X, y: PLAYER_START_Y });
    const target = new Bot('Target', { x: PLAYER_START_X + 100, y: PLAYER_START_Y });

    // Remote Bot: Positioned FAR away.
    const remote = new Bot('Remote', { x: 50, y: 50 });

    try {
        console.log("Connecting Bots...");
        await Promise.all([tester.connect(), target.connect(), remote.connect()]);
        console.log("All Bots Connected. Waiting for stabilization...");
        await sleep(1000);

        // --- FORCE POSITION OVERRIDE ---
        // Server likely moved us to default spawn (3300, 4300) on connect.
        // We must override it NOW.
        console.log("Forcing Remote Bot to (50, 50)...");
        remote.pos.x = 50;
        remote.pos.y = 50;
        remote.emit('characterUpdate', {
            x: 50, y: 50,
            firstName: 'Remote', lastName: 'Bot', isInGame: true
        });
        remote.emit('playerInput', { left: false, right: false, up: false, down: false, delta: 0.016 });

        await sleep(500);

        // Verify Position
        console.log(`Remote Final Setup Pos: ${JSON.stringify(remote.pos)}`);
        if (remote.pos.x > 3000) {
            console.warn("⚠️ WARNING: Remote Bot seems stuck at spawn. AOI Test might fail.");
        }

        // ---------------------------------------------------------
        // Test 1: AOI & Movement
        // ---------------------------------------------------------
        console.log("\n--- Test 1: AOI & Movement ---");

        const monitorStart = Date.now();
        console.log("Tester moving right...");
        await tester.moveRight(500);

        await sleep(500);

        const targetEvents = target.events.filter(e =>
            e.name === 'playerUpdates' &&
            e.time > monitorStart &&
            e.args[0][tester.id]
        );

        const remoteEvents = remote.events.filter(e =>
            e.name === 'playerUpdates' &&
            e.time > monitorStart &&
            e.args[0][tester.id]
        );

        if (targetEvents.length > 0) console.log("✅ Target saw Tester move (AOI Working).");
        else console.error("❌ Target did NOT see Tester move.");

        if (remoteEvents.length === 0) {
            console.log("✅ Remote did NOT see Tester move (AOI Working).");
        } else {
            console.error(`❌ Remote SAW Tester move (AOI Failure). Remote Pos: ${JSON.stringify(remote.pos)}`);
        }


        // ---------------------------------------------------------
        // Test 2: Item Interaction (Pick Up)
        // ---------------------------------------------------------
        console.log("\n--- Test 2: Item Pick Up ---");
        tester.pos.x = TEST_ITEM_POS.x - 20;
        tester.pos.y = TEST_ITEM_POS.y;
        tester.emit('characterUpdate', { x: tester.pos.x, y: tester.pos.y });
        tester.emit('playerInput', { delta: 0.016 });
        await sleep(200);

        console.log(`Tester attempting to pick up item '${TEST_ITEM_UID}'...`);
        tester.emit('pickUpClicked', { Identifier: 'item', Name: TEST_ITEM_UID });

        try {
            await tester.waitForEvent('playerStateUpdate');
            console.log("✅ Tester received state update (Item picked up).");
        } catch (e) {
            console.error("❌ Pick Up Failed (Item might be missing?):", e.message);
        }

        // ---------------------------------------------------------
        // Test 3: Equip Item
        // ---------------------------------------------------------
        console.log("\n--- Test 3: Equip Item ---");
        console.log("Tester attempting to equip item to 'head'...");
        tester.emit('equipItemClicked', 'head');
        try {
            await tester.waitForEvent('playerStateUpdate');
            console.log("✅ Tester received state update (Item equipped).");
        } catch (e) {
            console.error("❌ Equip Failed:", e.message);
        }

        // ---------------------------------------------------------
        // Test 4: Physical Interactions (Hold/Grip)
        // ---------------------------------------------------------
        console.log("\n--- Test 4: Physical Interactions (Hold/Grip) ---");

        // Ensure proximity
        target.pos.x = tester.pos.x + 40;
        target.pos.y = tester.pos.y;
        target.emit('characterUpdate', { x: target.pos.x, y: target.pos.y });
        target.emit('playerInput', { delta: 0.016 });
        await sleep(200);

        console.log("Tester attempting to grab Target...");
        tester.emit('playerPerformAction', {
            targetId: target.id,
            intent: 'grabbing'
        });

        const [msg] = await target.waitForEvent('systemMessage', 2000).catch(e => []);
        if (msg) {
            console.log("✅ Target received grab message.");
            await sleep(500);

            console.log("Tester holding tight...");
            tester.emit('gripFirmly', { playerId: target.id });

            const [msg2] = await target.waitForEvent('systemMessage', 2000).catch(e => []);
            if (msg2) console.log("✅ Target received grip message.");

            await sleep(500);

            console.log("Tester releasing...");
            tester.emit('releaseClicked', { playerId: target.id });

            const [msg3] = await target.waitForEvent('systemMessage', 2000).catch(e => []);
            if (msg3) console.log("✅ Target received release message.");
        } else {
            console.error("❌ Grab Notification Failed (Timeout)");
        }


        // ---------------------------------------------------------
        // Test 5: Collision Logic
        // ---------------------------------------------------------
        console.log("\n--- Test 5: Collision Logic ---");
        tester.pos.x = 20;
        tester.pos.y = 20;
        tester.emit('characterUpdate', { x: 20, y: 20 });
        await sleep(100);

        console.log("Tester trying to walk into left wall...");

        const steps = 10;
        for (let i = 0; i < steps; i++) {
            tester.emit('playerInput', {
                left: true, right: false, up: false, down: false,
                delta: 0.05
            });
            await sleep(20);
        }
        await sleep(500);

        console.log(`Final X Position: ${tester.pos.x}`);
        if (tester.pos.x >= -5) {
            console.log("✅ Collision prevented movement (Correct).");
        } else {
            console.log("❌ Collision failed, player moved too far left.");
        }

        console.log("\n=== Test Suite Completed ===");

    } catch (err) {
        console.error("CRITICAL TEST FAILURE:", err);
    } finally {
        console.log("Cleaning up...");
        tester.disconnect();
        target.disconnect();
        remote.disconnect();
        await sleep(500); // Allow logs to flush
        process.exit(0);
    }
}

runTests();
