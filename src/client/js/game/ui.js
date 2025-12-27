export function createVoreList(voreTypes, self) {
    const container = document.getElementById("voreListContainer");
    if (!container) return;

    // Capture currently open accordions
    const openIds = new Set();
    container.querySelectorAll('.accordion.is-open').forEach(btn => {
        if (btn.dataset.id) openIds.add(btn.dataset.id);
    });

    container.innerHTML = ""; // Clear existing

    // 1. Render the Accordion List
    voreTypes.forEach((vore, index) => {
        // Filter out nodes that are NOT destinations (e.g. Entrances)
        if (vore.isEntrance) return;

        // Create Card
        const card = document.createElement("div");
        card.className = "anatomy-card";

        // Header (Accordion Button)
        const btn = document.createElement("button");
        btn.className = "accordion";
        btn.dataset.id = vore._id; // Store ID for persistence
        btn.innerHTML = `
            <span><i class="fa-solid fa-caret-right arrow"></i> ${vore.destination}</span>
            <span class="mode-badge">${vore.mode || 'Hold'}</span>
        `;

        // Content Panel
        const panel = document.createElement("div");
        panel.className = "accordion-content";

        const content = document.createElement("div");
        content.className = "panel-content";

        // Mode Selector (Stamps)
        const modeSelector = document.createElement("div");
        modeSelector.className = "mode-selector";
        ['Hold', 'Digest', 'Absorb'].forEach(m => {
            const label = document.createElement("div");
            label.className = `mode-label ${m === (vore.mode || 'Hold') ? 'selected' : ''}`;
            label.innerText = m;
            label.onclick = (e) => {
                e.stopPropagation();
                updateVoreMode(vore._id, m, self);
            };
            modeSelector.appendChild(label);
        });

        // Contents Roster
        const roster = document.createElement("div");
        roster.className = "contents-roster";
        const rosterList = document.createElement("ul");
        rosterList.className = "roster-list";

        if (vore.contents && vore.contents.length > 0) {
            vore.contents.forEach(name => {
                const li = document.createElement("li");
                li.style.display = "flex";
                li.style.justifyContent = "space-between";
                li.style.alignItems = "center";

                const nameSpan = document.createElement("span");
                nameSpan.innerText = name;

                // Release Button
                // This button allows the predator to manually release a consumed player.
                // It emits the 'releaseVoreTarget' event to the server.
                const releaseBtn = document.createElement("button");
                releaseBtn.innerHTML = '<i class="fa-solid fa-eject"></i>';
                releaseBtn.title = "Release";
                releaseBtn.className = "release-btn"; // Add styling later if needed
                releaseBtn.style.marginLeft = "10px";
                releaseBtn.style.padding = "2px 5px";
                releaseBtn.style.background = "#d9534f";
                releaseBtn.style.color = "white";
                releaseBtn.style.border = "none";
                releaseBtn.style.borderRadius = "3px";
                releaseBtn.style.cursor = "pointer";

                releaseBtn.onclick = (e) => {
                    e.stopPropagation();
                    console.log(`[UI] Releasing ${name} from ${vore.destination}`);
                    self.socket.emit('releaseVoreTarget', { voreTypeId: vore._id, targetName: name });
                };

                li.appendChild(nameSpan);
                li.appendChild(releaseBtn);
                rosterList.appendChild(li);
            });
        } else {
            const li = document.createElement("li");
            li.innerText = "Empty";
            li.style.opacity = "0.5";
            rosterList.appendChild(li);
        }
        roster.appendChild(rosterList);

        // Edit Button
        const editBtn = document.createElement("button");
        editBtn.className = "edit-btn";
        editBtn.innerHTML = '<i class="fa-solid fa-gear"></i> Modify Settings';
        editBtn.onclick = () => openSettings(vore, self);

        // Assemble
        content.appendChild(modeSelector);
        content.appendChild(roster);
        content.appendChild(editBtn);
        panel.appendChild(content);

        card.appendChild(btn);
        card.appendChild(panel);
        container.appendChild(card);

        // Accordion Logic
        btn.onclick = () => {
            btn.classList.toggle("is-open");
            if (panel.style.maxHeight) {
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        };

        // Restore State
        // Restore State check
        if (openIds.has(vore._id)) {
            btn.classList.add("is-open");
            // Disable transition temporarily to snap open
            panel.style.transition = 'none';
            panel.style.maxHeight = 'none'; // Allow it to expand fully to calculate height naturally if needed, or just keep it open?
            // Actually, accordions usually need specific height for transition to close. 
            // But for opening INSTANTLY, we can just set it. 
            // We need to read scrollHeight to set the specific pixel value so it can close later with animation.

            // Force a reflow to ensure scrollHeight is ready? 
            // It's already appended.
            const height = panel.scrollHeight;
            panel.style.maxHeight = height + "px";

            // Re-enable transition after a microtask to ensure the 'none' applied for the initial paint
            setTimeout(() => {
                panel.style.transition = '';
            }, 10);
        }
    });



    // 3. Setup Modal Logic (Global listeners, run once)
    setupModalListeners(self);
}

function updateVoreMode(id, mode, self) {
    // Optimistic UI update
    console.log(`Updating mode for ${id} to ${mode}`);

    // Find the local vore object and update it
    const vore = window.localPlayerInfo.voreTypes.find(v => v._id === id);
    if (vore) vore.mode = mode;

    // Direct DOM Update (No Re-render)
    const container = document.getElementById("voreListContainer");
    if (container) {
        // Find the button for this ID
        const btn = container.querySelector(`.accordion[data-id="${id}"]`);
        if (btn) {
            // Update Badge
            const badge = btn.querySelector(".mode-badge");
            if (badge) badge.innerText = mode;

            // Update Selected Stamp
            // We need to find the panel content associated with this button
            // The structure is card -> btn, panel -> content -> modeSelector
            const card = btn.closest('.anatomy-card');
            if (card) {
                const modeSelector = card.querySelector('.mode-selector');
                if (modeSelector) {
                    const labels = modeSelector.querySelectorAll('.mode-label');
                    labels.forEach(label => {
                        if (label.innerText === mode) {
                            label.classList.add('selected');
                        } else {
                            label.classList.remove('selected');
                        }
                    });
                }
            }
        }
    }

    // Emit socket event
    self.socket.emit('updateVoreType', { id, mode });
}

// --- MODAL LOGIC (Refactored for Anatomy Forge) ---

let modalInitialized = false;

function setupModalListeners(self) {
    if (modalInitialized) return;

    const modal = document.getElementById("settingsModal");
    const closeBtn = modal.querySelector(".close");

    // Fix Layering: Move modal to body to escape sidePanel stacking context
    if (modal && modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }

    // Close Modal Logic
    const closeModal = () => {
        modal.style.display = "none";
        // Optional: Reset Forge state or selection if needed
    };

    if (closeBtn) closeBtn.onclick = closeModal;

    window.onclick = (event) => {
        if (event.target == modal) closeModal();
    };

    // Open Main Forge Button (from Vore Dashboard Header)
    const openForgeBtn = document.getElementById("openAnatomyForgeBtn");
    if (openForgeBtn) {
        openForgeBtn.onclick = () => {
            openSettings(null, self);
        };
    }

    modalInitialized = true;
}

function openSettings(voreData, self) {
    const modal = document.getElementById("settingsModal");
    modal.style.display = "block";

    // Trigger Resize for Anatomy Forge since it was hidden
    if (window.AnatomyForge && typeof window.AnatomyForge.resize === 'function') {
        // slight delay to ensure display:block applies
        setTimeout(() => {
            window.AnatomyForge.resize();
        }, 50);
    }

    if (voreData) {
        console.log("Opening Forge for specific destination:", voreData._id);
        // TODO: In future, tell AnatomyForge to focus/select this node
        // e.g. AnatomyForge.selectNode(voreData._id);
    } else {
        console.log("Opening Forge (General)");
    }
}

// Deprecated: saveSettings was replaced by AnatomyForge's internal save logic
function saveSettings(self) {
    console.warn("saveSettings called but functionality moved to Anatomy Forge.");
}

// Global helper for audio preview (called by inline onclick)
window.toggleAudioPreview = function (btn, type) {
    const icon = btn.querySelector("i");
    if (btn.classList.contains("playing")) {
        btn.classList.remove("playing");
        icon.className = "fa-solid fa-play";
        // Stop audio logic here
    } else {
        // Reset others
        document.querySelectorAll(".audio-btn").forEach(b => {
            b.classList.remove("playing");
            b.querySelector("i").className = "fa-solid fa-play";
        });

        btn.classList.add("playing");
        icon.className = "fa-solid fa-stop";
        // Play audio logic here

        // Auto stop after 2s for demo
        setTimeout(() => {
            btn.classList.remove("playing");
            icon.className = "fa-solid fa-play";
        }, 2000);
    }
};

// --- Struggle Button UI ---
// This function creates or removes the "Struggle" button for consumed players.
// It is called from create.js when the player's consumed status changes.
// --- Predator Controls UI ---
export function createPredatorVoreControls(data, socket) {
    removePredatorVoreControls();

    // If Stage is not 1 or 2, we don't show controls. 
    // Stage 0 = Released/None. Stage 3+ = Full Consumption.
    if (!data.stage || data.stage <= 0 || data.stage >= 3) return;

    const container = document.createElement('div');
    container.id = 'predator-controls';
    container.style.position = 'absolute';
    container.style.bottom = '150px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.display = 'flex';
    container.style.gap = '10px';
    container.style.zIndex = '1000';

    // Buttons style helper
    const btnStyle = (bg) => `
        padding: 10px 20px;
        font-size: 16px; 
        font-weight: bold; 
        color: white; 
        background-color: ${bg}; 
        border: none; 
        border-radius: 5px; 
        cursor: pointer;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    `;

    // 1. Release Button (Available in Stage 1 ONLY)
    if (data.stage === 1) {
        const releaseBtn = document.createElement('button');
        releaseBtn.innerText = 'Release';
        releaseBtn.style.cssText = btnStyle('#d9534f'); // Red
        releaseBtn.onclick = () => {
            // Emit release event (needs separate listener or update releaseVoreTarget)
            // For now using releaseClicked generic or new one? 
            // releaseVoreTarget expects voreTypeId. We might not have it here easily unless passed in data.
            // We passed `nodeName`? 
            // But `releaseClicked` works on targetId.
            socket.emit('releaseClicked', { playerId: data.playerId });
            removePredatorVoreControls();
        };
        container.appendChild(releaseBtn);
    }

    // 2. Reverse Button (Available in Stage 2)
    if (data.stage === 2) {
        const reverseBtn = document.createElement('button');
        reverseBtn.innerText = 'Reverse';
        reverseBtn.style.cssText = btnStyle('#f0ad4e'); // Orange
        reverseBtn.onclick = () => {
            socket.emit('advanceVoreStage', { targetId: data.playerId, direction: 'backward' });
        };
        container.appendChild(reverseBtn);
    }

    // 3. Proceed Button (Available in Stage 1 & 2)
    const proceedBtn = document.createElement('button');
    proceedBtn.innerText = 'Proceed';
    proceedBtn.style.cssText = btnStyle('#5cb85c'); // Green
    proceedBtn.onclick = () => {
        socket.emit('advanceVoreStage', { targetId: data.playerId, direction: 'forward' });
    };
    container.appendChild(proceedBtn);

    document.body.appendChild(container);
}

export function removePredatorVoreControls() {
    const existing = document.getElementById('predator-controls');
    if (existing) existing.remove();
}

export function createStruggleButton(isConsumed, socket) {
    let struggleBtn = document.getElementById('struggle-btn');

    if (isConsumed) {
        if (!struggleBtn) {
            struggleBtn = document.createElement('button');
            struggleBtn.id = 'struggle-btn';
            struggleBtn.innerText = 'Struggle';
            struggleBtn.style.position = 'absolute';
            struggleBtn.style.bottom = '150px'; // Above chat/input
            struggleBtn.style.left = '50%';
            struggleBtn.style.transform = 'translateX(-50%)';
            struggleBtn.style.padding = '15px 30px';
            struggleBtn.style.fontSize = '20px';
            struggleBtn.style.fontWeight = 'bold';
            struggleBtn.style.color = 'white';
            struggleBtn.style.backgroundColor = '#d9534f';
            struggleBtn.style.border = '2px solid #c9302c';
            struggleBtn.style.borderRadius = '5px';
            struggleBtn.style.cursor = 'pointer';
            struggleBtn.style.zIndex = '1000';
            struggleBtn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

            struggleBtn.onclick = () => {
                console.log('Struggle button clicked');
                socket.emit('struggleInside');

                // Visual feedback
                struggleBtn.style.transform = 'translateX(-50%) scale(0.95)';
                setTimeout(() => {
                    struggleBtn.style.transform = 'translateX(-50%) scale(1)';
                }, 100);
            };

            document.body.appendChild(struggleBtn);
        }
        struggleBtn.style.display = 'block';
    } else {
        if (struggleBtn) {
            struggleBtn.remove();
        }
    }
}
