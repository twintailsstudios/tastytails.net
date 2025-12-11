export const actionHands = {
    activeHand: 'right',
    leftNode: null,
    rightNode: null,
    socket: null,

    init(socket) {
        this.socket = socket;
        this.render();
        console.log('Action Hands Initialized with socket:', this.socket);
    },

    toggleActiveHand() {
        // Optimistic update
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

    onSlotClick(hand) {
        console.log('Slot clicked:', hand);
        if (hand !== this.activeHand) {
            // If clicking the inactive hand, swap
            if (this.socket) {
                console.log('Emitting swapHandItems');
                this.socket.emit('swapHandItems');
                // Optimistic swap?
                const temp = this.leftNode;
                this.leftNode = this.rightNode;
                this.rightNode = temp;
                this.render();
            }
        } else {
            // Clicking active hand
            // Maybe inspect?
        }
    },

    dropItem() {
        if (this.socket) {
            console.log('[Client] Emitting dropItemClicked');
            this.socket.emit('dropItemClicked');
        }
    },

    update(playerInfo) {
        if (playerInfo.actionHands) {
            // console.log('Updating Action Hands:', playerInfo.actionHands);
            this.activeHand = playerInfo.actionHands.activeHand;
            this.leftNode = playerInfo.actionHands.leftNode;
            this.rightNode = playerInfo.actionHands.rightNode;
            this.render();
        }
    },

    render() {
        const leftSlot = document.getElementById('leftHandSlot');
        const rightSlot = document.getElementById('rightHandSlot');
        const toggle = document.getElementById('handToggle');

        if (!leftSlot || !rightSlot) {
            // console.warn('Hands HUD elements not found');
            return;
        }

        // Update Active Class
        if (this.activeHand === 'left') {
            leftSlot.classList.add('active');
            rightSlot.classList.remove('active');
            toggle.classList.add('left');
            toggle.classList.remove('right');
        } else {
            rightSlot.classList.add('active');
            leftSlot.classList.remove('active');
            toggle.classList.remove('left');
            toggle.classList.add('right');
        }

        // Render Items
        this.renderItem(leftSlot, this.leftNode, 'LEFT');
        this.renderItem(rightSlot, this.rightNode, 'RIGHT');
    },

    renderItem(slot, item, labelText) {
        slot.innerHTML = '';
        if (item) {
            const div = document.createElement('div');
            div.className = 'item'; // Changed to match inventory.css
            // Assuming item has Icon property
            // We can use a font awesome icon or sprite if available
            // server-loop.js: spells.push({ Identifier: "spell", Name: "Spell #0", Icon: "scroll2", ... })
            // We can try to match icon name to an image path if we have assets
            if (item.Icon) {
                // display simple text for now or icon name
                // If the icon string looks like a FA class (e.g. 'fa-scroll'), use it
                if (item.Icon.startsWith('fa-')) {
                    div.innerHTML = `<i class="fa-solid ${item.Icon}"></i>`;
                } else {
                    div.innerText = item.Icon;
                }
            } else {
                div.innerText = item.Name || 'Item';
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

// Make global so onclick in HTML works
window.actionHands = actionHands;
