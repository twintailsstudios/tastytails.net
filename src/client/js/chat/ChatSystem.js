/**
 * @fileoverview ChatSystem.js - Central Orchestrator & Mediator for Game Chat
 * 
 * @description
 * Primary coordinator class for client-side chat in TastyTails.net.
 * Initializes and interconnects specialized sub-modules (ChatUI, ChatNetwork, ChatInput,
 * ChatContextMenu, ChatMessage, ChatFormatter), manages optimistic UI ("ghost messages"),
 * handles incoming WebSocket broadcasts, and provides global access points for external game scripts.
 * 
 * Triggered by:
 * - Phaser game scene initialization (window.initializeChat)
 * - Socket.IO network event broadcasts via ChatNetwork
 * - User DOM events (infinite scroll requestOlderChats, textarea input)
 */

// OPTIMIZATION: Module-level static constants eliminate repeated RegExp compilation
// and array allocations inside hot path methods (getToken & extractProfile).
const AUTH_COOKIE_REGEX = /(?:^| )TastyTails=([^;]+)/;
const PROFILE_PARTS = ['head', 'eyes', 'ear', 'body', 'hands', 'feet', 'tail', 'hair', 'headAccessories', 'beak'];

class ChatSystem {
    /**
     * Instantiates all chat sub-modules and sets up internal event listeners.
     * @param {Object} socket - Active Socket.IO client instance for network communication.
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

        // OPTIMIZATION: Store named bound listener references to enable clean unbinding during teardown
        this._boundOlderChatsHandler = (e) => {
            if (this.network && e?.detail?.timestamp) {
                this.network.getOlderChats({
                    beforeTime: e.detail.timestamp,
                    token: this.getToken(),
                    charId: this.getCharId()
                });
            }
        };

        this._boundWindowClickHandler = (e) => {
            if (!e?.target?.closest || !e.target.closest('.custom-select')) {
                document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
            }
        };

        // Initialize Custom Selects (Legacy UI component for dropdowns)
        this.initCustomSelects();

        // Listen for internal events (e.g., Infinite Scroll triggers)
        window.addEventListener('requestOlderChats', this._boundOlderChatsHandler);
        window.addEventListener('click', this._boundWindowClickHandler);

        // Initialize Global Helpers that depend on `this` instance
        // Exposed for access by other game scripts (e.g., main game loop)
        window.chatSystem = this;
    }

    /**
     * Cleanly unbinds window event listeners and tears down sub-modules.
     * Prevents memory leaks when game scenes reload or sockets reconnect.
     */
    destroy() {
        window.removeEventListener('requestOlderChats', this._boundOlderChatsHandler);
        window.removeEventListener('click', this._boundWindowClickHandler);

        if (this.network && typeof this.network.destroy === 'function') {
            this.network.destroy();
        }
        if (window.chatSystem === this) {
            window.chatSystem = null;
        }
    }

    // --- Data Access ---

    /**
     * Retrieves the authentication token from document cookies.
     * @returns {string} The authentication token string, or empty string if not present.
     */
    getToken() {
        // OPTIMIZATION: Uses pre-compiled AUTH_COOKIE_REGEX to avoid GC allocation on lookup
        const match = document.cookie.match(AUTH_COOKIE_REGEX);
        if (match) return match[1];
        return '';
    }

    /**
     * Retrieves the current character ID based on global localPlayerInfo state or URL path fallback.
     * @returns {string} Character ID string.
     */
    getCharId() {
        if (typeof localPlayerInfo !== 'undefined' && localPlayerInfo._id) {
            return localPlayerInfo._id;
        }
        // Fallback for character ID extraction from URL if global player object is missing
        const parts = document.location.href.split('play/');
        return parts.length > 1 ? parts[1].split('?')[0] : '';
    }

    /**
     * Extracts visual avatar profile data from a full player object.
     * Used for generating ghost messages (optimistic UI) before server confirmation.
     * @param {Object} playerInfo - The full player data object
     * @returns {Object} A minimized profile object containing active visual slots
     */
    extractProfile(playerInfo) {
        if (!playerInfo) return {};
        const profile = {};
        // OPTIMIZATION: Index-based loop over static PROFILE_PARTS avoids array closure allocations
        for (let i = 0; i < PROFILE_PARTS.length; i++) {
            const part = PROFILE_PARTS[i];
            if (playerInfo[part]) profile[part] = playerInfo[part];
        }
        return profile;
    }

    // --- Network Callbacks ---
    // These methods are called by ChatNetwork when network data arrives.

    /**
     * Called when a batch of messages is received from the server.
     * Handles ghost message reconciliation (optimistic UI confirmation) and batch DOM rendering.
     * @param {Array<Object>} data - Array of incoming message payload objects
     */
    onMessageOutput(data) {
        if (!data || !Array.isArray(data) || !data.length) return;

        const batch = [];
        const myCharId = this.getCharId();

        data.forEach(msg => {
            // SAFEGUARD: Defensive optional chaining prevents crash on non-standard payload formats
            const isDeleted = Boolean(msg?.deleted && (msg.deleted.status === 'true' || msg.deleted.status === true));
            if (!isDeleted) {
                // Ghost Replacement Logic:
                // If this message corresponds to a temporary "ghost" message we created,
                // replace the ghost in-place instead of appending a new one.
                if (msg.clientMsgId) {
                    const ghost = document.getElementById('temp-' + msg.clientMsgId);
                    if (ghost && document.body.contains(ghost)) {
                        const html = this.messageRenderer.render(msg);
                        // OPTIMIZATION: Defer inline DOM replacement to requestAnimationFrame to avoid layout thrashing
                        requestAnimationFrame(() => {
                            if (ghost.parentNode) ghost.outerHTML = html;
                        });
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
        if (this.ui?.messagesContainer && !this.ui.messagesContainer.dataset.initialized) {
            this.ui.messagesContainer.dataset.initialized = "true";
            this.ui.scrollToBottom(); // Force scroll on initial load
        }
    }

    /**
     * Called when a message edit or deletion broadcast is received.
     * @param {Object} data - Update payload containing message ID and updated state
     */
    onEditOutput(data) {
        if (!data) return;
        const isDeleted = Boolean(data.deleted && (data.deleted.status === 'true' || data.deleted.status === true));
        // Handle deletion
        if (isDeleted) {
            this.ui.removeMessage(data._id);
        } else if (Array.isArray(data.message) && data.message.length > 0) {
            // Handle content update
            const latest = data.message[data.message.length - 1];
            if (latest && typeof latest.content !== 'undefined') {
                this.ui.updateMessageContent(data._id, latest.content);
            }
        }
    }

    /**
     * Called when a spoiler status changes (e.g. clicked to reveal content).
     * @param {Object} data - Spoiler state payload containing message ID and spoiler status
     */
    onSpoilerOutput(data) {
        if (data?._id && data?.spoiler) {
            this.ui.updateSpoiler(data._id, data.spoiler.status);
        }
    }

    /**
     * Called when reactions are added/removed on a message.
     * @param {Object} data - Reaction payload containing message ID and updated reactions array
     */
    onReactionUpdate(data) {
        if (data?._id) {
            const html = this.messageRenderer.renderReactions(data.reactions || [], data._id);
            this.ui.updateReactions(data._id, html);
        }
    }

    /**
     * Called when older chat history is loaded via infinite scroll pagination.
     * @param {Array<Object>} data - Slice of historical message objects (newest to oldest)
     */
    onOlderChatsOutput(data) {
        if (!data || !Array.isArray(data)) return;
        let html = '';
        // Reverse order because we prepend (server sends newest->oldest of the slice)
        for (let i = 0; i < data.length; i++) {
            const msg = data[i];
            const isDeleted = Boolean(msg?.deleted && (msg.deleted.status === 'true' || msg.deleted.status === true));
            if (!isDeleted) {
                html += this.messageRenderer.render(msg);
            }
        }
        if (html) {
            this.ui.prependMessages(html);
        }
    }

    /**
     * Handles character limit warning triggers from input validation.
     * @param {number} count - Total characters attempted
     * @param {string} msg - Warning/error message text
     */
    onTooManyChars(count, msg) {
        if (this.input?.textarea) this.input.textarea.innerHTML = msg;
        if (this.input?.updateCharCounter) this.input.updateCharCounter();
        const notification = `Too many characters: ${count}/10000`;
        // OPTIMIZATION: Uses non-blocking local system message instead of thread-blocking window.alert
        if (window.addLocalSystemMessage) {
            window.addLocalSystemMessage(notification);
        }
    }

    /**
     * Renders a temporary "Ghost" message immediately upon sending.
     * Provides instant optimistic user feedback before server round-trip confirmation.
     * @param {Object} msg - The temporary message object with clientMsgId
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
    }
}

/**
 * Global initialization helper (matches old 'initializeChat' invocation expected by game/index.js).
 * @param {Object} socket - Active Socket.IO instance
 */
window.initializeChat = function (socket) {
    if (window.chatSystem && typeof window.chatSystem.destroy === 'function') {
        window.chatSystem.destroy();
    }
    new ChatSystem(socket);
};

/**
 * Global Helper for external game logic to add synthetic local system messages.
 * @param {string} content - Message text to display in local chat scope
 */
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

/**
 * Global Helper for external game logic to display world-space floating toast messages.
 * @param {number} x - World X position
 * @param {number} y - World Y position
 * @param {string} text - Text to display in world toast
 */
window.showWorldToast = function (x, y, text) {
    if (window.chatSystem && window.chatSystem.ui) {
        window.chatSystem.ui.showWorldToast(x, y, text);
    }
};
