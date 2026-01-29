document.addEventListener('DOMContentLoaded', async () => {
    const charSelect = document.getElementById('charSelect');
    const searchBtn = document.getElementById('searchBtn');
    const saveBtn = document.getElementById('saveBtn');
    const chatResults = document.getElementById('chatResults');
    const statusMsg = document.getElementById('statusMsg');

    // Filters
    const searchInput = document.getElementById('searchInput');
    const partnerInput = document.getElementById('partnerInput');
    const locationInput = document.getElementById('locationInput');
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');
    const voreTypeInput = document.getElementById('voreTypeInput');
    const sizeInput = document.getElementById('sizeInput');
    const spellInput = document.getElementById('spellInput');

    // Pagination State
    let currentPage = 1;
    let currentLimit = 50;

    // Mass Selection State
    let lastCheckedCheckbox = null; // For Shift-Click
    let isRangeMode = false;
    let rangeStartId = null;
    let rangeEndId = null;
    let rangeStartTime = null;
    let rangeEndTime = null;
    const rangeExcludedIds = new Set();

    // Context Jump State
    let targetJumpId = null;

    // Load User Characters


    // Quick Fix: Let's fetch from the /character-bank page? No that's HTML.
    // I'll assume I need to fetch it.
    // Let's use a simple Fetch to a new endpoint I'll add to chatArchives.js route: GET /characters
    loadCharacters();

    async function loadCharacters() {
        try {
            // We'll hit the new endpoint I'll add in a moment.
            const res = await fetch('/api/chat-archives/my-characters');
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();

            charSelect.innerHTML = '<option value="" disabled selected>Select a character</option>';
            data.forEach(char => {
                const opt = document.createElement('option');
                opt.value = char._id;
                opt.textContent = `${char.firstName} ${char.lastName}`;
                charSelect.appendChild(opt);
            });

            charSelect.addEventListener('change', () => {
                searchBtn.disabled = false;
                // Auto search? Maybe not.
            });

        } catch (err) {
            console.error("Error loading characters", err);
            charSelect.innerHTML = '<option disabled>Error loading characters</option>';
        }

    }

    // Load Zones
    loadZones();
    async function loadZones() {
        const locationSelect = document.getElementById('locationInput');
        try {
            const res = await fetch('/api/chat-archives/zones');
            if (!res.ok) {
                const text = await res.text();
                console.error(`Status: ${res.status} ${res.statusText}, Body: ${text}`);
                throw new Error(`Failed to load zones: ${res.status}`);
            }
            const zones = await res.json();

            // Keep default "Any Location"
            locationSelect.innerHTML = '<option value="">Any Location</option>';

            zones.forEach(zone => {
                if (!zone) return;
                const opt = document.createElement('option');
                opt.value = zone;
                // Capitalize first letter strictly for display? Or just use raw string.
                // Raw string is usually "pub", "blacksmith".
                opt.textContent = zone.charAt(0).toUpperCase() + zone.slice(1);
                locationSelect.appendChild(opt);
            });
        } catch (err) {
            console.error("Error loading zones", err);
        }
    }

    // Selection Persistence
    const selectedMessageIds = new Set();
    const selectedPartners = new Set(); // NEW: Multi-select partners

    // Clear selection on new search? 
    // Usually yes, if parameters change. If paging, no. 
    // We'll clear it in performSearch ONLY if it's page 1 (implied new search) 
    // OR explicit clear. Actually, searchBtn click sets page=1.

    // ... (rest of code) ...

    // Search Logic
    searchBtn.addEventListener('click', () => {
        currentPage = 1;
        selectedMessageIds.clear(); // New search clears checkboxes
        selectedPartners.clear();   // New search clears partner filters
        if (typeof selectedExcludedPartners !== 'undefined') selectedExcludedPartners.clear();

        lastCheckedCheckbox = null;
        // Keep Range Mode? Probably reset it for safety or keep it? 
        // Let's keep it but reset selection points if they aren't valid? 
        // Simpler to just reset range points on new search.
        rangeStartId = null;
        rangeEndId = null;
        rangeStartTime = null;
        rangeEndTime = null;
        rangeExcludedIds.clear();
        updateRangeVisuals();

        document.getElementById('partnerTags').innerHTML = '';
        document.getElementById('excludePartnerTags').innerHTML = '';
        performSearch();
    });

    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.select-checkbox');
            let allChecked = true;
            // Check if all are already checked to toggle off? Or just Select All?
            // "Select All" usually implies Select All. Toggle would be "Toggle All".
            // Let's just Select All.
            checkboxes.forEach(cb => {
                cb.checked = true;
                selectedMessageIds.add(cb.dataset.id);
            });
            saveBtn.disabled = (selectedMessageIds.size === 0);
        });
    }

    const rangeModeBtn = document.getElementById('rangeModeBtn');
    if (rangeModeBtn) {
        rangeModeBtn.addEventListener('click', () => {
            isRangeMode = !isRangeMode;
            rangeModeBtn.classList.toggle('range-mode-active', isRangeMode);

            // Visual feedback
            if (isRangeMode) {
                rangeModeBtn.innerHTML = '<i class="fa-solid fa-arrows-left-right-to-line"></i> Range Mode: ON';
                alert('Range Mode Active:\n1. Click a message to set START.\n2. Click another message (even on a different page) to set END.\n3. Click "Save Selected" to save everything in between.');
            } else {
                rangeModeBtn.innerHTML = '<i class="fa-solid fa-arrows-left-right-to-line"></i> Range Mode';
                rangeStartId = null;
                rangeEndId = null;
                rangeStartTime = null;
                rangeEndTime = null;
                rangeExcludedIds.clear();
                updateRangeVisuals();
            }
        });
    }

    async function performSearch() {
        const charId = charSelect.value;
        if (!charId) return;

        // Reset Partner Search Input Only (keep the tags/selection)
        partnerInput.value = '';
        partnerInput.disabled = true;

        // Reset Exclude Partner Search
        const excludePartnerInput = document.getElementById('excludePartnerInput');
        if (excludePartnerInput) {
            excludePartnerInput.value = '';
            excludePartnerInput.disabled = true;
        }

        document.getElementById('partnerList').innerHTML = ''; // Clear datalist
        document.getElementById('excludePartnerList').innerHTML = ''; // Clear datalist

        // selectedPartners and tags are preserved unless this is a new search (handled above)
        // Need to handle selectedExcludedPartners persistence too if not cleared above.
        // If it's a new search, we should clear it.



        const payload = {
            characterId: charId,
            page: currentPage,
            limit: currentLimit,
            filters: {
                content: searchInput.value,
                // Partner Name is CLIENT SIDE ONLY now.
                // partnerName: partnerInput.value, 
                location: locationInput.value,
                startDate: startDate.value,
                endDate: endDate.value,
                voreType: voreTypeInput.value,
                size: sizeInput.value,
                sort: document.getElementById('sortOrder').value
            }
        };

        try {
            const res = await fetch('/api/chat-archives/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await res.json();

            if (result.error) {
                chatResults.innerHTML = `<div class="placeholder-msg error">${result.error}</div>`;
                statusMsg.textContent = "Error.";
                return;
            }

            renderResults(result.data);
            populatePartnerFilter(result.data); // NEW: Populate dynamic filter

            // Re-apply Client-Side Filters
            // Re-apply Client-Side Filters
            renderPartnerTags(selectedPartners, 'partnerTags');
            renderPartnerTags(selectedExcludedPartners, 'excludePartnerTags', true);
            filterMessages();
            filterMessages();

            updatePagination(result.pagination);
            statusMsg.textContent = `Found ${result.pagination.total} messages.`;

            // Handle Context Jump (Scroll & Highlight)
            if (targetJumpId) {
                const targetRow = document.querySelector(`.chat-message-row[data-id="${targetJumpId}"]`);
                if (targetRow) {
                    setTimeout(() => {
                        targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        targetRow.classList.add('flash-highlight');
                        // Remove class after animation
                        setTimeout(() => targetRow.classList.remove('flash-highlight'), 2000);
                    }, 500); // Small delay to allow render/DOM reflow
                }
                targetJumpId = null; // Clear
            }

        } catch (err) {
            console.error(err);
            chatResults.innerHTML = '<div class="placeholder-msg error">Network Error</div>';
        }
    }

    function renderResults(messages) {
        if (!messages || messages.length === 0) {
            chatResults.innerHTML = '<div class="placeholder-msg">No messages found.</div>';
            // Only disable save if set is also empty
            if (selectedMessageIds.size === 0 && !isRangeMode) saveBtn.disabled = true;
            return;
        }

        chatResults.innerHTML = '';
        // In range mode, save button is always enabled if we have points, or disabled if not?
        // Actually save button logic should update based on mode.
        updateSaveButtonState();

        const checkboxes = [];

        messages.forEach((msg, index) => {
            const row = document.createElement('div');
            row.className = 'chat-message-row';
            row.dataset.id = msg._id; // Store ID on row for range clicking

            const msgTime = new Date(msg.createdAt || msg.message[0].time).getTime();
            row.dataset.time = msgTime;

            // Visuals for Range Mode
            if (msg._id === rangeStartId) row.classList.add('range-start');
            if (msg._id === rangeEndId) row.classList.add('range-end');

            // Highlight In-Range Messages
            let isInRange = false;
            if (isRangeMode && rangeStartTime && rangeEndTime) {
                const start = Math.min(rangeStartTime, rangeEndTime);
                const end = Math.max(rangeStartTime, rangeEndTime);
                if (msgTime >= start && msgTime <= end) {
                    isInRange = true;
                    row.classList.add('in-range');
                }
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'select-checkbox';
            checkbox.dataset.id = msg._id;
            checkbox.dataset.index = index; // For shift-click

            // Restore selection state
            // Normal Mode: from selectedMessageIds
            // Range Mode: Checked if In-Range AND NOT Excluded
            if (isRangeMode) {
                if (isInRange && !rangeExcludedIds.has(msg._id)) {
                    checkbox.checked = true;
                } else if (msg._id === rangeStartId || msg._id === rangeEndId) {
                    checkbox.checked = true; // Start/End always checked effectively
                }
            } else {
                if (selectedMessageIds.has(msg._id)) {
                    checkbox.checked = true;
                }
            }

            // Click Listener for Row (Range Mode)
            row.addEventListener('click', (e) => {
                // If clicking checkbox, don't trigger row logic unless we need to
                if (e.target === checkbox) return;

                if (isRangeMode) {
                    handleRangeClick(msg._id, msgTime);
                } else {
                    // Optional: Clicking row toggles checkbox?
                    // checkbox.click(); // Standard behavior often likes this
                }
            });

            // Listen for changes (Standard & Shift-Click)
            checkbox.addEventListener('click', (e) => {
                // Use 'click' instead of 'change' to catch shift key cleanly on the event
                const isChecked = e.target.checked;
                const currentId = msg._id;
                const currentIndex = index;

                if (e.shiftKey && lastCheckedCheckbox !== null && !isRangeMode) {
                    const start = Math.min(lastCheckedCheckbox, currentIndex);
                    const end = Math.max(lastCheckedCheckbox, currentIndex);

                    // Check all in range
                    for (let i = start; i <= end; i++) {
                        const cb = checkboxes[i];
                        cb.checked = isChecked; // Follow the leader
                        if (isChecked) selectedMessageIds.add(cb.dataset.id);
                        else selectedMessageIds.delete(cb.dataset.id);
                    }
                } else if (isRangeMode) {
                    // Range Mode Checkbox Logic
                    // Unchecking an in-range item -> Exclude
                    // Checking an excluded item -> Re-include
                    if (!isChecked) {
                        rangeExcludedIds.add(currentId);
                    } else {
                        rangeExcludedIds.delete(currentId);
                    }
                } else {
                    // Normal Click
                    if (isChecked) selectedMessageIds.add(currentId);
                    else selectedMessageIds.delete(currentId);
                }

                lastCheckedCheckbox = currentIndex;
                updateSaveButtonState();
            });

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'msg-content-wrapper';

            // Format time
            const date = new Date(msg.createdAt || msg.message[0].time);
            const timeParams = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateParams = date.toLocaleDateString();

            // Construct HTML similar to chat.js
            let html = `
                <div class="msg-header">
                    <span class="msg-time">[${dateParams} ${timeParams}]</span>
                    <span class="msg-name ${msg.type}">${msg.name}:</span>
                    <div class="msg-header-actions">
                        <button class="btn-icon" title="Jump to Context" onclick="window.jumpToContext('${msg._id}', '${msg.createdAt || msg.message[0].time}')">
                            <i class="fa-solid fa-turn-up"></i>
                        </button>
                    </div>
                </div>
                <div class="msg-body">
                    ${msg.message[0].content} 
                </div>
            `;
            contentWrapper.innerHTML = html;

            row.appendChild(checkbox);
            row.appendChild(contentWrapper);
            chatResults.appendChild(row);

            checkboxes.push(checkbox); // Track for shift-click
        });
    }

    function handleRangeClick(id) {
        // Find element to get time
        // Note: We might click a row on a page where we don't have the object in 'messages' scope here easily?
        // renderResults creates the closure, so 'messages' is available inside renderResults, 
        // but handleRangeClick is outside.
        // We need to pass the time or find it.
        // Let's modify handleRangeClick signature or look it up from DOM?
        // DOM .chat-message-row might not have time.
        // Better: Pass timestamp from renderResults.
    }

    // Redefine handleRangeClick to accept time
    function handleRangeClick(id, timestamp) {
        if (!rangeStartId) {
            rangeStartId = id;
            rangeStartTime = timestamp;
            rangeEndId = null; // Reset end if restarting
            rangeEndTime = null;
        } else if (!rangeEndId) {
            rangeEndId = id;
            rangeEndTime = timestamp;
        } else {
            // Both set, restart with this as new start
            rangeStartId = id;
            rangeStartTime = timestamp;
            rangeEndId = null;
            rangeEndTime = null;
        }

        // Clear exclusions when range changes
        rangeExcludedIds.clear();

        // Re-render to update highlights
        // We need to re-run renderResults but we don't have the messages array here.
        // Actually, we can just update visually if on this page?
        // But renderResults does the "In Range" check. 
        // We should trigger a re-render or manually update classes.
        // Manual update is faster.
        updateRangeVisuals();
        updateSaveButtonState();
    }

    function updateRangeVisuals() {
        const rows = document.querySelectorAll('.chat-message-row');

        // Calculate range
        let start = 0, end = 0;
        if (rangeStartTime && rangeEndTime) {
            start = Math.min(rangeStartTime, rangeEndTime);
            end = Math.max(rangeStartTime, rangeEndTime);
        }

        rows.forEach(row => {
            row.classList.remove('range-start', 'range-end', 'in-range');
            const id = row.dataset.id;

            if (id === rangeStartId) row.classList.add('range-start');
            if (id === rangeEndId) row.classList.add('range-end');

            // Check if in range
            // We need the timestamp for each row.
            // Let's store it on dataset in renderResults?
            const timeStr = row.dataset.time;
            if (timeStr && start && end) {
                const time = parseInt(timeStr);
                if (time >= start && time <= end) {
                    row.classList.add('in-range');

                    // Update checkbox state
                    const cb = row.querySelector('.select-checkbox');
                    if (cb) {
                        // Check if excluded
                        cb.checked = !rangeExcludedIds.has(id);
                    }
                } else {
                    // Not in range, uncheck?
                    // If we are in range mode, things outside range should be unchecked?
                    // Yes.
                    const cb = row.querySelector('.select-checkbox');
                    if (cb) cb.checked = false;
                }
            }
        });
    }

    function updateSaveButtonState() {
        // If Range Mode: Enabled if Start AND End are set.
        // If Normal Mode: Enabled if selectedMessageIds > 0.
        // Actually, we can allow mixing? "Save Selected" usually implies checkboxes.
        // Maybe we need two save actions? Or one payload?
        // Let's assume one payload.

        if (isRangeMode) {
            saveBtn.disabled = !(rangeStartId && rangeEndId);
            saveBtn.innerHTML = (rangeStartId && rangeEndId)
                ? '<i class="fa-solid fa-floppy-disk"></i> Save Range'
                : '<i class="fa-solid fa-floppy-disk"></i> Select Start & End';
        } else {
            saveBtn.disabled = (selectedMessageIds.size === 0);
            saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Selected';
        }
    }

    function updatePagination(pagination) {
        const prevPage = document.getElementById('prevPage');
        const nextPage = document.getElementById('nextPage');
        const pageInfo = document.getElementById('pageInfo');
        const paginationContainer = document.querySelector('.pagination-controls');

        if (pagination.pages <= 1) {
            paginationContainer.style.display = 'none';
            return;
        }

        paginationContainer.style.display = 'flex';
        pageInfo.textContent = `Page ${pagination.page} of ${pagination.pages}`;

        prevPage.disabled = pagination.page <= 1;
        nextPage.disabled = pagination.page >= pagination.pages;

        // Clone and replace to prevent duplicate listeners
        const newPrev = prevPage.cloneNode(true);
        const newNext = nextPage.cloneNode(true);
        prevPage.parentNode.replaceChild(newPrev, prevPage);
        nextPage.parentNode.replaceChild(newNext, nextPage);

        newPrev.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                performSearch();
            }
        });

        newNext.addEventListener('click', () => {
            if (currentPage < pagination.pages) {
                currentPage++;
                performSearch();
            }
        });
    }

    // Save Logic
    saveBtn.addEventListener('click', async () => {
        // Use the Set instead of DOM
        const selected = Array.from(selectedMessageIds);

        if (selected.length === 0 && !isRangeMode) {
            alert('Please select messages to save.');
            return;
        }

        // If Range Mode, we might not have selected IDs, but we have range.
        let countText = isRangeMode ? "the selected range of" : selected.length;

        const title = prompt(`Saving ${countText} messages. Enter a name for this saved log:`);
        if (!title) return;

        try {
            let payload = {
                characterId: charSelect.value,
                title: title
            };

            if (isRangeMode) {
                if (!rangeStartId || !rangeEndId) {
                    alert("Please select both a start and end message.");
                    return;
                }
                payload.rangeMode = true;
                payload.rangeStartId = rangeStartId;
                payload.rangeEndId = rangeEndId;
                payload.excludedMessageIds = Array.from(rangeExcludedIds);
                // Send Partner Filters for Server-Side Range Query
                payload.filters = {
                    content: searchInput.value,
                    location: locationInput.value,
                    voreType: voreTypeInput.value,
                    size: sizeInput.value,
                    sort: document.getElementById('sortOrder').value,
                    includedPartners: Array.from(selectedPartners),
                    excludedPartners: Array.from(selectedExcludedPartners || [])
                };
            } else {
                payload.messageIds = selected;
            }

            const res = await fetch('/api/chat-archives/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.success) {
                alert('Log saved successfully!');
            } else {
                alert('Error saving log: ' + data.error);
            }
        } catch (err) {
            console.error(err);
            alert('Network error while saving.');
        }
    });


    // --- Dynamic Partner Filter Logic (Include / Exclude) ---

    // 1. Include Partner Logic
    partnerInput.addEventListener('input', () => {
        handlePartnerInput(partnerInput, selectedPartners, 'partnerList', 'partnerTags');
    });

    const excludePartnerInput = document.getElementById('excludePartnerInput');
    const selectedExcludedPartners = new Set();

    // 2. Exclude Partner Logic
    excludePartnerInput.addEventListener('input', () => {
        handlePartnerInput(excludePartnerInput, selectedExcludedPartners, 'excludePartnerList', 'excludePartnerTags', true);
    });

    function handlePartnerInput(inputEl, set, listId, containerId, isExclude = false) {
        const val = inputEl.value;
        const opts = document.getElementById(listId).options;

        // Check if value matches an option (Selection Event)
        for (let i = 0; i < opts.length; i++) {
            if (opts[i].value === val) {
                addPartnerTag(val, set, containerId, isExclude);
                inputEl.value = ''; // Clear input
                break;
            }
        }
    }

    function addPartnerTag(name, set, containerId, isExclude = false) {
        if (set.has(name)) return;
        set.add(name);
        renderPartnerTags(set, containerId, isExclude);
        filterMessages();
    }

    function removePartnerTag(name, set, containerId, isExclude = false) {
        set.delete(name);
        renderPartnerTags(set, containerId, isExclude);
        filterMessages();
    }

    function renderPartnerTags(set, containerId, isExclude = false) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        set.forEach(name => {
            const tag = document.createElement('div');
            tag.className = 'partner-tag';
            if (isExclude) tag.style.backgroundColor = '#e74c3c'; // Red for exclude

            tag.innerHTML = `
                <span>${name}</span>
                <span class="remove-tag" data-name="${name}">&times;</span>
            `;
            tag.querySelector('.remove-tag').addEventListener('click', (e) => {
                removePartnerTag(e.target.dataset.name, set, containerId, isExclude);
            });
            container.appendChild(tag);
        });
    }

    function filterMessages() {
        const rows = document.querySelectorAll('.chat-message-row');

        rows.forEach(row => {
            const nameEl = row.querySelector('.msg-name');
            if (nameEl) {
                const name = nameEl.textContent.replace(':', '').trim();

                // 1. Exclude Logic (Hard Filter)
                if (selectedExcludedPartners.has(name)) {
                    row.style.display = 'none';
                    return;
                }

                // 2. Include Logic (Soft Filter)
                // Show if NO tags selected OR name matches one of the tags
                if (selectedPartners.size === 0 || selectedPartners.has(name)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
        });
    }

    function populatePartnerFilter(messages) {
        // ... (existing populate logic) ...
        const partnerList = document.getElementById('partnerList');
        const excludeList = document.getElementById('excludePartnerList');

        partnerList.innerHTML = '';
        excludeList.innerHTML = '';

        partnerInput.disabled = false;
        excludePartnerInput.disabled = false; // Enable exclude input

        const uniqueNames = new Set();

        messages.forEach(msg => {
            if (msg.name && msg.name !== 'System') {
                uniqueNames.add(msg.name);
            }
        });

        const sortedNames = Array.from(uniqueNames).sort();

        sortedNames.forEach(name => {
            // Populate Include List
            const opt = document.createElement('option');
            opt.value = name;
            partnerList.appendChild(opt);

            // Populate Exclude List
            const optEx = document.createElement('option');
            optEx.value = name;
            excludeList.appendChild(optEx);
        });
    }

    // Expose Jump function to global scope so onclick works
    window.jumpToContext = function (msgId, dateStr) {
        const date = new Date(dateStr);
        // Format YYYY-MM-DD using UTC to match Server (which queries by UTC day)
        // This prevents Timezone Reference Errors (e.g. 5PM PST is next day UTC)
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const dateVal = `${yyyy}-${mm}-${dd}`;

        // Set Date Filter
        startDate.value = dateVal;
        endDate.value = dateVal;

        // Clear other filters
        searchInput.value = '';
        locationInput.value = '';
        partnerInput.value = '';
        if (typeof excludePartnerInput !== 'undefined') excludePartnerInput.value = '';
        voreTypeInput.value = '';
        sizeInput.value = '';

        // Clear Filter Selections
        selectedPartners.clear();
        if (typeof selectedExcludedPartners !== 'undefined') selectedExcludedPartners.clear();

        // Update Filter Visuals
        document.getElementById('partnerTags').innerHTML = '';
        document.getElementById('excludePartnerTags').innerHTML = '';

        // Clear Checkbox Selections
        selectedMessageIds.clear();
        rangeStartId = null;
        rangeEndId = null;
        rangeStartTime = null;
        rangeEndTime = null;
        rangeExcludedIds.clear();

        updateRangeVisuals();
        saveBtn.disabled = true;

        // Set Target
        targetJumpId = msgId;

        // Reset Page & Increase Limit to capture full context
        // If we only load 50, we might miss the message if it's deep in the day.
        currentPage = 1;
        currentLimit = 1000; // Force a large limit for "Context View"

        // Trigger Search
        performSearch();
    };

});
