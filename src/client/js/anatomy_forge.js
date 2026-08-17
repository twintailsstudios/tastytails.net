/**
 * @fileoverview AnatomyForge - Client-Side Interactive Organ Topology & Vore Graph Editor
 * 
 * @description
 * Provides a node-based visual flowchart editor for defining character organ pathways,
 * vore mechanics, sensory text descriptions, struggle triggers, and audio loops.
 * 
 * Performance & Security Highlights:
 * - rAF-batched pointer interaction loop preventing DOM layout thrashing.
 * - Dynamic node dimension caching (_width/_height) for SVG Bezier edge rendering.
 * - DocumentFragment connector updates for high-performance canvas redrawing.
 * - HTML string sanitization (escapeHTML) protecting against DOM-XSS attacks.
 * 
 * Triggered by: Character Creation (/create), In-Game Anatomy Customization Modal (/play).
 */
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

    let mouseRafId = null;
    let lastMousePos = { x: 0, y: 0 };

    /**
     * Sanitizes user-provided string input to prevent DOM-XSS attacks when rendering HTML labels.
     * @SECURITY Replaces dangerous HTML characters (&, <, >, ", ') with safe entity codes.
     * @param {string} str - Raw input string
     * @returns {string} Sanitized HTML entity string
     */
    function escapeHTML(str) {
        return String(str || '').replace(/[&<>"']/g, match => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[match]));
    }

    // DOM Elements - to be fetched in init
    let container, canvasContainer, world, svgLayer, inspector, inspectorTitle, inspectorSubtitle, inspectorContent;
    let ghostNode, confirmModal, modalBox, btnConfirmDelete, modalTitle, modalMsg, modalCheckboxContainer, modalCheck;
    let tooltip, toastContainer;
    let onSaveCallback = null;

    // ==========================================
    // 2. INITIALIZATION
    // ==========================================

    /**
     * Initializes the AnatomyForge canvas, fetches DOM elements, loads initial data, and binds event handlers.
     * @param {string} domContainerId - ID of parent container element
     * @param {string} initialAnatomyData - JSON string of stored visual graph layout
     * @param {Array<Object>} legacyVoreList - Runtime vore profiles array for property hydration
     * @param {Function|null} onSave - Callback invoked when changes are saved
     */
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

    /**
     * Serializes current graph state and invokes external save callback.
     * @OPTIMIZATION Separates visual graph layout (anatomyData) from rich runtime profiles (voreTypes) to minimize JSON payload size.
     */
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

    // =========================================================================================================
    // CRITICAL: DO NOT MODIFY, TRUNCATE, OR SUMMARIZE THE TEXT AND DESCRIPTIONS IN THIS FUNCTION WITHOUT
    // EXPLICIT USER INSTRUCTIONS. THE EXACT STRINGS AND DESCRIPTIONS MUST BE PRESERVED.
    // =========================================================================================================
    function setupDefaultAnatomy() {
        nodes = [];
        connections = [];
        nextId = 1;

        // --- 1. ORAL VORE CHAIN ---
        const maw = createNode('entrance', 25, 100, {
            id: 1,
            name: 'Maw',
            icon: 'tooth',
            verb: 'shoves',
            mode: 'Hold',
            destinationDescrip: "You are pulled between <pred>'s lips...",
            examineMsgDescrip: "<pred>'s cheeks are swollen with <prey>...",
            struggleInsideMsgDescrip: "You pry at the jaws...",
            struggleOutsideMsgDescrip: "<pred>'s cheeks puff out..."
        }, false);

        const gullet = createNode('path', 165, 100, {
            id: 3,
            name: 'Gullet',
            icon: 'waves',
            destinationDescrip: "The tight tube squeezes you down...",
            examineMsgDescrip: "A bulge is working it's way down <pred>'s throat...",
            struggleInsideMsgDescrip: "The walls constrict tightly...",
            struggleOutsideMsgDescrip: "A bulge travels down <pred>'s throat..."
        }, false);

        const stomach = createNode('destination', 305, 100, {
            id: 5,
            name: 'Stomach',
            icon: 'spiral',
            verb: 'digests',
            digestivePower: 'Normal',
            mode: 'Stomach',
            destinationDescrip: "TThe walls feel hot and slimy as they constrict around you.",
            examineMsgDescrip: "<pred>'s belly looks as though something inside is moving...",
            struggleInsideMsgDescrip: "Pressing against the slimy walls doesn't seem to get much of a reaction from <pred>.",
            struggleOutsideMsgDescrip: "<pred>'s belly bulges out with the outline of a hand print for a moment before returning to it's distended shape.",
            digestionInsideMsgDescrip: "The constant liquid churning inside<pred>'s stomach causes your form to contort and squirm uncomfortably until you can no longer recognize your own shape and your mind melts away into nothingness.",
            digestionOutsideMsgDescrip: "The constant movement inside <pred>'s middle finally goes still as a soft gurgling sound comes from their belly.",
            releaseMsgDescrip: "<pred> leans forward and heaves, forcing you back out into the light.",
            audioEntry: 'swallow',
            audioAmbient: 'gurgle_loud',
            audioStruggle: 'squish',
            audioExit: 'belch'
        }, false);

        const anusExit = createNode('exit', 445, 100, {
            id: 6,
            name: 'Anus',
            icon: 'door',
            destinationDescrip: "You are squeezed into the lower intestines...",
            examineMsgDescrip: "<pred>'s anus bulges outward...",
            struggleInsideMsgDescrip: "There is little room to move...",
            struggleOutsideMsgDescrip: "<pred>'s lower belly churns..."
        }, false);

        // --- 2. ANAL VORE CHAIN ---
        const anusEntrance = createNode('entrance', 25, 240, {
            id: 2,
            name: 'Anus',
            icon: 'door',
            verb: 'squelches',
            mode: 'Hold',
            destinationDescrip: "You can feel the slimy walls of <pred>'s anal canal rippling around you...",
            examineMsgDescrip: "<prey> is slowly being worked up into <pred>'s tight ass...",
            struggleInsideMsgDescrip: "You push against the tight ring...",
            struggleOutsideMsgDescrip: "<pred> groans as their ass tightens around the intruding prey..."
        }, false);

        const bowels = createNode('path', 165, 240, {
            id: 4,
            name: 'Bowels',
            icon: 'waves',
            destinationDescrip: "You feel the musky walls of <pred>'s digestive tract undulating around you as you are shoved up their ass.",
            examineMsgDescrip: "<pred>'s lower abdomen seems to be swollen out quite a lot...did something just move?",
            struggleInsideMsgDescrip: "Wriggling about only seems to make that tight fleshy tube squeeze tighter around your body.",
            struggleOutsideMsgDescrip: "The outline of a footprint forms against the surface of <pred>'s lower belly"
        }, false);

        // --- 3. UNBIRTH CHAIN ---
        const slitEntrance = createNode('entrance', 25, 380, {
            id: 7,
            name: 'Slit',
            icon: 'droplet',
            verb: 'presses',
            mode: 'Hold',
            destinationDescrip: "You are pulled past <pred>'s soft outer lips...",
            examineMsgDescrip: "<pred> is working <prey> in and out of their pussy...",
            struggleInsideMsgDescrip: "You struggle against the slick folds...",
            struggleOutsideMsgDescrip: "<pred>'s hips twitch as <prey> pushes from inside..."
        }, false);

        const canal = createNode('path', 165, 380, {
            id: 8,
            name: 'Canal',
            icon: 'waves',
            destinationDescrip: "The tight, ribbed canal squeezes tightly around you...",
            examineMsgDescrip: "<pred>'s lower tummy is distended with the shape of <prey> sliding in deeper...",
            struggleInsideMsgDescrip: "The fleshy passage grips you firmly...",
            struggleOutsideMsgDescrip: "A visible bulge shifts along <pred>'s pelvis..."
        }, false);

        const womb = createNode('destination', 305, 380, {
            id: 9,
            name: 'Womb',
            icon: 'heart',
            verb: 'birthing',
            mode: 'Womb',
            digestivePower: 'Normal',
            destinationDescrip: "You are wholly enveloped in a humid heat as you are deposited into a wet and slimy chamber. The air is filled with the scent of <pred>'s arousal and their heart can be heard beating just above.",
            examineMsgDescrip: "<pred>'s lower belly bulges warmly with life...",
            struggleInsideMsgDescrip: "Struggling seems to do little good, but you do feel the gentle rubbing of <pred>'s hand over your shape as they press the bulges you make back into their core.",
            struggleOutsideMsgDescrip: "<pred>'s distended belly seems to rock and sway on it's own, they coo softly and seem to rub over their middle affectionately.",
            digestionInsideMsgDescrip: "Your body seems to feel soggy and wet as the heat surrounding you grows more intense. The walls seem to flex down harder and harder until finally... splorsh! You succumb to <pred>'s arousal and are reduced to a pool of fem-cum.",
            digestionOutsideMsgDescrip: "<pred>'s middle suddenly compacts down noticeably and their face flushes red as they bite their lower lip. A muffled sloshing sound could be heard seemingly coming from their belly!",
            releaseMsgDescrip: "<pred>'s body convulses as they push you back out through their canal, birthing you back into freedom."
        }, false);

        const slitExit = createNode('exit', 445, 380, {
            id: 10,
            name: 'Slit',
            icon: 'droplet',
            destinationDescrip: "You are birthed out through the slick slit...",
            examineMsgDescrip: "",
            struggleInsideMsgDescrip: "You press outward toward freedom...",
            struggleOutsideMsgDescrip: "<pred>'s slit widens as you push..."
        }, false);

        // --- 4. COCK VORE CHAIN ---
        const cockEntrance = createNode('entrance', 25, 520, {
            id: 11,
            name: 'Cock',
            icon: 'tail',
            verb: 'forces',
            mode: 'Hold',
            destinationDescrip: "You are forced into the tip of <pred>'s cock...",
            examineMsgDescrip: "<prey> is sliding inside the tip of <pred>'s cock...",
            struggleInsideMsgDescrip: "You squirm against the narrow opening...",
            struggleOutsideMsgDescrip: "<pred>'s cock twitches as <prey> slides in..."
        }, false);

        const shaft = createNode('path', 165, 520, {
            id: 12,
            name: 'Shaft',
            icon: 'waves',
            destinationDescrip: "The tight, throbbing shaft constricts around you...",
            examineMsgDescrip: "<prey> is sliding deeper into <pred>'s cock, making a visible bulge along it's length...",
            struggleInsideMsgDescrip: "The slick inner walls clamp tight...",
            struggleOutsideMsgDescrip: "A distinct bulge squirms along the underside of <pred>'s girth..."
        }, false);

        const balls = createNode('destination', 305, 520, {
            id: 13,
            name: 'Balls',
            icon: 'droplet',
            verb: 'stores',
            mode: 'Balls',
            digestivePower: 'Normal',
            destinationDescrip: "You fall down into a thick, musky puddle of jizz that immediately starts coating your body as the wrinkly walls of <pred>'s scrotum tighten up to welcome you~",
            examineMsgDescrip: "A large bulge between <pred>'s thighs seems to shift and sway on it's own.",
            struggleInsideMsgDescrip: "The walls of your prison seem to give easily when you push out against them, but they always clench right back down the moment you relax...",
            struggleOutsideMsgDescrip: "A very clear imprint of someone's face bulges out from the side of <pred>'s nutsack.",
            digestionInsideMsgDescrip: "The walls around you suddenly cinch up tightly submerging your head completely in <pred>'s sperm before you finally melt, becoming one with the pool of seed you had been bathing in.",
            digestionOutsideMsgDescrip: "There are a few frantic garbled sounds seeming to come up from <pred>'s crotch before there was a sudden, thick sounding, GLORP and those frantic sounds were reduced to a soft sloshing.",
            releaseMsgDescrip: "With a powerful thrust, <pred> expels you from their sack, sending you sliding out into the world."
        }, false);

        const cockExit = createNode('exit', 445, 520, {
            id: 14,
            name: 'Cock',
            icon: 'tail',
            destinationDescrip: "You are ejaculated out from <pred>'s cock...",
            struggleInsideMsgDescrip: "You push outward down the shaft...",
            struggleOutsideMsgDescrip: "<pred>'s shaft throbs as you move..."
        }, false);

        // --- CONNECTIONS ---
        // Oral: Maw (1) -> Gullet (3) -> Stomach (5) -> Anus (6)
        connections.push({ from: 1, to: 3 });
        connections.push({ from: 3, to: 5 });
        connections.push({ from: 5, to: 6 });

        // Anal: Anus (2) -> Bowels (4) -> Stomach (5)
        connections.push({ from: 2, to: 4 });
        connections.push({ from: 4, to: 5 });

        // Unbirth: Slit (7) -> Canal (8) -> Womb (9) -> Slit (10)
        connections.push({ from: 7, to: 8 });
        connections.push({ from: 8, to: 9 });
        connections.push({ from: 9, to: 10 });

        // Cock Vore: Cock (11) -> Shaft (12) -> Balls (13) -> Cock (14)
        connections.push({ from: 11, to: 12 });
        connections.push({ from: 12, to: 13 });
        connections.push({ from: 13, to: 14 });

        nextId = 100;

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

    function hasPrecedingDestination(startNodeId, visited = new Set()) {
        if (!startNodeId || visited.has(startNodeId)) return false;
        visited.add(startNodeId);

        const startNode = nodes.find(n => String(n.id) === String(startNodeId));
        if (!startNode) return false;

        if (startNode.type === 'destination') return true;

        const incoming = connections.filter(c => String(c.to) === String(startNodeId));
        for (const conn of incoming) {
            const parentNode = nodes.find(n => String(n.id) === String(conn.from));
            if (!parentNode) continue;
            if (parentNode.type === 'destination') return true;
            if (hasPrecedingDestination(parentNode.id, visited)) return true;
        }

        return false;
    }

    function checkConnectionValidity(sourceType, targetType, sourceNodeId = null, targetNodeId = null) {
        if (sourceType === 'entrance') {
            if (targetType === 'path') return { valid: true };
            if (targetType === 'destination') return { valid: false, reason: "Entrance organs must connect to a Path organ first (e.g. Esophagus)." };
            if (targetType === 'exit') return { valid: false, reason: "Entrance organs cannot connect directly to an Exit." };
            return { valid: false, reason: "Entrance organs must connect to a Path organ." };
        }

        if (sourceType === 'destination') {
            if (targetType === 'destination' || targetType === 'path' || targetType === 'exit') {
                return { valid: true };
            }
            return { valid: false, reason: "Destination organs can only connect to a Path, Destination, or Exit." };
        }

        if (sourceType === 'path') {
            if (targetType === 'path' || targetType === 'destination') {
                return { valid: true };
            }
            if (targetType === 'exit') {
                if (sourceNodeId && hasPrecedingDestination(sourceNodeId)) {
                    return { valid: true };
                } else {
                    return { valid: false, reason: "Anatomy path must pass through a Destination organ (e.g. Stomach) before connecting to an Exit." };
                }
            }
            return { valid: false, reason: "Path organs cannot connect to an Entrance." };
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

    /**
     * Synchronously processes pending mouse movement updates for canvas pan, node drag, or connection drawing.
     * @OPTIMIZATION Decouples raw mouse event frequency from rendering loop to prevent layout thrashing.
     * @param {number} clientX - Current mouse X coordinate
     * @param {number} clientY - Current mouse Y coordinate
     */
    function updateMouseMove(clientX, clientY) {
        if (view.isPanning) {
            view.x = clientX - view.panStartX;
            view.y = clientY - view.panStartY;
            updateTransform();
            return;
        }
        if (isDraggingNode && draggedNodeId) {
            const worldPos = screenToWorld(clientX, clientY);
            const node = nodes.find(n => String(n.id) === String(draggedNodeId));
            if (node) {
                node.x = worldPos.x - dragOffset.x;
                node.y = worldPos.y - dragOffset.y;
                const el = document.querySelector(`.af-node[data-id="${draggedNodeId}"]`);
                if (el) {
                    el.style.left = `${node.x}px`;
                    el.style.top = `${node.y}px`;
                }
            }
            updateConnections();
            serializeSystem();
        }
        if (isDrawingLine) {
            const worldPos = screenToWorld(clientX, clientY);
            tempLineEnd = worldPos;
            updateConnections();
        }
        if (isDraggingNewNode && ghostNode) {
            ghostNode.style.left = `${clientX}px`;
            ghostNode.style.top = `${clientY}px`;
        }
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
            lastMousePos.x = e.clientX;
            lastMousePos.y = e.clientY;

            if (view.isPanning || isDraggingNode || isDrawingLine || isDraggingNewNode) {
                if (!mouseRafId) {
                    mouseRafId = requestAnimationFrame(() => {
                        mouseRafId = null;
                        updateMouseMove(lastMousePos.x, lastMousePos.y);
                    });
                }
            }
        });

        function handleGlobalMouseUp(e) {
            console.log('[AF-DEBUG] handleGlobalMouseUp triggered:', { type: e.type, isDraggingNode, draggedNodeId, target: e.target ? (e.target.className || e.target.tagName) : 'none' });
            if (mouseRafId) {
                cancelAnimationFrame(mouseRafId);
                mouseRafId = null;
                updateMouseMove(e.clientX, e.clientY);
            }

            view.isPanning = false;
            if (container) container.style.cursor = 'grab';

            let didChange = false;

            if (isDraggingNewNode) {
                const rect = canvasContainer ? canvasContainer.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
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
                try {
                    serializeSystem();
                } catch (err) {
                    console.error('AnatomyForge: Error during serialization on drag release:', err);
                }
                didChange = true;
            }

            isDraggingNode = false;
            draggedNodeId = null;

            if (isDrawingLine) {
                const hitElement = document.elementFromPoint(e.clientX, e.clientY);
                const targetNodeEl = hitElement ? hitElement.closest('.af-node') : null;
                if (targetNodeEl && targetNodeEl.dataset && targetNodeEl.dataset.id) {
                    finishConnection(targetNodeEl.dataset.id);
                } else {
                    isDrawingLine = false;
                    connectionStartNodeId = null;
                    updateConnections();
                }
                document.querySelectorAll('.af-node').forEach(n => {
                    n.classList.remove('target-glow');
                    n.classList.remove('target-error');
                });
            }

            if (didChange) triggerSave();
        }

        // Use capture phase (true) to guarantee release even if child elements call stopPropagation()
        window.addEventListener('mouseup', handleGlobalMouseUp, true);
        window.addEventListener('pointerup', handleGlobalMouseUp, true);
        window.addEventListener('blur', () => {
            isDraggingNode = false;
            draggedNodeId = null;
            isDraggingNewNode = false;
            isDrawingLine = false;
            view.isPanning = false;
        });
    }

    function setupKeyboardEvents() {
        window.addEventListener('keydown', (e) => {
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                return; // Don't trigger canvas hotkeys while typing in fields
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) { e.preventDefault(); redo(); }
                else { e.preventDefault(); undo(); }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
            if (e.key.toLowerCase() === 'r') { resetView(); }
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

    /**
     * Renders a graph node element in the DOM and caches dynamic dimensions.
     * @SECURITY Uses escapeHTML to sanitize node types and user labels.
     * @OPTIMIZATION Caches node offsetWidth/offsetHeight in nodeData._width and nodeData._height to avoid layout thrashing during connection updates.
     * @param {Object} nodeData - Node state object
     */
    function renderNodeDOM(nodeData) {
        const el = document.createElement('div');
        el.className = 'af-node';
        el.dataset.id = nodeData.id;
        el.dataset.type = nodeData.type;
        el.style.left = `${nodeData.x}px`;
        el.style.top = `${nodeData.y}px`;

        const iconSvg = ICONS[nodeData.properties.icon] || ICONS['generic'];

        el.innerHTML = `
            <div class="af-node-type">${escapeHTML(nodeData.type)}</div>
            <div class="af-node-icon"><svg viewBox="0 0 24 24">${iconSvg}</svg></div>
            <button type="button" class="af-node-edit-btn" title="Edit Properties">✒</button>
            <div class="af-node-label">${escapeHTML(nodeData.properties.name)}</div>
            ${nodeData.type !== 'entrance' ? '<div class="af-socket input"></div>' : ''}
            ${nodeData.type !== 'exit' ? '<div class="af-socket output"></div>' : ''}
        `;

        el.addEventListener('mousedown', (e) => {
            console.log('[AF-DEBUG] mousedown on node:', nodeData.id, { eButton: e.button });
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            saveState();
            isDraggingNode = true;
            draggedNodeId = nodeData.id;
            const worldPos = screenToWorld(e.clientX, e.clientY);
            dragOffset.x = worldPos.x - nodeData.x;
            dragOffset.y = worldPos.y - nodeData.y;
        });

        const editBtn = el.querySelector('.af-node-edit-btn');
        editBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
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
                const validation = checkConnectionValidity(sourceNode.type, nodeData.type, sourceNode.id, nodeData.id);
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
        // Measure and cache node dimensions to prevent layout thrashing during connection rendering
        nodeData._width = el.offsetWidth || 140;
        nodeData._height = el.offsetHeight || 100;
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
        const targetNode = nodes.find(n => String(n.id) === String(targetNodeId));
        if (!targetNode || targetNode.type === 'entrance') {
            isDrawingLine = false;
            connectionStartNodeId = null;
            updateConnections();
            return;
        }

        if (isDrawingLine && connectionStartNodeId && String(connectionStartNodeId) !== String(targetNodeId)) {
            const sourceNode = nodes.find(n => String(n.id) === String(connectionStartNodeId));
            if (sourceNode) {
                const validation = checkConnectionValidity(sourceNode.type, targetNode.type, sourceNode.id, targetNode.id);

                if (!validation.valid) {
                    showToast(validation.reason, 'error');
                } else {
                    const exists = connections.some(c => String(c.from) === String(connectionStartNodeId) && String(c.to) === String(targetNodeId));
                    if (!exists) {
                        saveState();
                        connections.push({ from: sourceNode.id, to: targetNode.id });
                        updateConnections();
                        serializeSystem();
                    }
                }
            }
        }
        isDrawingLine = false;
        connectionStartNodeId = null;
        updateConnections(); // clear draft line
    }

    /**
     * Re-calculates and updates all SVG Bezier curve connection splines.
     * @OPTIMIZATION Uses DocumentFragment and Element.replaceChildren to batch DOM mutations off-screen and avoid reflow thrashing.
     */
    function updateConnections() {
        const frag = document.createDocumentFragment();

        connections.forEach((conn, index) => {
            const nodeA = nodes.find(n => n.id === conn.from);
            const nodeB = nodes.find(n => n.id === conn.to);
            if (!nodeA || !nodeB) return;

            const widthA = nodeA._width || 140;
            const heightA = nodeA._height || 100;
            const widthB = nodeB._width || 140;

            const x1 = nodeA.x + widthA / 2;
            const y1 = nodeA.y + heightA; // Output at bottom
            const x2 = nodeB.x + widthB / 2;
            const y2 = nodeB.y; // Input at top

            // 1. Halo (visual outline/contrast)
            drawBezierToContainer(frag, x1, y1, x2, y2, 'af-connector-halo');

            // 2. Invisible wide hit area (for easier selection)
            drawBezierToContainer(frag, x1, y1, x2, y2, 'af-connector-hit', index);

            // 3. Main visible line
            drawBezierToContainer(frag, x1, y1, x2, y2, 'af-connector', index);
        });

        if (isDrawingLine && connectionStartNodeId) {
            const nodeA = nodes.find(n => n.id === connectionStartNodeId);
            if (nodeA) {
                const widthA = nodeA._width || 140;
                const heightA = nodeA._height || 100;

                const x1 = nodeA.x + widthA / 2;
                const y1 = nodeA.y + heightA;
                drawBezierToContainer(frag, x1, y1, tempLineEnd.x, tempLineEnd.y, 'af-connector af-connector-draft');
            }
        }

        svgLayer.replaceChildren(frag);
    }

    function drawBezierToContainer(targetContainer, x1, y1, x2, y2, className, connectionIndex = null) {
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
                if (tooltip) tooltip.style.display = 'none';
            });
            path.addEventListener('mouseenter', (e) => {
                if (tooltip) {
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                }
            });
            path.addEventListener('mousemove', (e) => {
                if (tooltip) {
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                }
            });
            path.addEventListener('mouseleave', () => {
                if (tooltip) tooltip.style.display = 'none';
            });
        }
        targetContainer.appendChild(path);
    }

    // ==========================================
    // 7. INSPECTOR & SERIALIZATION
    // ==========================================

    const FIELD_HELP = {
        destinationDescrip: 'Sent internally to the prey player when entering this organ chamber (what prey sees & feels).',
        examineMsgDescrip: 'Broadcast to other players who examine the predator while prey is inside this organ.',
        digestionInsideMsgDescrip: 'Sent internally to the prey player when they succumb to digestion in this chamber.',
        digestionOutsideMsgDescrip: 'Broadcast to nearby players & predator when prey digestion completes in this chamber.',
        releaseMsgDescrip: 'Sent to players when prey escapes or is released from this organ chamber.',
        name: 'Label for this organ chamber in your anatomy map.',
        verb: 'Action verb used when swallowing prey into this entrance organ.'
    };

    function selectNode(id) {
        selectedNodeId = id;
        document.querySelectorAll('.af-node').forEach(n => n.classList.remove('selected'));
        const el = document.querySelector(`.af-node[data-id="${id}"]`);
        if (el) el.classList.add('selected');

        const node = nodes.find(n => n.id === id);
        renderInspector(node);
        inspector.classList.add('visible');
    }

    function createTagChipBar(onInsert) {
        const bar = document.createElement('div');
        bar.className = 'af-tag-chip-bar';

        const tags = [
            { label: '<pred>', tag: '<pred>' },
            { label: '<prey>', tag: '<prey>' },
            { label: '<organ>', tag: '<organ>' },
            { label: '<pred_pronouns>', tag: '<pred_pronouns>' },
            { label: '<prey_pronouns>', tag: '<prey_pronouns>' }
        ];

        tags.forEach(t => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'af-tag-chip';
            chip.innerText = t.label;
            chip.title = `Insert ${t.tag} tag`;
            chip.onclick = (e) => {
                e.preventDefault();
                onInsert(t.tag);
            };
            bar.appendChild(chip);
        });

        return bar;
    }

    function createPane(id, isActive) {
        const pane = document.createElement('div');
        pane.id = id;
        pane.className = `af-tab-pane ${isActive ? 'active' : ''}`;
        inspectorContent.appendChild(pane);
        return pane;
    }

    function renderInspector(node) {
        inspectorTitle.innerText = `${node.properties.name || node.type} (${node.type})`;
        inspectorContent.innerHTML = '';

        // Tab Bar Navigation
        const tabBar = document.createElement('div');
        tabBar.className = 'af-tab-bar';

        const tabs = [
            { id: 'afSensoryTab', label: '🧠 Sensory' },
            { id: 'afStruggleTab', label: '🥊 Struggle' },
            { id: 'afDigestionTab', label: '☠️ Digestion' },
            { id: 'afSettingsTab', label: '⚙️ Settings' }
        ];

        if (node.type !== 'destination') {
            tabs.splice(2, 1); // Hide Digestion tab for non-destination nodes
        }

        tabs.forEach((tab, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `af-tab-btn ${idx === 0 ? 'active' : ''}`;
            btn.innerText = tab.label;
            btn.onclick = function () {
                tabBar.querySelectorAll('.af-tab-btn').forEach(b => b.classList.remove('active'));
                inspectorContent.querySelectorAll('.af-tab-pane').forEach(p => p.classList.remove('active'));
                this.classList.add('active');
                const pane = document.getElementById(tab.id);
                if (pane) pane.classList.add('active');
            };
            tabBar.appendChild(btn);
        });

        inspectorContent.appendChild(tabBar);

        // Tab Panes
        const sensoryPane = createPane('afSensoryTab', true);
        const strugglePane = createPane('afStruggleTab', false);
        const digestionPane = node.type === 'destination' ? createPane('afDigestionTab', false) : null;
        const settingsPane = createPane('afSettingsTab', false);

        // --- SENSORY PANE ---
        addInputField(node, 'destinationDescrip', 'Arrival Description (Internal)', 'textarea', sensoryPane);
        addInputField(node, 'examineMsgDescrip', 'Examine Message (External)', 'textarea', sensoryPane);

        // --- STRUGGLE PANE ---
        addStruggleListField(node, 'struggleInsideList', 'struggleInsideMsgDescrip', 'Internal Feedback Messages', 'Sent internally to prey when they struggle inside this organ chamber.', strugglePane);
        addStruggleListField(node, 'struggleOutsideList', 'struggleOutsideMsgDescrip', 'External Observation Messages', 'Broadcast to nearby players & predator when prey struggles.', strugglePane);

        // --- DIGESTION PANE ---
        if (digestionPane) {
            addInputField(node, 'digestionInsideMsgDescrip', 'Internal Fate', 'textarea', digestionPane);
            addInputField(node, 'digestionOutsideMsgDescrip', 'External Outcome', 'textarea', digestionPane);
            addInputField(node, 'releaseMsgDescrip', 'Release / Escape Message', 'textarea', digestionPane);
        }

        // --- SETTINGS PANE ---
        addInputField(node, 'name', 'Organ Name (Label)', 'text', settingsPane);

        if (node.type === 'entrance') {
            addInputField(node, 'verb', 'Action Verb', 'text', settingsPane);
        }

        if (node.type === 'destination') {
            addSelectField(node, 'digestivePower', 'Digestive Power', DIGESTIVE_POWER_OPTIONS, settingsPane);
            addSelectField(node, 'enterSound', 'Enter Sound', AUDIO_OPTIONS, settingsPane);
            addSelectField(node, 'ambientSound', 'Ambient Loop', AUDIO_OPTIONS, settingsPane);
            addSelectField(node, 'struggleSound', 'Struggle Sound', AUDIO_OPTIONS, settingsPane);
            addSelectField(node, 'exitSound', 'Exit Sound', AUDIO_OPTIONS, settingsPane);
        }

        const iconHeader = document.createElement('div');
        iconHeader.className = 'af-section-header';
        iconHeader.innerText = 'Visual Sigil Icon';
        settingsPane.appendChild(iconHeader);

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
        settingsPane.appendChild(iconGrid);

        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'af-btn-delete';
        btnDel.style.marginTop = '15px';
        btnDel.innerText = 'Delete Organ Chamber';
        btnDel.onclick = requestDeleteNode;
        settingsPane.appendChild(btnDel);
    }

    function addStruggleListField(node, listKey, fallbackKey, labelText, helpText, parentPane) {
        if (!node.properties[listKey] || !Array.isArray(node.properties[listKey])) {
            const fallbackVal = node.properties[fallbackKey] || '';
            node.properties[listKey] = fallbackVal ? [fallbackVal] : [''];
        }

        const group = document.createElement('div');
        group.className = 'af-form-group';

        const lbl = document.createElement('label');
        lbl.className = 'af-form-label';
        lbl.innerHTML = `<i class="fa-solid fa-comments"></i> ${labelText}`;
        group.appendChild(lbl);

        if (helpText) {
            const help = document.createElement('div');
            help.className = 'af-field-help';
            help.innerText = helpText;
            group.appendChild(help);
        }

        const listContainer = document.createElement('div');
        listContainer.className = 'af-struggle-list';

        function renderListItems() {
            listContainer.innerHTML = '';
            const items = node.properties[listKey];

            items.forEach((itemText, idx) => {
                const itemBox = document.createElement('div');
                itemBox.className = 'af-struggle-item';

                const header = document.createElement('div');
                header.className = 'af-struggle-header';

                const counter = document.createElement('span');
                counter.className = 'af-char-counter';
                const len = itemText.length;
                counter.innerText = `${len} / 250 chars`;
                if (len >= 240) counter.classList.add('warning');

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'af-item-remove-btn';
                removeBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
                removeBtn.title = 'Delete struggle message';
                removeBtn.onclick = () => {
                    if (items.length <= 1) {
                        showToast('Must keep at least 1 struggle message option', 'error');
                        return;
                    }
                    saveState();
                    items.splice(idx, 1);
                    node.properties[fallbackKey] = items[0] || '';
                    renderListItems();
                    serializeSystem();
                    triggerSave();
                };

                header.appendChild(counter);
                header.appendChild(removeBtn);
                itemBox.appendChild(header);

                // Add Tag Chips
                const chipBar = createTagChipBar((tag) => {
                    const start = textarea.selectionStart || 0;
                    const end = textarea.selectionEnd || 0;
                    const val = textarea.value;
                    if (val.length + tag.length > 250) {
                        showToast('Message exceeds 250 character limit!', 'error');
                        return;
                    }
                    textarea.value = val.substring(0, start) + tag + val.substring(end);
                    textarea.dispatchEvent(new Event('input'));
                });
                itemBox.appendChild(chipBar);

                const textarea = document.createElement('textarea');
                textarea.className = 'af-form-textarea';
                textarea.rows = 2;
                textarea.maxLength = 250;
                textarea.value = itemText;

                textarea.addEventListener('input', (e) => {
                    let val = e.target.value;
                    if (val.length > 250) {
                        val = val.substring(0, 250);
                        e.target.value = val;
                    }
                    items[idx] = val;
                    node.properties[fallbackKey] = items[0] || '';
                    const currentLen = val.length;
                    counter.innerText = `${currentLen} / 250 chars`;
                    if (currentLen >= 240) counter.classList.add('warning');
                    else counter.classList.remove('warning');
                });

                textarea.addEventListener('change', () => {
                    saveState();
                    serializeSystem();
                    triggerSave();
                });

                itemBox.appendChild(textarea);
                listContainer.appendChild(itemBox);
            });
        }

        renderListItems();
        group.appendChild(listContainer);

        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'af-add-struggle-btn';
        addBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Struggle Message Option';
        addBtn.onclick = () => {
            saveState();
            node.properties[listKey].push('');
            renderListItems();
            serializeSystem();
            triggerSave();
        };

        group.appendChild(addBtn);
        parentPane.appendChild(group);
    }

    function addInputField(node, key, label, type, parentPane = null) {
        const group = document.createElement('div');
        group.className = 'af-form-group';

        const lbl = document.createElement('label');
        lbl.className = 'af-form-label';
        lbl.innerText = label;
        group.appendChild(lbl);

        if (FIELD_HELP[key]) {
            const help = document.createElement('div');
            help.className = 'af-field-help';
            help.innerText = FIELD_HELP[key];
            group.appendChild(help);
        }

        let elem;
        if (type === 'textarea') {
            const chipBar = createTagChipBar((tag) => {
                const start = elem.selectionStart || 0;
                const end = elem.selectionEnd || 0;
                const val = elem.value;
                elem.value = val.substring(0, start) + tag + val.substring(end);
                elem.dispatchEvent(new Event('input'));
                elem.dispatchEvent(new Event('change'));
            });
            group.appendChild(chipBar);

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
                const parentEl = document.querySelector(`.af-node[data-id="${node.id}"]`);
                if (parentEl) {
                    node._width = parentEl.offsetWidth || 140;
                    node._height = parentEl.offsetHeight || 100;
                }
            });
        }

        elem.onchange = (e) => {
            saveState();
            node.properties[key] = e.target.value;
            serializeSystem();
            triggerSave();
        };

        group.appendChild(elem);
        (parentPane || inspectorContent).appendChild(group);
    }

    function addSelectField(node, key, label, options, parentPane = null) {
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
        (parentPane || inspectorContent).appendChild(group);
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

    /**
     * Centers and scales the canvas viewport to frame all graph nodes.
     * @OPTIMIZATION Clamps content dimensions to a minimum of 1px to prevent division-by-zero Infinity scale calculations.
     */
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

            const contentW = Math.max(maxX - minX, 1);
            const contentH = Math.max(maxY - minY, 1);
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

        updateSaveStatus(true);

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

    function saveState() {
        historyStack.push(JSON.stringify({ nodes, connections, nextId }));
        if (historyStack.length > MAX_HISTORY) historyStack.shift();
        redoStack = [];
        updateSaveStatus(false);
    }

    function updateSaveStatus(isStaged = true) {
        const badge = document.getElementById('af-save-status');
        if (badge) {
            if (isStaged) {
                badge.innerHTML = '<span class="status-dot green"></span> Staged for Creation';
                badge.title = 'Your anatomy configuration is automatically staged. It will be saved when you click Finish Character Creation at the bottom of the form.';
            } else {
                badge.innerHTML = '<span class="status-dot yellow"></span> Staging Changes...';
                badge.title = 'Updating anatomy configuration...';
            }
        }
    }

    function undo() {
        if (historyStack.length === 0) {
            showToast('Nothing to undo', 'error');
            return;
        }
        redoStack.push(JSON.stringify({ nodes, connections, nextId }));
        const state = JSON.parse(historyStack.pop());
        nodes = state.nodes;
        connections = state.connections;
        nextId = state.nextId;
        rebuildWorld();
        updateConnections();
        serializeSystem();
        showToast('Undo successful', 'success');
    }

    function redo() {
        if (redoStack.length === 0) {
            showToast('Nothing to redo', 'error');
            return;
        }
        historyStack.push(JSON.stringify({ nodes, connections, nextId }));
        const state = JSON.parse(redoStack.pop());
        nodes = state.nodes;
        connections = state.connections;
        nextId = state.nextId;
        rebuildWorld();
        updateConnections();
        serializeSystem();
        showToast('Redo successful', 'success');
    }

    function requestRestoreDefault() {
        if (!confirmModal || !modalBox) return;

        confirmModal.classList.add('active');
        modalBox.classList.add('danger-mode');
        if (modalCheckboxContainer) modalCheckboxContainer.style.display = 'flex';
        if (modalCheck) modalCheck.checked = false;
        if (btnConfirmDelete) {
            btnConfirmDelete.disabled = true;
            btnConfirmDelete.innerText = 'Reset All Anatomy to Default';
        }

        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--accent-red,#a84a4a);"></i> RESTORE DEFAULT ANATOMY?';
        }

        if (modalMsg) {
            modalMsg.innerHTML = `
                <div style="font-size:0.95rem; line-height:1.5;">
                    <strong style="color: var(--accent-red,#a84a4a);">⚠️ CRITICAL WARNING: RESTORING DEFAULTS WILL ERASE ALL CUSTOMIZATIONS!</strong><br><br>
                    This action will completely reset your anatomy map back to the initial 4 default anatomy paths (<strong>Oral Vore</strong>, <strong>Anal Vore</strong>, <strong>Unbirth</strong>, and <strong>Cock Vore</strong>).<br><br>
                    <span style="color: var(--accent-red,#a84a4a); font-weight:bold;">All custom organ chambers, organ names, sensory descriptions, struggle feedback messages, and digestion outcomes will be PERMANENTLY ERASED and lost.</span>
                </div>
            `;
        }

        if (btnConfirmDelete) {
            btnConfirmDelete.onclick = () => {
                restoreDefaultAnatomy();
                closeModal();
            };
        }
    }

    function restoreDefaultAnatomy() {
        saveState();
        setupDefaultAnatomy();
        updateConnections();
        serializeSystem();
        resetView();
        showToast('Default 4-path anatomy topology restored!', 'success');
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
        restoreDefault: requestRestoreDefault,
        undo: undo,
        redo: redo,
        requestDeleteNode: requestDeleteNode,
        openTagGuideModal: function () {
            const modal = document.getElementById('af-tag-guide-modal');
            if (modal) modal.classList.add('active');
        },
        refreshLayout: function () {
            // Force recalculation of node dimensions and connections
            // Use timeout to ensure browser layout has processed the display:block change
            setTimeout(() => {
                rebuildWorld();
            }, 50);
        }
    };
})();
