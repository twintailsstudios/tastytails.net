/**
 * ChatUI.js
 * 
 * Manages the User Interface for the chat system.
 * This class handles all direct DOM manipulations, including:
 * - Appending/prepending messages
 * - Managing tabs (Global/Local) and unread counts
 * - Handling scroll behavior (auto-scroll vs. infinite scroll)
 * - Applying spoiler filters
 * - Showing toasts and notifications
 */
class ChatUI {
    /**
     * @param {Class} formatter - Reference to ChatFormatter helper
     */
    constructor(formatter) {
        this.formatter = formatter;

        // --- DOM Elements ---
        this.messagesContainer = document.getElementById('messages');
        this.tabGlobal = document.getElementById('tab-global');
        this.tabLocal = document.getElementById('tab-local');
        this.jumpToPresentBtn = document.getElementById('jump-to-present');
        this.connectionBanner = document.getElementById('connection-banner');

        // --- State Handling ---
        this.unreadCounts = { global: 0, local: 0 };
        this.currentScope = 'local';

        // Saves scroll state per tab to restore when switching back
        this.tabStates = {
            global: { atBottom: true, scrollTop: 0, hasBeenVisited: false },
            local: { atBottom: true, scrollTop: 0, hasBeenVisited: false }
        };

        this.isLoadingOlder = false; // Prevents double-fetching history

        this.bindEvents();
        // Initial set scope
        this.setScope('local');
    }

    /**
     * Binds click and scroll listeners to UI elements.
     */
    bindEvents() {
        if (this.tabGlobal) this.tabGlobal.addEventListener('click', () => this.setScope('global'));
        if (this.tabLocal) this.tabLocal.addEventListener('click', () => this.setScope('local'));

        if (this.messagesContainer) {
            this.messagesContainer.addEventListener('scroll', () => this.handleScroll());
        }

        if (this.jumpToPresentBtn) {
            this.jumpToPresentBtn.addEventListener('click', () => this.jumpToPresent());
        }

        // Spoiler Filters (Checkboxes in options)
        ['watersportsBox', 'disposalBox', 'goreBox'].forEach(id => {
            const box = document.getElementById(id);
            if (box) {
                box.addEventListener('change', () => this.applySpoilerFilters());
            }
        });

        // Dropdown Logic (Global)
        document.addEventListener('click', e => {
            const isBtn = e.target.matches('[data-dropdown-button]') || e.target.closest('[data-dropdown-button]');
            const dropdownContainer = e.target.closest('[data-dropdown]');

            if (isBtn && dropdownContainer) {
                // Toggle this one
                dropdownContainer.classList.toggle('active');
                // Close others
                document.querySelectorAll('[data-dropdown].active').forEach(d => {
                    if (d !== dropdownContainer) d.classList.remove('active');
                });
                return;
            }

            // If inside a dropdown (but not the toggle button), do nothing (allow interaction)
            if (dropdownContainer) return;

            // If outside everything, close all
            document.querySelectorAll('[data-dropdown].active').forEach(d => d.classList.remove('active'));
        });
    }

    // --- Tab & Scope Logic ---

    /**
     * Switches the current chat view (Global vs Local).
     * Saves the state of the current tab before switching.
     * @param {string} scope - 'global' or 'local'
     */
    setScope(scope) {
        this.saveTabState(this.currentScope);
        this.currentScope = scope;
        this.messagesContainer.setAttribute('data-view', scope);

        if (scope === 'global') {
            this.tabGlobal.classList.add('active');
            this.tabLocal.classList.remove('active');
        } else {
            this.tabGlobal.classList.remove('active');
            this.tabLocal.classList.add('active');
        }

        // Slight delay to allow layout update before restoring scroll position
        setTimeout(() => {
            this.restoreTabState(scope);
        }, 10);
    }

    /**
     * Saves whether the user was at the bottom and their scroll position.
     */
    saveTabState(scope) {
        const atBottom = this.scrollChecker();
        this.tabStates[scope] = {
            atBottom: atBottom,
            scrollTop: this.messagesContainer.scrollTop,
            hasBeenVisited: true
        };
    }

    /**
     * Restores the scroll position for the selected tab.
     * If unread messages exist and user was at bottom, forces scroll to bottom.
     */
    restoreTabState(scope) {
        const state = this.tabStates[scope];
        if (!this.messagesContainer.dataset.initialized || !state.hasBeenVisited || (state.atBottom && this.unreadCounts[scope] === 0)) {
            this.scrollToBottom();
            this.unreadCounts[scope] = 0;
            state.hasBeenVisited = true;
            if (this.jumpToPresentBtn) this.jumpToPresentBtn.classList.add('hidden');
        } else {
            this.messagesContainer.scrollTop = state.scrollTop;
            if (this.unreadCounts[scope] > 0 && this.jumpToPresentBtn) {
                this.jumpToPresentBtn.classList.remove('hidden');
                this.jumpToPresentBtn.innerHTML = `<span>${this.unreadCounts[scope]} New Messages</span> <i class="fas fa-arrow-down"></i>`;
            }
        }
    }

    // --- Scroll Logic ---

    /**
     * Checks if the user is currently scrolled near the bottom of the chat.
     * Used to determine if we should auto-scroll for new messages.
     * @returns {boolean} True if within 150px of bottom
     */
    scrollChecker() {
        return this.messagesContainer.scrollHeight - this.messagesContainer.clientHeight <= this.messagesContainer.scrollTop + 150;
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        // Double-tap for browser layout inconsistencies
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }

    /**
     * Scroll to the "New Messages" marker or to the bottom if none exists.
     */
    jumpToPresent() {
        const divider = this.messagesContainer.querySelector(`.new-messages-divider[data-scope="${this.currentScope}"]`);
        if (divider) {
            this.messagesContainer.scrollTop = divider.offsetTop - 50;
        } else {
            this.scrollToBottom();
        }
        this.jumpToPresentBtn.classList.add('hidden');
        this.unreadCounts[this.currentScope] = 0;
    }

    /**
     * Main scroll handler.
     * Detects if we hit the top to trigger infinite scroll.
     * Updates "Jump to Present" button visibility.
     */
    handleScroll() {
        // If user scrolls back to bottom manually, clear unreads
        if (this.scrollChecker()) {
            if (this.jumpToPresentBtn) this.jumpToPresentBtn.classList.add('hidden');
            this.unreadCounts[this.currentScope] = 0;
        }

        // Infinite Scroll Trigger (Top of container)
        if (this.messagesContainer.scrollTop === 0 && !this.isLoadingOlder) {
            // Check for actual content
            const firstMsg = this.messagesContainer.querySelector('.chat-message');
            if (firstMsg) {
                const timestamp = firstMsg.getAttribute('data-timestamp');
                if (timestamp) {
                    this.isLoadingOlder = true;
                    // Show spinner
                    const spinner = document.getElementById('chat-loading-spinner');
                    if (spinner) spinner.style.display = 'block';

                    // Dispatch event for ChatSystem to handle network request
                    const event = new CustomEvent('requestOlderChats', { detail: { timestamp: timestamp } });
                    window.dispatchEvent(event);
                }
            }
        }
    }

    // --- Message Manipulation ---

    /**
     * Appends a batch of messages to the DOM.
     * Optimized to minimize layout thrashing by constructing a single HTML string
     * before insertion and performing bulk pruning.
     * 
     * @param {Array<Object>} messages - Array of {html, scope, isMe} objects
     */
    appendMessagesBatch(messages) {
        if (!messages || messages.length === 0) return;

        let isScrolledToBottom = this.scrollChecker();

        let combinedHtml = '';
        let dividerAdded = { global: false, local: false };

        // Check if dividers already exist in DOM to prevent duplicates
        const hasGlobalDivider = !!this.messagesContainer.querySelector(`.new-messages-divider[data-view="global"]`);
        const hasLocalDivider = !!this.messagesContainer.querySelector(`.new-messages-divider[data-view="local"]`);

        for (const msgData of messages) {
            const { html, scope, isMe } = msgData;

            // If I sent a message, always force scroll to bottom
            if (isMe) isScrolledToBottom = true;

            // Unread / Divider Logic
            let needsDivider = false;
            // If message is for current view but we aren't at bottom -> Unread
            if (scope === this.currentScope) {
                if (!isScrolledToBottom) {
                    needsDivider = true;
                    this.unreadCounts[this.currentScope]++;
                }
            } else {
                // Background tab message -> Unread
                needsDivider = true;
                this.unreadCounts[scope]++;
            }

            if (needsDivider) {
                const alreadyHas = (scope === 'global' ? hasGlobalDivider : hasLocalDivider) || dividerAdded[scope];
                if (!alreadyHas) {
                    combinedHtml += `<div class="new-messages-divider" data-scope="${scope}">New Messages</div>`;
                    dividerAdded[scope] = true;
                }
            }

            combinedHtml += html;
        }

        // Update jump button notification
        if (this.unreadCounts[this.currentScope] > 0 && this.jumpToPresentBtn) {
            this.jumpToPresentBtn.classList.remove('hidden');
            this.jumpToPresentBtn.innerHTML = `<span>${this.unreadCounts[this.currentScope]} New Messages</span> <i class="fas fa-arrow-down"></i>`;
        }

        // Single DOM Insertion (Performance Critical)
        this.messagesContainer.insertAdjacentHTML('beforeend', combinedHtml);

        // Single Prune Operation
        this.pruneMessages();

        // Single Scroll Adjustment
        if (isScrolledToBottom) {
            this.scrollToBottom();
            this.unreadCounts[this.currentScope] = 0; // Read
            if (this.jumpToPresentBtn) this.jumpToPresentBtn.classList.add('hidden');

            // Remove divider if we are at bottom (it's read)
            const divider = this.messagesContainer.querySelector(`.new-messages-divider[data-scope="${this.currentScope}"]`);
            if (divider) divider.remove();
        }

        this.applySpoilerFilters();
    }

    /**
     * Fallback for single message appending (wraps batch method).
     */
    appendMessage(html, msgScope, isMe) {
        this.appendMessagesBatch([{ html, scope: msgScope, isMe }]);
    }

    /**
     * Prepends older messages (Infinite Scroll).
     * Maintains scroll position relative to the content.
     */
    prependMessages(html) {
        const oldScrollHeight = this.messagesContainer.scrollHeight;
        this.messagesContainer.insertAdjacentHTML('afterbegin', html);

        // Restore scroll position so user doesn't jump
        const newScrollHeight = this.messagesContainer.scrollHeight;
        this.messagesContainer.scrollTop = newScrollHeight - oldScrollHeight;

        this.isLoadingOlder = false;
        const spinner = document.getElementById('chat-loading-spinner');
        if (spinner) spinner.style.display = 'none';

        this.applySpoilerFilters();
    }

    /**
     * Removes old messages if history exceeds MAX_HISTORY (200).
     * Now removes multiple elements in a loop to handle batch insertions.
     */
    pruneMessages() {
        const MAX_HISTORY = 200;
        const children = this.messagesContainer.children;
        const total = children.length;

        if (total > MAX_HISTORY) {
            // Check index 1 if spinner exists at 0
            const firstMsgIndex = (children[0] && children[0].id === 'chat-loading-spinner') ? 1 : 0;
            const toRemoveCount = total - MAX_HISTORY;

            for (let i = 0; i < toRemoveCount; i++) {
                if (children[firstMsgIndex]) {
                    children[firstMsgIndex].remove();
                } else break;
            }
        }
    }

    // --- Helpers ---

    addLocalSystemMessage(html) {
        this.messagesContainer.insertAdjacentHTML('beforeend', html);
        this.scrollToBottom();
    }

    /**
     * Shows a floating text toast in the game world (UI overlay).
     */
    showWorldToast(x, y, text) {
        const toast = document.createElement('div');
        toast.className = 'world-toast';
        toast.innerText = text;
        // ... (Styles applied directly or via CSS class) ...
        Object.assign(toast.style, {
            position: 'absolute', left: x + 'px', top: y + 'px',
            transform: 'translate(-50%, -100%)', background: 'rgba(0, 0, 0, 0.7)',
            color: '#ff6b6b', padding: '5px 10px', borderRadius: '5px',
            fontWeight: 'bold', pointerEvents: 'none', zIndex: '10000',
            transition: 'all 1s ease-out', opacity: '1'
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.top = (y - 50) + 'px';
            toast.style.opacity = '0';
        });
        setTimeout(() => toast.remove(), 1000);
    }

    updateMessageContent(id, newContent) {
        const el = document.getElementById(id);
        if (el) {
            const contentEl = el.querySelector('.message-content');
            if (contentEl) contentEl.innerHTML = newContent;
        }
    }

    removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    updateSpoiler(id, status) {
        const el = document.getElementById(id);
        if (!el) return;
        const spoilerDiv = el.querySelector('[data-spoiler-type]');
        if (spoilerDiv) {
            const old = spoilerDiv.getAttribute('data-spoiler-type');
            spoilerDiv.classList.remove(`spoiled-${old}`);
            spoilerDiv.classList.add(`spoiled-${status}`);
            spoilerDiv.setAttribute('data-spoiler-type', status);

            if (status !== 'none') {
                spoilerDiv.classList.add('spoiled-content');
                spoilerDiv.classList.remove('revealed');
            } else {
                spoilerDiv.classList.remove('spoiled-content');
            }
            this.applySpoilerFilters();
        }
    }

    updateReactions(id, html) {
        const el = document.getElementById(id);
        if (!el) return;
        const body = el.querySelector('.message-body');
        if (body) {
            const existing = body.querySelector('.reaction-bar');
            if (existing) existing.remove();
            body.insertAdjacentHTML('beforeend', html);
        }
    }

    /**
     * Applies global spoiler settings (checkboxes) to hide/reveal content types.
     */
    applySpoilerFilters() {
        ['watersports', 'disposal', 'gore'].forEach(type => {
            const box = document.getElementById(`${type}Box`);
            const isChecked = box ? box.checked : true; // Default checked (hidden)
            const elements = document.querySelectorAll(`.spoiled-${type}`);
            elements.forEach(el => {
                if (isChecked) el.classList.remove('revealed');
                else el.classList.add('revealed');
            });
        });
    }

    showConnectionBanner(msg, color) {
        if (this.connectionBanner) {
            this.connectionBanner.style.display = 'block';
            this.connectionBanner.innerText = msg;
            this.connectionBanner.style.background = color;
        }
    }

    hideConnectionBanner() {
        if (this.connectionBanner) this.connectionBanner.style.display = 'none';
    }
}

window.ChatUI = ChatUI;
