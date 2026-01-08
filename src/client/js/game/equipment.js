
export const equipmentManager = {
    socket: null,

    // Ordered list of slots for rendering
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
        this.renderSlots(); // Render empty slots initially
        console.log('[EquipmentManager] Initialized');
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
            slotDiv.onclick = () => this.onSlotClick(slot.id);

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

        // console.log('[EquipmentManager] Updating slots with:', playerInfo.equipment);

        this.slots.forEach(slot => {
            const item = playerInfo.equipment[slot.id];
            const slotEl = document.getElementById(`equip-slot-${slot.id}`);
            if (!slotEl) {
                console.error(`[EquipmentManager] Slot element #equip-slot-${slot.id} NOT FOUND`);
                return;
            }

            const iconContainer = slotEl.querySelector('.icon-container');
            iconContainer.innerHTML = ''; // Clear current

            if (item) {
                slotEl.classList.add('has-item');
                // Render Icon or Text
                const icon = document.createElement('div');
                icon.className = 'slot-item-icon';
                // display simple text or icon
                icon.innerText = item.name ? item.name.substring(0, 2) : '??';
                // Ideally this would be an image
                iconContainer.appendChild(icon);
            } else {
                slotEl.classList.remove('has-item');
            }
        });
    },

    onSlotClick: function (slotId) {
        console.log('[EquipmentManager] Clicked slot:', slotId);
        if (this.socket) {
            console.log('[EquipmentManager] Emitting equipItemClicked');
            this.socket.emit('equipItemClicked', slotId);
        } else {
            console.error('[EquipmentManager] Socket not initialized!');
        }
    }
};

/**
 * EQUIPMENT_VISUALS Configuration
 * -----------------------------
 * This constant maps specific item textures (e.g. 'shirt') to their visual assets and rendering rules.
 * 
 * Structure:
 * - Key: The 'texture' property value of the item (as stored in the DB/ItemManager).
 * - atlas: The sprite atlas key used for animation (e.g. 'shirt_01'), loaded in preload.js.
 * - slotId: The equipment slot ID where this item belongs. Must match an ID in equipmentManager.slots.
 * - depth: (Optional) Relative z-index depth. Currently unused as layering is largely handled by 
 *          insertion order in player.js or manual sorting in animations.js.
 */
export const EQUIPMENT_VISUALS = {
    'shirt': {
        atlas: 'shirt_01',
        slotId: 'torsoOuter', // Matches equipmentManager.slots
        depth: 10 // Relative z-index
    },
    'shirt_01': {
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
