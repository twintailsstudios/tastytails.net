/**
 * @fileoverview ChatContextMenu.js - Client-Side Chat Context Menu Manager
 * 
 * @description
 * Manages contextual interaction menus for chat messages (the "Three Dots" menu).
 * Handles edit/delete triggers, spoiler label tagging, emoji reaction picker,
 * revealable spoiler toggles, and deletion confirmation dialogs.
 * 
 * Triggered by: Delegated DOM click events on #messages container.
 */
class ChatContextMenu {
    /**
     * Creates an instance of ChatContextMenu.
     * @param {Object} chatNetwork - Network client for sending socket events.
     * @param {Object} chatSystem - Master chat system coordinator.
     */
    constructor(chatNetwork, chatSystem) {
        this.network = chatNetwork;
        this.chatSystem = chatSystem;
        this.activeCloseListener = null;
        this.bindEvents();
    }

    /**
     * Binds event delegation listener to the #messages container.
     */
    bindEvents() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            // OPTIMIZATION: Event delegation on #messages handles dynamic chat bubble clicks without memory leaks
            messagesContainer.addEventListener('click', (e) => this.handleClick(e));
        }
    }

    /**
     * Closes and cleans up active context menus and unbinds outside-click event listeners.
     * OPTIMIZATION: Prevents memory leaks by ensuring document click listeners are explicitly removed.
     */
    closeActiveMenu() {
        if (this.activeCloseListener) {
            document.removeEventListener('click', this.activeCloseListener);
            this.activeCloseListener = null;
        }
        document.querySelectorAll('.msg-settings-menu').forEach(el => el.remove());
    }

    /**
     * Main event delegation router for message clicks.
     * @param {Event} e - The DOM click event.
     */
    handleClick(e) {
        // 1. Spoiler Clicks (Reveal/Hide)
        const spoilerContainer = e.target.closest('.spoiled-content');
        if (spoilerContainer && !e.target.closest('.message-content.editing')) {
            spoilerContainer.classList.toggle('revealed');
            return;
        }

        // 2. Settings/Edit Button (The vertical dots / hamburger icon)
        const settingsBtn = e.target.closest('[data-dropdown-button]');
        if (settingsBtn) {
            e.stopPropagation();
            const msgId = settingsBtn.getAttribute('data-id');
            const senderId = settingsBtn.getAttribute('data-sender-id');
            const msgEl = document.getElementById(msgId);
            if (!msgEl) return;
            const contentEl = msgEl.querySelector('.message-content');
            const spoilerEl = msgEl.querySelector('[data-spoiler-type]');

            this.createMenu(e.clientX, e.clientY, msgId, senderId, contentEl, spoilerEl);
        }

        // 3. Reaction Toggle (Clicking an existing pill)
        const reactionToggle = e.target.closest('[data-reaction-toggle]');
        if (reactionToggle) {
            e.stopPropagation();
            const msgId = reactionToggle.getAttribute('data-msg-id');
            const reaction = reactionToggle.getAttribute('data-reaction-toggle');
            this.network.toggleReaction({
                _id: msgId,
                reaction: reaction,
                token: this.chatSystem.getToken(),
                charId: this.chatSystem.getCharId()
            });
        }

        // 4. Add Reaction Shortcut (Plus Icon)
        const addReactionBtn = e.target.closest('.add-reaction-btn');
        if (addReactionBtn) {
            e.stopPropagation();
            const msgId = addReactionBtn.getAttribute('data-msg-id');
            this.showReactionOptions(addReactionBtn, msgId);
        }
    }

    /**
     * Renders and positions the main floating context menu.
     * OPTIMIZATION: Uses visibility:hidden during measurement to calculate layout in a single frame without flicker.
     * @param {number} x - Mouse click X position.
     * @param {number} y - Mouse click Y position.
     * @param {string} msgId - Target message ID.
     * @param {string} senderId - Message sender character ID.
     * @param {HTMLElement} contentEl - Message content container element.
     * @param {HTMLElement} spoilerEl - Spoiler attribute container element.
     */
    createMenu(x, y, msgId, senderId, contentEl, spoilerEl) {
        this.closeActiveMenu();

        const menu = document.createElement('div');
        menu.className = 'msg-settings-menu';
        menu.style.position = 'fixed';
        menu.style.visibility = 'hidden';

        const myCharId = this.chatSystem.getCharId();
        const isMyMessage = (senderId === myCharId);

        let html = '';
        if (isMyMessage) {
            html += `<div class="msg-settings-option" data-action="edit">Edit</div>`;
            html += `<div class="msg-settings-option" data-action="delete">Delete</div>`;
        }
        html += `<div class="msg-settings-option" data-action="spoiler">Edit Spoiler</div>`;
        html += `<div class="msg-settings-option" data-action="reaction">Add Reaction</div>`;

        menu.innerHTML = html;
        document.body.appendChild(menu);

        // Single-frame bounds calculation to prevent layout thrashing
        const rect = menu.getBoundingClientRect();
        const finalX = (x + rect.width > window.innerWidth) ? (x - rect.width) : x;
        const finalY = (y + rect.height > window.innerHeight) ? (y - rect.height) : y;
        menu.style.left = `${finalX}px`;
        menu.style.top = `${finalY}px`;
        menu.style.visibility = 'visible';

        menu.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'edit' && contentEl) this.chatSystem.input.startEditing(msgId, contentEl.innerHTML);
            if (action === 'delete') this.confirmDelete(msgId);
            if (action === 'spoiler') this.showSpoilerOptions(e.target, msgId, spoilerEl);
            if (action === 'reaction') this.showReactionOptions(e.target, msgId);

            if (action !== 'spoiler' && action !== 'reaction') this.closeActiveMenu();
        });

        // Close on click outside (deferred to allow event propagation)
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    this.closeActiveMenu();
                }
            };
            this.activeCloseListener = closeMenu;
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    /**
     * Renders a modal confirmation dialog before deleting a message.
     * @param {string} msgId - Target message ID to delete.
     */
    confirmDelete(msgId) {
        const chatHolder = document.querySelector('.chat-holder');
        if (!chatHolder) return;

        // Clean up any existing deletion dialogue boxes
        chatHolder.querySelectorAll('.dialogueBox').forEach(el => el.remove());

        const dialogue = document.createElement('div');
        dialogue.className = 'dialogueBox';
        dialogue.innerHTML = `
            <h2>Delete This Message?</h2>
            <div>This action cannot be undone.</div>
            <button id="cancelDelete">Cancel</button>
            <button id="confirmDelete">Delete</button>
        `;
        chatHolder.appendChild(dialogue);

        dialogue.querySelector('#cancelDelete').onclick = () => dialogue.remove();
        dialogue.querySelector('#confirmDelete').onclick = () => {
            this.network.deleteMessage({
                _id: msgId,
                token: this.chatSystem.getToken(),
                charId: this.chatSystem.getCharId()
            });
            dialogue.remove();
        };
    }

    /**
     * Renders a generic sub-menu attached to a parent option element.
     * @param {HTMLElement} targetEl - The parent option element.
     * @param {Array<{html: string, value: string}>} items - List of option items to render.
     * @param {string} className - Additional CSS class name for the sub-menu.
     * @param {Function} onSelect - Selection callback taking the chosen value.
     */
    renderSubMenu(targetEl, items, className, onSelect) {
        if (targetEl.querySelector(`.${className}`)) return;

        const list = document.createElement('div');
        list.className = `msg-settings-menu ${className}`;
        targetEl.style.position = 'relative';

        items.forEach(opt => {
            const item = document.createElement('div');
            item.className = opt.className || 'msg-settings-option';
            item.innerHTML = opt.html;

            item.onclick = (e) => {
                e.stopPropagation();
                onSelect(opt.value);
                this.closeActiveMenu();
            };
            list.appendChild(item);
        });

        targetEl.appendChild(list);

        // Position sub-menu relative to viewport
        const rect = list.getBoundingClientRect();
        if (rect.right > window.innerWidth) { list.style.left = 'auto'; list.style.right = '100%'; }
        if (rect.bottom > window.innerHeight) { list.style.top = 'auto'; list.style.bottom = '0'; }
    }

    /**
     * Renders a sub-menu for choosing a spoiler category tag.
     * @param {HTMLElement} targetEl - Target option node.
     * @param {string} msgId - Target message ID.
     * @param {HTMLElement} spoilerEl - Element carrying data-spoiler-type.
     */
    showSpoilerOptions(targetEl, msgId, spoilerEl) {
        const currentStatus = spoilerEl ? spoilerEl.getAttribute('data-spoiler-type') : 'none';
        const options = ['general', 'watersports', 'disposal', 'gore', 'none'];

        const items = options.map(opt => {
            const label = opt.charAt(0).toUpperCase() + opt.slice(1);
            const isSelected = currentStatus === opt;
            const icon = isSelected ? '<i class="fas fa-check" style="margin-right: 8px; color: var(--gold);"></i>' : '<span style="display:inline-block; width:20px;"></span>';
            return {
                html: `${icon}${label}`,
                value: opt
            };
        });

        this.renderSubMenu(targetEl, items, 'spoiler-sub-menu', (spoiler) => {
            this.network.sendSpoilerEdit({
                _id: msgId,
                spoiler: spoiler,
                token: this.chatSystem.getToken(),
                charId: this.chatSystem.getCharId()
            });
        });
    }

    /**
     * Renders a sub-menu for choosing an emoji reaction.
     * @param {HTMLElement} targetEl - Target option node.
     * @param {string} msgId - Target message ID.
     */
    showReactionOptions(targetEl, msgId) {
        const reactionMap = (window.ChatMessage && window.ChatMessage.REACTION_MAP) || { heart: '❤️', blush: '😳', laugh: '😂', thumbsup: '👍', thumbsdown: '👎' };
        const options = Object.keys(reactionMap);

        const items = options.map(opt => ({
            html: `${reactionMap[opt]} ${opt.charAt(0).toUpperCase() + opt.slice(1)}`,
            value: opt,
            className: 'msg-settings-option reaction-menu-option'
        }));

        this.renderSubMenu(targetEl, items, 'reaction-sub-menu', (reaction) => {
            this.network.toggleReaction({
                _id: msgId,
                reaction: reaction,
                token: this.chatSystem.getToken(),
                charId: this.chatSystem.getCharId()
            });
        });
    }
}

window.ChatContextMenu = ChatContextMenu;
