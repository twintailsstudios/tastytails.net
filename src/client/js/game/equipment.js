import { clickManager } from './clickManager.js';
import { WindowManager } from './utils/WindowManager.js';
import { DockManager } from './utils/DockManager.js';
import itemData from './itemData.js';

export const equipmentManager = {
    socket: null,
    isOpen: false,
    isMinimized: false,

    // Window DOM references
    overlay: null,
    window: null,
    header: null,
    minimizedTab: null,
    dockCountEl: null,

    // Ordered list of slots for rendering
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

    init: function (socket) {
        this.socket = socket;
        this.cacheDOM();
        this.setupWindowControls();
        this.renderSlots();
    },

    cacheDOM: function () {
        this.overlay = document.getElementById('apparel-overlay');
        this.window = document.getElementById('apparel-window');
        this.header = document.getElementById('apparel-header');
        this.minimizedTab = document.getElementById('apparel-minimized-tab');
        this.dockCountEl = document.getElementById('dock-equipped-count');
    },

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
    },

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
    },

    undress: function () {
        if (!this.socket) {
            console.error('[EquipmentManager] Socket not initialized');
            return;
        }
        console.log('[EquipmentManager] Emitting undressClicked');
        this.socket.emit('undressClicked');
    },

    // Initial render of HTML structure for all slots
    renderSlots: function () {
        const container = document.getElementById('equipment-grid');
        if (!container) {
            console.error('[EquipmentManager] Container #equipment-grid NOT FOUND');
            return;
        }

        container.innerHTML = ''; // Clear

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

            container.appendChild(slotDiv);
        });
        console.log('[EquipmentManager] Slots rendered successfully');
    },

    // Update slots with data from server player object
    update: function (playerInfo) {
        if (!playerInfo.equipment) {
            console.warn('[EquipmentManager] No equipment data in playerInfo');
            return;
        }

        let equippedCount = 0;

        this.slots.forEach(slot => {
            const item = playerInfo.equipment[slot.id];
            const slotEl = document.getElementById(`equip-slot-${slot.id}`);
            if (!slotEl) return;

            const iconContainer = slotEl.querySelector('.icon-container');
            iconContainer.innerHTML = ''; // Clear current

            if (item) {
                equippedCount++;
                slotEl.classList.add('has-item');
                // Render Icon or Text
                const icon = document.createElement('div');
                icon.className = 'slot-item-icon';
                if (item.icon && item.icon.startsWith('fa-')) {
                    icon.innerHTML = `<i class="fa-solid ${item.icon}"></i>`;
                } else {
                    icon.innerText = item.name ? item.name.substring(0, 2) : '??';
                }
                slotEl.title = `${item.name || 'Equipped Item'} (L-Click: Left Hand | R-Click: Right Hand)`;
                iconContainer.appendChild(icon);
            } else {
                slotEl.classList.remove('has-item');
                slotEl.title = `${slot.label} (Empty Slot)`;
            }
        });

        // Update Dock Count Badge
        if (this.dockCountEl) {
            this.dockCountEl.textContent = equippedCount;
        }
    },

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

