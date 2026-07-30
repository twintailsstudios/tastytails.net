/**
 * @fileoverview ChatInput.js - Client Chat Input & Formatting Orchestrator
 * 
 * @description
 * Manages the client-side text input area, rich-text formatting toolbar,
 * draft auto-saving, typing indicators, character length validations,
 * message editing mode, and optimistic ghost message dispatching to ChatNetwork.
 * 
 * Triggered by: DOM keydown/input events, toolbar clicks, and ChatContextMenu actions.
 */
class ChatInput {
    /**
     * Initializes input controller references and attaches event listeners.
     * @param {Object} chatNetwork - Network adapter instance handling WebSockets/socket.io
     * @param {Object} chatSystem - Main client chat system orchestrator
     */
    constructor(chatNetwork, chatSystem) {
        this.network = chatNetwork;
        this.chatSystem = chatSystem;
        this.textarea = document.getElementById('textarea');
        this.limitModal = document.getElementById('char-limit-modal');
        this.charLimitEl = document.querySelector('.charlimit');

        this.isTyping = false;
        this.typingTimeout = null;
        this.draftSaveTimeout = null;
        this.editingMessageId = null; // ID of message currently being edited
        this.originalDraft = ''; // Backup of input before editing started
        this.toolbarButtons = null; // Lazy-cached DOM elements for toolbar

        // Bound event handler references for clean teardown and unbinding
        this.onWindowKeyDown = (e) => this.handleGlobalKeyDown(e);
        this.onSelectionChange = () => {
            if (document.activeElement === this.textarea) {
                this.updateToolbarState();
            }
        };

        // OPTIMIZATION: Ensure any pending debounced draft write is immediately flushed before tab close
        this.onBeforeUnload = () => this.flushDraft();
        window.addEventListener('beforeunload', this.onBeforeUnload);

        this.bindEvents();
    }

    /**
     * Synchronously persists current text input state to LocalStorage draft.
     */
    flushDraft() {
        if (this.textarea) {
            localStorage.setItem("textarea", this.textarea.innerHTML);
        }
    }

    /**
     * Binds DOM event listeners for focus tracking, keyboard shortcuts, and input handling.
     */
    bindEvents() {
        if (!this.textarea) return;

        // Sync focus state for game control disabling (prevents WASD character movement while typing)
        this.textarea.addEventListener('focus', () => {
            window.chatFocused = true;
        });

        this.textarea.addEventListener('blur', () => {
            window.chatFocused = false;
        });

        // Global Tab key focus toggle
        window.addEventListener('keydown', this.onWindowKeyDown);

        this.textarea.addEventListener('input', () => this.handleInput());

        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { // Enter to send
                e.preventDefault();
                this.sendMessage();
            }
            if (e.key === 'Escape' && this.editingMessageId) { // Escape to cancel edit
                this.cancelEditing();
            }
            if (e.key === 'ArrowUp' && this.textarea.innerHTML === '') { // Up Arrow for history recall
                this.textarea.innerHTML = localStorage.getItem("previousMessage") || '';
                this.updateCharCounter();
            }

            // Formatting shortcuts (Ctrl+B, Ctrl+I, etc.)
            if (e.ctrlKey) {
                let handled = true;
                switch (e.key) {
                    case 'b': e.preventDefault(); document.execCommand('bold'); break;
                    case 'i': e.preventDefault(); document.execCommand('italic'); break;
                    case 'u': e.preventDefault(); document.execCommand('underline'); break;
                    case 's': e.preventDefault(); document.execCommand('strikethrough'); break;
                    case '-': e.preventDefault(); document.execCommand('subscript'); break;
                    case '+': e.preventDefault(); document.execCommand('superscript'); break;
                    default: handled = false; break;
                }
                if (handled) {
                    this.updateToolbarState();
                    this.handleInput();
                }
            }
        });

        // Restore saved text draft from LocalStorage on load
        const stored = localStorage.getItem("textarea");
        if (stored) {
            this.textarea.innerHTML = stored;
            this.updateCharCounter();
        }

        // Close limit modal overlay
        if (this.limitModal) {
            this.limitModal.addEventListener('click', (e) => {
                if (e.target === this.limitModal || e.target.id === 'close-char-modal') {
                    this.limitModal.style.display = 'none';
                }
            });
        }

        this.bindToolbarButtons();
    }

    /**
     * Global keydown handler for Tab focus toggling between game view and chat.
     * @param {KeyboardEvent} e - DOM KeyboardEvent
     */
    handleGlobalKeyDown(e) {
        if (e.key === 'Tab') {
            const active = document.activeElement;
            if (active && active !== this.textarea && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
                return; // Let standard form navigation handle it
            }

            e.preventDefault();
            if (window.chatFocused) {
                this.textarea.blur();
            } else {
                this.textarea.focus();
                try {
                    const range = document.createRange();
                    range.selectNodeContents(this.textarea);
                    range.collapse(false);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);
                } catch (err) {
                    console.warn('Failed to select text range:', err);
                }
            }
        }
    }

    /**
     * Binds rich text formatting buttons and connects selectionchange indicator listener.
     */
    bindToolbarButtons() {
        const toolbarMap = [
            { id: 'bold-btn', command: 'bold' },
            { id: 'italic-btn', command: 'italic' },
            { id: 'underline-btn', command: 'underline' },
            { id: 'strikethrough-btn', command: 'strikethrough' },
            { id: 'subscript-btn', command: 'subscript' },
            { id: 'superscript-btn', command: 'superscript' }
        ];

        toolbarMap.forEach(({ id, command }) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            // Prevent focus loss from textarea on click so text selection remains active
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.textarea) {
                    this.textarea.focus();
                }
                document.execCommand(command, false, null);
                this.updateToolbarState();
                this.handleInput();
            });
        });

        // OPTIMIZATION: Track active toolbar state using bound selectionchange listener
        document.addEventListener('selectionchange', this.onSelectionChange);
    }

    /**
     * Updates active state classes (.activeBtn) on toolbar buttons based on selection formatting state.
     */
    updateToolbarState() {
        // OPTIMIZATION: Lazily cache DOM elements once to eliminate 6 getElementById queries per selectionchange
        if (!this.toolbarButtons) {
            const commands = ['bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript'];
            this.toolbarButtons = commands
                .map(cmd => ({ command: cmd, el: document.getElementById(`${cmd}-btn`) }))
                .filter(item => item.el !== null);
        }

        this.toolbarButtons.forEach(({ el, command }) => {
            try {
                const isState = document.queryCommandState(command);
                el.classList.toggle('activeBtn', Boolean(isState));
            } catch (e) {
                // Command state fallback
            }
        });
    }

    /**
     * Handles text input events.
     * Manages debounced LocalStorage draft saving and typing status network notifications.
     */
    handleInput() {
        this.updateCharCounter();

        // OPTIMIZATION: Debounce LocalStorage write to prevent blocking main UI thread on every keystroke
        clearTimeout(this.draftSaveTimeout);
        this.draftSaveTimeout = setTimeout(() => {
            this.flushDraft();
        }, 500);

        if (!this.isTyping) {
            this.isTyping = true;
            this.network.sendTyping({
                charId: this.chatSystem.getCharId(),
                isTyping: true
            });
        }

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.isTyping = false;
            this.network.sendTyping({
                charId: this.chatSystem.getCharId(),
                isTyping: false
            });
        }, 2000);
    }

    /**
     * Submits the current message or edit update.
     * Performs validations and generates optimistic "Ghost" messages for immediate feedback.
     */
    sendMessage() {
        if (!this.textarea || !this.textarea.innerText.trim()) return;

        const content = this.textarea.innerHTML;
        const charCount = this.getCharCount();

        if (charCount > 10000) {
            if (this.limitModal) {
                this.limitModal.style.display = 'flex';
                this.limitModal.style.animation = 'fadeIn 0.2s';
            }
            return;
        }

        // OPTIMIZATION: Validation passed — immediately clear typing indicator state on remote clients
        if (this.isTyping) {
            this.isTyping = false;
            clearTimeout(this.typingTimeout);
            this.network.sendTyping({
                charId: this.chatSystem.getCharId(),
                isTyping: false
            });
        }

        if (this.editingMessageId) {
            // Send Edit Update
            this.network.sendEdit({
                _id: this.editingMessageId,
                message: content,
                token: this.chatSystem.getToken(),
                charId: this.chatSystem.getCharId()
            });
            this.cancelEditing();
        } else {
            // Send New Message
            const scope = document.getElementById('messages') ? (document.getElementById('messages').getAttribute('data-view') || 'local') : 'local';
            const spoilerVal = document.getElementById('spoilers') ? document.getElementById('spoilers').value : 'none';

            // Generate temp ID for ghost message
            const tempId = Date.now().toString(36) + Math.random().toString(36).substring(2);

            // Optimistic Render (Ghost)
            const ghostMsg = {
                _id: 'temp-' + tempId,
                name: (typeof localPlayerInfo !== 'undefined' && localPlayerInfo.firstName) ? (localPlayerInfo.firstName + ' ' + localPlayerInfo.lastName) : 'Me',
                type: 'Default',
                scope: scope,
                message: [{ content: content, time: new Date().toUTCString() }],
                spoiler: { status: spoilerVal, votes: {} },
                identifier: this.chatSystem.getCharId(),
                deleted: { status: 'false' },
                senderProfile: (typeof localPlayerInfo !== 'undefined') ? this.chatSystem.extractProfile(localPlayerInfo) : {},
                clientMsgId: tempId
            };

            // Check commands for local logic (though server has final say)
            const cleanTxt = this.textarea.innerText.trim();
            if (cleanTxt.startsWith('/me ')) ghostMsg.type = 'Say';
            if (cleanTxt.startsWith('/ooc ')) ghostMsg.type = 'OOC';

            // Render Ghost immediately
            this.chatSystem.renderGhostMessage(ghostMsg);

            // Emit to Network
            this.network.sendInput({
                message: content,
                scope: scope,
                spoiler: spoilerVal,
                token: this.chatSystem.getToken(),
                charId: this.chatSystem.getCharId(),
                clientMsgId: tempId,
                name: ghostMsg.name,
                senderProfile: ghostMsg.senderProfile
            });

            localStorage.setItem('previousMessage', content);
            this.textarea.innerHTML = '';
            this.flushDraft();
            this.updateCharCounter();
        }
    }

    /**
     * Enters Message Edit Mode for a target message ID.
     * @param {string} msgId - ID of target message row
     * @param {string} content - Original message HTML content
     */
    startEditing(msgId, content) {
        if (!this.editingMessageId) {
            this.originalDraft = this.textarea.innerHTML;
        } else {
            // OPTIMIZATION: Remove highlight from previously edited row directly in O(1) time
            const prevRow = document.getElementById(this.editingMessageId);
            if (prevRow) prevRow.classList.remove('editing-highlight');
        }
        this.editingMessageId = msgId;

        const row = document.getElementById(msgId);
        if (row) row.classList.add('editing-highlight');

        this.textarea.innerHTML = content;
        this.textarea.focus();

        const indicator = document.getElementById('editing-indicator');
        if (indicator) indicator.classList.remove('hidden');

        const cancelBtn = document.getElementById('cancel-edit');
        if (cancelBtn) cancelBtn.onclick = () => this.cancelEditing();
    }

    /**
     * Cancels Message Edit Mode and restores the previous un-submitted draft.
     */
    cancelEditing() {
        if (this.editingMessageId) {
            // OPTIMIZATION: Direct O(1) removal of highlight class
            const row = document.getElementById(this.editingMessageId);
            if (row) row.classList.remove('editing-highlight');
        }
        this.editingMessageId = null;
        this.textarea.innerHTML = this.originalDraft;
        this.originalDraft = '';

        const indicator = document.getElementById('editing-indicator');
        if (indicator) indicator.classList.add('hidden');

        this.updateCharCounter();
    }

    /**
     * Fast character length calculation in JS string memory without triggering DOM layout reflows.
     * @returns {number} Character count
     */
    getCharCount() {
        if (!this.textarea) return 0;
        const html = this.textarea.innerHTML;
        if (!html.includes('<')) {
            return (this.textarea.textContent || '').length;
        }
        // OPTIMIZATION: Fast JS memory string manipulation without triggering heavy browser layout reflow via innerText
        return html.replace(/<br\s*[\/]?>/gi, '\n').replace(/<[^>]+>/g, '').length;
    }

    /**
     * Updates the UI character counter element (.charlimit).
     */
    updateCharCounter() {
        const count = this.getCharCount();
        if (this.charLimitEl) {
            this.charLimitEl.innerText = `${count}/10000`;
            this.charLimitEl.style.color = count > 9950 ? '#c94747' : '#767f66';
        }
    }

    /**
     * Cleans up global event listeners and active timers upon component destruction.
     */
    destroy() {
        window.removeEventListener('beforeunload', this.onBeforeUnload);
        window.removeEventListener('keydown', this.onWindowKeyDown);
        document.removeEventListener('selectionchange', this.onSelectionChange);
        clearTimeout(this.typingTimeout);
        clearTimeout(this.draftSaveTimeout);
    }
}

window.ChatInput = ChatInput;
