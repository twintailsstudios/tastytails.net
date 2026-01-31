/**
 * ChatNetwork.js
 * 
 * Handles all Socket.IO communication for the chat system.
 * Decouples network logic from UI and Input logic.
 * Binds server events to ChatSystem callbacks and provides public methods
 * for sending data to the server.
 */
class ChatNetwork {
    /**
     * @param {Object} socket - The socket.io client instance
     * @param {ChatSystem} chatSystem - Reference to the core chat system
     */
    constructor(socket, chatSystem) {
        this.socket = socket;
        this.chatSystem = chatSystem;
        this.setupListeners();
    }

    /**
     * Sets up all incoming socket event listeners.
     */
    setupListeners() {
        if (!this.socket) return;

        // Core Chat Events
        this.socket.on('output', (data) => this.chatSystem.onMessageOutput(data));
        this.socket.on('editOutput', (data) => this.chatSystem.onEditOutput(data));
        this.socket.on('editSpoilerOutput', (data) => this.chatSystem.onSpoilerOutput(data));
        this.socket.on('messageReactionUpdate', (data) => this.chatSystem.onReactionUpdate(data));
        this.socket.on('olderChatsOutput', (data) => this.chatSystem.onOlderChatsOutput(data));
        this.socket.on('tooManyChars', (data, message) => this.chatSystem.onTooManyChars(data, message));

        // Connection Stability & System Messages
        this.socket.on('serverUnstable', () => this.chatSystem.ui.showConnectionBanner('Connection Unstable: Changes are being queued...', 'orange'));
        this.socket.on('serverStable', () => this.chatSystem.ui.hideConnectionBanner());
        this.socket.on('serverCriticalWarning', (data) => this.chatSystem.ui.showConnectionBanner(`CRITICAL WARNING: Server shutting down in ${data.seconds} seconds!`, 'red'));
    }

    // --- Emission Wrappers ---

    sendInput(data) {
        this.socket.emit('input', data);
    }

    sendEdit(data) {
        this.socket.emit('inputEdit', data);
    }

    deleteMessage(data) {
        this.socket.emit('deleteMessage', data);
    }

    sendSpoilerEdit(data) {
        this.socket.emit('sendSpoilEdit', data);
    }

    toggleReaction(data) {
        this.socket.emit('toggleReaction', data);
    }

    getOlderChats(data) {
        this.socket.emit('getOlderChats', data);
    }

    sendTyping(data) {
        this.socket.emit('typing', data);
    }
}

window.ChatNetwork = ChatNetwork;
