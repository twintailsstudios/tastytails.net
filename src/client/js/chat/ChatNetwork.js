/**
 * @fileoverview ChatNetwork.js - Socket.IO Network Transceiver & Adapter for TastyTails Chat
 * 
 * @description
 * Decouples Socket.IO network communication from UI rendering and input handling.
 * Manages tracked event listener registrations, automatic teardown, connection health monitoring,
 * and safe emission wrappers for outbound chat actions.
 * 
 * Triggered by: User input in ChatInput, message context actions in ChatContextMenu,
 * historical pagination in ChatSystem, and inbound Socket.IO server broadcasts.
 */
class ChatNetwork {
    /**
     * @param {Object} socket - The socket.io client instance
     * @param {ChatSystem} chatSystem - Reference to the core chat system hub
     */
    constructor(socket, chatSystem) {
        this.socket = socket;
        this.chatSystem = chatSystem;
        // OPTIMIZATION: Tracked Map prevents duplicate listener bindings and memory leaks on socket reconnects
        this.boundListeners = new Map();
        this.setupListeners();
    }

    /**
     * Helper property indicating if the underlying Socket.IO connection is active.
     * @returns {boolean} True if socket is defined and connected.
     */
    get isConnected() {
        return !!(this.socket && (this.socket.connected !== false));
    }

    /**
     * Registers a tracked socket event listener, replacing any previous listener for the same event.
     * OPTIMIZATION: Auto-detaches existing listeners for the event key to prevent event duplication.
     * @param {string} event - The Socket.IO event name
     * @param {Function} handler - Callback function
     */
    on(event, handler) {
        if (!this.socket) return;
        if (this.boundListeners.has(event)) {
            this.socket.off(event, this.boundListeners.get(event));
        }
        this.boundListeners.set(event, handler);
        this.socket.on(event, handler);
    }

    /**
     * Detaches all tracked Socket.IO event listeners managed by this instance.
     * OPTIMIZATION: Clean teardown ensures old ChatSystem/ChatNetwork instances are garbage collected.
     */
    removeListeners() {
        if (!this.socket) return;
        for (const [event, handler] of this.boundListeners.entries()) {
            if (typeof this.socket.off === 'function') {
                this.socket.off(event, handler);
            }
        }
        this.boundListeners.clear();
    }

    /**
     * Clean teardown method to unbind listeners and release object references.
     */
    destroy() {
        this.removeListeners();
        this.socket = null;
        this.chatSystem = null;
    }

    /**
     * Safely emits a Socket.IO event with socket availability and connection checks.
     * OPTIMIZATION: Prevents uncaught TypeError exceptions when user acts while socket is offline.
     * @param {string} event - Socket event name to emit
     * @param {Object} data - Event payload
     * @returns {boolean} True if successfully emitted, false if socket is offline or missing
     */
    emitSafe(event, data) {
        if (this.socket && typeof this.socket.emit === 'function') {
            this.socket.emit(event, data);
            return true;
        }
        console.warn(`[ChatNetwork] Failed to emit '${event}': Socket unavailable.`);
        return false;
    }

    /**
     * Sets up all incoming socket event listeners.
     */
    setupListeners() {
        if (!this.socket) return;

        // OPTIMIZATION: Clear prior listeners before binding to guarantee single-handler execution
        this.removeListeners();

        // Core Chat Events (guarded with optional chaining to prevent call errors on uninitialized state)
        this.on('output', (data) => this.chatSystem?.onMessageOutput(data));
        this.on('editOutput', (data) => this.chatSystem?.onEditOutput(data));
        this.on('editSpoilerOutput', (data) => this.chatSystem?.onSpoilerOutput(data));
        this.on('messageReactionUpdate', (data) => this.chatSystem?.onReactionUpdate(data));
        this.on('olderChatsOutput', (data) => this.chatSystem?.onOlderChatsOutput(data));
        this.on('tooManyChars', (data, message) => this.chatSystem?.onTooManyChars(data, message));

        // Connection Stability & System Messages
        this.on('serverVersion', (data) => {
            if (data && data.version && typeof window.checkAppVersion === 'function') {
                window.checkAppVersion(data.version);
            }
        });
        this.on('serverUnstable', () => this.chatSystem?.ui?.showConnectionBanner('Connection Unstable: Changes are being queued...', 'orange'));
        this.on('serverStable', () => this.chatSystem?.ui?.hideConnectionBanner());
        this.on('serverCriticalWarning', (data) => this.chatSystem?.ui?.showConnectionBanner(`CRITICAL WARNING: Server shutting down in ${data?.seconds ?? 'a few'} seconds!`, 'red'));
    }

    // --- Emission Wrappers ---

    /**
     * Emits a new message input payload to the server.
     * @param {Object} data - Payload containing text, scope, clientMsgId, token, charId
     * @returns {boolean} Emitted status
     */
    sendInput(data) {
        return this.emitSafe('input', data);
    }

    /**
     * Emits a message content edit payload to the server.
     * @param {Object} data - Payload containing messageId, newContent, token, charId
     * @returns {boolean} Emitted status
     */
    sendEdit(data) {
        return this.emitSafe('inputEdit', data);
    }

    /**
     * Emits a message deletion payload to the server.
     * @param {Object} data - Payload containing messageId, token, charId
     * @returns {boolean} Emitted status
     */
    deleteMessage(data) {
        return this.emitSafe('deleteMessage', data);
    }

    /**
     * Emits a spoiler status change payload to the server.
     * @param {Object} data - Payload containing messageId, status, token, charId
     * @returns {boolean} Emitted status
     */
    sendSpoilerEdit(data) {
        return this.emitSafe('sendSpoilEdit', data);
    }

    /**
     * Emits an emoji reaction toggle payload to the server.
     * @param {Object} data - Payload containing messageId, emoji, token, charId
     * @returns {boolean} Emitted status
     */
    toggleReaction(data) {
        return this.emitSafe('toggleReaction', data);
    }

    /**
     * Emits a request for historical chat messages (infinite scroll pagination).
     * @param {Object} data - Payload containing beforeTime, token, charId
     * @returns {boolean} Emitted status
     */
    getOlderChats(data) {
        return this.emitSafe('getOlderChats', data);
    }

    /**
     * Emits typing indicator status updates to the server.
     * @param {Object} data - Payload containing charId, isTyping
     * @returns {boolean} Emitted status
     */
    sendTyping(data) {
        return this.emitSafe('typing', data);
    }
}

window.ChatNetwork = ChatNetwork;


