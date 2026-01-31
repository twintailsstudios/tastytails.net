/**
 * ChatSystem.js
 * 
 * The central orchestrator for the game's chat functionality.
 * This class initializes all sub-modules (UI, Network, Input, etc.) and acts as the
 * primary hub for data flow between them. It delegates specific tasks to specialized
 * classes while maintaining the core state and initialization logic.
 */
class ChatSystem {
    /**
     * @param {Object} socket - The socket.io client instance for network communication.
     */
    constructor(socket) {
        this.socket = socket;

        // Initialize Modules
        // Formatter: Static helper for text/time formatting
        this.formatter = ChatFormatter;

        // UI: Handles all DOM manipulation and rendering logic
        this.ui = new ChatUI(this.formatter);

        // Network: Handles all server emission and listener bindings
        this.network = new ChatNetwork(this.socket, this);

        // Input: Handles the text area, typing status, and message submission
        this.input = new ChatInput(this.network, this);

        // ContextMenu: Handles right-click options on messages
        this.contextMenu = new ChatContextMenu(this.network, this);

        // MessageRenderer: Helper class to generate HTML from message objects
        this.messageRenderer = new ChatMessage();

        // Initialize Custom Selects (Legacy UI component for dropdowns)
        this.initCustomSelects();

        // Listen for internal events (e.g., Infinite Scroll triggers)
        window.addEventListener('requestOlderChats', (e) => {
            this.network.getOlderChats({
                beforeTime: e.detail.timestamp,
                token: this.getToken(),
                charId: this.getCharId()
            });
        });

        // Initialize Global Helpers that depend on `this` instance
        // Exposed for access by other game scripts (e.g., main game loop)
        window.chatSystem = this;
    }

    // --- Data Access ---

    /**
     * Retrieves the authentication token from cookies.
     * @returns {string} The Auth Token
     */
    getToken() {
        const match = document.cookie.match(new RegExp('(^| )TastyTails=([^;]+)'));
        if (match) return match[2];
        return '';
    }

    /**
     * Retrieves the current character ID based on global state or URL.
     * @returns {string} Character ID
     */
    getCharId() {
        if (typeof localPlayerInfo !== 'undefined' && localPlayerInfo._id) {
            return localPlayerInfo._id;
        }
        // Fallback for character ID extraction from URL if global global var missing
        const parts = document.location.href.split('play/');
        return parts.length > 1 ? parts[1].split('?')[0] : '';
    }

    /**
     * Extracts visual profile data from a full player object.
     * Used for generating ghost messages (optimistic UI) before server confirms.
     * @param {Object} playerInfo - The full player data object
     * @returns {Object} A minimized profile object for the AvatarRenderer
     */
    extractProfile(playerInfo) {
        const parts = ['head', 'eyes', 'ear', 'body', 'hands', 'feet', 'tail', 'hair', 'headAccessories', 'beak'];
        const profile = {};
        parts.forEach(part => {
            if (playerInfo[part]) profile[part] = playerInfo[part];
        });
        return profile;
    }

    // --- Network Callbacks ---
    // These methods are called by ChatNetwork when data arrives.

    /**
     * Called when a batch of messages is received.
     * Handles ghost replacement (optimistic UI confirmation) and rendering.
     * @param {Array} data - Array of message objects
     */
    onMessageOutput(data) {
        if (!data || !data.length) return;

        const batch = [];
        const myCharId = this.getCharId();

        data.forEach(msg => {
            if (msg.deleted.status === 'false' || msg.deleted.status === false) {
                // Ghost Replacement Logic:
                // If this message corresponds to a temporary "ghost" message we created,
                // replace the ghost in-place instead of appending a new one.
                if (msg.clientMsgId) {
                    const ghost = document.getElementById('temp-' + msg.clientMsgId);
                    if (ghost) {
                        const html = this.messageRenderer.render(msg);
                        ghost.outerHTML = html;
                        return; // Done with this message
                    }
                }

                const html = this.messageRenderer.render(msg);
                const isMe = (msg.identifier === myCharId) || (msg.clientMsgId);

                // Collect for batch insertion
                batch.push({
                    html: html,
                    scope: msg.scope || 'global',
                    isMe: !!isMe
                });
            }
        });

        // Send valid new messages to UI in a single batch operation
        if (batch.length > 0) {
            this.ui.appendMessagesBatch(batch);
        }

        // Ensure initialization flag is set after first batch to enable smooth scrolling
        if (!this.ui.messagesContainer.dataset.initialized) {
            this.ui.messagesContainer.dataset.initialized = "true";
            this.ui.scrollToBottom(); // Force scroll on initial load
        }
    }

    /**
     * Called when a message edit/delete update is received.
     * @param {Object} data - The update payload
     */
    onEditOutput(data) {
        // Handle deletion
        if (data.deleted.status !== 'false' && data.deleted.status !== false) {
            this.ui.removeMessage(data._id);
        } else {
            // Handle content update
            const latest = data.message[data.message.length - 1];
            this.ui.updateMessageContent(data._id, latest.content);
        }
    }

    /**
     * Called when a spoiler status changes (e.g. clicked to reveal).
     */
    onSpoilerOutput(data) {
        this.ui.updateSpoiler(data._id, data.spoiler.status);
    }

    /**
     * Called when reactions are updated for a message.
     */
    onReactionUpdate(data) {
        const html = this.messageRenderer.renderReactions(data.reactions, data._id);
        this.ui.updateReactions(data._id, html);
    }

    /**
     * Called when older chat history is loaded (Infinite Scroll).
     */
    onOlderChatsOutput(data) {
        let html = '';
        // Reverse order because we prepend (server sends newest->oldest of the slice)
        for (let i = 0; i < data.length; i++) {
            const msg = data[i];
            if (msg.deleted.status === 'false' || msg.deleted.status === false) {
                html += this.messageRenderer.render(msg);
            }
        }
        this.ui.prependMessages(html);
    }

    onTooManyChars(count, msg) {
        if (this.input.textarea) this.input.textarea.innerHTML = msg;
        this.input.updateCharCounter();
        alert(`Too many characters: ${count}/10000`);
    }

    /**
     * Renders a temporary "Ghost" message immediately upon sending.
     * This provides instant feedback before the server confirms receipt.
     * @param {Object} msg - The temporary message object
     */
    renderGhostMessage(msg) {
        const html = this.messageRenderer.render(msg);
        this.ui.appendMessage(html, msg.scope, true);

        // Add ghost class for styling (e.g. reduced opacity)
        const el = document.getElementById(msg._id);
        if (el) el.classList.add('ghost-message');
    }

    // --- Legacy Ported Utilities ---

    /**
     * Initializes custom styled select dropdowns.
     * Walks through standard <select> elements and wraps them in custom DOM structures.
     */
    initCustomSelects() {
        const selects = document.querySelectorAll('select');
        // ... (Legacy code logic preserved) ...
        selects.forEach(select => {
            if (select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper')) return;

            const wrapper = document.createElement('div');
            wrapper.classList.add('custom-select-wrapper');

            const customSelect = document.createElement('div');
            customSelect.classList.add('custom-select');

            const trigger = document.createElement('div');
            trigger.classList.add('custom-select__trigger');
            const selectedOption = select.options[select.selectedIndex];
            trigger.innerHTML = `<span>${selectedOption ? selectedOption.text : 'Select...'}</span><div class="arrow"></div>`;

            const customOptions = document.createElement('div');
            customOptions.classList.add('custom-options');

            Array.from(select.options).forEach(option => {
                const customOption = document.createElement('span');
                customOption.classList.add('custom-option');
                customOption.dataset.value = option.value;
                customOption.textContent = option.text;
                if (option.selected) customOption.classList.add('selected');

                customOption.addEventListener('click', (e) => {
                    e.stopPropagation();
                    trigger.querySelector('span').textContent = option.text;
                    customOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                    customOption.classList.add('selected');
                    customSelect.classList.remove('open');
                    select.value = option.value;
                    // Trigger change event
                    const event = new Event('change');
                    select.dispatchEvent(event);
                });
                customOptions.appendChild(customOption);
            });

            customSelect.appendChild(trigger);
            customSelect.appendChild(customOptions);
            wrapper.appendChild(customSelect);
            select.parentNode.insertBefore(wrapper, select.nextSibling);
            select.style.display = 'none';

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.custom-select').forEach(s => {
                    if (s !== customSelect) s.classList.remove('open');
                });
                customSelect.classList.toggle('open');
            });
        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select')) {
                document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
            }
        });
    }
}

// Global initialization helper (matches old 'initializeChat' invocation expected by game/index.js)
window.initializeChat = function (socket) {
    new ChatSystem(socket);
};

// Global Helpers for external scripts (like game logic)
window.addLocalSystemMessage = function (content) {
    if (window.chatSystem && window.chatSystem.ui) {
        // Create a synthetic message object
        const msg = {
            message: [{ time: new Date().toISOString(), content: content }],
            name: 'System',
            spoiler: { status: 'none' },
            _id: 'local-' + Date.now() + Math.random(),
            identifier: 'system',
            type: 'Interactional',
            scope: 'local',
            senderProfile: {}
        };
        const html = window.chatSystem.messageRenderer.render(msg);
        window.chatSystem.ui.addLocalSystemMessage(html);
    }
};

window.showWorldToast = function (x, y, text) {
    if (window.chatSystem && window.chatSystem.ui) {
        window.chatSystem.ui.showWorldToast(x, y, text);
    }
};
