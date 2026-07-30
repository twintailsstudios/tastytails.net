/**
 * @fileoverview equipment.js - Client Apparel & Equipment Fitting Doll Manager
 *
 * @description
 * Manages the interactive client-side Apparel & Equipment window UI, paper doll slots,
 * window control lifecycle (drag/resize via WindowManager, docking via DockManager),
 * dual-hand item clicks via clickManager, and server socket event emissions.
 * Also builds and exports `EQUIPMENT_VISUALS` which maps equipment textures to slot IDs and
 * depth layers consumed by player.js during 2D avatar rendering.
 *
 * Triggers:
 * - Game Scene Initialization (`create.js` -> `equipmentManager.init(socket)`)
 * - Network Player State Updates (`create.js` -> `equipmentManager.update(playerInfo)`)
 * - Side Navigation Apparel Tab (`tabs.js` -> `window.equipmentManager.open()`)
 * - Paper Doll Slot Clicks (`onSlotClick(slotId, hand)`) -> Emits `equipItemClicked` socket message
 */

import { clickManager } from './clickManager.js';
import { WindowManager } from './utils/WindowManager.js';
import { DockManager } from './utils/DockManager.js';
import itemData from './itemData.js';

export const equipmentManager = {
    /** @type {Object|null} Socket.io client instance connection */
    socket: null,
    /** @type {boolean} Modal window open state */
    isOpen: false,
    /** @type {boolean} Dock bar minimized state */
    isMinimized: false,

    // OPTIMIZATION: Local state caching properties to prevent DOM thrashing
    /** @type {Object|null} Cached player object reference from last server packet */
    _lastPlayerInfo: null,
    /** @type {boolean} Dirty state flag indicating pending DOM slot updates while hidden */
    _isDirty: false,
    /** @type {Object.<string, {slotEl: HTMLElement, iconContainer: HTMLElement}>} Cached slot DOM node pointers */
    slotDOMCache: {},

    // Window DOM references
    overlay: null,
    window: null,
    header: null,
    minimizedTab: null,
    dockCountEl: null,

    /**
     * Ordered list of paper doll equipment slots for UI grid rendering.
     * Maps to CSS grid area identifiers via `data-slot` attribute.
     */
    slots: [
        { id: 'hair', label: 'Hair', icon: 'fa-ribbon' },
        { id: 'leftEar', label: 'L Ear', icon: 'fa-circle-dot' },
        { id: 'head', label: 'Head', icon: 'fa-hat-wizard' },
        { id: 'rightEar', label: 'R Ear', icon: 'fa-circle-dot' },

        { id: 'neck', label: 'Neck', icon: 'fa-gem' },
        { id: 'back', label: 'Back', icon: 'fa-shield-halved' },

        { id: 'leftWrist', label: 'L Wrist', icon: 'fa-ring' },
        { id: 'torsoInner', label: 'In Torso', icon: 'fa-vest' },
        { id: 'torsoOuter', label: 'Out Torso', icon: 'fa-shirt' },
        { id: 'rightWrist', label: 'R Wrist', icon: 'fa-ring' },

        { id: 'leftHand', label: 'L Hand', icon: 'fa-mitten' },
        { id: 'belt', label: 'Belt', icon: 'fa-grip-lines' },
        { id: 'underwear', label: 'Undies', icon: 'fa-heart' },
        { id: 'rightHand', label: 'R Hand', icon: 'fa-hand-fist' },

        { id: 'legs', label: 'Legs', icon: 'fa-socks' },
        { id: 'feet', label: 'Feet', icon: 'fa-shoe-prints' },

        { id: 'tailBase', label: 'Tail Base', icon: 'fa-link' },
        { id: 'tailTip', label: 'Tail Tip', icon: 'fa-feather' }
    ],

    /**
     * Initializes the Equipment Manager on game scene creation.
     * @param {Object} socket - Active Socket.io connection
     */
    init: function (socket) {
        this.socket = socket;
        this.cacheDOM();
        this.setupWindowControls();
        this.renderSlots();
    },

    /**
     * Caches primary window DOM references.
     */
    cacheDOM: function () {
        this.overlay = document.getElementById('apparel-overlay');
        this.window = document.getElementById('apparel-window');
        this.header = document.getElementById('apparel-header');
        this.minimizedTab = document.getElementById('apparel-minimized-tab');
        this.dockCountEl = document.getElementById('dock-equipped-count');
    },

    /**
     * Configures WindowManager drag/resize behavior, DockManager registration,
     * pointer event suppression, and control button listeners.
     */
    setupWindowControls: function () {
        if (!this.window || !this.header) return;

        // Register minimized tab with DockManager
        if (this.minimizedTab) {
            DockManager.register(this.minimizedTab, 'left');
        }

        // Shared WindowManager for Drag & Resize
        WindowManager.makeDraggable(this.window, this.header);

        const handles = {
            r: this.window.querySelector('.resize-handle.right'),
            b: this.window.querySelector('.resize-handle.bottom'),
            br: this.window.querySelector('.resize-handle.br'),
            l: this.window.querySelector('.resize-handle.left'),
            t: this.window.querySelector('.resize-handle.top')
        };
        WindowManager.makeResizable(this.window, handles, { minWidth: 580, minHeight: 700 });

        // Prevent pointer clicks on window from propagating to Phaser game world
        const stopProp = (e) => e.stopPropagation();
        ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
            this.window.addEventListener(evt, stopProp);
            if (this.minimizedTab) this.minimizedTab.addEventListener(evt, stopProp);
        });

        // Close & Minimize Button Handlers
        const closeBtn = document.getElementById('apparel-btn-close');
        if (closeBtn) closeBtn.onclick = () => this.close();

        const minimizeBtn = document.getElementById('apparel-btn-minimize');
        if (minimizeBtn) minimizeBtn.onclick = () => this.minimize();

        const restoreBtn = document.getElementById('apparel-tab-restore');
        if (restoreBtn) restoreBtn.onclick = () => this.restore();
        if (this.minimizedTab) {
            this.minimizedTab.onclick = () => {
                if (this.minimizedTab.dataset.isDragging !== 'true') {
                    this.restore();
                }
            };
        }

        // Re-open button from side menu tab
        const reopenBtn = document.getElementById('reopenApparelWindowBtn');
        if (reopenBtn) reopenBtn.onclick = () => this.open();

        // Undress Quick Action Button
        const undressBtn = document.getElementById('apparel-btn-undress');
        if (undressBtn) undressBtn.onclick = () => this.undress();
    },

    /**
     * Toggles the modal window state between open, minimized, and closed.
     */
    toggle: function () {
        if (this.isOpen) {
            if (this.isMinimized) {
                this.restore();
            } else {
                this.close();
            }
        } else {
            this.open();
        }
    },

    /**
     * Opens the Apparel window overlay and brings it to front.
     * Flushes pending state updates if marked dirty while hidden.
     */
    open: function () {
        this.isOpen = true;
        this.isMinimized = false;

        if (this.window && this.overlay && this.window.parentElement !== this.overlay) {
            this.overlay.appendChild(this.window);
        }

        if (this.overlay) {
            this.overlay.style.display = 'flex';
            this.overlay.classList.add('active');
        }
        if (this.window) {
            delete this.window.dataset.hasBeenDragged;
            this.window.style.position = '';
            this.window.style.left = '';
            this.window.style.top = '';
            this.window.style.transform = '';
            this.window.style.margin = '';
            this.window.style.display = '';
        }
        if (this.minimizedTab) {
            this.minimizedTab.style.display = 'none';
        }

        WindowManager.bringToFront(this.window);

        // OPTIMIZATION: Auto-flush DOM update when opening if state changed while hidden
        if (this._isDirty && this._lastPlayerInfo) {
            this.forceUpdate(this._lastPlayerInfo);
        }
    },

    /**
     * Closes the Apparel window modal overlay.
     */
    close: function () {
        this.isOpen = false;
        this.isMinimized = false;

        if (this.window && this.overlay && this.window.parentElement !== this.overlay) {
            this.overlay.appendChild(this.window);
        }

        if (this.overlay) {
            this.overlay.style.display = 'none';
            this.overlay.classList.remove('active');
        }
        if (this.window) {
            this.window.style.display = 'none';
        }
        if (this.minimizedTab) {
            this.minimizedTab.style.display = 'none';
        }
    },

    /**
     * Minimizes the Apparel window into the floating left dock tab.
     */
    minimize: function () {
        if (!this.isOpen) return;
        this.isMinimized = true;

        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
        if (this.window) {
            this.window.style.display = 'none';
        }
        if (this.minimizedTab) {
            this.minimizedTab.style.display = 'flex';
            DockManager.updateLayout();
        }
    },

    /**
     * Restores the window from minimized state to full overlay display.
     */
    restore: function () {
        this.isOpen = true;
        this.isMinimized = false;

        if (this.overlay) {
            this.overlay.style.display = 'flex';
        }
        if (this.window) {
            this.window.style.display = '';
        }
        if (this.minimizedTab) {
            this.minimizedTab.style.display = 'none';
        }
        WindowManager.bringToFront(this.window);

        // OPTIMIZATION: Auto-flush DOM update when restoring if state changed while minimized
        if (this._isDirty && this._lastPlayerInfo) {
            this.forceUpdate(this._lastPlayerInfo);
        }
    },

    /**
     * Emits `undressClicked` socket message to clear all equipped items.
     */
    undress: function () {
        if (!this.socket) {
            console.error('[EquipmentManager] Socket not initialized');
            return;
        }
        console.log('[EquipmentManager] Emitting undressClicked');
        this.socket.emit('undressClicked');
    },

    /**
     * Renders initial HTML slot grid nodes and caches element pointers in `slotDOMCache`.
     */
    renderSlots: function () {
        const container = document.getElementById('equipment-grid');
        if (!container) {
            console.error('[EquipmentManager] Container #equipment-grid NOT FOUND');
            return;
        }

        // OPTIMIZATION: Fast DOM purge avoiding innerHTML HTML parser
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        this.slotDOMCache = {};

        this.slots.forEach(slot => {
            const slotDiv = document.createElement('div');
            slotDiv.className = 'equip-slot';
            slotDiv.id = `equip-slot-${slot.id}`;
            slotDiv.dataset.slot = slot.id; // Vital for CSS Grid positioning

            // Unified Hand Click Handler for Equipment Slots (Left Click = Left Hand, Right Click = Right Hand)
            clickManager.bindElementHandClick(slotDiv, {
                onHandClick: (hand) => this.onSlotClick(slot.id, hand)
            });

            // Visual Decoration: Add a "link" icon between tail parts
            if (slot.id === 'tailBase') {
                const link = document.createElement('i');
                link.className = 'fa-solid fa-link tail-link-icon';
                slotDiv.appendChild(link);
            }

            // Placeholder Ghost Icon
            const ghost = document.createElement('i');
            ghost.className = `fa-solid ${slot.icon} ghost-icon`;
            slotDiv.appendChild(ghost);

            // Metal Plaque Label
            const label = document.createElement('div');
            label.className = 'slot-label';
            label.innerText = slot.label;
            slotDiv.appendChild(label);

            // Icon Container (populated in update)
            const iconContainer = document.createElement('div');
            iconContainer.className = 'icon-container';
            slotDiv.appendChild(iconContainer);

            // OPTIMIZATION: Cache DOM node pointers to avoid querying DOM during update broadcasts
            this.slotDOMCache[slot.id] = {
                slotEl: slotDiv,
                iconContainer: iconContainer
            };

            container.appendChild(slotDiv);
        });
        console.log('[EquipmentManager] Slots rendered successfully');
    },

    /**
     * Updates paper doll slots with new data from server player payload.
     * Defer execution if window is hidden to prevent UI thread thrashing.
     * @param {Object} playerInfo - Server player state payload containing `equipment` object
     */
    update: function (playerInfo) {
        if (!playerInfo || !playerInfo.equipment) {
            console.warn('[EquipmentManager] No equipment data in playerInfo');
            return;
        }

        this._lastPlayerInfo = playerInfo;

        // OPTIMIZATION: Skip DOM mutations when window is closed and not docked
        if (!this.isOpen && !this.isMinimized) {
            this._isDirty = true;
            return;
        }

        this.forceUpdate(playerInfo);
    },

    /**
     * Executes DOM slot updates using cached DOM element pointers.
     * @param {Object} playerInfo - Server player state payload
     */
    forceUpdate: function (playerInfo) {
        this._isDirty = false;
        let equippedCount = 0;

        // Self-healing: Re-render slots if cache is empty or detached from DOM
        const firstSlotCache = this.slots[0] ? this.slotDOMCache[this.slots[0].id] : null;
        if (!firstSlotCache || !firstSlotCache.slotEl || !firstSlotCache.slotEl.isConnected) {
            this.renderSlots();
        }

        this.slots.forEach(slot => {
            const item = playerInfo.equipment ? playerInfo.equipment[slot.id] : null;
            const cached = this.slotDOMCache[slot.id];
            if (!cached) return;

            const { slotEl, iconContainer } = cached;

            // Fast DOM purge
            while (iconContainer.firstChild) {
                iconContainer.removeChild(iconContainer.firstChild);
            }

            if (item) {
                equippedCount++;
                slotEl.classList.add('has-item');
                const icon = document.createElement('div');
                icon.className = 'slot-item-icon';

                let iconClass = item.icon || (item.itemId && itemData[item.itemId] ? itemData[item.itemId].icon : null);
                if (!iconClass) iconClass = 'fa-solid fa-box-open';

                const fullClass = iconClass.includes('fa-') ? (iconClass.includes('fa-solid') ? iconClass : `fa-solid ${iconClass}`) : `fa-solid ${iconClass}`;
                const iEl = document.createElement('i');
                iEl.className = fullClass;
                if (item.color) {
                    iEl.style.color = '#' + item.color.toString(16).padStart(6, '0');
                }
                icon.appendChild(iEl);
                slotEl.title = `${item.name || 'Equipped Item'} (L-Click: Left Hand | R-Click: Right Hand)`;
                iconContainer.appendChild(icon);
            } else {
                slotEl.classList.remove('has-item');
                slotEl.title = `${slot.label} (Empty Slot)`;
            }
        });

        if (this.dockCountEl) {
            this.dockCountEl.textContent = equippedCount;
        }
    },

    /**
     * Slot click handler emitting equipItemClicked socket message.
     * @param {string} slotId - Identifier of clicked equipment slot
     * @param {string} hand - Target hand ('left' or 'right')
     */
    onSlotClick: function (slotId, hand = 'left') {
        console.log('[EquipmentManager] Clicked slot:', slotId, 'Hand:', hand);
        if (this.socket) {
            this.socket.emit('equipItemClicked', { slotId: slotId, hand: hand });
        } else {
            console.error('[EquipmentManager] Socket not initialized!');
        }
    }
};

/**
 * EQUIPMENT_VISUALS Configuration
 * Maps item textures / itemIds to equipment slot IDs and depth layering for 2D avatar rendering.
 */
const baseVisuals = {
    'shirt': {
        atlas: 'shirt_01',
        slotId: 'torsoOuter',
        depth: 10
    },
    'pants': {
        atlas: 'pants_01',
        slotId: 'legs',
        depth: 5
    }
};

// Dynamically populate from itemData
Object.values(itemData).forEach(item => {
    if (item.equipSlot && (item.texture || item.itemId)) {
        const tex = item.texture || item.itemId;
        const depth = item.depth || (item.equipSlot === 'legs' ? 5 : 10);
        baseVisuals[tex] = {
            atlas: tex,
            slotId: item.equipSlot,
            depth: depth
        };
        baseVisuals[item.itemId] = baseVisuals[tex];
    }
});

export const EQUIPMENT_VISUALS = baseVisuals;
window.equipmentManager = equipmentManager;
