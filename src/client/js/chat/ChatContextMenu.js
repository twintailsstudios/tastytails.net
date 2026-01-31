/**
 * ChatContextMenu.js
 * 
 * Manages the contextual interactions for chat messages (the "Three Dots" menu).
 * Handles:
 * - Opening the settings menu (Edit/Delete/Spoiler/Reactions)
 * - Toggling spoiler visibility (Click to reveal)
 * - Rendering sub-menus for spoiler types and reactions
 * - Confirmation dialogues for deletion
 */
class ChatContextMenu {
    constructor(chatNetwork, chatSystem) {
        this.network = chatNetwork;
        this.chatSystem = chatSystem;
        this.bindEvents();
    }

    bindEvents() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            // Uses event delegation for all message clicks
            messagesContainer.addEventListener('click', (e) => this.handleClick(e));
        }
    }

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
     * Renders the main floating context menu.
     */
    createMenu(x, y, msgId, senderId, contentEl, spoilerEl) {
        // Remove existing if any
        document.querySelectorAll('.msg-settings-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'msg-settings-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

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

        // Bounds check to keep within viewport
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = `${x - rect.width}px`;
        if (rect.bottom > window.innerHeight) menu.style.top = `${y - rect.height}px`;

        menu.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'edit') this.chatSystem.input.startEditing(msgId, contentEl.innerHTML);
            if (action === 'delete') this.confirmDelete(msgId);
            if (action === 'spoiler') this.showSpoilerOptions(e.target, msgId, spoilerEl);
            if (action === 'reaction') this.showReactionOptions(e.target, msgId);

            if (action !== 'spoiler' && action !== 'reaction') menu.remove();
        });

        // Close on click outside (deferred)
        setTimeout(() => {
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            document.addEventListener('click', closeMenu);
        }, 0);
    }

    confirmDelete(msgId) {
        const dialogue = document.createElement('div');
        dialogue.className = 'dialogueBox';
        dialogue.innerHTML = `
            <h2>Delete This Message?</h2>
            <div>This action cannot be undone.</div>
            <button id="cancelDelete">Cancel</button>
            <button id="confirmDelete">Delete</button>
        `;
        document.querySelector('.chat-holder').appendChild(dialogue);

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
     * Renders a sub-menu for choosing a spoiler type.
     */
    showSpoilerOptions(targetEl, msgId, spoilerEl) {
        if (targetEl.querySelector('.spoiler-sub-menu')) return;

        const currentStatus = spoilerEl ? spoilerEl.getAttribute('data-spoiler-type') : 'none';
        const options = ['general', 'watersports', 'disposal', 'gore', 'none'];

        const list = document.createElement('div');
        list.className = 'msg-settings-menu spoiler-sub-menu';
        targetEl.style.position = 'relative';

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'msg-settings-option';

            const label = opt.charAt(0).toUpperCase() + opt.slice(1);
            const isSelected = currentStatus === opt;
            const icon = isSelected ? '<i class="fas fa-check" style="margin-right: 8px; color: var(--gold);"></i>' : '<span style="display:inline-block; width:20px;"></span>';

            item.innerHTML = `${icon}${label}`;
            item.onclick = (e) => {
                e.stopPropagation();
                this.network.sendSpoilerEdit({
                    _id: msgId,
                    spoiler: opt,
                    token: this.chatSystem.getToken(),
                    charId: this.chatSystem.getCharId()
                });
                targetEl.closest('.msg-settings-menu').remove();
            };
            list.appendChild(item);
        });

        targetEl.appendChild(list);

        // Bounds
        const rect = list.getBoundingClientRect();
        if (rect.right > window.innerWidth) { list.style.left = 'auto'; list.style.right = '100%'; }
        if (rect.bottom > window.innerHeight) { list.style.top = 'auto'; list.style.bottom = '0'; }
    }

    /**
     * Renders a sub-menu for adding reactions.
     */
    showReactionOptions(targetEl, msgId) {
        if (targetEl.querySelector('.reaction-sub-menu')) return;

        const options = ['heart', 'blush', 'laugh', 'thumbsup', 'thumbsdown'];
        const reactionMap = { heart: '❤️', blush: '😳', laugh: '😂', thumbsup: '👍', thumbsdown: '👎' };

        const list = document.createElement('div');
        list.className = 'msg-settings-menu reaction-sub-menu';
        targetEl.style.position = 'relative';

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'msg-settings-option reaction-menu-option';
            item.innerHTML = `${reactionMap[opt]} ${opt.charAt(0).toUpperCase() + opt.slice(1)}`;

            item.onclick = (e) => {
                e.stopPropagation();
                this.network.toggleReaction({
                    _id: msgId,
                    reaction: opt,
                    token: this.chatSystem.getToken(),
                    charId: this.chatSystem.getCharId()
                });
                list.remove();
            };
            list.appendChild(item);
        });

        targetEl.appendChild(list);

        // Bounds
        const rect = list.getBoundingClientRect();
        if (rect.right > window.innerWidth) { list.style.left = 'auto'; list.style.right = '100%'; }
        if (rect.bottom > window.innerHeight) { list.style.top = 'auto'; list.style.bottom = '0'; }
    }
}

window.ChatContextMenu = ChatContextMenu;
