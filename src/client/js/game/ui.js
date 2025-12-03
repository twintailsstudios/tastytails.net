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
        if (openIds.has(vore._id)) {
            btn.classList.add("is-open");
            // Use timeout to allow render to finish for scrollHeight
            setTimeout(() => {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }, 0);
        }
    });

    // 2. Setup "Add New" Button
    const addBtn = document.getElementById("addVoreBtn");
    if (addBtn) {
        // Remove old listeners to prevent duplicates if re-run
        const newBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newBtn, addBtn);
        newBtn.onclick = () => {
            // Open modal with empty/default data
            openSettings(null, self);
        };
    }

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
    self.socket.emit('voreModeUpdate', { id, mode });
}

// --- MODAL LOGIC ---

let currentEditingId = null;
let modalInitialized = false;

function setupModalListeners(self) {
    if (modalInitialized) return;

    const modal = document.getElementById("settingsModal");
    const closeBtn = modal.querySelector(".close");
    const saveBtn = document.getElementById("saveSettingsBtn");
    const tabs = modal.querySelectorAll(".modal-tab");

    // Close Modal
    closeBtn.onclick = () => modal.style.display = "none";
    window.onclick = (event) => {
        if (event.target == modal) modal.style.display = "none";
    };

    // Tab Switching
    tabs.forEach(tab => {
        tab.onclick = () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");

            // Activate clicked
            tab.classList.add("active");
            const target = tab.getAttribute("data-target");
            document.getElementById(`tab-${target}`).style.display = "block";
        };
    });

    // Save Button
    saveBtn.onclick = () => {
        saveSettings(self);
        modal.style.display = "none";
    };

    modalInitialized = true;
}

let initialVoreData = {};

function openSettings(voreData, self) {
    const modal = document.getElementById("settingsModal");
    const form = document.getElementById("settingsForm");

    // Reset Tabs
    document.querySelectorAll(".modal-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
    document.querySelector(".modal-tab[data-target='general']").classList.add("active");
    document.getElementById("tab-general").style.display = "block";

    if (voreData) {
        // EDIT MODE
        currentEditingId = voreData._id;
        document.getElementById("modalTitle").innerText = `Edit ${voreData.destination}`;

        document.getElementById("editId").value = voreData._id;
        document.getElementById("editName").value = voreData.destination || "";
        document.getElementById("editVerb").value = voreData.verb || "";
        document.getElementById("editTimer").value = voreData.digestionTimer || 120;
        document.getElementById("editAnimation").value = voreData.animation || 1;
        document.getElementById("editMode").value = voreData.mode || "Hold";

        document.getElementById("editDesc").value = voreData.destinationDescrip || "";
        document.getElementById("editExamine").value = voreData.examineMsgDescrip || "";

        document.getElementById("editStruggleIn").value = voreData.struggleInsideMsgDescrip || "";
        document.getElementById("editStruggleOut").value = voreData.struggleOutsideMsgDescrip || "";
        document.getElementById("editDigestIn").value = voreData.digestionInsideMsgDescrip || "";
        document.getElementById("editDigestOut").value = voreData.digestionOutsideMsgDescrip || "";

        // Audio (Mock data for now)
        document.getElementById("editEntrySound").value = voreData.audioEntry || "none";
        document.getElementById("editAmbientSound").value = voreData.audioAmbient || "none";
        document.getElementById("editStruggleSound").value = voreData.audioStruggle || "none";
        document.getElementById("editExitSound").value = voreData.audioExit || "none";

        // Store initial state for change detection
        initialVoreData = {
            id: voreData._id,
            destination: voreData.destination || "",
            verb: voreData.verb || "",
            digestionTimer: String(voreData.digestionTimer || 120),
            animation: String(voreData.animation || 1),
            mode: voreData.mode || "Hold",
            destinationDescrip: voreData.destinationDescrip || "",
            examineMsgDescrip: voreData.examineMsgDescrip || "",
            struggleInsideMsgDescrip: voreData.struggleInsideMsgDescrip || "",
            struggleOutsideMsgDescrip: voreData.struggleOutsideMsgDescrip || "",
            digestionInsideMsgDescrip: voreData.digestionInsideMsgDescrip || "",
            digestionOutsideMsgDescrip: voreData.digestionOutsideMsgDescrip || "",
            audioEntry: voreData.audioEntry || "none",
            audioAmbient: voreData.audioAmbient || "none",
            audioStruggle: voreData.audioStruggle || "none",
            audioExit: voreData.audioExit || "none"
        };

    } else {
        // CREATE MODE
        currentEditingId = "NEW";
        document.getElementById("modalTitle").innerText = "Create New Destination";
        form.reset();
        document.getElementById("editId").value = "NEW";
        initialVoreData = {}; // No initial data for new entry
    }

    modal.style.display = "block";
}

function saveSettings(self) {
    const data = {
        id: document.getElementById("editId").value,
        destination: document.getElementById("editName").value,
        verb: document.getElementById("editVerb").value,
        digestionTimer: document.getElementById("editTimer").value,
        animation: document.getElementById("editAnimation").value,
        mode: document.getElementById("editMode").value,

        destinationDescrip: document.getElementById("editDesc").value,
        examineMsgDescrip: document.getElementById("editExamine").value,

        struggleInsideMsgDescrip: document.getElementById("editStruggleIn").value,
        struggleOutsideMsgDescrip: document.getElementById("editStruggleOut").value,
        digestionInsideMsgDescrip: document.getElementById("editDigestIn").value,
        digestionOutsideMsgDescrip: document.getElementById("editDigestOut").value,

        audioEntry: document.getElementById("editEntrySound").value,
        audioAmbient: document.getElementById("editAmbientSound").value,
        audioStruggle: document.getElementById("editStruggleSound").value,
        audioExit: document.getElementById("editExitSound").value,

        // Auth
        token: document.cookie.replace('TastyTails=', ''),
        charId: document.location.href.split('play/')[1]
    };

    // Check for changes
    if (data.id !== "NEW") {
        let hasChanges = false;
        for (const key in initialVoreData) {
            if (initialVoreData[key] !== data[key]) {
                hasChanges = true;
                break;
            }
        }

        if (!hasChanges) {
            console.log("No changes detected.");
            return;
        }
    }

    console.log("Saving Vore Settings:", data);

    // Emit to server
    if (data.id === "NEW") {
        self.socket.emit('addVoreType', data);
    } else {
        self.socket.emit('updateVoreType', data);
    }
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
