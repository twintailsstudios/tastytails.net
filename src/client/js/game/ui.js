// --- RECONCILIATION HELPER ---
function getVoreNodeType(vore, localPlayerInfo) {
    let nodeType = vore.type;
    if (!nodeType && localPlayerInfo && localPlayerInfo.anatomyData) {
        try {
            const graph = JSON.parse(localPlayerInfo.anatomyData);
            if (graph.nodes) {
                const node = graph.nodes.find(n => String(n.id) === vore.graphNodeId);
                if (node) nodeType = node.type;
            }
        } catch (e) { /* ignore parse error */ }
    }
    return nodeType;
}

export function createVoreList(voreTypes, self) {
    window.createVoreList = createVoreList;
    const container = document.getElementById("voreListContainer");
    if (!container) return;

    // --- PHASE 1: INDEX EXISTING ELEMENTS ---
    const existingCards = new Map();
    container.querySelectorAll('.anatomy-card').forEach(card => {
        const btn = card.querySelector('.accordion');
        if (btn && btn.dataset.id) {
            existingCards.set(btn.dataset.id, card);
        }
    });

    const activeIds = new Set();

    // --- PHASE 2: UPDATE OR CREATE ---
    voreTypes.forEach((vore, index) => {
        // Filter Logic (Preserved as-is)
        let nodeType = getVoreNodeType(vore, window.localPlayerInfo);

        if (nodeType && nodeType !== 'destination') return;

        activeIds.add(vore._id);
        const mode = vore.mode || 'Hold';
        const occCount = (vore.contents && Array.isArray(vore.contents)) ? vore.contents.length : 0;
        const occText = occCount > 0 ? `${occCount} ${occCount === 1 ? 'Occupant' : 'Occupants'}` : 'Empty';

        let card = existingCards.get(vore._id);

        if (card) {
            // [UPDATE] Existing Card
            const btn = card.querySelector('.accordion');

            // 1. Update Header Info
            const nameSpan = btn.querySelector('.destination-name');
            if (nameSpan) {
                nameSpan.innerText = vore.destination;
            }

            const occBadge = btn.querySelector('.occupant-badge');
            if (occBadge) {
                occBadge.innerText = occText;
                if (occCount > 0) occBadge.classList.add('active');
                else occBadge.classList.remove('active');
            }

            const badge = btn.querySelector('.mode-badge');
            if (badge) {
                badge.innerText = mode;
                badge.className = `mode-badge mode-${mode.toLowerCase()}`;
            }

            // 2. Update Mode Selectors
            const modeSelector = card.querySelector('.mode-selector');
            if (modeSelector) {
                ['Hold', 'Digest', 'Absorb'].forEach(m => {
                    const labels = Array.from(modeSelector.querySelectorAll('.mode-label'));
                    const label = labels.find(l => l.innerText === m);
                    if (label) {
                        const shouldBeSelected = (m === mode);
                        label.className = `mode-label mode-${m.toLowerCase()} ${shouldBeSelected ? 'selected' : ''}`;
                    }
                });
            }

            // 3. Update Roster (Rebuild UL contents)
            const rosterList = card.querySelector('.roster-list');
            if (rosterList) {
                updateRosterList(rosterList, vore.contents, vore, self, card);
            }

        } else {
            // [CREATE] New Card
            card = document.createElement("div");
            card.className = "anatomy-card";

            // Header (Accordion Button)
            const btn = document.createElement("button");
            btn.className = "accordion";
            btn.dataset.id = vore._id;
            btn.innerHTML = `
                <div class="accordion-header-left">
                    <i class="fa-solid fa-caret-right arrow"></i>
                    <span class="destination-name">${vore.destination}</span>
                </div>
                <div class="accordion-header-right">
                    <span class="occupant-badge ${occCount > 0 ? 'active' : ''}">${occText}</span>
                    <span class="mode-badge mode-${mode.toLowerCase()}">${mode}</span>
                </div>
            `;

            // Content Panel
            const panel = document.createElement("div");
            panel.className = "accordion-content";

            const content = document.createElement("div");
            content.className = "panel-content";

            // Mode Selector (Pill Stamps)
            const modeSelector = document.createElement("div");
            modeSelector.className = "mode-selector";
            ['Hold', 'Digest', 'Absorb'].forEach(m => {
                const label = document.createElement("div");
                label.className = `mode-label mode-${m.toLowerCase()} ${m === mode ? 'selected' : ''}`;
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

            updateRosterList(rosterList, vore.contents, vore, self, card);

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
        }
    });

    // --- PHASE 3: CLEANUP OBSOLETE ---
    existingCards.forEach((card, id) => {
        if (!activeIds.has(id)) {
            card.remove();
        }
    });

    setupModalListeners(self);
}

// Helper to rebuild roster list efficiently
function updateRosterList(ul, contents, vore, self, card = null) {
    const newContentStr = JSON.stringify(contents);
    if (ul.dataset.lastContent === newContentStr) return;

    ul.innerHTML = ""; // Clear
    ul.dataset.lastContent = newContentStr;

    // Remove existing Eject All button if any
    if (card) {
        const existingEjectAll = card.querySelector('.btn-eject-all');
        if (existingEjectAll) existingEjectAll.remove();
    }

    if (contents && contents.length > 0) {
        contents.forEach(name => {
            const li = document.createElement("li");
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "4px 0";

            const nameSpan = document.createElement("span");
            nameSpan.style.fontWeight = "bold";
            nameSpan.innerText = name;

            // Release Button
            const releaseBtn = document.createElement("button");
            releaseBtn.innerHTML = '<i class="fa-solid fa-eject"></i> Eject';
            releaseBtn.title = `Release ${name}`;
            releaseBtn.className = "release-btn";
            releaseBtn.style.marginLeft = "10px";
            releaseBtn.style.padding = "3px 8px";
            releaseBtn.style.background = "#d9534f";
            releaseBtn.style.color = "white";
            releaseBtn.style.border = "none";
            releaseBtn.style.borderRadius = "3px";
            releaseBtn.style.cursor = "pointer";
            releaseBtn.style.fontSize = "10px";
            releaseBtn.style.fontWeight = "bold";

            releaseBtn.onclick = (e) => {
                e.stopPropagation();
                console.log(`[UI] Releasing ${name} from ${vore.destination}`);
                self.socket.emit('releaseVoreTarget', { voreTypeId: vore._id, targetName: name });
            };

            li.appendChild(nameSpan);
            li.appendChild(releaseBtn);
            ul.appendChild(li);
        });

        // Add "Eject All" button if card reference provided
        if (card) {
            const contentPanel = card.querySelector('.panel-content');
            if (contentPanel) {
                const ejectAllBtn = document.createElement("button");
                ejectAllBtn.className = "btn-eject-all";
                ejectAllBtn.innerHTML = '<i class="fa-solid fa-eject"></i> Eject All Occupants';
                ejectAllBtn.onclick = (e) => {
                    e.stopPropagation();
                    console.log(`[UI] Ejecting all occupants from ${vore.destination}`);
                    contents.forEach(targetName => {
                        self.socket.emit('releaseVoreTarget', { voreTypeId: vore._id, targetName });
                    });
                };
                contentPanel.insertBefore(ejectAllBtn, contentPanel.querySelector('.edit-btn'));
            }
        }
    } else {
        const li = document.createElement("li");
        li.innerText = "Empty";
        li.style.opacity = "0.5";
        ul.appendChild(li);
    }
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

    if (window.AnatomyForge) {
        if (!window.AnatomyForgeInitialized) {
            // Initialize with current data
            const anatomyData = window.localPlayerInfo.anatomyData || "";
            const voreTypes = window.localPlayerInfo.voreTypes || [];

            window.AnatomyForge.init("anatomyForgeContainer", anatomyData, voreTypes, (newAnatomyData, newVoreTypes) => {
                console.log("Saving from Anatomy Forge...", { voreTypesCount: newVoreTypes ? newVoreTypes.length : 0 });
                // Note: The second arg 'newVoreTypes' is the RICH array from the compressed save logic.
                // We send it to the server so it doesn't have to re-parse the now-stripped anatomyData.
                self.socket.emit('updateVoreSettings', {
                    anatomyData: newAnatomyData,
                    voreTypes: newVoreTypes // Explicit pass
                });
            });
            window.AnatomyForgeInitialized = true;
        }
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

import { WindowManager } from './utils/WindowManager.js';
import { DockManager } from './utils/DockManager.js';

export function positionVoreWindow(container) {
    if (!container || container.dataset.hasBeenDragged === 'true') return;

    if (container.parentElement !== document.body) {
        document.body.appendChild(container);
    }

    container.style.position = 'absolute';

    // X-Axis Centering: Center strictly relative to the Phaser App Game View (#phaserApp)
    const phaserApp = document.getElementById('phaserApp') || document.body;
    const appRect = phaserApp.getBoundingClientRect();
    const appCenterX = appRect.left + (appRect.width / 2);
    const winWidth = container.offsetWidth || 360;
    const targetLeft = Math.max(10, appCenterX - (winWidth / 2));

    container.style.left = `${Math.round(targetLeft)}px`;
    container.style.transform = 'none';

    // Y-Axis Stacking: Positioned 12px above Active Hands UI or Pockets drawer
    const handsHud = document.getElementById('hands-hud');
    const drawer = document.getElementById('satchel-drawer');
    const isDrawerOpen = drawer && drawer.classList.contains('open');

    if (isDrawerOpen && drawer) {
        const rect = drawer.getBoundingClientRect();
        const bottomOffset = window.innerHeight - rect.top + 12;
        container.style.bottom = `${Math.round(bottomOffset)}px`;
    } else if (handsHud) {
        const handleTab = document.getElementById('pocket-collapse-handle');
        const targetEl = (handleTab && handleTab.offsetHeight > 0 && !handleTab.classList.contains('hidden-hud') && !handleTab.classList.contains('collapsed')) ? handleTab : handsHud;
        const rect = targetEl.getBoundingClientRect();
        const bottomOffset = window.innerHeight - rect.top + 12;
        container.style.bottom = `${Math.round(bottomOffset)}px`;
    } else {
        container.style.bottom = '78px';
    }
}
if (typeof window !== 'undefined') {
    window.positionVoreWindow = positionVoreWindow;
    window.addEventListener('resize', () => {
        document.querySelectorAll('.vore-window').forEach(win => {
            if (win.dataset.hasBeenDragged !== 'true') positionVoreWindow(win);
        });
    });
}

// --- Struggle Button & Predator Controls UI ---
export function createPredatorVoreControls(data, socket) {
    // Stage 0 = Released/None. Only Stages 1, 2, and 3 are supported.
    if (!data || !data.stage || data.stage <= 0 || data.stage > 3) {
        removePredatorVoreControls();
        return;
    }

    let container = document.getElementById('predator-controls');
    const isNew = !container;

    if (isNew) {
        container = document.createElement('div');
        container.id = 'predator-controls';
        container.className = 'vore-window';
        document.body.appendChild(container);
        positionVoreWindow(container);
    }

    let minTab = document.getElementById('vore-minimized-tab');
    if (!minTab) {
        minTab = document.createElement('div');
        minTab.id = 'vore-minimized-tab';
        minTab.className = 'minimized-tab';
        minTab.style.display = 'none';
        minTab.innerHTML = `
            <div class="tab-icon">🐾</div>
            <div class="tab-title">Vore Controls (Stage ${data.stage})</div>
            <button class="restore-btn" title="Restore Window">☐</button>
        `;
        document.body.appendChild(minTab);
        if (window.DockManager || DockManager) {
            (window.DockManager || DockManager).register(minTab, 'right');
        }
    } else {
        const titleEl = minTab.querySelector('.tab-title');
        if (titleEl) titleEl.innerText = `Vore Controls (Stage ${data.stage})`;
    }

    const currentStage = data.stage;
    const stageName = currentStage === 1 ? 'Entrance Node' : (currentStage === 2 ? 'Transit Path Node' : `Destination Node (${data.nodeName || 'Stomach'})`);

    // Target Health Calculations
    const targetHp = (data.targetHp !== undefined) ? data.targetHp : 100;
    const targetMaxHp = (data.targetMaxHp !== undefined && data.targetMaxHp > 0) ? data.targetMaxHp : 100;
    const hpPercent = Math.max(0, Math.min(100, Math.round((targetHp / targetMaxHp) * 100)));

    let conditionBadge = { text: 'Solid', cssClass: 'status-solid', fillClass: '' };
    if (hpPercent <= 0) conditionBadge = { text: 'Unconscious', cssClass: 'status-unconscious', fillClass: 'fill-melting' };
    else if (hpPercent < 33) conditionBadge = { text: 'Melting', cssClass: 'status-melting', fillClass: 'fill-melting' };
    else if (hpPercent <= 66) conditionBadge = { text: 'Softening', cssClass: 'status-softening', fillClass: 'fill-softening' };

    let sensoryText = "They still feel nice and solid in there, they probably have a ways to go";
    if (hpPercent < 33) {
        sensoryText = "They are getting nniiice and soft now~";
    } else if (hpPercent <= 66) {
        sensoryText = "It feels like they are starting to settle in now~";
    }

    const activeMode = data.destinationMode || 'Hold';

    // Toggleable Clench Logic
    const isClenching = !!data.isClenching;
    const predatorStamina = (data.predatorStamina !== undefined) ? data.predatorStamina : 100;
    
    let clenchBtnText = 'Clench';
    let clenchBtnSubtext = 'Squeeze Target';
    let clenchBtnClass = 'btn-vore-clench';
    let isClenchDisabled = false;

    if (isClenching) {
        clenchBtnText = 'Active Clench';
        clenchBtnSubtext = 'Flexing (Draining Stamina)';
        clenchBtnClass += ' clench-active';
    } else if (predatorStamina <= 0) {
        clenchBtnSubtext = 'Exhausted (0 Stamina)';
        isClenchDisabled = true;
    }

    // Retain existing struggle status text if present during in-place render
    const currentStruggleStatus = container.querySelector('#struggle-status-text')?.innerText || 'Calm';

    container.innerHTML = `
        <div class="resize-handle top"></div>
        <div class="resize-handle left"></div>
        <div class="resize-handle right"></div>
        <div class="resize-handle bottom"></div>
        <div class="resize-handle br"></div>
        <div class="vore-window-header" id="predator-controls-header">
            <div class="vore-window-title">
                <i class="fa-solid fa-teeth-open"></i> Vore Controls
            </div>
            <div class="vore-window-controls">
                <button class="vore-window-btn" id="vore-btn-minimize" title="Minimize Window">_</button>
            </div>
        </div>
        <div class="vore-window-body">
            <div class="vore-info-banner">
                <div class="vore-info-title">${data.targetName ? 'Target: ' + data.targetName : 'Vore Action in Progress'}</div>
                <div class="vore-info-subtitle">Stage ${currentStage}: ${stageName}</div>
            </div>

            <!-- Target Struggle Activity Monitor (All Stages) -->
            <div class="struggle-activity-container" id="vore-struggle-activity">
                <div class="struggle-activity-label">
                    <i class="fa-solid fa-heart-pulse"></i> Prey Activity: <span id="struggle-status-text">${currentStruggleStatus}</span>
                </div>
                <div class="struggle-activity-pulse">
                    <div class="pulse-bar"></div>
                    <div class="pulse-bar"></div>
                    <div class="pulse-bar"></div>
                    <div class="pulse-bar"></div>
                </div>
            </div>

            <div class="vore-stage-stepper">
                <div class="stepper-node ${currentStage >= 1 ? (currentStage > 1 ? 'completed' : 'active') : ''}">
                    <div class="stepper-node-icon"><i class="fa-solid fa-door-open"></i></div>
                    <span>Entrance</span>
                </div>
                <div class="stepper-line ${currentStage >= 2 ? 'active' : ''}"></div>
                <div class="stepper-node ${currentStage >= 2 ? (currentStage > 2 ? 'completed' : 'active') : ''}">
                    <div class="stepper-node-icon"><i class="fa-solid fa-route"></i></div>
                    <span>Transit</span>
                </div>
                <div class="stepper-line ${currentStage >= 3 ? 'active' : ''}"></div>
                <div class="stepper-node ${currentStage >= 3 ? 'active' : ''}">
                    <div class="stepper-node-icon"><i class="fa-solid fa-bullseye"></i></div>
                    <span>Destination</span>
                </div>
            </div>

            ${currentStage === 3 ? `
                <!-- Target Health & Physical Condition Gauge -->
                <div class="vore-target-health-panel">
                    <div class="vore-target-health-header">
                        <span>Physical State</span>
                        <span class="vore-status-badge ${conditionBadge.cssClass}">${conditionBadge.text}</span>
                    </div>
                    <div class="vore-target-health-bar-container">
                        <div class="vore-target-health-bar-fill ${conditionBadge.fillClass}" style="width: ${hpPercent}%;"></div>
                        <div class="vore-target-health-text">${hpPercent}% HP (${targetHp} / ${targetMaxHp})</div>
                    </div>
                </div>

                <!-- Tactile Sensory Description Line -->
                <div class="vore-sensory-quote">
                    <i class="fa-solid fa-quote-left"></i>
                    <span>"${sensoryText}"</span>
                </div>

                <!-- Destination Mode Controls (Hold / Digest / Absorb) -->
                <div class="vore-destination-mode-panel">
                    <div class="vore-mode-panel-title"><i class="fa-solid fa-sliders"></i> Destination Mode</div>
                    <div class="vore-mode-buttons">
                        <button class="btn-vore-mode mode-hold ${activeMode === 'Hold' ? 'active-mode' : ''}" data-mode="Hold">
                            <span>🛡️ Hold</span>
                        </button>
                        <button class="btn-vore-mode mode-digest ${activeMode === 'Digest' ? 'active-mode' : ''}" data-mode="Digest">
                            <span>🧪 Digest</span>
                        </button>
                        <button class="btn-vore-mode mode-absorb ${activeMode === 'Absorb' ? 'active-mode' : ''}" data-mode="Absorb">
                            <span>🌀 Absorb</span>
                        </button>
                    </div>
                </div>
            ` : ''}

            <div class="vore-button-group">
                ${currentStage === 1 ? `
                    <button class="btn-vore btn-vore-danger" id="vore-btn-release">
                        <span><i class="fa-solid fa-door-open"></i> Release</span>
                        <span class="btn-vore-subtext">Let Target Go</span>
                    </button>
                ` : ''}
                ${currentStage >= 2 ? `
                    <button class="btn-vore btn-vore-secondary" id="vore-btn-reverse">
                        <span><i class="fa-solid fa-rotate-left"></i> Reverse</span>
                        <span class="btn-vore-subtext">${currentStage === 3 ? 'Pull to Transit' : 'Pull to Entrance'}</span>
                    </button>
                ` : ''}
                ${currentStage < 3 ? `
                    <button class="btn-vore btn-vore-primary" id="vore-btn-proceed">
                        <span><i class="fa-solid fa-angles-down"></i> Proceed</span>
                        <span class="btn-vore-subtext">${currentStage === 1 ? 'Push to Transit' : 'Push to Destination'}</span>
                    </button>
                ` : `
                    <button class="btn-vore ${clenchBtnClass}" id="vore-btn-clench" ${isClenchDisabled ? 'disabled' : ''}>
                        <span><i class="fa-solid fa-hand-fist"></i> ${clenchBtnText}</span>
                        <span class="btn-vore-subtext">${clenchBtnSubtext}</span>
                    </button>
                `}
            </div>
        </div>
    `;

    const header = document.getElementById('predator-controls-header');
    const wm = window.WindowManager || WindowManager;
    if (wm) {
        if (header) wm.makeDraggable(container, header);
        const handles = {
            t: container.querySelector('.resize-handle.top'),
            l: container.querySelector('.resize-handle.left'),
            r: container.querySelector('.resize-handle.right'),
            b: container.querySelector('.resize-handle.bottom'),
            br: container.querySelector('.resize-handle.br')
        };
        wm.makeResizable(container, handles, { minWidth: 320, minHeight: 180 });
    }

    const releaseBtn = document.getElementById('vore-btn-release');
    if (releaseBtn) {
        releaseBtn.onclick = () => {
            socket.emit('releaseClicked', { playerId: data.playerId });
            removePredatorVoreControls();
        };
    }

    const reverseBtn = document.getElementById('vore-btn-reverse');
    if (reverseBtn) {
        reverseBtn.onclick = () => {
            socket.emit('advanceVoreStage', { targetId: data.playerId, direction: 'backward' });
        };
    }

    const proceedBtn = document.getElementById('vore-btn-proceed');
    if (proceedBtn) {
        proceedBtn.onclick = () => {
            socket.emit('advanceVoreStage', { targetId: data.playerId, direction: 'forward' });
        };
    }

    const clenchBtn = document.getElementById('vore-btn-clench');
    if (clenchBtn && !isClenchDisabled) {
        clenchBtn.onclick = () => {
            socket.emit('clenchVoreStage', { targetId: data.playerId });
        };
    }

    // Destination Mode Button Listeners
    container.querySelectorAll('.btn-vore-mode').forEach(modeBtn => {
        modeBtn.onclick = () => {
            const newMode = modeBtn.dataset.mode;
            if (newMode && data.nodeVoreTypeId) {
                socket.emit('updateVoreType', { id: data.nodeVoreTypeId, mode: newMode });
            }
        };
    });

    const minimizeBtn = document.getElementById('vore-btn-minimize');
    if (minimizeBtn) {
        minimizeBtn.onclick = () => {
            container.style.display = 'none';
            container.dataset.isMinimized = 'true';
            if (minTab) minTab.style.display = 'flex';
        };
    }

    if (minTab) {
        minTab.onclick = (e) => {
            if (e.target.closest('.restore-btn') || minTab.contains(e.target)) {
                delete container.dataset.isMinimized;
                minTab.style.display = 'none';
                container.style.display = 'block';
            }
        };
    }

    if (container.dataset.isMinimized === 'true') {
        container.style.display = 'none';
        if (minTab) minTab.style.display = 'flex';
    } else {
        container.style.display = 'block';
        if (minTab) minTab.style.display = 'none';
    }
}

export function removePredatorVoreControls() {
    const existing = document.getElementById('predator-controls');
    if (existing) existing.remove();
    const minTab = document.getElementById('vore-minimized-tab');
    if (minTab) minTab.remove();
}

export function createStruggleButton(isConsumed, socket, clenchData = window.lastClenchData || {}) {
    let container = document.getElementById('struggle-window');
    let minTab = document.getElementById('struggle-minimized-tab');

    if (isConsumed) {
        if (clenchData && Object.keys(clenchData).length > 0) {
            window.lastClenchData = clenchData;
        } else if (window.lastClenchData) {
            clenchData = window.lastClenchData;
        }

        const now = Date.now();
        const isClenched = !!(clenchData && (clenchData.isClenchSuppressed || clenchData.isClenching));
        const predatorName = (clenchData && clenchData.predatorName) ? clenchData.predatorName : 'Predator';

        let struggleCooldownUntil = (clenchData && clenchData.struggleCooldownUntil) ? clenchData.struggleCooldownUntil : 0;
        if (container && container.dataset.struggleCooldownUntil) {
            const existingCd = parseInt(container.dataset.struggleCooldownUntil, 10);
            if (existingCd > now && existingCd > struggleCooldownUntil) {
                struggleCooldownUntil = existingCd;
            }
        }

        // If resuming from a paused clench cooldown
        if (!struggleCooldownUntil && container && container.dataset.struggleCooldownRemaining && !isClenched) {
            const remMs = parseInt(container.dataset.struggleCooldownRemaining, 10);
            if (remMs > 0) {
                struggleCooldownUntil = now + remMs;
                delete container.dataset.struggleCooldownRemaining;
            }
        }

        const isCooldownActive = struggleCooldownUntil && now < struggleCooldownUntil;
        const targetStamina = (clenchData && clenchData.targetStamina !== undefined) ? clenchData.targetStamina : (window.localPlayerInfo && window.localPlayerInfo.stats ? window.localPlayerInfo.stats.stamina : 100);
        const isExhausted = targetStamina < 20;

        let subtitleText = 'Thrash against internal walls to escape!';
        let buttonSubtext = 'Fight Back & Thrash';
        let isStruggleDisabled = false;

        if (isClenched) {
            subtitleText = `${predatorName}'s body is squeezing too tightly to move`;
            buttonSubtext = 'Squeezed Tight';
            isStruggleDisabled = true;
            if (isCooldownActive) {
                const rem = Math.max(0, struggleCooldownUntil - now);
                if (container) container.dataset.struggleCooldownRemaining = String(rem);
            }
        } else if (isCooldownActive) {
            const remainingSec = Math.ceil((struggleCooldownUntil - now) / 1000);
            subtitleText = 'Recovering breath from struggling...';
            buttonSubtext = `Recovering... (${remainingSec}s)`;
            isStruggleDisabled = true;
        } else if (isExhausted) {
            subtitleText = 'Too exhausted to struggle right now!';
            buttonSubtext = 'Exhausted (Needs Stamina)';
            isStruggleDisabled = true;
        }

        if (!container) {
            container = document.createElement('div');
            container.id = 'struggle-window';
            container.className = 'vore-window';
            document.body.appendChild(container);

            positionVoreWindow(container);
        }

        container.dataset.isClenched = isClenched ? 'true' : 'false';
        container.dataset.isCooldown = isCooldownActive ? 'true' : 'false';
        if (isCooldownActive) {
            container.dataset.struggleCooldownUntil = String(struggleCooldownUntil);
        } else if (now >= struggleCooldownUntil) {
            delete container.dataset.struggleCooldownUntil;
        }

        if (!container.querySelector('.vore-window-header')) {

            container.innerHTML = `
                <div class="resize-handle top"></div>
                <div class="resize-handle left"></div>
                <div class="resize-handle right"></div>
                <div class="resize-handle bottom"></div>
                <div class="resize-handle br"></div>
                <div class="vore-window-header" id="struggle-window-header">
                    <div class="vore-window-title">
                        <i class="fa-solid fa-hand-fist"></i> Trapped Inside
                    </div>
                    <div class="vore-window-controls">
                        <button class="vore-window-btn" id="struggle-btn-minimize" title="Minimize Window">_</button>
                    </div>
                </div>
                <div class="vore-window-body">
                    <div class="vore-info-banner">
                        <div class="vore-info-title">Internal Struggle</div>
                        <div class="vore-info-subtitle" id="struggle-subtitle">${subtitleText}</div>
                    </div>

                    <div class="struggle-progress-container">
                        <div class="struggle-progress-fill" id="struggle-fill" style="width: 45%;"></div>
                        <div class="struggle-progress-text" id="struggle-text">${isClenched ? 'Constricted' : (isCooldownActive ? 'Recovering' : 'Resistance Active')}</div>
                    </div>

                    <div class="vore-button-group">
                        <button class="btn-vore btn-vore-danger ${isStruggleDisabled ? 'btn-disabled' : ''}" id="struggle-btn" ${isStruggleDisabled ? 'disabled' : ''}>
                            <span><i class="fa-solid fa-hand-fist"></i> STRUGGLE</span>
                            <span class="btn-vore-subtext" id="struggle-btn-subtext">${buttonSubtext}</span>
                        </button>
                    </div>
                </div>
            `;

            const header = document.getElementById('struggle-window-header');
            const wm = window.WindowManager || WindowManager;
            if (wm && header) {
                wm.makeDraggable(container, header);
                const handles = {
                    t: container.querySelector('.resize-handle.top'),
                    l: container.querySelector('.resize-handle.left'),
                    r: container.querySelector('.resize-handle.right'),
                    b: container.querySelector('.resize-handle.bottom'),
                    br: container.querySelector('.resize-handle.br')
                };
                wm.makeResizable(container, handles, { minWidth: 320, minHeight: 180 });
            }

            const struggleBtn = document.getElementById('struggle-btn');
            if (struggleBtn) {
                struggleBtn.onclick = () => {
                    if (struggleBtn.disabled || struggleBtn.getAttribute('disabled') !== null || struggleBtn.classList.contains('btn-disabled') || container.dataset.isClenched === 'true' || container.dataset.isCooldown === 'true') {
                        console.log('[Client] Struggle blocked - target is clenched tight or on cooldown');
                        return;
                    }
                    console.log('Struggle button clicked');

                    // Trigger immediate optimistic cooldown & stamina drain
                    const newCd = Date.now() + 10000;
                    if (!window.lastClenchData) window.lastClenchData = {};
                    window.lastClenchData.struggleCooldownUntil = newCd;
                    container.dataset.struggleCooldownUntil = String(newCd);
                    container.dataset.isCooldown = 'true';

                    if (window.lastClenchData.targetStamina !== undefined) {
                        window.lastClenchData.targetStamina = Math.max(0, window.lastClenchData.targetStamina - 20);
                    }

                    socket.emit('struggleInside');

                    struggleBtn.classList.remove('btn-wiggle');
                    void struggleBtn.offsetWidth; // Trigger reflow
                    struggleBtn.classList.add('btn-wiggle');

                    // Rerender UI immediately to grey out button and start countdown
                    createStruggleButton(true, socket, window.lastClenchData);
                };
            }

            const minimizeBtn = document.getElementById('struggle-btn-minimize');
            if (minimizeBtn) {
                minimizeBtn.onclick = (e) => {
                    if (e) e.stopPropagation();
                    container.style.display = 'none';
                    container.dataset.isMinimized = 'true';
                    const activeMinTab = document.getElementById('struggle-minimized-tab');
                    if (activeMinTab) activeMinTab.style.display = 'flex';
                };
            }
        } else {
            // In-place updates for existing struggle window
            const subtitleEl = container.querySelector('#struggle-subtitle');
            if (subtitleEl) subtitleEl.innerText = subtitleText;

            const struggleTextEl = container.querySelector('#struggle-text');
            if (struggleTextEl) struggleTextEl.innerText = isClenched ? 'Constricted' : (isCooldownActive ? 'Recovering' : 'Resistance Active');

            const btnSubtextEl = container.querySelector('#struggle-btn-subtext');
            if (btnSubtextEl) btnSubtextEl.innerText = buttonSubtext;

            const struggleBtn = container.querySelector('#struggle-btn');
            if (struggleBtn) {
                struggleBtn.disabled = isStruggleDisabled;
                if (isStruggleDisabled) {
                    struggleBtn.setAttribute('disabled', 'disabled');
                    struggleBtn.classList.add('btn-disabled');
                } else {
                    struggleBtn.removeAttribute('disabled');
                    struggleBtn.classList.remove('btn-disabled');
                }
            }
        }

        // Live Cooldown Timer Tick Handler
        if (container.struggleCooldownTimer) {
            clearInterval(container.struggleCooldownTimer);
            container.struggleCooldownTimer = null;
        }

        if (isCooldownActive && !isClenched && !isExhausted) {
            container.struggleCooldownTimer = setInterval(() => {
                const currentNow = Date.now();
                const btnSubtextEl = container.querySelector('#struggle-btn-subtext');
                const struggleBtn = container.querySelector('#struggle-btn');
                const subtitleEl = container.querySelector('#struggle-subtitle');

                if (currentNow < struggleCooldownUntil) {
                    const remSec = Math.ceil((struggleCooldownUntil - currentNow) / 1000);
                    if (btnSubtextEl) btnSubtextEl.innerText = `Recovering... (${remSec}s)`;
                } else {
                    clearInterval(container.struggleCooldownTimer);
                    container.struggleCooldownTimer = null;
                    delete container.dataset.struggleCooldownUntil;
                    container.dataset.isCooldown = 'false';
                    if (btnSubtextEl) btnSubtextEl.innerText = 'Fight Back & Thrash';
                    if (subtitleEl) subtitleEl.innerText = 'Thrash against internal walls to escape!';
                    if (struggleBtn && container.dataset.isClenched !== 'true') {
                        struggleBtn.disabled = false;
                        struggleBtn.removeAttribute('disabled');
                        struggleBtn.classList.remove('btn-disabled');
                    }
                }
            }, 250);
        }

        if (!minTab) {
            minTab = document.createElement('div');
            minTab.id = 'struggle-minimized-tab';
            minTab.className = 'minimized-tab';
            minTab.style.display = 'none';
            minTab.innerHTML = `
                <div class="tab-icon">⚡</div>
                <div class="tab-title">Trapped Inside</div>
                <button class="restore-btn" title="Restore Window">☐</button>
            `;
            document.body.appendChild(minTab);
            if (window.DockManager || DockManager) {
                (window.DockManager || DockManager).register(minTab, 'right');
            }

            minTab.onclick = (e) => {
                delete container.dataset.isMinimized;
                minTab.style.display = 'none';
                container.style.display = 'block';
            };
        }

        if (container.dataset.isMinimized === 'true') {
            container.style.display = 'none';
            if (minTab) minTab.style.display = 'flex';
        } else {
            container.style.display = 'block';
            if (minTab) minTab.style.display = 'none';
        }
    } else {
        if (container) container.remove();
        if (minTab) minTab.remove();
    }
}
