const AnatomyForge = (function () {

    // ==========================================
    // 1. DATA & CONFIGURATION
    // ==========================================

    let nodes = [];
    let connections = [];
    let nextId = 1;

    // Configuration
    let containerId = "";

    const ICONS = {
        generic: `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>`,
        tooth: `<path d="M17 19c0-3.31-2.69-6-6-6s-6 2.69-6 6v3h12v-3zm-6-8c2.21 0 4-1.79 4-4 0-2.21-1.79-4-4-4S7 4.79 7 7c0 2.21 1.79 4 4 4z"/>`,
        spiral: `<path d="M12.9 2.5c-.7-.1-1.4.4-1.5 1.1-.1.7.4 1.4 1.1 1.5 3.1.5 5.5 3.2 5.5 6.4 0 3.6-2.9 6.5-6.5 6.5S5 15.1 5 11.5c0-2.3 1.2-4.4 3.2-5.6.6-.4.8-1.1.5-1.7-.4-.6-1.1-.8-1.7-.5C4.2 5.5 2.5 8.3 2.5 11.5c0 5 4 9 9 9s9-4 9-9c0-4.5-3.3-8.3-7.6-9z"/>`,
        waves: `<path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/>`,
        door: `<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z m-7-1h5v-5h-5v5z"/>`,
        droplet: `<path d="M12 2c-5.33 4.55-8 8.48-8 11.8 0 4.98 3.8 8.2 8 8.2s8-3.22 8-8.2c0-3.32-2.67-7.25-8-11.8z"/>`,
        heart: `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>`,
        star: `<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>`,
        tail: `<path d="M19 13c0-3.87-3.13-7-7-7h-1V4h1c5.52 0 10 4.48 10 10 0 5.52-4.48 10-10 10H4v-2h8c4.42 0 8-3.58 8-8z"/>`
    };

    // Placeholder Audio Options (To be updated with real asset paths)
    const AUDIO_OPTIONS = [
        { label: 'None', value: 'none' },
        { label: 'Wet Swallow', value: 'swallow' },
        { label: 'Slimy Slide', value: 'slide' },
        { label: 'Heartbeat (Slow)', value: 'heartbeat_slow' },
        { label: 'Heartbeat (Fast)', value: 'heartbeat_fast' },
        { label: 'Soft Gurgle', value: 'gurgle_soft' },
        { label: 'Loud Churning', value: 'gurgle_loud' },
        { label: 'Wet Squish', value: 'squish' },
        { label: 'Fluid Slosh', value: 'slosh' },
        { label: 'Suction Pop', value: 'pop' },
        { label: 'Belch', value: 'belch' }
    ];

    const DIGESTIVE_POWER_OPTIONS = [
        { label: 'Very Low', value: 'Very Low' },
        { label: 'Low', value: 'Low' },
        { label: 'Normal', value: 'Normal' },
        { label: 'High', value: 'High' },
        { label: 'Very High', value: 'Very High' }
    ];

    let historyStack = [];
    let redoStack = [];
    const MAX_HISTORY = 50;

    let view = {
        x: 0,
        y: 0,
        scale: 1,
        isPanning: false,
        panStartX: 0,
        panStartY: 0
    };

    let selectedNodeId = null;
    let isDraggingNode = false;
    let dragOffset = { x: 0, y: 0 };
    let draggedNodeId = null;

    let isDraggingNewNode = false;
    let newNodeType = null;

    let isDrawingLine = false;
    let connectionStartNodeId = null;
    let tempLineEnd = { x: 0, y: 0 };

    // DOM Elements - to be fetched in init
    let container, canvasContainer, world, svgLayer, inspector, inspectorTitle, inspectorSubtitle, inspectorContent;
    let ghostNode, confirmModal, modalBox, btnConfirmDelete, modalTitle, modalMsg, modalCheckboxContainer, modalCheck;
    let tooltip, toastContainer;
    let onSaveCallback = null;

    // ==========================================
    // 2. INITIALIZATION
    // ==========================================

    function init(domContainerId, initialAnatomyData, legacyVoreList, onSave = null) {
        // console.log("AnatomyForge: Init started for container", domContainerId);
        try {
            containerId = domContainerId;
            onSaveCallback = onSave;

            // Fetch DOM references
            container = document.getElementById(containerId);
            canvasContainer = document.getElementById('af-canvas-container');

            if (!container || !canvasContainer) {
                console.error("AnatomyForge: Container not found", containerId, "or canvas container missing");
                return;
            }

            world = document.getElementById('af-world');
            svgLayer = document.getElementById('af-connections-layer');
            inspector = document.getElementById('af-inspector');
            inspectorTitle = document.getElementById('af-inspector-title');
            inspectorSubtitle = document.getElementById('af-inspector-subtitle');
            inspectorContent = document.getElementById('af-inspector-content');
            ghostNode = document.getElementById('af-ghost-node');

            confirmModal = document.getElementById('af-confirm-modal');
            modalBox = document.getElementById('af-modal-box');
            btnConfirmDelete = document.getElementById('af-btn-confirm-delete');
            modalTitle = document.getElementById('af-modal-title');
            modalMsg = document.getElementById('af-modal-msg');
            modalCheckboxContainer = document.getElementById('af-modal-checkbox-container');
            modalCheck = document.getElementById('af-modal-confirm-check');

            // console.log("AnatomyForge: DOM Elements fetched. Check:", { modalCheck, btnConfirmDelete, inspector });

            if (modalCheck) {
                modalCheck.addEventListener('change', (e) => {
                    btnConfirmDelete.disabled = !e.target.checked;
                });
            } else {
                console.warn("AnatomyForge: Warning - modalCheck not found.");
            }

            // Modal Close Logic
            const closeBtn = document.querySelector('.af-btn-cancel');
            if (closeBtn) closeBtn.onclick = closeModal;

            // Inspector Close Logic
            const inspectorClose = document.querySelector('.af-close-inspector');
            if (inspectorClose) {
                inspectorClose.onclick = () => {
                    inspector.classList.remove('visible');
                    document.querySelectorAll('.af-node').forEach(n => n.classList.remove('selected'));
                    selectedNodeId = null;
                };
            }

            tooltip = document.getElementById('af-connection-tooltip');
            toastContainer = document.getElementById('af-toast-container');

            // Load Data
            if (initialAnatomyData && typeof initialAnatomyData === 'string' && initialAnatomyData.length > 2) {
                try {
                    const data = JSON.parse(initialAnatomyData);
                    nodes = data.nodes || [];
                    connections = data.links || [];

                    // --- HYDRATION STEP (Optimization) ---
                    // Merge runtime properties (voreTypes) back into the visual nodes
                    if (legacyVoreList && Array.isArray(legacyVoreList)) {
                        nodes.forEach(node => {
                            // Find matching runtime data by ID (preferred) or Name
                            const runtimeData = legacyVoreList.find(v =>
                                String(v.graphNodeId) === String(node.id) ||
                                v.destination === (node.properties ? node.properties.name : '')
                            );

                            if (runtimeData) {
                                // Ensure properties object exists
                                if (!node.properties) node.properties = {};

                                // Restore name/icon if missing (minimal visual data)
                                node.properties.name = runtimeData.destination;
                                // icon might differ if user changed it in editor vs what server stored, 
                                // but server doesn't store icon in voreTypes usually? 
                                // actually User.js schema doesn't have icon in voreTypes. 
                                // So Icon MUST persist in anatomyData.
                                // But gameplay props (verb, desc) come from runtimeData.
                                node.properties.verb = runtimeData.verb;
                                node.properties.digestivePower = runtimeData.digestivePower;
                                node.properties.mode = runtimeData.mode;
                                node.properties.destinationDescrip = runtimeData.destinationDescrip;
                                node.properties.examineMsgDescrip = runtimeData.examineMsgDescrip;
                                node.properties.struggleInsideMsgDescrip = runtimeData.struggleInsideMsgDescrip;
                                node.properties.struggleOutsideMsgDescrip = runtimeData.struggleOutsideMsgDescrip;
                                node.properties.digestionInsideMsgDescrip = runtimeData.digestionInsideMsgDescrip;
                                node.properties.digestionOutsideMsgDescrip = runtimeData.digestionOutsideMsgDescrip;
                                node.properties.enterSound = runtimeData.audioEntry;
                                node.properties.ambientSound = runtimeData.audioAmbient;
                                node.properties.struggleSound = runtimeData.audioStruggle;
                                node.properties.exitSound = runtimeData.audioExit;
                            }
                        });
                    }

                    // Safely calculate nextId, ignoring non-numeric IDs (like default string IDs)
                    const maxId = nodes.reduce((max, n) => {
                        const val = parseInt(n.id);
                        return !isNaN(val) && val > max ? val : max;
                    }, 0);
                    nextId = data.nextId || (maxId + 1);

                    // console.log("AnatomyForge: Loaded & Hydrated initial data", nodes.length, "nodes");
                } catch (e) {
                    console.error("AnatomyForge: Failed to parse initial data", e);
                    setupDefaultAnatomy(); // Fallback to default if parse fails
                }
            } else {
                // No anatomyData found. Check if we have voreTypes to rebuild from?
                // If we have voreTypes but no anatomyData, it's a legacy migration case (rare if we just deleted anatomyData).
                // Or a fresh character.
                if (legacyVoreList && legacyVoreList.length > 0) {
                    // console.log("AnatomyForge: Setting up from legacy list");
                    setupFromLegacy(legacyVoreList);
                } else {
                    // console.log("AnatomyForge: Setting up default anatomy");
                    setupDefaultAnatomy();
                }
            }

            rebuildWorld();
            setupViewportEvents();
            setupKeyboardEvents();
            setTimeout(() => {
                try {
                    // console.log("AnatomyForge: Resetting view...");
                    resetView();
                } catch (err) {
                    console.warn("AnatomyForge: View reset warning (non-critical):", err);
                }
            }, 200);

            // Initial Serialization
            serializeSystem();
            console.log("AnatomyForge: Ready.");

        } catch (err) {
            console.error("AnatomyForge: CRITICAL INIT ERROR", err);
        }
    }

    function triggerSave() {
        if (typeof onSaveCallback === 'function') {
            // --- COMPRESSION STEP (Optimization) ---
            // 1. Create Lightweight Visual Graph (anatomyData)
            const compressedNodes = nodes.map(n => {
                // Keep only visual/structural properties
                return {
                    id: n.id,
                    type: n.type,
                    x: Math.round(n.x), // Int coords are fine
                    y: Math.round(n.y),
                    properties: {
                        name: n.properties.name,
                        icon: n.properties.icon
                        // STRIPPED: verb, descriptions, sounds, power, mode
                    }
                };
            });

            const compressedData = JSON.stringify({
                nodes: compressedNodes,
                links: connections,
                nextId: nextId
            });

            // 2. Create Rich Runtime List (voreTypes)
            // This contains ALL the gameplay data we stripped from anatomyData
            const fullVoreTypes = nodes.map(n => {
                return {
                    // id: n.id, // ID is handled by index or _id on server usually, but we pass graphNodeId
                    graphNodeId: String(n.id),
                    destination: n.properties.name || 'Unknown',
                    type: n.type, // Important for UI filtering
                    verb: n.properties.verb || 'eats',
                    digestivePower: n.properties.digestivePower || 'Normal',
                    mode: n.properties.mode || 'Hold',
                    destinationDescrip: n.properties.destinationDescrip || '',
                    examineMsgDescrip: n.properties.examineMsgDescrip || '',
                    struggleInsideMsgDescrip: n.properties.struggleInsideMsgDescrip || '',
                    struggleOutsideMsgDescrip: n.properties.struggleOutsideMsgDescrip || '',
                    digestionInsideMsgDescrip: n.properties.digestionInsideMsgDescrip || '',
                    digestionOutsideMsgDescrip: n.properties.digestionOutsideMsgDescrip || '',
                    audioEntry: n.properties.enterSound || 'none',
                    audioAmbient: n.properties.ambientSound || 'none',
                    audioStruggle: n.properties.struggleSound || 'none',
                    audioExit: n.properties.exitSound || 'none',
                    // contents: [] // Contents are preserved by server, not sent by client usually
                };
            });

            // console.log("AnatomyForge: Saving Compressed Data", { 
            //     nodes: compressedNodes.length, 
            //     jsonSize: compressedData.length,
            //     voreTypes: fullVoreTypes.length 
            // });

            onSaveCallback(compressedData, fullVoreTypes);
        }
    }

    // Attempt to build a graph from the flat vore list
    function setupFromLegacy(list) {
        nodes = [];
        connections = [];
        nextId = 1;
        const nameToId = {};

        // 1. Create Nodes
        let x = 100;
        let y = 100;

        list.forEach((item, idx) => {
            const type = item.type || 'destination';

            // Use custom coords if provided, else auto-layout
            const nx = item.x !== undefined ? item.x : x;
            const ny = item.y !== undefined ? item.y : y;

            const node = createNode(type, nx, ny, {
                name: item.destination || "Unknown",
                ...item // Spread the rest of the props
            }, false);

            if (item.id) {
                nameToId[item.id] = node.id;
            }
            if (item.destination) {
                nameToId[item.destination] = node.id;
            }

            // Simple auto-layout increment if no coords
            if (item.x === undefined) {
                x += 160;
                if (idx % 3 === 2) { x = 100; y += 150; }
            }
        });

        // 2. Create Connections
        list.forEach(item => {
            if (item.protoConnections && Array.isArray(item.protoConnections)) {
                // Resolution order: try item.id, then item.destination
                const sourceKey = item.id || item.destination;
                const sourceId = nameToId[sourceKey];

                if (!sourceId) return;

                item.protoConnections.forEach(targetKey => {
                    const targetId = nameToId[targetKey];
                    if (targetId) {
                        connections.push({ from: sourceId, to: targetId });
                    }
                });
            }
        });
    }

    function setupDefaultAnatomy() {
        nodes = [];
        connections = [];
        nextId = 1;

        // --- 1. ORAL VORE CHAIN ---
        // Mouth (1) -> Throat (2) -> Stomach (3) -> Bowels (4) -> Anus (5)
        const mouth = createNode('entrance', 100, 50, {
            id: 1,
            name: 'Mouth',
            icon: 'tooth',
            verb: 'swallows',
            mode: 'Hold'
        }, false);

        const throat = createNode('path', 300, 50, {
            id: 2,
            name: 'Throat',
            icon: 'waves'
        }, false);

        const stomach = createNode('destination', 500, 50, {
            id: 3,
            name: 'Stomach',
            icon: 'spiral',
            verb: 'digests',
            digestivePower: 'Normal',
            mode: 'Stomach',
            destinationDescrip: "You slide into the hot, churning stomach.",
            examineMsgDescrip: "<pred>'s belly looks as though something inside is moving...",
            struggleInsideMsgDescrip: "You push against the slimy walls of the stomach.",
            struggleOutsideMsgDescrip: "<pred>'s gut bulges as you struggle.",
            digestionInsideMsgDescrip: "You feel your body softening in the acids...",
            digestionOutsideMsgDescrip: "<pred> lets out a satisfied belch.",
            audioEntry: 'swallow',
            audioAmbient: 'gurgle_loud',
            audioStruggle: 'squish',
            audioExit: 'belch'
        }, false);

        // --- 2. ANAL VORE CHAIN ---
        // Anus (5) -> Bowels (4) -> Stomach (3) [Reverse flow?] 
        // OR Separate: Anus (Exit/Entrance) -> Bowels (Destination/Path)
        // User requested: "destinations for that path". 
        // Standard setup: Anus -> Bowels (Destination).

        const bowels = createNode('destination', 700, 50, {
            id: 4,
            name: 'Bowels',
            icon: 'waves',
            verb: 'clenchant',
            mode: 'Bowels',
            digestivePower: 'Normal',
            destinationDescrip: "You are squeezed into the tight, winding bowels.",
            struggleOutsideMsgDescrip: "<pred>'s rear shifts as you struggle."
        }, false);

        const anus = createNode('entrance', 900, 50, {
            id: 5,
            name: 'Anus',
            icon: 'door',
            verb: 'inserts',
            mode: 'Hold'
        }, false);
        // Note: Anus can be Entrance AND Exit types? 
        // Current logic splits types. Let's keep it 'entrance' for vore entry.
        // It can also serves as exit for Digestion if linked from Bowels?
        // For simplicity: Anus is Entrance -> Bowels. 

        // --- 3. UNBIRTH CHAIN ---
        // Slit (6) -> Vaginal Canal (7) -> Womb (8)
        const slit = createNode('entrance', 100, 250, {
            id: 6,
            name: 'Slit',
            icon: 'droplet',
            verb: 'absorbs',
            mode: 'Hold'
        }, false);

        const vcanal = createNode('path', 300, 250, {
            id: 7,
            name: 'Vaginal Canal',
            icon: 'waves'
        }, false);

        const womb = createNode('destination', 500, 250, {
            id: 8,
            name: 'Womb',
            icon: 'heart',
            verb: 'birthing', // or unbirthing
            mode: 'Womb',
            digestivePower: 'Normal', // Womb usually safe?
            destinationDescrip: "You are pushed into the warm, pulsing womb.",
            struggleOutsideMsgDescrip: "<pred>'s womb kicks with life."
        }, false);

        // --- 4. COCK VORE CHAIN ---
        // Cock (9) -> Urethra (10) -> Balls (11)
        const cock = createNode('entrance', 100, 450, {
            id: 9,
            name: 'Cock',
            icon: 'tail', // close enough shape?
            verb: 'sounds',
            mode: 'Hold'
        }, false);

        const urethra = createNode('path', 300, 450, {
            id: 10,
            name: 'Urethra',
            icon: 'waves'
        }, false);

        const balls = createNode('destination', 500, 450, {
            id: 11,
            name: 'Balls',
            icon: 'droplet',
            verb: 'stores',
            mode: 'Balls',
            digestivePower: 'Normal', // Cum transfo?
            destinationDescrip: "You splash down into the sticky balls.",
            struggleOutsideMsgDescrip: "<pred>'s balls churn around you."
        }, false);


        // --- CONNECTIONS ---
        // Oral
        connections.push({ from: 1, to: 2 }); // Mouth -> Throat
        connections.push({ from: 2, to: 3 }); // Throat -> Stomach
        connections.push({ from: 3, to: 4 }); // Stomach -> Bowels (Digestion path)

        // Anal
        connections.push({ from: 5, to: 4 }); // Anus -> Bowels

        // Unbirth
        connections.push({ from: 6, to: 7 }); // Slit -> Canal
        connections.push({ from: 7, to: 8 }); // Canal -> Womb

        // Cock
        connections.push({ from: 9, to: 10 }); // Cock -> Urethra
        connections.push({ from: 10, to: 11 }); // Urethra -> Balls

        nextId = 100; // Jump ID to avoid conflict with manual additions

        rebuildWorld();
    }

    // ==========================================
    // 3. CORE LOGIC
    // ==========================================

    function saveState() {
        const state = {
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: JSON.parse(JSON.stringify(connections)),
            nextId: nextId
        };
        historyStack.push(state);
        if (historyStack.length > MAX_HISTORY) historyStack.shift();
        redoStack = [];
    }

    function undo() {
        if (historyStack.length === 0) return showToast("Nothing to undo.", "info");
        redoStack.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: JSON.parse(JSON.stringify(connections)),
            nextId: nextId
        });
        const prevState = historyStack.pop();
        nodes = prevState.nodes;
        connections = prevState.connections;
        nextId = prevState.nextId;
        rebuildWorld();
        serializeSystem();
        triggerSave();
    }

    function redo() {
        if (redoStack.length === 0) return showToast("Nothing to redo.", "info");
        historyStack.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            connections: JSON.parse(JSON.stringify(connections)),
            nextId: nextId
        });
        const nextState = redoStack.pop();
        nodes = nextState.nodes;
        connections = nextState.connections;
        nextId = nextState.nextId;
        rebuildWorld();
        serializeSystem();
        triggerSave();
    }

    function rebuildWorld() {
        const existingNodes = document.querySelectorAll('.af-node');
        existingNodes.forEach(el => el.remove());
        nodes.forEach(node => {
            renderNodeDOM(node);
        });
        updateConnections();
    }

    // ==========================================
    // 4. INTERACTION
    // ==========================================

    function checkConnectionValidity(sourceType, targetType) {
        if (sourceType === 'entrance') {
            if (targetType === 'path') return { valid: true };
            return { valid: false, reason: "Entrances must lead to a Path." };
        }
        if (sourceType === 'destination') {
            if (targetType === 'path' || targetType === 'exit') return { valid: true };
            return { valid: false, reason: "Destinations must lead to a Path or Exit." };
        }
        if (sourceType === 'path') {
            if (targetType === 'path' || targetType === 'destination' || targetType === 'exit') return { valid: true };
            return { valid: false, reason: "Paths cannot lead to an Entrance." };
        }
        return { valid: false, reason: "Invalid connection." };
    }

    function updateTransform() {
        if (!world) return;
        world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    }

    function screenToWorld(screenX, screenY) {
        const rect = canvasContainer.getBoundingClientRect();
        const localX = screenX - rect.left;
        const localY = screenY - rect.top;
        const pannedX = localX - view.x;
        const pannedY = localY - view.y;
        return {
            x: pannedX / view.scale,
            y: pannedY / view.scale
        };
    }

    function setupViewportEvents() {
        window.addEventListener('resize', () => {
            updateTransform();
        });

        canvasContainer.addEventListener('mousedown', (e) => {
            // Dismiss if clicking background (not a node/socket)
            const isNodeInteraction = e.target.closest('.af-node');

            if (e.button === 1 || e.button === 2 || (e.button === 0 && !isNodeInteraction)) {
                view.isPanning = true;
                view.panStartX = e.clientX - view.x;
                view.panStartY = e.clientY - view.y;
                container.style.cursor = 'grabbing';
                if (e.button === 0) {
                    inspector.classList.remove('visible');
                    document.querySelectorAll('.af-node').forEach(n => n.classList.remove('selected'));
                    selectedNodeId = null;
                }
            }
        });

        canvasContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomIntensity = 0.1;
            const delta = -Math.sign(e.deltaY);
            const newScale = Math.min(Math.max(0.1, view.scale + (delta * zoomIntensity)), 3);
            const mouseWorldBefore = screenToWorld(e.clientX, e.clientY);
            view.scale = newScale;

            const rect = canvasContainer.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;

            view.x = localX - (mouseWorldBefore.x * view.scale);
            view.y = localY - (mouseWorldBefore.y * view.scale);
            updateTransform();
        });

        window.addEventListener('mousemove', (e) => {
            if (view.isPanning) {
                view.x = e.clientX - view.panStartX;
                view.y = e.clientY - view.panStartY;
                updateTransform();
                return;
            }
            if (isDraggingNode && draggedNodeId) {
                const worldPos = screenToWorld(e.clientX, e.clientY);
                const node = nodes.find(n => n.id === draggedNodeId);
                node.x = worldPos.x - dragOffset.x;
                node.y = worldPos.y - dragOffset.y;
                const el = document.querySelector(`.af-node[data-id="${draggedNodeId}"]`);
                if (el) {
                    el.style.left = `${node.x}px`;
                    el.style.top = `${node.y}px`;
                }
                updateConnections();
                serializeSystem(); // Live update hidden inputs? maybe too heavy.
            }
            if (isDrawingLine) {
                const worldPos = screenToWorld(e.clientX, e.clientY);
                tempLineEnd = worldPos;
                updateConnections();
            }
            if (isDraggingNewNode && ghostNode) {
                ghostNode.style.left = `${e.clientX}px`;
                ghostNode.style.top = `${e.clientY}px`;
            }
        });

        window.addEventListener('mouseup', (e) => {
            view.isPanning = false;
            container.style.cursor = 'grab';

            let didChange = false;

            if (isDraggingNewNode) {
                const rect = canvasContainer.getBoundingClientRect();
                if (e.clientX > rect.left && e.clientX < rect.right &&
                    e.clientY > rect.top && e.clientY < rect.bottom) {
                    const worldPos = screenToWorld(e.clientX, e.clientY);
                    saveState();
                    const newNode = createNode(newNodeType, worldPos.x, worldPos.y);
                    selectNode(newNode.id);
                    serializeSystem();
                    didChange = true;
                }
                isDraggingNewNode = false;
                newNodeType = null;
                if (ghostNode) ghostNode.style.display = 'none';
            }

            if (isDraggingNode) {
                serializeSystem();
                didChange = true;
            }

            isDraggingNode = false;
            draggedNodeId = null;

            if (isDrawingLine) {
                isDrawingLine = false;
                connectionStartNodeId = null;
                updateConnections();
                document.querySelectorAll('.af-node').forEach(n => {
                    n.classList.remove('target-glow');
                    n.classList.remove('target-error');
                });
                // Assuming finishConnection sets flag, but we check here
                if (connections.length > 0) didChange = true; // Heuristic, better to track if line was actually added
            }

            if (didChange) triggerSave();
        });
    }

    function setupKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 'r') { resetView(); }
        });
    }

    // ==========================================
    // 5. NODE LOGIC
    // ==========================================

    function createNode(type, x, y, initialData = {}, save = true) {
        // Use provided ID or generate a new one
        let id;
        if (initialData.id) {
            id = initialData.id;
            // Ensure nextId stays ahead of any manually loaded integer IDs
            const numId = parseInt(id);
            if (!isNaN(numId) && numId >= nextId) {
                nextId = numId + 1;
            }
        } else {
            id = nextId++;
        }

        let defaultName = "New Node";
        let defaultIcon = 'generic';
        if (type === 'entrance') { defaultName = "Mouth"; defaultIcon = "tooth"; }
        if (type === 'destination') { defaultName = "Stomach"; defaultIcon = "spiral"; }
        if (type === 'path') { defaultName = "Esophagus"; defaultIcon = "waves"; }
        if (type === 'exit') { defaultName = "Anus"; defaultIcon = "door"; }

        const props = {
            name: initialData.name || defaultName,
            icon: initialData.icon || defaultIcon,
            ...initialData
        };

        if (type === 'destination' && !props.digestivePower) {
            props.digestivePower = 'Normal';
        }

        const nodeData = {
            id: id,
            // Ensure graphNodeId is always present as a string for server compatibility
            graphNodeId: String(id),
            type: type,
            x: x,
            y: y,
            properties: props
        };

        nodes.push(nodeData);
        renderNodeDOM(nodeData);
        return nodeData;
    }

    function renderNodeDOM(nodeData) {
        const el = document.createElement('div');
        el.className = 'af-node';
        el.dataset.id = nodeData.id;
        el.dataset.type = nodeData.type;
        el.style.left = `${nodeData.x}px`;
        el.style.top = `${nodeData.y}px`;

        const iconSvg = ICONS[nodeData.properties.icon] || ICONS['generic'];

        el.innerHTML = `
            <div class="af-node-type">${nodeData.type}</div>
            <div class="af-node-icon"><svg viewBox="0 0 24 24">${iconSvg}</svg></div>
            <button type="button" class="af-node-edit-btn" title="Edit Properties">✒</button>
            <div class="af-node-label">${nodeData.properties.name}</div>
            ${nodeData.type !== 'entrance' ? '<div class="af-socket input"></div>' : ''}
            ${nodeData.type !== 'exit' ? '<div class="af-socket output"></div>' : ''}
        `;

        el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            saveState();
            isDraggingNode = true;
            draggedNodeId = nodeData.id;
            const worldPos = screenToWorld(e.clientX, e.clientY);
            dragOffset.x = worldPos.x - nodeData.x;
            dragOffset.y = worldPos.y - nodeData.y;
        });

        const editBtn = el.querySelector('.af-node-edit-btn');
        editBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectNode(nodeData.id);
        });

        el.addEventListener('mouseup', (e) => {
            if (isDrawingLine) {
                e.stopPropagation();
                finishConnection(nodeData.id);
                document.querySelectorAll('.af-node').forEach(n => {
                    n.classList.remove('target-glow');
                    n.classList.remove('target-error');
                });
            }
        });

        el.addEventListener('mouseenter', () => {
            if (isDrawingLine && nodeData.type !== 'entrance' && nodeData.id !== connectionStartNodeId) {
                const sourceNode = nodes.find(n => n.id === connectionStartNodeId);
                const validation = checkConnectionValidity(sourceNode.type, nodeData.type);
                if (validation.valid) el.classList.add('target-glow');
                else el.classList.add('target-error');
            }
        });

        el.addEventListener('mouseleave', () => {
            el.classList.remove('target-glow');
            el.classList.remove('target-error');
        });

        const outputSocket = el.querySelector('.af-socket.output');
        if (outputSocket) {
            outputSocket.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                startConnection(e, nodeData.id);
            });
        }

        const inputSocket = el.querySelector('.af-socket.input');
        if (inputSocket) {
            // Prevent node drag on socket click
            inputSocket.addEventListener('mousedown', (e) => e.stopPropagation());

            inputSocket.addEventListener('mouseup', (e) => {
                e.stopPropagation();
                finishConnection(nodeData.id);
            });
        }

        world.appendChild(el);
    }

    // ==========================================
    // 6. CONNECTION LOGIC
    // ==========================================

    function startConnection(e, nodeId) {
        isDrawingLine = true;
        connectionStartNodeId = nodeId;
        tempLineEnd = screenToWorld(e.clientX, e.clientY);
    }

    function finishConnection(targetNodeId) {
        const targetNode = nodes.find(n => n.id === targetNodeId);
        if (targetNode.type === 'entrance') return;

        if (isDrawingLine && connectionStartNodeId && connectionStartNodeId !== targetNodeId) {
            const sourceNode = nodes.find(n => n.id === connectionStartNodeId);
            const validation = checkConnectionValidity(sourceNode.type, targetNode.type);

            if (!validation.valid) {
                showToast(validation.reason, 'error');
            } else {
                const exists = connections.some(c => c.from === connectionStartNodeId && c.to === targetNodeId);
                if (!exists) {
                    saveState();
                    connections.push({ from: connectionStartNodeId, to: targetNodeId });
                    updateConnections();
                    serializeSystem();
                }
            }
        }
        isDrawingLine = false;
        connectionStartNodeId = null;
        updateConnections(); // clear draft line
    }

    function updateConnections() {
        svgLayer.innerHTML = '';
        connections.forEach((conn, index) => {
            const nodeA = nodes.find(n => n.id === conn.from);
            const nodeB = nodes.find(n => n.id === conn.to);
            const elA = document.querySelector(`.af-node[data-id="${conn.from}"]`);
            const elB = document.querySelector(`.af-node[data-id="${conn.to}"]`);
            if (!elA || !elB) return;

            // Fallback dimensions if element is hidden/unrendered
            const widthA = elA.offsetWidth || 140;
            const heightA = elA.offsetHeight || 100;
            const widthB = elB.offsetWidth || 140;
            // const heightB = elB.offsetHeight || 100; // Not used for target Y

            const x1 = nodeA.x + widthA / 2;
            const y1 = nodeA.y + heightA; // Output at bottom
            const x2 = nodeB.x + widthB / 2;
            const y2 = nodeB.y; // Input at top

            // 1. Halo (visual outline/contrast)
            drawBezier(x1, y1, x2, y2, 'af-connector-halo');

            // 2. Invisible wide hit area (for easier selection)
            // Drawn BEFORE visible line so we can use CSS sibling selector (.hit:hover + .visible)
            drawBezier(x1, y1, x2, y2, 'af-connector-hit', index);

            // 3. Main visible line
            // Pointer events should be none in CSS so clicks pass to hit area (or handled by hit area)
            drawBezier(x1, y1, x2, y2, 'af-connector', index);
        });

        if (isDrawingLine && connectionStartNodeId) {
            const nodeA = nodes.find(n => n.id === connectionStartNodeId);
            const elA = document.querySelector(`.af-node[data-id="${connectionStartNodeId}"]`);

            const widthA = elA.offsetWidth || 140;
            const heightA = elA.offsetHeight || 100;

            const x1 = nodeA.x + widthA / 2;
            const y1 = nodeA.y + heightA;
            drawBezier(x1, y1, tempLineEnd.x, tempLineEnd.y, 'af-connector af-connector-draft');
        }
    }

    function drawBezier(x1, y1, x2, y2, className, connectionIndex = null) {
        const svgOffsetX = 5000;
        const svgOffsetY = 5000;
        const sx = x1 + svgOffsetX;
        const sy = y1 + svgOffsetY;
        const ex = x2 + svgOffsetX;
        const ey = y2 + svgOffsetY;

        const dist = Math.abs(ey - sy) * 0.5;
        const curveStrength = Math.max(dist, 60);

        const d = `M ${sx} ${sy} C ${sx} ${sy + curveStrength}, ${ex} ${ey - curveStrength}, ${ex} ${ey}`;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("class", className);

        if (connectionIndex !== null) {
            path.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                saveState();
                connections.splice(connectionIndex, 1);
                updateConnections();
                serializeSystem();
                tooltip.style.display = 'none';
            });
            path.addEventListener('mouseenter', (e) => {
                tooltip.style.display = 'block';
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });
            path.addEventListener('mousemove', (e) => {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });
            path.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });
        }
        svgLayer.appendChild(path);
    }

    // ==========================================
    // 7. INSPECTOR & SERIALIZATION
    // ==========================================

    function selectNode(id) {
        selectedNodeId = id;
        document.querySelectorAll('.af-node').forEach(n => n.classList.remove('selected'));
        const el = document.querySelector(`.af-node[data-id="${id}"]`);
        if (el) el.classList.add('selected');

        const node = nodes.find(n => n.id === id);
        renderInspector(node);
        inspector.classList.add('visible');
    }

    function renderInspector(node) {
        inspectorTitle.innerText = node.type.toUpperCase();
        inspectorContent.innerHTML = '';

        addSectionHeader('Core Identity');
        addInputField(node, 'name', 'Node Name (Label)', 'text');

        addSectionHeader('Visual Sigil');
        const iconGrid = document.createElement('div');
        iconGrid.className = 'af-icon-grid';

        Object.keys(ICONS).forEach(iconKey => {
            const iconOption = document.createElement('div');
            iconOption.className = 'af-icon-option';
            if (node.properties.icon === iconKey) iconOption.classList.add('selected');
            iconOption.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[iconKey]}</svg>`;
            iconOption.onclick = () => {
                saveState();
                node.properties.icon = iconKey;
                const nodeEl = document.querySelector(`.af-node[data-id="${node.id}"] .af-node-icon`);
                if (nodeEl) nodeEl.innerHTML = `<svg viewBox="0 0 24 24">${ICONS[iconKey]}</svg>`;
                document.querySelectorAll('.af-icon-option').forEach(el => el.classList.remove('selected'));
                iconOption.classList.add('selected');
                serializeSystem();
                triggerSave();
            };
            iconGrid.appendChild(iconOption);
        });
        inspectorContent.appendChild(iconGrid);

        if (node.type === 'entrance') {
            addSectionHeader('Interaction');
            addInputField(node, 'verb', 'Action Verb', 'text');
        }

        if (node.type === 'destination') {
            addSelectField(node, 'digestivePower', 'Digestive Power', DIGESTIVE_POWER_OPTIONS);

            addSectionHeader('Audio Atmosphere');
            addSelectField(node, 'enterSound', 'Enter Sound', AUDIO_OPTIONS);
            addSelectField(node, 'ambientSound', 'Ambient Loop', AUDIO_OPTIONS);
            addSelectField(node, 'struggleSound', 'Struggle Sound', AUDIO_OPTIONS);
            addSelectField(node, 'exitSound', 'Exit Sound', AUDIO_OPTIONS);
        }

        // Shared Fields for All Nodes (Sensory & Struggle)
        addSectionHeader('Sensory Experience');
        addInputField(node, 'destinationDescrip', 'Arrival Description', 'textarea');
        addInputField(node, 'examineMsgDescrip', 'Examine Message (External)', 'textarea');

        addSectionHeader('The Struggle');
        addInputField(node, 'struggleInsideMsgDescrip', 'Internal Feedback', 'textarea');
        addInputField(node, 'struggleOutsideMsgDescrip', 'External Observation', 'textarea');

        // Destination Specific Messages (Digestion & Alt Endings) - Rendered Last
        if (node.type === 'destination') {
            addSectionHeader('Digestion Events');
            addInputField(node, 'digestionInsideMsgDescrip', 'Internal Fate', 'textarea');
            addInputField(node, 'digestionOutsideMsgDescrip', 'External Outcome', 'textarea');

            addSectionHeader('Alternative Endings');
            addInputField(node, 'releaseMsgDescrip', 'Release/Escape Message', 'textarea');
        }

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'af-btn-delete';
        btnDel.innerText = 'Delete Node';
        btnDel.onclick = requestDeleteNode;
        inspectorContent.appendChild(btnDel);
    }

    function addSectionHeader(text) {
        const h = document.createElement('div');
        h.className = 'af-section-header';
        h.innerText = text;
        inspectorContent.appendChild(h);
    }

    function addInputField(node, key, label, type, parent = null, useCol = false) {
        const group = document.createElement('div');
        if (useCol) {
            group.className = 'af-inspector-col'; // Column wrapper
        } else {
            group.className = 'af-form-group';
        }

        const lbl = document.createElement('label');
        lbl.className = 'af-form-label';
        lbl.innerText = label;

        let elem;
        if (type === 'textarea') {
            elem = document.createElement('textarea');
            elem.className = 'af-form-textarea';
            elem.rows = 3;
        } else {
            elem = document.createElement('input');
            elem.type = type;
            elem.className = 'af-form-input';
        }

        elem.value = node.properties[key] || '';

        // Live update for name field
        if (key === 'name') {
            elem.addEventListener('input', (e) => {
                const nodeEl = document.querySelector(`.af-node[data-id="${node.id}"] .af-node-label`);
                if (nodeEl) nodeEl.innerText = e.target.value;
            });
        }

        elem.onchange = (e) => {
            saveState();
            node.properties[key] = e.target.value;
            serializeSystem();
            triggerSave();
        };

        if (useCol) {
            // For columns, we assume generic layout, but labels should be block?
            // af-inspector-col handles width. Inside we want standard stacking.
            // Let's wrap standard label+input inside the col div
            group.appendChild(lbl);
            group.appendChild(elem);
        } else {
            group.appendChild(lbl);
            group.appendChild(elem);
        }

        // If parent is provided (e.g. a row), append there. Else default to inspectorContent
        (parent || inspectorContent).appendChild(group);
    }

    function addSelectField(node, key, label, options) {
        const group = document.createElement('div');
        group.className = 'af-form-group';
        const lbl = document.createElement('label');
        lbl.className = 'af-form-label';
        lbl.innerText = label;

        const select = document.createElement('select');
        select.className = 'af-form-select';

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.innerText = opt.label;
            if (node.properties[key] === opt.value) option.selected = true;
            select.appendChild(option);
        });

        select.onchange = (e) => {
            saveState();
            node.properties[key] = e.target.value;
            serializeSystem();
            triggerSave();
        };

        group.appendChild(lbl);
        group.appendChild(select);
        inspectorContent.appendChild(group);
    }

    function requestDeleteNode() {
        if (!selectedNodeId) return;
        confirmModal.classList.add('active');
        btnConfirmDelete.onclick = () => {
            saveState();
            deleteSelectedNode();
            closeModal();
            triggerSave();
        };
    }

    function deleteSelectedNode() {
        connections = connections.filter(c => c.from !== selectedNodeId && c.to !== selectedNodeId);
        nodes = nodes.filter(n => n.id !== selectedNodeId);
        const el = document.querySelector(`.af-node[data-id="${selectedNodeId}"]`);
        if (el) el.remove();
        selectedNodeId = null;
        inspector.classList.remove('visible');
        updateConnections();
        serializeSystem();
    }

    function resetView() {
        if (!world) return;
        if (nodes.length === 0) {
            view.x = 20; view.y = 20; view.scale = 1;
        } else {
            // Calculate bounding box of all nodes
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            nodes.forEach(n => {
                const nx = Number(n.x) || 0;
                const ny = Number(n.y) || 0;
                if (nx < minX) minX = nx;
                if (nx > maxX) maxX = nx;
                if (ny < minY) minY = ny;
                if (ny > maxY) maxY = ny;
            });

            // Add estimated node dimensions (approx 140x100) to max values to cover full node
            // This ensures we're centering on the visual center, not just the top-left coord.
            const NODE_W = 140;
            const NODE_H = 100;
            maxX += NODE_W;
            maxY += NODE_H;

            const contentW = maxX - minX;
            const contentH = maxY - minY;
            const centerX = minX + contentW / 2;
            const centerY = minY + contentH / 2;

            // Get available canvas size
            // If hidden (offset=0), fallback to a reasonable default window size or 800x600
            const canvasW = canvasContainer.offsetWidth || 800;
            const canvasH = canvasContainer.offsetHeight || 600;
            const padding = 100;

            // Determine scale to fit content
            const scaleX = (canvasW - padding) / contentW;
            const scaleY = (canvasH - padding) / contentH;

            // Limit scale to reasonable values (e.g., don't zoom in crazy close if 1 node, don't zoom out to infinity)
            let newScale = Math.min(scaleX, scaleY);
            newScale = Math.min(Math.max(newScale, 0.2), 1.0); // Clamp between 20% and 100% zoom

            view.scale = newScale;
            view.x = (canvasW / 2) - (centerX * newScale);
            view.y = (canvasH / 2) - (centerY * newScale);
        }
        updateTransform();
    }

    function requestClearMap() {
        confirmModal.classList.add('active');
        modalBox.classList.add('danger-mode');
        modalCheckboxContainer.style.display = 'flex';
        modalCheck.checked = false;

        // Disable confirm button by default for this action
        btnConfirmDelete.disabled = true;

        if (modalTitle) modalTitle.innerText = "CRITICAL WARNING: CLEAR MAP";
        if (modalMsg) modalMsg.innerText = "WARNING: You are about to DELETE EVERYTHING.\n\nThis will erase all custom nodes, connections, text descriptions, and settings. Your work will be lost forever and the canvas will be reset to default.\n\nThis action cannot be undone.";

        btnConfirmDelete.onclick = () => {
            saveState();
            nodes = [];
            connections = [];
            rebuildWorld();
            serializeSystem();
            closeModal();
            showToast("Map Cleared", "error");
            triggerSave();
        };
    }

    function closeModal() {
        confirmModal.classList.remove('active');
        modalBox.classList.remove('danger-mode');
        modalCheckboxContainer.style.display = 'none';
        modalCheck.checked = false;
        btnConfirmDelete.disabled = false; // Reset to enabled for normal ops
        if (modalTitle) modalTitle.innerText = "Confirm Deletion";
        if (modalMsg) modalMsg.innerText = "Are you sure you want to delete this node?";
        inspector.classList.remove('visible');
    }

    function showToast(msg, type) {
        const t = document.createElement('div');
        t.className = `af-toast ${type}`;
        t.innerText = msg;
        toastContainer.appendChild(t);
        void t.offsetWidth;
        t.classList.add('show');
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // 8. SERIALIZATION
    // ==========================================

    function serializeSystem() {
        const exportData = { nodes: nodes, links: connections, nextId: nextId };
        const jsonStr = JSON.stringify(exportData);

        // 1. Update the Main Hidden Input
        let mainInput = document.getElementById('anatomyData');
        if (!mainInput) {
            // Should probably error here but let's be resilient
            // console.warn("AnatomyForge: #anatomyData input missing.");
        } else {
            mainInput.value = jsonStr;
        }

        // 2. Generate Legacy Hidden Inputs for the Backend
        generateLegacyInputs(nodes);

        return jsonStr;
    }


    function generateLegacyInputs(currentNodes) {
        // Find the container for legacy inputs. 
        // We'll look for a div id="legacy-shim-container" or create one in the form.
        let shim = document.getElementById('legacy-shim-container');
        if (!shim) {
            const form = document.getElementById('anatomyData')?.closest('form');
            if (form) {
                shim = document.createElement('div');
                shim.id = 'legacy-shim-container';
                shim.style.display = 'none';
                form.appendChild(shim);
            } else {
                return;
            }
        }

        shim.innerHTML = ''; // Clear previous

        // Filter for Destinations as that's what the old system cared about
        const destNodes = currentNodes.filter(n => n.type === 'destination');

        destNodes.forEach(node => {
            const p = node.properties;
            createHiddenField(shim, 'destination[]', p.name || 'Stomach'); // Changed to match demo logic where name is destination
            createHiddenField(shim, 'verb[]', p.verb || 'eats');
            createHiddenField(shim, 'digestivePower[]', p.digestivePower || 'Normal');
            createHiddenField(shim, 'animation[]', 1); // Defaulting animation as it's not in the new inspector yet

            createHiddenField(shim, 'destinationDescrip[]', p.destinationDescrip || '');
            createHiddenField(shim, 'examineMsgDescrip[]', p.examineMsgDescrip || '');
            createHiddenField(shim, 'struggleInsideMsgDescrip[]', p.struggleInsideMsgDescrip || '');
            createHiddenField(shim, 'struggleOutsideMsgDescrip[]', p.struggleOutsideMsgDescrip || '');
            createHiddenField(shim, 'digestionInsideMsgDescrip[]', p.digestionInsideMsgDescrip || '');
            createHiddenField(shim, 'digestionOutsideMsgDescrip[]', p.digestionOutsideMsgDescrip || '');
        });
    }

    function createHiddenField(parent, name, value) {
        const i = document.createElement('input');
        i.type = 'hidden';
        i.name = name;
        i.value = value;
        parent.appendChild(i);
    }

    // Public API
    return {
        init: init,
        serialize: serializeSystem,
        resize: function () {
            // Re-apply transform to ensure visual consistency
            if (typeof updateTransform === 'function') updateTransform();
        },
        startDragNewNode: (e, type) => {
            // Need to expose this because the Sidebar HTML has inline handlers.
            e.preventDefault();
            isDraggingNewNode = true;
            newNodeType = type;

            // Fetch dynamically to ensure we have the latest ref
            ghostNode = document.getElementById('af-ghost-node');

            // Self-healing: Create it if it doesn't exist
            if (!ghostNode) {
                ghostNode = document.createElement('div');
                ghostNode.id = 'af-ghost-node';
                ghostNode.className = 'af-node ghost';
                ghostNode.style.display = 'none';
                document.body.appendChild(ghostNode);
            }

            if (ghostNode) {
                ghostNode.style.display = 'flex';
                ghostNode.innerHTML = `<div class="af-node-type">${type}</div><div class="af-node-label">New ${type}</div>`;
                ghostNode.style.left = `${e.clientX}px`;
                ghostNode.style.top = `${e.clientY}px`;
            } else {
                console.error("AnatomyForge: Failed to create ghost node.");
            }
        },
        resetView: resetView,
        clearMap: requestClearMap,
        refreshLayout: function () {
            // Force recalculation of node dimensions and connections
            // Use timeout to ensure browser layout has processed the display:block change
            setTimeout(() => {
                rebuildWorld();
            }, 50);
        }
    };
})();
