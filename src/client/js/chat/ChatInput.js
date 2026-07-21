/**
 * ChatInput.js
 * 
 * Manages the text input area and message submission logic.
 * Handles:
 * - Typing status indicators (debounced)
 * - Message length limits (10k chars)
 * - Constructing and sending new messages via ChatNetwork
 * - Optimistic UI updates ("Ghost" messages)
 * - Message Editing mode
 * - Formatting shortcuts (Ctrl+B, etc.) and history recall (Up Arrow)
 */
class ChatInput {
    constructor(chatNetwork, chatSystem) {
        this.network = chatNetwork;
        this.chatSystem = chatSystem;
        this.textarea = document.getElementById('textarea');
        this.limitModal = document.getElementById('char-limit-modal');
        this.charLimitEl = document.querySelector('.charlimit');

        this.isTyping = false;
        this.typingTimeout = null;
        this.editingMessageId = null; // ID of message currently being edited
        this.originalDraft = ''; // Backup of input before editing started

        this.bindEvents();
    }

    bindEvents() {
        if (!this.textarea) return;

        // Sync focus state for game control disabling
        this.textarea.addEventListener('focus', () => {
            window.chatFocused = true;
        });

        this.textarea.addEventListener('blur', () => {
            window.chatFocused = false;
        });

        // Global Tab key focus toggle
        window.addEventListener('keydown', (e) => {
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
        });

        this.textarea.addEventListener('input', () => this.handleInput());

        this.textarea.addEventListener('keydown', (e) => {
            if (e.which === 13 && !e.shiftKey) { // Enter to send
                e.preventDefault();
                this.sendMessage();
            }
            if (e.which === 27 && this.editingMessageId) { // Escape to cancel edit
                this.cancelEditing();
            }
            if (e.which === 38 && this.textarea.innerHTML === '') { // Up Arrow for history
                this.textarea.innerHTML = localStorage.getItem("previousMessage") || '';
                this.updateCharCounter();
            }

            // Formatting shortcuts
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

        // Restore saved text logic (Draft preservation)
        const stored = localStorage.getItem("textarea");
        if (stored) {
            this.textarea.innerHTML = stored;
            this.updateCharCounter();
        }

        // Close limit modal
        if (this.limitModal) {
            this.limitModal.addEventListener('click', (e) => {
                if (e.target === this.limitModal || e.target.id === 'close-char-modal') {
                    this.limitModal.style.display = 'none';
                }
            });
        }

        this.bindToolbarButtons();
    }

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

            // Prevent focus loss from textarea on click so selection remains active
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

        // Update toolbar active states on selection change when typing or moving cursor
        document.addEventListener('selectionchange', () => {
            if (document.activeElement === this.textarea) {
                this.updateToolbarState();
            }
        });
    }

    updateToolbarState() {
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
            try {
                const isState = document.queryCommandState(command);
                if (isState) {
                    btn.classList.add('activeBtn');
                } else {
                    btn.classList.remove('activeBtn');
                }
            } catch (e) {
                // Command state fallback
            }
        });
    }

    /**
     * Handles text input events.
     * Manages local storage backup and typing status debouncing.
     */
    handleInput() {
        localStorage.setItem("textarea", this.textarea.innerHTML);
        this.updateCharCounter();

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
     * Submits the current message or edit.
     * Performs validation and generates optimistic "Ghost" messages for immediate feedback.
     */
    sendMessage() {
        if (!this.textarea.innerText.trim()) return;

        const content = this.textarea.innerHTML;
        const charCount = this.textarea.innerText.length;

        if (charCount > 10000) {
            if (this.limitModal) {
                this.limitModal.style.display = 'flex';
                this.limitModal.style.animation = 'fadeIn 0.2s';
            }
            return;
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
            const scope = document.getElementById('messages').getAttribute('data-view') || 'global';
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
                name: ghostMsg.name
            });

            localStorage.setItem('previousMessage', content);
            this.textarea.innerHTML = '';
            this.updateCharCounter();
        }
    }

    startEditing(msgId, content) {
        if (!this.editingMessageId) {
            this.originalDraft = this.textarea.innerHTML;
        }
        this.editingMessageId = msgId;

        document.querySelectorAll('.chat-message').forEach(el => el.classList.remove('editing-highlight'));
        const row = document.getElementById(msgId);
        if (row) row.classList.add('editing-highlight');

        this.textarea.innerHTML = content;
        this.textarea.focus();

        const indicator = document.getElementById('editing-indicator');
        if (indicator) indicator.classList.remove('hidden');

        const cancelBtn = document.getElementById('cancel-edit');
        if (cancelBtn) cancelBtn.onclick = () => this.cancelEditing();
    }

    cancelEditing() {
        this.editingMessageId = null;
        this.textarea.innerHTML = this.originalDraft;
        this.originalDraft = '';

        document.querySelectorAll('.editing-highlight').forEach(el => el.classList.remove('editing-highlight'));
        const indicator = document.getElementById('editing-indicator');
        if (indicator) indicator.classList.add('hidden');

        this.updateCharCounter();
    }

    updateCharCounter() {
        const count = this.textarea.innerText.length;
        if (this.charLimitEl) {
            this.charLimitEl.innerText = `${count}/10000`;
            this.charLimitEl.style.color = count > 9950 ? '#c94747' : '#767f66';
        }
    }
}

window.ChatInput = ChatInput;
