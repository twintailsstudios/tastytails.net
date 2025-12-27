function initializeChat(socket) {
    const element = (id) => document.getElementById(id);
    const messages = element('messages');
    const textarea = element('textarea');
    const spoilerLabel = element('spoiler-label');
    const jumpToPresentBtn = element('jump-to-present');
    let newMessagesCount = 0;
    let editingMessageId = null; // Track which message is being edited
    let originalDraft = ''; // Store draft when switching to edit mode
    let isLoadingOlder = false; // Track if we are currently fetching older messages

    //----- Chat box -----//
    rememberText();

    // --- Typing Indicator Logic ---
    let typingTimeout = null;
    let isTyping = false;
    const TYPING_TIMER_LENGTH = 2000; // 2 seconds

    textarea.addEventListener('input', () => {
        localStorage.setItem("textarea", textarea.innerHTML);
        charCounter();

        if (!isTyping) {
            isTyping = true;
            socket.emit('typing', {
                charId: document.location.href.split('play/')[1],
                isTyping: true
            });
        }

        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            socket.emit('typing', {
                charId: document.location.href.split('play/')[1],
                isTyping: false
            });
        }, TYPING_TIMER_LENGTH);
    });

    // --- Custom Select Logic ---
    function initCustomSelects() {
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

                customOption.addEventListener('click', function (e) {
                    e.stopPropagation(); // Prevent bubbling
                    trigger.querySelector('span').textContent = this.textContent;
                    customOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                    this.classList.add('selected');
                    customSelect.classList.remove('open');
                    select.value = this.dataset.value;

                    // Trigger change event for listeners
                    const event = new Event('change');
                    select.dispatchEvent(event);
                });
                customOptions.appendChild(customOption);
            });

            customSelect.appendChild(trigger);
            customSelect.appendChild(customOptions);
            wrapper.appendChild(customSelect);
            select.parentNode.insertBefore(wrapper, select.nextSibling);
            select.style.display = 'none'; // Hide original select

            trigger.addEventListener('click', function (e) {
                e.stopPropagation();
                // Close other selects
                document.querySelectorAll('.custom-select').forEach(s => {
                    if (s !== customSelect) s.classList.remove('open');
                });
                customSelect.classList.toggle('open');
            });
        });

        window.addEventListener('click', function (e) {
            if (!e.target.closest('.custom-select')) {
                document.querySelectorAll('.custom-select').forEach(s => s.classList.remove('open'));
            }
        });
    }

    initCustomSelects();

    // --- Scope / Tabs Logic ---
    let currentScope = 'global';
    const tabGlobal = element('tab-global');
    const tabLocal = element('tab-local');
    const tabStates = {
        global: { anchorId: null, offset: 0 },
        local: { anchorId: null, offset: 0 }
    };

    function saveTabState(scope) {
        const visibleBottom = messages.scrollTop + messages.clientHeight;
        const children = Array.from(messages.querySelectorAll('.chat-message'));
        let anchor = null;

        // Iterate backwards / find bottom-most visible message for this scope
        for (let i = children.length - 1; i >= 0; i--) {
            const el = children[i];
            // Check if matches scope and is roughly visible (top is above bottom of viewport)
            if (el.dataset.scope === scope && el.getBoundingClientRect().height > 0) {
                // Note: 'display:none' elements have 0 height/dimensions usually, 
                // but checking dataset directly is safer as we are ABOUT to change views.
                // Actually, saveTabState is called BEFORE view change, so CSS check works.
                if (el.offsetTop < visibleBottom) {
                    anchor = el;
                    break;
                }
            }
        }

        if (anchor) {
            tabStates[scope] = {
                anchorId: anchor.id,
                offset: visibleBottom - (anchor.offsetTop + anchor.offsetHeight)
            };
        } else {
            // If no messages or scrolled to top etc.
            tabStates[scope] = { anchorId: null, offset: 0 };
        }
    }

    function restoreTabState(scope) {
        const state = tabStates[scope];
        let restored = false;

        if (state && state.anchorId) {
            const anchor = document.getElementById(state.anchorId);
            if (anchor) {
                const targetBottom = anchor.offsetTop + anchor.offsetHeight + state.offset;
                messages.scrollTop = targetBottom - messages.clientHeight;
                restored = true;

                // Calculate New Messages (Unread)
                let unreadCount = 0;
                let sibling = anchor.nextElementSibling;
                while (sibling) {
                    if (sibling.classList.contains('chat-message') && sibling.dataset.scope === scope) {
                        unreadCount++;
                    }
                    sibling = sibling.nextElementSibling;
                }

                if (unreadCount > 0) {
                    // Insert Divider if missing
                    let nextEl = anchor.nextElementSibling;
                    if (!nextEl || !nextEl.classList.contains('new-messages-divider')) {
                        const marker = document.createElement('div');
                        marker.className = 'new-messages-divider';
                        marker.dataset.scope = scope;
                        marker.innerHTML = 'New Messages';
                        anchor.insertAdjacentElement('afterend', marker);
                    }

                    if (jumpToPresentBtn) {
                        jumpToPresentBtn.classList.remove('hidden');
                        jumpToPresentBtn.innerHTML = `<span>${unreadCount} New Messages</span> <i class="fas fa-arrow-down"></i>`;
                        newMessagesCount = unreadCount; // Sync global counter
                    }
                } else if (jumpToPresentBtn) {
                    jumpToPresentBtn.classList.add('hidden');
                    newMessagesCount = 0;
                    // Do NOT remove divider here. It persists until reply.
                }
            }
        }

        if (!restored) {
            messages.scrollTop = messages.scrollHeight;
            if (jumpToPresentBtn) {
                jumpToPresentBtn.classList.add('hidden');
                newMessagesCount = 0;
            }
        }
    }

    function setScope(scope) {
        // 1. Save state of OLD scope
        saveTabState(currentScope);

        currentScope = scope;
        messages.setAttribute('data-view', scope);

        // Update Tabs
        if (scope === 'global') {
            tabGlobal.classList.add('active');
            tabLocal.classList.remove('active');
        } else {
            tabGlobal.classList.remove('active');
            tabLocal.classList.add('active');
        }

        // 2. Restore state of NEW scope
        // Need brief timeout for layout update? Usually sync DOM update handles it before paint, 
        // but scrollTop needs layout. 
        // Force layout by reading scrollHeight?
        const _ = messages.scrollHeight;
        restoreTabState(scope);
    }

    if (tabGlobal && tabLocal) {
        tabGlobal.addEventListener('click', () => setScope('global'));
        tabLocal.addEventListener('click', () => setScope('local'));
    }

    // Set initial
    setScope('global');

    // --- Helper Functions ---

    function formatTime(dateString) {
        return new Date(Date.parse(dateString)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function renderMessageHTML(msg) {
        const rawTime = msg.message[msg.message.length - 1].time; // Get raw time string
        const time = formatTime(rawTime);
        const username = msg.name;
        const content = msg.message[msg.message.length - 1].content;
        const spoilerStatus = msg.spoiler.status;
        const msgId = msg._id;
        const identifier = msg.identifier; // Character ID

        const type = msg.type || 'Default'; // Default to 'Default' if undefined
        const scope = msg.scope || 'global';

        // Environmental Message Check
        // Messages from "Environment" are special system messages (e.g. vore actions, releases).
        // They are styled differently (centered, italic, no username) to distinguish them from player chat.
        if (username === 'Environment' || type === 'Environmental') {
            return `
                <div id="${msgId}" class="chat-message environmental-message" data-timestamp="${rawTime}">
                    <div class="message-content">
                        ${content}
                    </div>
                </div>
            `;
        }

        // Determine content classes based on spoiler
        let contentClasses = "message-content";
        if (spoilerStatus !== 'none') {
            contentClasses += ` spoiled-content spoiled-${spoilerStatus}`;
        }

        // Determine message container classes based on type
        let messageClasses = "chat-message";
        if (type === 'Say') messageClasses += " say-message";
        if (type === 'Unique') messageClasses += " unique-message";
        if (type === 'Interactional') messageClasses += " interactional-message";
        if (type === 'OOC') messageClasses += " ooc-message";

        // --- Reactions Rendering ---
        let reactionsHtml = '';
        if (msg.reactions) {
            reactionsHtml = '<div class="reaction-bar">';
            const reactionMap = { heart: '❤️', blush: '😳', laugh: '😂', thumbsup: '👍', thumbsdown: '👎' };
            const myCharId = document.location.href.split('play/')[1];

            for (const [type, users] of Object.entries(msg.reactions)) {
                if (users && users.length > 0) {
                    const isActive = users.includes(myCharId) ? 'active' : '';
                    reactionsHtml += `<div class="reaction-pill ${isActive}" data-reaction-toggle="${type}" data-msg-id="${msgId}">${reactionMap[type]} <span class="count">${users.length}</span></div>`;
                }
            }
            // Add Shortcut Button
            reactionsHtml += `<div class="reaction-pill add-reaction-btn" data-msg-id="${msgId}" title="Add Reaction"><i class="fas fa-plus"></i> <i class="far fa-smile"></i></div>`;
            reactionsHtml += '</div>';
        }

        return `
            <div id="${msgId}" class="${messageClasses}" data-timestamp="${rawTime}" data-scope="${scope}">
                <div class="msg-title-bar">
                    <div>
                        <span class="postTime">${time} </span>
                        <span class="msgUsername"><strong>${username}:</strong></span>
                    </div>
                    <button class="msg-control-btn material-icons" data-dropdown-button data-id="${msgId}" data-sender-id="${identifier}" title="Options">more_vert</button>
                </div>
                <div class="${contentClasses}" data-spoiler-type="${spoilerStatus}">
                    ${content}
                </div>
                ${reactionsHtml}
            </div >
            `;
    }

    // --- Jump to Present Logic ---
    if (jumpToPresentBtn) {
        jumpToPresentBtn.addEventListener('click', () => {
            const divider = messages.querySelector(`.new-messages-divider[data-scope="${currentScope}"]`);
            if (divider) {
                // Scroll to the divider (with a little padding)
                messages.scrollTop = divider.offsetTop - 50;
            } else {
                // Fallback to bottom if no divider
                messages.scrollTop = messages.scrollHeight;
            }

            jumpToPresentBtn.classList.add('hidden');
            newMessagesCount = 0;
            // Note: We do NOT remove the divider here. It serves as a visual marker.
            // The scroll listener will remove it when the user reaches the bottom.
        });
    }

    messages.addEventListener('scroll', () => {
        if (scrollChecker()) {
            if (jumpToPresentBtn) jumpToPresentBtn.classList.add('hidden');
            newMessagesCount = 0;
            // Do NOT remove divider on scroll.
        }
    });

    // --- Socket Events ---

    if (socket !== undefined) {
        console.log('Connected to Socket...');

        socket.on('output', function (data) {
            if (data.length) {
                const isScrolledToBottom = scrollChecker();
                let html = '';
                const hasVisible = data.some(m => (m.scope || 'global') === currentScope);

                // Process messages
                let currentBatchHTML = '';

                for (let i = 0; i < data.length; i++) {
                    if (data[i].deleted.status == 'false') {
                        const msgHtml = renderMessageHTML(data[i]);
                        let processed = false;

                        // Check for ghost replacement
                        if (data[i].clientMsgId) {
                            const ghost = document.getElementById('temp-' + data[i].clientMsgId);
                            if (ghost) {
                                // Flush any pending batch before replacing
                                if (currentBatchHTML) {
                                    messages.insertAdjacentHTML('beforeend', currentBatchHTML);
                                    currentBatchHTML = '';
                                }
                                ghost.outerHTML = msgHtml;
                                processed = true;
                            }
                        }

                        if (!processed) {
                            currentBatchHTML += msgHtml;
                        }
                    }
                }

                // Insert remaining DOM
                if (!isScrolledToBottom) {
                    // If user is scrolled up, add marker if not present AND we have visible messages
                    if (hasVisible && !messages.querySelector(`.new-messages-divider[data-scope="${currentScope}"]`)) {
                        const marker = document.createElement('div');
                        marker.className = 'new-messages-divider';
                        marker.dataset.scope = currentScope;
                        marker.innerHTML = 'New Messages';
                        messages.appendChild(marker);
                    }

                    if (currentBatchHTML) {
                        messages.insertAdjacentHTML('beforeend', currentBatchHTML);
                    }

                    if (hasVisible) {
                        newMessagesCount += data.filter(m => (m.scope || 'global') === currentScope).length;
                        if (newMessagesCount > 0 && jumpToPresentBtn) {
                            jumpToPresentBtn.classList.remove('hidden');
                            jumpToPresentBtn.innerHTML = `<span>${newMessagesCount} New Messages</span> <i class="fas fa-arrow-down"></i>`;
                        }
                    }
                } else {
                    // User is at bottom, just append and scroll
                    if (currentBatchHTML) {
                        messages.insertAdjacentHTML('beforeend', currentBatchHTML);
                    }

                    // Only auto-scroll if content is visible?
                    // display: none takes no space. So scrollTop remains at bottom.
                    messages.scrollTop = messages.scrollHeight - messages.clientHeight;

                    // clear button
                    newMessagesCount = 0;
                    if (jumpToPresentBtn) jumpToPresentBtn.classList.add('hidden');
                    // Do NOT remove divider here.
                }

                // Apply filters immediately after rendering
                applySpoilerFilters();
            }
        });

        socket.on('editOutput', function (data) {
            const msgEl = document.getElementById(data._id);
            if (!msgEl) return;

            if (data.deleted.status == 'false') {
                const contentEl = msgEl.querySelector('.message-content');
                if (contentEl) {
                    contentEl.innerHTML = data.message[data.message.length - 1].content;
                }
            } else {
                msgEl.remove();
            }
        });

        socket.on('editSpoilerOutput', function (data) {
            const msgEl = document.getElementById(data._id);
            if (!msgEl) return;

            const spoilerDiv = msgEl.querySelector('[data-spoiler-type]');
            if (spoilerDiv) {
                const oldStatus = spoilerDiv.getAttribute('data-spoiler-type');
                spoilerDiv.classList.remove(`spoiled-${oldStatus}`);
                spoilerDiv.classList.add(`spoiled-${data.spoiler.status}`);
                spoilerDiv.setAttribute('data-spoiler-type', data.spoiler.status);

                // Reset visibility
                if (data.spoiler.status !== 'none') {
                    spoilerDiv.classList.add('spoiled-content');
                    spoilerDiv.classList.remove('revealed');
                } else {
                    spoilerDiv.classList.remove('spoiled-content');
                }
                applySpoilerFilters();
            }
            applySpoilerFilters();
        });

        socket.on('messageReactionUpdate', function (data) {
            const msgEl = document.getElementById(data._id);
            if (!msgEl) return;

            const existingBar = msgEl.querySelector('.reaction-bar');
            if (existingBar) existingBar.remove();

            let reactionsHtml = '<div class="reaction-bar">';
            const reactionMap = { heart: '❤️', blush: '😳', laugh: '😂', thumbsup: '👍', thumbsdown: '👎' };
            const myCharId = document.location.href.split('play/')[1];
            let hasReactions = false;

            for (const [type, users] of Object.entries(data.reactions)) {
                if (users && users.length > 0) {
                    hasReactions = true;
                    const isActive = users.includes(myCharId) ? 'active' : '';
                    reactionsHtml += `<div class="reaction-pill ${isActive}" data-reaction-toggle="${type}" data-msg-id="${data._id}">${reactionMap[type]} <span class="count">${users.length}</span></div>`;
                }
            }

            if (hasReactions) {
                // Add Shortcut Button
                reactionsHtml += `<div class="reaction-pill add-reaction-btn" data-msg-id="${data._id}" title="Add Reaction"><i class="fas fa-plus"></i> <i class="far fa-smile"></i></div>`;
                reactionsHtml += '</div>';
                msgEl.insertAdjacentHTML('beforeend', reactionsHtml);
            }
        });

        socket.on('tooManyChars', function (data, message) {
            textarea.innerHTML = message;
            charCounter();
            showDialogue('Too Many Characters', `${data}/10000 Characters`, 'Your post has too many characters.');
        });

        socket.on('olderChatsOutput', function (data) {
            isLoadingOlder = false;
            const loadingSpinner = document.getElementById('chat-loading-spinner');
            if (loadingSpinner) loadingSpinner.style.display = 'none';

            if (data.length) {
                const oldScrollHeight = messages.scrollHeight;
                let html = '';

                // Process messages (reverse order because we prepend)
                for (let i = 0; i < data.length; i++) {
                    if (data[i].deleted.status == 'false') {
                        html += renderMessageHTML(data[i]);
                    }
                }

                messages.insertAdjacentHTML('afterbegin', html);

                // Maintain scroll position
                const newScrollHeight = messages.scrollHeight;
                messages.scrollTop = newScrollHeight - oldScrollHeight;

                applySpoilerFilters();
            }
        });

        socket.on('voreLog', function (message) {
            console.log(message);
        });

        // --- Connection Stability Events ---
        socket.on('serverUnstable', function () {
            const banner = document.getElementById('connection-banner');
            if (banner) {
                banner.style.display = 'block';
                banner.innerText = 'Connection Unstable: Changes are being queued...';
                banner.style.background = 'orange';
            }
        });

        socket.on('serverStable', function () {
            const banner = document.getElementById('connection-banner');
            if (banner) {
                banner.style.display = 'none';
            }
        });

        socket.on('serverCriticalWarning', function (data) {
            const banner = document.getElementById('connection-banner');
            if (banner) {
                banner.style.display = 'block';
                banner.innerText = `CRITICAL WARNING: Server shutting down in ${data.seconds} seconds!`;
                banner.style.background = 'red';
            }
        });
    }

    // --- Infinite Scroll ---
    messages.addEventListener('scroll', () => {
        if (messages.scrollTop === 0 && !isLoadingOlder) {
            const firstMsg = messages.querySelector('.chat-message');
            if (firstMsg) {
                // Get timestamp from the first message element (we need to store it or parse it)
                // Parsing from UI is brittle. Better to store raw time in data attribute.
                // Let's assume we can get it or we need to update renderMessageHTML to store it.
                // For now, let's try to parse the time or use the ID if we can't.
                // Actually, the server expects 'beforeTime'. 
                // We need the raw timestamp. Let's update renderMessageHTML to add data-timestamp.

                // Wait, I can't update renderMessageHTML in this chunk easily without a separate chunk.
                // Let's assume I will update renderMessageHTML in another chunk.
                const timestamp = firstMsg.getAttribute('data-timestamp');
                if (timestamp) {
                    isLoadingOlder = true;
                    const loadingSpinner = document.getElementById('chat-loading-spinner');
                    if (loadingSpinner) loadingSpinner.style.display = 'block';

                    socket.emit('getOlderChats', {
                        beforeTime: timestamp,
                        token: getToken(),
                        charId: document.location.href.split('play/')[1]
                    });
                }
            }
        }
    });

    // --- Event Delegation ---

    messages.addEventListener('click', function (e) {
        // 1. Handle Spoiler Clicks
        const spoilerContainer = e.target.closest('.spoiled-content');
        if (spoilerContainer && !e.target.closest('.message-content.editing')) {
            // Reveal on click
            spoilerContainer.classList.toggle('revealed');
            return;
        }

        // 2. Handle Settings/Edit Button Click
        const settingsBtn = e.target.closest('[data-dropdown-button]');
        if (settingsBtn) {
            e.stopPropagation();
            const msgId = settingsBtn.getAttribute('data-id');
            const senderId = settingsBtn.getAttribute('data-sender-id');
            const msgEl = document.getElementById(msgId);
            const contentEl = msgEl.querySelector('.message-content');
            const spoilerEl = msgEl.querySelector('[data-spoiler-type]');

            createContextMenu(e.clientX, e.clientY, msgId, senderId, contentEl, spoilerEl);
        }

        // 3. Handle Reaction Toggle Clicks
        const reactionToggle = e.target.closest('[data-reaction-toggle]');
        if (reactionToggle) {
            e.stopPropagation();
            const msgId = reactionToggle.getAttribute('data-msg-id');
            const reaction = reactionToggle.getAttribute('data-reaction-toggle');
            const charId = document.location.href.split('play/')[1];
            socket.emit('toggleReaction', { _id: msgId, reaction: reaction, token: getToken(), charId: charId });
        }

        // 4. Handle Add Reaction Shortcut Click
        const addReactionBtn = e.target.closest('.add-reaction-btn');
        if (addReactionBtn) {
            e.stopPropagation();
            const msgId = addReactionBtn.getAttribute('data-msg-id');
            showReactionOptions(addReactionBtn, msgId);
        }
    });

    // --- Context Menu Logic ---

    function createContextMenu(x, y, msgId, senderId, contentEl, spoilerEl) {
        // Remove existing menus
        document.querySelectorAll('.msg-settings-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'msg-settings-menu';
        menu.style.position = 'fixed';

        // Adjust position to keep in viewport
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;

        const myCharId = document.location.href.split('play/')[1];
        const isMyMessage = (senderId === myCharId);

        let html = '';
        if (isMyMessage) {
            html += `<div class="msg-settings-option" data-action="edit">Edit</div>`;
            html += `<div class="msg-settings-option" data-action="delete">Delete</div>`;
            html += `<div class="msg-settings-option" data-action="spoiler">Edit Spoiler</div>`;
            html += `<div class="msg-settings-option" data-action="reaction">Add Reaction</div>`;
        } else {
            html += `<div class="msg-settings-option" data-action="spoiler">Edit Spoiler</div>`;
            html += `<div class="msg-settings-option" data-action="reaction">Add Reaction</div>`;
        }

        menu.innerHTML = html;
        document.body.appendChild(menu);

        // Adjust position if off-screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = `${y - rect.height}px`;
        }

        // Handle Menu Clicks
        menu.addEventListener('click', (e) => {
            const action = e.target.getAttribute('data-action');
            if (action === 'edit') startEditing(msgId, contentEl);
            if (action === 'delete') confirmDelete(msgId);
            if (action === 'spoiler') showSpoilerOptions(e.target, msgId, spoilerEl);
            if (action === 'reaction') showReactionOptions(e.target, msgId);

            if (action !== 'spoiler' && action !== 'reaction') menu.remove();
        });

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
    }

    function startEditing(msgId, contentEl) {
        // 0. Save Draft if not already editing
        if (!editingMessageId) {
            originalDraft = textarea.innerHTML;
        }

        // 1. Set State
        editingMessageId = msgId;

        // 2. Highlight Message
        document.querySelectorAll('.chat-message').forEach(el => el.classList.remove('editing-highlight'));
        const msgRow = document.getElementById(msgId);
        if (msgRow) msgRow.classList.add('editing-highlight');

        // 3. Copy Content to Textarea
        textarea.innerHTML = contentEl.innerHTML;
        textarea.focus();

        // 4. Show Indicator
        const indicator = document.getElementById('editing-indicator');
        if (indicator) indicator.classList.remove('hidden');

        // 5. Handle Cancel Click
        const cancelBtn = document.getElementById('cancel-edit');
        if (cancelBtn) {
            cancelBtn.onclick = cancelEditing;
        }
    }

    function cancelEditing() {
        editingMessageId = null;
        textarea.innerHTML = originalDraft; // Restore draft
        originalDraft = '';
        document.querySelectorAll('.editing-highlight').forEach(el => el.classList.remove('editing-highlight'));
        document.getElementById('editing-indicator').classList.add('hidden');
        charCounter();
    }

    function confirmDelete(msgId) {
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
            socket.emit('deleteMessage', {
                _id: msgId,
                token: getToken(),
                charId: document.location.href.split('play/')[1]
            });
            dialogue.remove();
        };
    }

    function getToken() {
        const match = document.cookie.match(new RegExp('(^| )TastyTails=([^;]+)'));
        if (match) return match[2];
        return '';
    }

    function showSpoilerOptions(targetEl, msgId, spoilerEl) {
        if (targetEl.querySelector('.spoiler-sub-menu')) return; // Already open

        // Create sub-menu for spoilers
        const currentStatus = spoilerEl.getAttribute('data-spoiler-type');
        const options = ['general', 'watersports', 'disposal', 'gore', 'none'];

        const list = document.createElement('div');
        list.className = 'msg-settings-menu spoiler-sub-menu';

        // Ensure relative positioning for absolute child
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
                socket.emit('sendSpoilEdit', {
                    _id: msgId,
                    spoiler: opt,
                    token: getToken(),
                    charId: document.location.href.split('play/')[1]
                });
                targetEl.closest('.msg-settings-menu').remove();
            };
            list.appendChild(item);
        });

        targetEl.appendChild(list);

        // Adjust position if off-screen
        const rect = list.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            list.style.left = 'auto';
            list.style.right = '100%';
        }
        if (rect.bottom > window.innerHeight) {
            list.style.top = 'auto';
            list.style.bottom = '0';
        }
    }

    function showReactionOptions(targetEl, msgId) {
        if (targetEl.querySelector('.reaction-sub-menu')) return; // Already open

        // Create sub-menu for reactions
        const options = ['heart', 'blush', 'laugh', 'thumbsup', 'thumbsdown'];
        const reactionMap = { heart: '❤️', blush: '😳', laugh: '😂', thumbsup: '👍', thumbsdown: '👎' };

        const list = document.createElement('div');
        list.className = 'msg-settings-menu reaction-sub-menu';

        // Ensure relative positioning
        targetEl.style.position = 'relative';

        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'msg-settings-option reaction-menu-option';

            item.innerHTML = `${reactionMap[opt]} ${opt.charAt(0).toUpperCase() + opt.slice(1)}`;

            item.onclick = (e) => {
                e.stopPropagation();
                const charId = document.location.href.split('play/')[1];
                socket.emit('toggleReaction', {
                    _id: msgId,
                    reaction: opt,
                    token: getToken(),
                    charId: charId
                });
                list.remove(); // Safely remove the menu we just created
            };
            list.appendChild(item);
        });

        targetEl.appendChild(list);

        // Adjust position
        const rect = list.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            list.style.left = 'auto';
            list.style.right = '100%';
        }
        if (rect.bottom > window.innerHeight) {
            list.style.top = 'auto';
            list.style.bottom = '0';
        }
    }

    function showDialogue(title, subtitle, message) {
        const div = document.createElement('div');
        div.className = 'dialogueBox';
        div.innerHTML = `
            <h2>${title}</h2>
            <h3>${subtitle}</h3>
            <div>${message}</div>
            <button>OK</button>
        `;
        div.querySelector('button').onclick = () => div.remove();
        document.querySelector('.chat-holder').appendChild(div);
    }

    // --- Global Dropdown Logic ---
    document.addEventListener('click', e => {
        const isDropdownButton = e.target.matches('[data-dropdown-button]');
        if (!isDropdownButton && e.target.closest('[data-dropdown]') != null) return;

        let currentDropdown;
        if (isDropdownButton) {
            currentDropdown = e.target.closest('[data-dropdown]');
            if (currentDropdown) {
                currentDropdown.classList.toggle('active');
            }
        }

        document.querySelectorAll('[data-dropdown].active').forEach(dropdown => {
            if (dropdown === currentDropdown) return;
            dropdown.classList.remove('active');
        });
    });

    // --- Input Handling ---

    // --- Character Limit Modal ---
    const charModal = document.getElementById('char-limit-modal');
    const closeCharModalBtn = document.getElementById('close-char-modal');

    function showCharLimitModal() {
        if (charModal) {
            charModal.style.display = 'flex';
            charModal.style.animation = 'fadeIn 0.2s';
        }
    }

    if (closeCharModalBtn) {
        closeCharModalBtn.addEventListener('click', () => {
            if (charModal) charModal.style.display = 'none';
        });
    }

    if (charModal) {
        charModal.addEventListener('click', (e) => {
            if (e.target === charModal) {
                charModal.style.display = 'none';
            }
        });
    }

    // --- Input Handling ---

    textarea.addEventListener('keydown', function (event) {
        if (event.which === 13 && !event.shiftKey) {
            event.preventDefault();

            // Prevent blank messages
            if (!textarea.innerText.trim()) {
                return;
            }

            // --- EDIT MODE ---
            if (editingMessageId) {
                socket.emit('inputEdit', {
                    _id: editingMessageId,
                    message: textarea.innerHTML,
                    token: getToken(),
                    charId: document.location.href.split('play/')[1]
                });
                cancelEditing();
                return;
            }

            // --- NORMAL MODE ---
            const charCount = charCounter();
            console.log("Attempting to send. Char count:", charCount);
            if (charCount <= 10000) {
                // Remove divider if we are at the bottom (replying = read)
                if (scrollChecker()) {
                    const existingMarker = messages.querySelector(`.new-messages-divider[data-scope="${currentScope}"]`);
                    if (existingMarker) existingMarker.remove();
                }

                // Generate Temp ID
                const tempId = Date.now().toString(36) + Math.random().toString(36).substring(2);

                // Simple helper to guess type for optimistic render
                let optimisticType = 'Default';
                const cleanTxt = textarea.innerHTML.replace(/<[^>]*>/g, '').trim();
                if (cleanTxt.startsWith('/me ')) optimisticType = 'Say';
                if (cleanTxt.startsWith('/ooc ')) optimisticType = 'OOC';

                // Create Ghost Object
                const ghostMsg = {
                    _id: 'temp-' + tempId,
                    name: localPlayerInfo.firstName + ' ' + localPlayerInfo.lastName,
                    type: optimisticType,
                    scope: currentScope,
                    message: [{ content: textarea.innerHTML, time: new Date().toUTCString() }],
                    spoiler: { status: document.getElementById('spoilers').value, votes: { watersports: 0, disposal: 0, gore: 0 } },
                    identifier: document.location.href.split('play/')[1],
                    deleted: { status: 'false' },
                    local: true // Flag to say this is local/ghost if needed, but class handling is manual below
                };

                // Render and Append Ghost
                const ghostContainer = document.createElement('div');
                ghostContainer.innerHTML = renderMessageHTML(ghostMsg);
                const ghostEl = ghostContainer.firstElementChild;
                if (ghostEl) {
                    ghostEl.classList.add('ghost-message');
                    // Ensure it is visible in current view (it matches scope)
                    messages.appendChild(ghostEl);
                    messages.scrollTop = messages.scrollHeight;
                }

                socket.emit('input', {
                    name: localPlayerInfo.firstName + ' ' + localPlayerInfo.lastName,
                    message: textarea.innerHTML,
                    scope: currentScope,
                    spoiler: document.getElementById('spoilers').value,
                    token: getToken(),
                    charId: document.location.href.split('play/')[1],
                    clientMsgId: tempId
                });
                localStorage.setItem('previousMessage', textarea.innerHTML);
                textarea.innerHTML = '';
                charCounter();
            } else {
                showCharLimitModal();
            }
        }

        if (event.which === 27 && editingMessageId) { // Escape to cancel edit
            cancelEditing();
        }

        if (event.which === 38 && textarea.innerHTML === '') { // Up arrow
            textarea.innerHTML = localStorage.getItem("previousMessage") || '';
            charCounter();
        }

        // Formatting shortcuts
        if (event.ctrlKey) {
            switch (event.key) {
                case 'b': event.preventDefault(); document.execCommand('bold'); break;
                case 'i': event.preventDefault(); document.execCommand('italic'); break;
                case 'u': event.preventDefault(); document.execCommand('underline'); break;
                case 's': event.preventDefault(); document.execCommand('strikethrough'); break;
                case '-': event.preventDefault(); document.execCommand('subscript'); break;
                case '+': event.preventDefault(); document.execCommand('superscript'); break;
            }
        }
    });



    function charCounter() {
        const count = textarea.innerText.length;
        const counterEl = document.querySelector('.charlimit');
        if (counterEl) {
            counterEl.innerText = `${count}/10000`;
            counterEl.style.color = count > 9950 ? '#c94747' : '#767f66';
        }
        return count;
    }

    function rememberText() {
        const stored = localStorage.getItem("textarea");
        if (stored) {
            textarea.innerHTML = stored;
            charCounter();
        }
    }

    function scrollChecker() {
        return messages.scrollHeight - messages.clientHeight <= messages.scrollTop + 50; // Tolerance
    }

    // --- Formatting Buttons ---
    // --- Formatting Buttons ---
    const formatCommands = ['bold', 'italic', 'underline', 'strikethrough', 'subscript', 'superscript'];

    function updateButtonStates() {
        formatCommands.forEach(cmd => {
            const btn = document.getElementById(`${cmd}-btn`);
            if (btn) {
                if (document.queryCommandState(cmd)) {
                    btn.classList.add('activeBtn');
                } else {
                    btn.classList.remove('activeBtn');
                }
            }
        });
    }

    formatCommands.forEach(cmd => {
        const btn = document.getElementById(`${cmd}-btn`);
        if (btn) {
            btn.addEventListener('click', () => {
                document.execCommand(cmd);
                textarea.focus();
                updateButtonStates();
            });
        }
    });

    // Update buttons when cursor moves or selection changes
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === textarea) {
            updateButtonStates();
        }
    });

    // --- Filter Handling ---
    function applySpoilerFilters() {
        ['watersports', 'disposal', 'gore'].forEach(type => {
            const box = document.getElementById(`${type}Box`);
            const isChecked = box ? box.checked : true; // Default to checked (hide)

            const elements = document.querySelectorAll(`.spoiled-${type}`);
            elements.forEach(el => {
                if (isChecked) {
                    // Hide (remove revealed class)
                    el.classList.remove('revealed');
                } else {
                    // Show (add revealed class)
                    el.classList.add('revealed');
                }
            });
        });
    }

    ['watersportsBox', 'disposalBox', 'goreBox'].forEach(id => {
        const box = document.getElementById(id);
        if (box) {
            box.addEventListener('change', applySpoilerFilters);
        }
    });

    // Initial filter application
    applySpoilerFilters();
}
