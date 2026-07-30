/**
 * @fileoverview SewingModule.js - Custom Sewing Machine Crafting Station UI
 * 
 * @description
 * Pluggable client-side crafting module for the `sewing_machine` station.
 * Mounted within `CraftingUI` (`crafting.js`) to provide real-time multi-layered
 * garment tailoring, pattern selection, offscreen canvas texture tinting,
 * smooth camera transitions, and hand-based thread spool inventory integration.
 * 
 * @module SewingModule
 */

import itemData from '../itemData.js';
import { clickManager } from '../clickManager.js';

/**
 * Camera zoom and offset configurations by clothing equipment slot.
 * @type {Object.<string, {offsetY: number, zoom: number}>}
 */
export const SLOT_CAMERA_CONFIGS = {
    'torsoOuter': { offsetY: 0,   zoom: 3.0 },
    'torsoInner': { offsetY: 0,   zoom: 3.0 },
    'legs':       { offsetY: -40, zoom: 2.8 },
    'feet':       { offsetY: -70, zoom: 3.0 },
    'head':       { offsetY: 20,  zoom: 3.0 },
    'default':    { offsetY: 0,   zoom: 3.0 }
};

/**
 * Class representing the interactive Sewing Machine Station UI module.
 */
export class SewingModule {
    /**
     * Creates an instance of SewingModule.
     * @param {HTMLElement} container - Parent DOM container element (.window-body)
     * @param {Object} socket - Socket.IO client instance
     * @param {Object} craftingUI - Host CraftingUI manager instance
     */
    constructor(container, socket, craftingUI) {
        this.container = container;
        this.socket = socket;
        this.craftingUI = craftingUI;
        this.active = false;

        // --- Optimization: Cache DOM Elements ---
        this.dom = {};

        // --- Optimization: Texture Cache ---
        this.textureCache = new Map();

        // Data & State
        this.bases = [];
        this.populateBasesFromRecipes();

        this.patterns = [];
        this.trims = [];
        this.details = [];

        // Camera Smooth Transition State
        this.camera = {
            currentY: 0,
            targetY: 0,
            currentZoom: 3.0,
            targetZoom: 3.0,
            lerpFactor: 0.12
        };

        // State
        this.state = {
            activeTab: 0,
            selections: [null, 'none', 'none', 'none'],
            threads: [null, null, null, null],
            threadItems: [null, null, null, null],
            activeSlotIndex: null,
            dirty: true
        };

        if (this.bases.length > 0) {
            this.state.selections[0] = this.bases[0].id;
        }

        this.updatePatternsForSelectedBase();

        this.rafId = null;
        this.activeBaseObj = null;
        this.isCrafting = false;
        this.craftTimeout = null;
        this.render();
    }

    /**
     * Discovers base clothing garments from item definitions or station recipes.
     * Populates `this.bases` with garment metadata.
     */
    populateBasesFromRecipes() {
        this.bases = [];
        Object.values(itemData).forEach(item => {
            if (item.itemType === 'clothing' && item.recipe && item.recipe.station === 'sewing_machine') {
                this.bases.push({
                    id: item.itemId,
                    name: item.name,
                    shape: item.recipe.customData?.baseShape || item.itemId,
                    resultItemId: item.itemId,
                    equipSlot: item.equipSlot || 'torsoOuter',
                    secondaryPatterns: item.secondaryPatterns || []
                });
            }
        });

        // Fallback to craftingUI recipes if itemData produced nothing
        if (this.bases.length === 0 && this.craftingUI.allRecipes) {
            const baseRecipes = this.craftingUI.allRecipes.filter(r =>
                r.customData && r.customData.baseShape && !r.validateOnly
            );
            baseRecipes.forEach(r => {
                this.bases.push({
                    id: r.result.itemId || r.customData.baseShape,
                    name: r.customData.baseName || r.name,
                    shape: r.customData.baseShape,
                    recipeId: r.id,
                    resultItemId: r.result.itemId,
                    equipSlot: 'torsoOuter',
                    secondaryPatterns: []
                });
            });
        }

        if (this.bases.length === 0) {
            this.bases = [{ id: 'shirt_01', name: 'T-Shirt', shape: 'shirt', resultItemId: 'shirt_01', equipSlot: 'torsoOuter', secondaryPatterns: [] }];
        }
        this.activeBaseObj = this.bases[0] || null;
    }

    /**
     * Cleans up animation loop frame requests, active craft timeouts, and clears texture caches upon module unmount.
     * @optimization Halts idle requestAnimationFrame loops to prevent memory leaks and unnecessary CPU usage.
     */
    destroy() {
        this.active = false;
        if (this.craftTimeout) {
            clearTimeout(this.craftTimeout);
            this.craftTimeout = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        this.textureCache.clear();
    }

    setCameraTargetForSlot(slotId) {
        const config = SLOT_CAMERA_CONFIGS[slotId] || SLOT_CAMERA_CONFIGS['default'];
        this.camera.targetY = config.offsetY;
        this.camera.targetZoom = config.zoom;
        this.state.dirty = true;
    }

    updatePatternsForSelectedBase() {
        const selectedBaseId = this.state.selections[0];
        const selectedBase = this.bases.find(b => b.id === selectedBaseId) || this.bases[0];

        if (selectedBase) {
            this.setCameraTargetForSlot(selectedBase.equipSlot);
        }

        const noneItem = { id: 'none', name: 'None' };
        const patternList = [noneItem];

        if (selectedBase && selectedBase.secondaryPatterns) {
            selectedBase.secondaryPatterns.forEach(pattern => {
                const id = typeof pattern === 'string' ? pattern : pattern.id;
                const name = typeof pattern === 'string' ? `Style ${pattern}` : (pattern.name || pattern.id);
                patternList.push({ id, name });
            });
        }

        this.patterns = patternList;
        this.trims = patternList;
        this.details = patternList;

        // Reset any invalid selections back to 'none'
        const validIds = new Set(patternList.map(p => p.id));
        for (let i = 1; i <= 3; i++) {
            if (!validIds.has(this.state.selections[i])) {
                this.state.selections[i] = 'none';
            }
        }
    }

    render() {
        // [VISUAL OVERHAUL: THE SPUN SILK THEME]
        // Integrating Reference CSS logic into our component structure.
        // We inject the styles dynamically.

        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=Playfair+Display:ital@0;1&family=Lato:wght@400;700&display=swap');

            .sewing-interface {
                /* Reset & Base */
                font-family: 'Crimson Pro', serif;
                color: #fff;
                height: 100%;
                display: flex;
                flex-direction: column;
                
                /* Border/Frame handled by WindowManager generally, but we can add an inner frame */
                /* border: 8px solid #8d6e63; Removed to avoid double border */
                border-radius: 8px;
                
                position: relative;
                padding: 20px;
                box-sizing: border-box;
                overflow: hidden;
            }

            /* Decorative Pins */
            .pin {
                position: absolute; width: 16px; height: 16px;
                border-radius: 50%; z-index: 10;
                box-shadow: 2px 2px 4px rgba(0,0,0,0.4);
            }
            .pin.tl { top: 12px; left: 12px; background: radial-gradient(circle at 30% 30%, #fff, #f48fb1); }
            .pin.tr { top: 12px; right: 12px; background: radial-gradient(circle at 30% 30%, #fff, #90caf9); }
            .pin.bl { bottom: 12px; left: 12px; background: radial-gradient(circle at 30% 30%, #fff, #a5d6a7); }
            .pin.br { bottom: 12px; right: 12px; background: radial-gradient(circle at 30% 30%, #fff, #fff59d); }

            /* --- LAYOUT --- */
            .sewing-body {
                display: flex;
                gap: 20px;
                height: 100%;
            }

            /* --- LEFT: PATTERN BOOK --- */
            .pattern-book {
                width: 200px; /* Reduced width to fit game window */
                background: #fff;
                border-radius: 4px;
                border: 1px solid #a1887f;
                display: flex; flex-direction: column;
                box-shadow: 3px 3px 10px rgba(0,0,0,0.3);
                transform: rotate(-1deg);
                overflow: hidden;
                flex-shrink: 0;
            }

            .book-tabs {
                display: flex;
                background: #f8bbd0;
                border-bottom: 1px dashed #c2185b;
            }

            .book-tab {
                flex: 1;
                padding: 8px 4px;
                text-align: center;
                font-size: 0.8rem;
                color: #880e4f;
                cursor: pointer;
                background: rgba(255,255,255,0.3);
                transition: 0.2s;
                font-family: 'Lato', sans-serif;
                font-weight: bold;
            }
            .book-tab.active {
                background: #fff;
                border-top: 3px solid #c2185b;
            }

            .pattern-list {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                color: #4e342e;
            }

            .pattern-item {
                padding: 8px;
                border-bottom: 1px solid #f3e5f5;
                cursor: pointer;
                font-size: 0.95rem;
            }
            .pattern-item:hover { background: #fce4ec; }
            .pattern-item.selected {
                background: #f8bbd0;
                border-left: 4px solid #c2185b;
                font-weight: bold;
            }

            /* --- RIGHT: WORKSTATION --- */
            .workstation {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 15px;
                height: 100%;
            }

            /* TOP: PREVIEW */
            .preview-container {
                flex: 1;
                min-height: 0; /* Flex fix */
                background: rgba(255,255,255,0.1);
                border: 2px dashed rgba(255,255,255,0.5);
                border-radius: 8px;
                position: relative;
                display: flex; justify-content: center; align-items: center;
                box-shadow: inset 0 0 20px rgba(0,0,0,0.2);
            }

            .preview-label {
                position: absolute; top: 10px; left: 10px;
                background: #fff; color: #333;
                padding: 4px 8px; font-family: 'Lato', sans-serif; font-size: 11px; font-weight: bold;
                box-shadow: 1px 1px 3px rgba(0,0,0,0.3);
                transform: rotate(-2deg);
            }

            /* MIDDLE: THREADS */
            .thread-deck {
                display: flex;
                justify-content: center;
                gap: 15px;
                background: rgba(0,0,0,0.2);
                padding: 10px;
                border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.2);
            }
            .spool-slot-container { display: flex; flex-direction: column; align-items: center; gap: 4px; }
            .layer-label { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.8); font-family: 'Lato', sans-serif; }
            
            .spool-slot {
                width: 40px; height: 60px;
                background: #a1887f;
                border-radius: 4px;
                cursor: pointer;
                box-shadow: inset 2px 2px 5px rgba(0,0,0,0.3);
                border: 2px solid transparent;
                display: flex; justify-content: center; align-items: center;
                font-size: 20px; color: rgba(255,255,255,0.3);
            }
            .spool-slot:hover { background: #bcaaa4; border-color: #fff; }

             /* Spool Visual */
            .spool-thread {
                width: 34px; height: 44px;
                border-radius: 3px;
                box-shadow: 2px 2px 5px rgba(0,0,0,0.4);
                position: relative;
            }
            .spool-thread::before, .spool-thread::after {
                content: ''; position: absolute; left: -2px; right: -2px; height: 5px;
                background: #8d6e63; border-radius: 2px;
            }
            .spool-thread::before { top: -3px; }
            .spool-thread::after { bottom: -3px; }

            /* BOTTOM: PRODUCTION */
            .production-deck {
                display: flex;
                align-items: center;
                gap: 15px;
            }

            /* Controls Group */
            .craft-controls {
                flex: 2;
                background: rgba(0,0,0,0.3);
                padding: 10px 20px;
                border-radius: 40px;
                display: flex; flex-direction: column; gap: 8px;
                border: 1px solid rgba(255,255,255,0.1);
            }

            .craft-btn {
                background: #ec407a;
                color: #fff;
                font-family: 'Crimson Pro', serif;
                font-weight: bold; font-size: 1.1rem;
                padding: 8px 0;
                width: 100%;
                border: 2px dashed #fff;
                border-radius: 20px;
                cursor: pointer;
                box-shadow: 0 4px 10px rgba(233, 30, 99, 0.4);
                position: relative;
                transition: 0.2s;
            }
            .craft-btn::before { content: ''; position: absolute; left: 15px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px; background: #333; border-radius: 50%; }
            .craft-btn:disabled { background: #bdbdbd; box-shadow: none; cursor: not-allowed; }
            .craft-btn:not(:disabled):hover { transform: scale(1.02) rotate(-1deg); }

            /* Output Pincushion (RED as requested) */
            .output-container {
                display: flex; flex-direction: column; align-items: center; gap: 4px;
            }
            .output-slot {
                width: 70px; height: 70px;
                /* Pincushion RED */
                background: radial-gradient(circle at 30% 30%, #e57373, #d32f2f);
                border-radius: 50%;
                border: 4px dotted #ffcdd2;
                box-shadow: inset 0 0 10px rgba(0,0,0,0.4), 0 5px 10px rgba(0,0,0,0.3);
                display: flex; justify-content: center; align-items: center;
                transition: 0.3s;
                position: relative;
            }
            /* Item inside overrides background to show item clearly? Or just sits on top? */
            /* We usually put items inside. The item icon will sit on the pincushion. */
        `;

        this.container.innerHTML = `
            <style>${css}</style>
            <div class="sewing-interface">
                <div class="sewing-body">
                    <!-- LEFT COLUMN -->
                    <div class="pattern-book">
                        <div class="book-tabs">
                            <div class="book-tab active" data-tab="0">Base</div>
                            <div class="book-tab" data-tab="1">Pattern</div>
                            <div class="book-tab" data-tab="2">Trim</div>
                            <div class="book-tab" data-tab="3">Detail</div>
                        </div>
                        <div class="pattern-list" id="sewing-pattern-list"></div>
                    </div>

                    <!-- RIGHT COLUMN -->
                    <div class="workstation">
                        <!-- Preview -->
                        <div class="preview-container">
                            <div class="preview-label">Live Preview</div>
                            <canvas id="clothing-canvas" width="300" height="300"></canvas>
                        </div>
                        
                        <!-- Inputs -->
                        <div class="thread-deck">
                           <div class="spool-slot-container">
                                <span class="layer-label">Base</span>
                                <div class="spool-slot" data-slot="0">+</div>
                            </div>
                            <div class="spool-slot-container">
                                <span class="layer-label">Pattern</span>
                                <div class="spool-slot" data-slot="1">+</div>
                            </div>
                            <div class="spool-slot-container">
                                <span class="layer-label">Trim</span>
                                <div class="spool-slot" data-slot="2">+</div>
                            </div>
                            <div class="spool-slot-container">
                                <span class="layer-label">Detail</span>
                                <div class="spool-slot" data-slot="3">+</div>
                            </div>
                        </div>

                        <!-- Production -->
                        <div class="production-deck">
                            <div class="craft-controls">
                                 <!-- Progress Bar -->
                                <div class="crafting-progress-container" id="sewing-progress-container" style="height: 6px; width: 100%; background: rgba(255,255,255,0.3); border-radius: 3px; overflow: hidden; display: none;">
                                    <div class="crafting-progress-fill" id="sewing-progress-fill" style="width: 0%; height: 100%; background: #fff; transition: width 0.2s;"></div>
                                </div>
                                <button class="craft-btn" id="sewing-craft-btn" disabled>Stitch Garment</button>
                            </div>

                            <div class="output-container">
                                <div class="output-slot" id="outputSlot"></div>
                                <div class="output-label" id="outputHint" style="font-family:'Lato'; font-size:9px; color:#fff; text-shadow:0 1px 2px black;">Result</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Cache Elements
        this.dom.list = this.container.querySelector('#sewing-pattern-list');
        this.dom.canvas = this.container.querySelector('#clothing-canvas');
        this.dom.ctx = this.dom.canvas.getContext('2d');
        this.dom.craftBtn = this.container.querySelector('#sewing-craft-btn');
        this.dom.slots = this.container.querySelectorAll('.spool-slot');
        this.dom.tabs = this.container.querySelectorAll('.book-tab');

        // Connect Crafting UI Output & Progress
        this.craftingUI.outputSlot = this.container.querySelector('#outputSlot');
        this.craftingUI.outputHint = this.container.querySelector('#outputHint');
        // Fix: craftingUI expects progressBar to be the fill element that grows
        this.craftingUI.progressBar = this.container.querySelector('#sewing-progress-fill');

        // Events
        this.dom.tabs.forEach((tab, idx) => {
            tab.onclick = () => this.setTab(idx);
        });

        this.dom.slots.forEach((slot, idx) => {
            clickManager.bindElementHandClick(slot, {
                onHandClick: (hand) => this.handleSlotClick(idx, hand)
            });
        });

        this.dom.craftBtn.onclick = () => this.craft();

        // Initial State
        this.setTab(0);
        this.startRenderLoop();
    }

    setTab(idx) {
        this.state.activeTab = idx;
        this.dom.tabs.forEach((el, i) => {
            if (i === idx) el.classList.add('active');
            else el.classList.remove('active');
        });

        this.buildList();
    }

    buildList() {
        this.dom.list.innerHTML = '';

        let items = [];
        if (this.state.activeTab === 0) items = this.bases;
        if (this.state.activeTab === 1) items = this.patterns;
        if (this.state.activeTab === 2) items = this.trims;
        if (this.state.activeTab === 3) items = this.details;

        items.forEach(item => {
            if (this.isMutuallyExcluded(item.id)) return;

            const div = document.createElement('div');
            div.className = 'pattern-item';
            div.dataset.id = item.id;
            div.textContent = item.name;
            div.onclick = () => this.selectItem(item.id);

            if (this.state.selections[this.state.activeTab] === item.id) {
                div.classList.add('selected');
            }

            this.dom.list.appendChild(div);
        });
    }

    isMutuallyExcluded(itemId) {
        if (itemId === 'none') return false;
        for (let i = 1; i <= 3; i++) {
            if (i === this.state.activeTab) continue;
            if (this.state.activeTab === 0) return false;

            if (this.state.selections[i] === itemId) return true;
        }
        return false;
    }

    selectItem(id) {
        this.state.selections[this.state.activeTab] = id;
        this.state.dirty = true;

        if (this.state.activeTab === 0) {
            this.activeBaseObj = this.bases.find(b => b.id === id) || this.bases[0];
            this.updatePatternsForSelectedBase();
        }

        const items = this.dom.list.querySelectorAll('.pattern-item');
        items.forEach(el => {
            if (el.dataset.id === id) el.classList.add('selected');
            else el.classList.remove('selected');
        });

        this.checkCraftability();
    }

    /**
     * Retrieves the currently active base garment object.
     * @optimization Caches reference to avoid O(N) Array.find lookups during 60 FPS canvas rendering.
     * @returns {Object} Active base garment configuration object.
     */
    getActiveBase() {
        const baseId = this.state.selections[0];
        if (this.activeBaseObj && this.activeBaseObj.id === baseId) {
            return this.activeBaseObj;
        }
        this.activeBaseObj = this.bases.find(b => b.id === baseId) || this.bases[0];
        return this.activeBaseObj;
    }

    /**
     * Updates station inventory threads and resets active craft lock state.
     * @param {Array<Object>} inventory - Array of item objects in the station
     */
    updateInventory(inventory) {
        this.isCrafting = false;
        if (this.craftTimeout) {
            clearTimeout(this.craftTimeout);
            this.craftTimeout = null;
        }
        this.inventory = inventory || [];
        this.state.threads = [null, null, null, null];
        this.state.threadItems = [null, null, null, null];

        const threads = this.inventory.filter(i => i.itemId.startsWith('thread_wool_') || i.name.toLowerCase().includes('thread'));

        for (let i = 0; i < 4; i++) {
            if (threads[i]) {
                const thread = threads[i];
                let color = this.extractColor(thread);
                this.state.threads[i] = color;
                this.state.threadItems[i] = thread;
            }
        }

        this.renderSlots();
        this.state.dirty = true;
        this.checkCraftability();
    }

    extractColor(item) {
        if (!item) return '#cccccc';

        // 1. Check for color on item root or customData
        let colorVal = item.color !== undefined ? item.color : (item.customData?.color);

        // 2. Fallback to static item definition in itemData if undefined over socket network
        if (colorVal === undefined && item.itemId && itemData[item.itemId]) {
            colorVal = itemData[item.itemId].color;
        }

        if (colorVal !== undefined) {
            return typeof colorVal === 'number'
                ? '#' + colorVal.toString(16).padStart(6, '0')
                : colorVal;
        }

        // 3. Fallback color matching by item name / ID
        const n = (item.name || item.itemId || '').toLowerCase();
        if (n.includes('red')) return '#d32f2f';
        if (n.includes('blue')) return '#1976d2';
        if (n.includes('green')) return '#388e3c';
        if (n.includes('yellow')) return '#ffff00';
        if (n.includes('black')) return '#000000';
        if (n.includes('white')) return '#ffffff';
        return '#cccccc';
    }

    renderSlots() {
        this.dom.slots.forEach((slot, i) => {
            const color = this.state.threads[i];
            const item = this.state.threadItems[i];

            slot.innerHTML = '';
            if (color && item) {
                const spool = document.createElement('div');
                spool.className = 'spool-thread';
                spool.style.backgroundColor = color;
                slot.appendChild(spool);
                slot.style.borderColor = 'rgba(255,255,255,0.5)';
                slot.title = `${item.name} (L-Click: Left Hand, R-Click: Right Hand)`;
            } else {
                slot.textContent = '+';
                slot.style.borderColor = 'transparent';
                slot.title = "Add Thread (L-Click: Left Hand, R-Click: Right Hand)";
            }
        });
    }

    handleSlotClick(idx, hand = 'left') {
        if (this.state.threadItems[idx]) {
            this.craftingUI.retrieveItem(this.state.threadItems[idx].uid, hand);
        } else {
            this.craftingUI.depositInStation(hand);
        }
    }

    checkCraftability() {
        let valid = true;
        const baseThread = this.state.threadItems[0];
        if (!baseThread) {
            valid = false;
        } else {
            const variant = baseThread.variant || 
                            baseThread.customData?.variant || 
                            itemData[baseThread.itemId]?.variant || 
                            baseThread.itemId;
            if (!variant) valid = false;
        }

        for (let i = 1; i < 4; i++) {
            if (this.state.selections[i] !== 'none' && !this.state.threads[i]) {
                valid = false;
            }
        }

        this.dom.craftBtn.disabled = !valid;
        this.dom.craftBtn.textContent = valid ? "Stitch Garment" : "Add Materials";
        if (valid) this.dom.craftBtn.classList.add('ready');
        else this.dom.craftBtn.classList.remove('ready');
    }

    /**
     * Starts the continuous 60 FPS animation and lerp camera transition loop.
     * @optimization Automatically self-terminates when container is disconnected or module is destroyed.
     */
    startRenderLoop() {
        this.active = true;
        const loop = () => {
            if (!this.active || !this.container || !this.container.isConnected) {
                this.rafId = null;
                return;
            }

            // Update Camera Lerp (Smooth scrolling transition)
            const deltaY = this.camera.targetY - this.camera.currentY;
            const deltaZoom = this.camera.targetZoom - this.camera.currentZoom;
            const isLerping = Math.abs(deltaY) > 0.05 || Math.abs(deltaZoom) > 0.0005;

            if (isLerping) {
                this.camera.currentY += deltaY * this.camera.lerpFactor;
                this.camera.currentZoom += deltaZoom * this.camera.lerpFactor;
                this.state.dirty = true;
            } else {
                this.camera.currentY = this.camera.targetY;
                this.camera.currentZoom = this.camera.targetZoom;
            }

            if (this.state.dirty) {
                this.drawCanvas();
                this.state.dirty = false;
            }

            this.rafId = requestAnimationFrame(loop);
        };
        this.rafId = requestAnimationFrame(loop);
    }

    /**
     * Renders the mannequin body and active garment layers onto the canvas context.
     * @optimization Uses getActiveBase() cached reference for O(1) lookups during rendering.
     */
    drawCanvas() {
        const ctx = this.dom.ctx;
        const w = this.dom.canvas.width;
        const h = this.dom.canvas.height;

        ctx.clearRect(0, 0, w, h);

        ctx.save();
        // Dynamic camera zoom & horizontal centering
        ctx.translate(w / 2, 0);
        ctx.scale(this.camera.currentZoom, this.camera.currentZoom);

        // Dynamic camera Y offset for smooth scrolling focusing by equipSlot
        const mannequinY = this.camera.currentY;
        const clothingY = mannequinY - 40;

        // 1. Draw Mannequin Body
        this.drawSprite('mannequin_00', 0, mannequinY, null);

        // 2. Base
        const baseId = this.state.selections[0];
        const baseThread = this.state.threads[0];
        if (baseId) {
            const baseObj = this.getActiveBase();
            if (baseObj) {
                const textureKey = baseObj.resultItemId;
                const alpha = baseThread ? 1.0 : 0.4;
                const color = baseThread ? baseThread : '#888888';
                this.drawSprite(textureKey, 0, clothingY, color, alpha);
            }
        }

        // 3. Patterns
        for (let i = 1; i <= 3; i++) {
            const sel = this.state.selections[i];
            const thread = this.state.threads[i];

            if (sel && sel !== 'none') {
                const baseObj = this.getActiveBase();
                if (!baseObj) continue;

                const textureKey = `${baseObj.resultItemId}-${sel}`;
                const alpha = thread ? 1.0 : 0.4;
                const color = thread ? thread : '#888888';

                this.drawSprite(textureKey, 0, clothingY, color, alpha);
            }
        }

        ctx.restore();
    }

    drawSprite(key, dx, dy, tintHex, alpha = 1.0) {
        if (!window.game) return;
        if (!window.game.textures.exists(key)) return;

        const texture = window.game.textures.get(key);
        // Correctly handle Spritesheet frames
        const frame = texture.get(0);
        const sourceImage = frame.source.image;

        if (!sourceImage) return;

        const sx = frame.cutX;
        const sy = frame.cutY;
        const sW = frame.width;
        const sH = frame.height;

        const x = -sW / 2 + dx;
        const y = dy;

        if (tintHex) {
            this.dom.ctx.globalAlpha = alpha;
            const tinted = this.getTintedImage(sourceImage, sx, sy, sW, sH, tintHex);
            this.dom.ctx.drawImage(tinted, x, y);
            this.dom.ctx.globalAlpha = 1.0;
        } else {
            this.dom.ctx.globalAlpha = alpha;
            this.dom.ctx.drawImage(sourceImage, sx, sy, sW, sH, x, y, sW, sH);
            this.dom.ctx.globalAlpha = 1.0;
        }
    }

    /**
     * Creates or retrieves a color-tinted offscreen canvas element.
     * @optimization Uses strict Least Recently Used (LRU) single-entry eviction when cache size reaches 50.
     * @param {HTMLImageElement|CanvasImageSource} img - Source image object
     * @param {number} sx - Source crop X coordinate
     * @param {number} sy - Source crop Y coordinate
     * @param {number} w - Source crop width
     * @param {number} h - Source crop height
     * @param {string} colorHex - Hex color string (#RRGGBB)
     * @returns {HTMLCanvasElement} Tinted offscreen canvas element
     */
    getTintedImage(img, sx, sy, w, h, colorHex) {
        const imgSrc = img.src || 'frame';
        const cacheKey = `${imgSrc}:${sx}:${sy}:${w}:${h}:${colorHex}`;

        if (this.textureCache.has(cacheKey)) {
            const cachedCanvas = this.textureCache.get(cacheKey);
            this.textureCache.delete(cacheKey);
            this.textureCache.set(cacheKey, cachedCanvas);
            return cachedCanvas;
        }

        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');

        ctx.fillStyle = colorHex;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);

        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);

        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = colorHex;
        ctx.fillRect(0, 0, c.width, c.height);

        if (this.textureCache.size >= 50) {
            const oldestKey = this.textureCache.keys().next().value;
            this.textureCache.delete(oldestKey);
        }

        this.textureCache.set(cacheKey, c);
        return c;
    }

    /**
     * Dispatches the tailored garment crafting request to the server.
     * @optimization Applies an in-flight craft lock to prevent duplicate socket packet emissions.
     */
    craft() {
        if (this.isCrafting) return;

        let threadCount = 0;
        if (this.state.threads[0]) threadCount++;
        for (let i = 1; i < 4; i++) {
            if (this.state.selections[i] !== 'none' && this.state.threads[i]) {
                threadCount++;
            }
        }
        if (threadCount === 0) return;

        this.isCrafting = true;
        if (this.dom.craftBtn) {
            this.dom.craftBtn.disabled = true;
            this.dom.craftBtn.textContent = "Stitching Garment...";
        }

        if (this.craftTimeout) clearTimeout(this.craftTimeout);
        this.craftTimeout = setTimeout(() => {
            this.isCrafting = false;
            this.checkCraftability();
        }, 10000);

        const recipeId = `sewing_${threadCount}_layer`;
        const selectedBase = this.getActiveBase();
        const targetItemId = selectedBase ? selectedBase.resultItemId : 'shirt_01';

        const customData = {
            itemId: targetItemId,
            name: "Custom " + (selectedBase ? selectedBase.name : "Garment"),
            description: "A custom tailored garment.",
            rendering: { type: 'layered', layers: [] }
        };

        customData.rendering.layers.push({
            texture: targetItemId,
            tint: this.parseColor(this.state.threads[0]),
            color: this.parseColor(this.state.threads[0])
        });

        for (let i = 1; i <= 3; i++) {
            const sel = this.state.selections[i];
            const thread = this.state.threads[i];

            if (sel && sel !== 'none' && thread) {
                customData.rendering.layers.push({
                    texture: `${targetItemId}-${sel}`,
                    tint: this.parseColor(thread),
                    color: this.parseColor(thread)
                });
            }
        }

        customData.icon = 'fa-solid fa-shirt';

        this.craftingUI.socket.emit('craftingStart', {
            stationId: this.craftingUI.currentStationId,
            recipeId: recipeId,
            customCraftingData: customData
        });

        this.craftingUI.startCraftingOptimistic(recipeId, 5000 + (threadCount * 1000));
    }

    /**
     * Parses a hex color string into an integer value for socket serialization.
     * @param {string} hexStr - Color hex string (e.g., '#FF0000' or '0xFF0000')
     * @returns {number} Integer color value (fallback 0xFFFFFF if invalid or NaN)
     */
    parseColor(hexStr) {
        if (!hexStr || typeof hexStr !== 'string') return 0xFFFFFF;
        const cleaned = hexStr.replace(/^#|^0x/, '');
        const parsed = parseInt(cleaned, 16);
        return isNaN(parsed) ? 0xFFFFFF : parsed;
    }
}
