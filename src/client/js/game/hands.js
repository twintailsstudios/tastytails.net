/**
 * @fileoverview src/client/js/game/hands.js - Client-Side Action Hands HUD Manager
 *
 * @description
 * Manages the player's active action hands UI component (left and right hands).
 * Tracks held item states, handles optimistic hand item swapping and active hand toggling,
 * manages item dropping into the game world, and syncs hand slot states with the server snapshot loop.
 *
 * Triggered by:
 * - Game scene initialization (`create.js`)
 * - Server player snapshot updates (`create.js` -> `actionHands.update()`)
 * - User DOM interactions on hand slots (`#leftHandSlot`, `#rightHandSlot`) and drop button (`#drop-btn`)
 */

import itemData from './itemData.js';

export const actionHands = {
    /** @type {'left' | 'right'} Current active hand slot. */
    activeHand: 'right',

    /** @type {Object | null} Item object currently held in the left hand. */
    leftNode: null,

    /** @type {Object | null} Item object currently held in the right hand. */
    rightNode: null,

    /** @type {Object | null} Client Socket.IO instance reference. */
    socket: null,

    /** @type {boolean} Flag tracking listener initialization state. */
    _isInitialized: false,

    /** @type {HTMLElement | null} Cached DOM element for the left hand slot. */
    _cachedLeftSlot: null,

    /** @type {HTMLElement | null} Cached DOM element for the right hand slot. */
    _cachedRightSlot: null,

    /**
     * Initializes socket binding, attaches HUD button listeners, and performs initial render.
     * 
     * @param {Object} socket - Active Socket.IO client instance
     */
    init(socket) {
        // ALWAYS refresh socket reference to ensure reconnection safety
        this.socket = socket;

        // Prevent duplicate listener attachments if already initialized
        if (this._isInitialized) {
            this.render();
            return;
        }

        this.render();

        // Suppress pointer/mouse/touch events on Master Command Bar HUD to prevent canvas movement
        const handsHud = document.getElementById('hands-hud');
        if (handsHud) {
            let hudTimer = null;
            const suppressHudPointer = (e) => {
                window.isPointerDownOnUI = true;
                if (hudTimer) clearTimeout(hudTimer);
                hudTimer = setTimeout(() => {
                    window.isPointerDownOnUI = false;
                }, 150);
            };
            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(evt => {
                handsHud.addEventListener(evt, suppressHudPointer, true);
            });
        }

        const dropBtn = document.getElementById('drop-btn');
        if (dropBtn) {
            // Prevent default browser context menu on right-clicking dropBtn
            dropBtn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
            });

            // Listen to mousedown to differentiate mouse button clicks
            dropBtn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.button === 2) {
                    // Right Click -> Drop Right Hand Item
                    this.dropItem('right');
                    if (window.completeTutorialTask) {
                        window.completeTutorialTask('right_drop');
                    }
                } else if (e.button === 0) {
                    // Left Click -> Drop Left Hand Item
                    this.dropItem('left');
                    if (window.completeTutorialTask) {
                        window.completeTutorialTask('left_drop');
                    }
                }
            });
        }

        this._isInitialized = true;
    },

    /**
     * Toggles active hand selection between 'left' and 'right' with optimistic local rendering.
     */
    toggleActiveHand() {
        console.log('[Client] Toggling active hand (optimistic)');
        this.activeHand = this.activeHand === 'left' ? 'right' : 'left';
        this.render();
        if (this.socket) {
            console.log('[Client] Emitting toggleActiveHand');
            this.socket.emit('toggleActiveHand');
        } else {
            console.warn('[Client] Socket not defined in actionHands!');
        }
    },

    /**
     * Handles slot click events when the player clicks a hand HUD slot.
     * 
     * @param {'left' | 'right'} hand - Clicked hand slot identifier
     * @param {MouseEvent} [e] - Optional DOM event object
     */
    onSlotClick(hand, e) {
        if (e && typeof e.stopPropagation === 'function') {
            e.stopPropagation();
        }
        console.log('Slot clicked:', hand);
        if (hand !== this.activeHand) {
            // Optimistic hand item swap when clicking inactive hand
            if (this.socket) {
                console.log('Emitting swapHandItems');
                this.socket.emit('swapHandItems');
                const temp = this.leftNode;
                this.leftNode = this.rightNode;
                this.rightNode = temp;
                this.render();
            }
        }
    },

    /**
     * Initiates item dropping for the target hand.
     * 
     * @param {'left' | 'right'} [hand] - Hand slot to drop item from (defaults to activeHand)
     */
    dropItem(hand) {
        const scene = window.gameScene;
        if (!scene) {
            console.error('Game Scene not found for Drop Mode');
            return;
        }

        const targetHand = hand || this.activeHand;
        const itemToDrop = targetHand === 'left' ? this.leftNode : this.rightNode;

        if (!itemToDrop) {
            if (window.showToast) window.showToast("Nothing to drop!", "error");
            return;
        }

        // Delegate spatial drop targeting to dropMode module, or fallback to socket emission
        if (window.dropMode) {
            window.dropMode.start(scene, itemToDrop, targetHand);
        } else {
            console.warn('DropMode module not loaded, falling back to instant drop.');
            if (this.socket) this.socket.emit('dropItemClicked', { hand: targetHand });
        }
    },

    /**
     * Generates a composite string key representing item state for dirty checking.
     * 
     * @param {Object | null} item - Item object to fingerprint
     * @returns {string} Composite state key
     */
    getItemFingerprint(item) {
        if (!item) return 'empty';
        const uid = item.uid || item.uniqueId || item.id || '';
        const name = item.name || item.Name || '';
        const icon = item.icon || item.Icon || '';
        const qty = item.quantity || item.Quantity || 1;
        const dur = item.durability || item.Durability || 0;
        return `${uid}:${name}:${icon}:${qty}:${dur}`;
    },

    /**
     * Synchronizes action hand state with incoming server player snapshot payload.
     * 
     * @param {Object} playerInfo - Player snapshot state payload from server tick
     */
    update(playerInfo) {
        if (playerInfo.actionHands) {
            const newActive = playerInfo.actionHands.activeHand;
            const newLeft = playerInfo.actionHands.leftNode;
            const newRight = playerInfo.actionHands.rightNode;

            // OPTIMIZATION: Fingerprint item states to prevent unnecessary DOM re-rendering on every server tick (20-60Hz)
            const isUnchanged =
                this.activeHand === newActive &&
                this.getItemFingerprint(this.leftNode) === this.getItemFingerprint(newLeft) &&
                this.getItemFingerprint(this.rightNode) === this.getItemFingerprint(newRight);

            this.activeHand = newActive;
            this.leftNode = newLeft;
            this.rightNode = newRight;

            if (!isUnchanged) {
                this.render();
            }
        }
    },

    /**
     * Re-renders hand slot DOM elements and applies active styling.
     */
    render() {
        // OPTIMIZATION: Cache DOM slot references with document attachment validation
        if (!this._cachedLeftSlot || !document.body.contains(this._cachedLeftSlot)) {
            this._cachedLeftSlot = document.getElementById('leftHandSlot');
        }
        if (!this._cachedRightSlot || !document.body.contains(this._cachedRightSlot)) {
            this._cachedRightSlot = document.getElementById('rightHandSlot');
        }

        const leftSlot = this._cachedLeftSlot;
        const rightSlot = this._cachedRightSlot;

        if (!leftSlot || !rightSlot) {
            return;
        }

        // Apply active CSS highlight class to active hand slot
        leftSlot.classList.toggle('active', this.activeHand === 'left');
        rightSlot.classList.toggle('active', this.activeHand === 'right');

        // Render Items in hand slots
        this.renderItem(leftSlot, this.leftNode, 'LEFT');
        this.renderItem(rightSlot, this.rightNode, 'RIGHT');
    },

    /**
     * Renders item details, click handlers, context menus, and labels into a hand slot.
     * 
     * @param {HTMLElement} slot - DOM element container for hand slot
     * @param {Object | null} item - Held item object or null
     * @param {'LEFT' | 'RIGHT'} labelText - Display text label for slot
     */
    renderItem(slot, item, labelText) {
        slot.innerHTML = '';

        // Slot click handler
        slot.onclick = () => this.onSlotClick(labelText === 'LEFT' ? 'left' : 'right');

        // Context menu handler for inspecting/using held item
        slot.oncontextmenu = (e) => {
            e.preventDefault();
            if (item) {
                console.log(`[Client] Right-clicked held item: ${item.uid}`);
                if (this.socket) {
                    this.socket.emit('playerRightClicked', {
                        rightClickedList: [{
                            Identifier: 'heldItem',
                            uniqueId: item.uid,
                            name: item.name || item.Name || 'Held Item',
                            description: item.description || item.Description || 'An item you are holding.',
                            slot: labelText === 'LEFT' ? 'left' : 'right'
                        }],
                        playerIntent: 'friendly',
                        pointerX: e.clientX,
                        pointerY: e.clientY
                    });
                }
            }
            return false;
        };

        if (item) {
            const div = document.createElement('div');
            div.className = 'item';

            let iconClass = item.icon || item.Icon || (item.itemId && itemData[item.itemId] ? itemData[item.itemId].icon : null);
            if (!iconClass) iconClass = 'fa-solid fa-box-open';

            if (typeof iconClass === 'string' && (iconClass.includes('fa-') || iconClass.startsWith('fa-'))) {
                const iconElem = document.createElement('i');
                const fullClass = iconClass.includes('fa-') ? (iconClass.includes('fa-solid') ? iconClass : `fa-solid ${iconClass}`) : `fa-solid ${iconClass}`;
                const sanitizedClasses = fullClass.split(/\s+/).filter(cls => /^[a-zA-Z0-9_-]+$/.test(cls));
                iconElem.className = sanitizedClasses.join(' ');
                if (item.color) {
                    iconElem.style.color = '#' + item.color.toString(16).padStart(6, '0');
                }
                div.appendChild(iconElem);
            } else if (iconClass) {
                div.innerText = iconClass;
            } else {
                div.innerText = item.name || item.Name || 'Item';
            }
            slot.appendChild(div);
        }

        if (labelText) {
            const label = document.createElement('span');
            label.className = 'hand-label';
            label.innerText = labelText;
            slot.appendChild(label);
        }
    }
};

// Bind to window object for global inline HTML handler support
window.actionHands = actionHands;
