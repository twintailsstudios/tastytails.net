
import { clickManager } from './clickManager.js';
import itemData from './itemData.js';

export const inventoryUI = {
    socket: null,
    container: null,
    drawer: null,
    listContainer: null,
    tower: null,
    activeTab: null,
    isCollapsed: false,
    lastRenderedHash: '',

    init: function (socket) {
        this.socket = socket;

        // Target specific slot
        const drawerSlot = document.getElementById('inventory-drawer-slot');

        if (!drawerSlot) {
            console.error('Inventory drawer slot not found!');
            return;
        }

        // Inject Drawer HTML with Top Header Collar Tabs & Collapse Button
        drawerSlot.innerHTML = `
            <!-- The Sliding Drawer (Expands Upward) -->
            <div id="satchel-drawer">
                <div class="drawer-header">
                    <div class="drawer-header-left">
                        <div id="inventory-tabs-slot">
                            <div class="clothing-tower" id="clothing-tower"></div>
                        </div>
                        <span id="drawer-title" class="drawer-title">Pockets</span>
                    </div>
                    <button id="drawer-collapse-btn" class="drawer-collapse-btn" title="Collapse Pockets">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                <div class="pocket-list" id="pocket-list-container"></div>
            </div>
        `;

        this.drawer = document.getElementById('satchel-drawer');
        this.listContainer = document.getElementById('pocket-list-container');
        this.tower = document.getElementById('clothing-tower');

        // Bind Collapse / Toggle Controls (Handle Tab & Dock Pill)
        const handleTab = document.getElementById('pocket-collapse-handle');
        if (handleTab) {
            handleTab.onclick = () => this.toggleCollapse();
        }

        const activePill = document.getElementById('active-apparel-pill');
        if (activePill) {
            activePill.onclick = () => this.toggleCollapse();
        }

        const collapseBtn = document.getElementById('drawer-collapse-btn');
        if (collapseBtn) {
            collapseBtn.onclick = () => this.toggleCollapse(true);
        }
    },

    toggleCollapse: function (forceCollapse) {
        if (typeof forceCollapse === 'boolean') {
            this.isCollapsed = forceCollapse;
        } else {
            this.isCollapsed = !this.isCollapsed;
        }

        const handleTab = document.getElementById('pocket-collapse-handle');

        if (this.isCollapsed) {
            this.drawer.classList.remove('open');
            if (handleTab) {
                handleTab.classList.add('collapsed');
                handleTab.title = "Expand Pockets";
                handleTab.innerHTML = '<span class="handle-icon"><i class="fa-solid fa-chevron-up"></i></span><span class="handle-text">POCKETS</span>';
            }
        } else {
            if (this.activeTab) {
                this.drawer.classList.add('open');
            }
            if (handleTab) {
                handleTab.classList.remove('collapsed');
                handleTab.title = "Collapse Pockets";
                handleTab.innerHTML = '<span class="handle-icon"><i class="fa-solid fa-chevron-down"></i></span><span class="handle-text">POCKETS</span>';
            }
        }
    },

    update: function (playerInfo) {
        if (!playerInfo.equipment) return;

        // Find equipped items with storage
        const storageItems = [];
        Object.keys(playerInfo.equipment).forEach(slotId => {
            const item = playerInfo.equipment[slotId];
            if (!item || !item.itemId) return;

            // Single Source of Truth: Look up definition strictly by itemId in itemData
            const def = itemData[item.itemId];

            if (def && def.pockets && def.pockets.length > 0) {
                storageItems.push({
                    slotId: slotId,
                    clothingId: item.itemId,
                    item: item,
                    def: def
                });
            }
        });

        const handleTab = document.getElementById('pocket-collapse-handle');
        const activePill = document.getElementById('active-apparel-pill');

        if (storageItems.length > 0) {
            if (handleTab) handleTab.classList.remove('hidden-hud');
            if (activePill) activePill.classList.remove('hidden-hud');
        } else {
            if (handleTab) handleTab.classList.add('hidden-hud');
            if (activePill) activePill.classList.add('hidden-hud');
            this.drawer.classList.remove('open');
            this.activeTab = null;
            return;
        }

        // Render Tower (Collar Tabs)
        this.renderTower(storageItems);

        // Render Active Drawer
        if (this.activeTab) {
            const activeItem = storageItems.find(i => i.clothingId === this.activeTab);
            if (activeItem) {
                this.renderDrawer(activeItem, false);
                if (!this.isCollapsed) this.drawer.classList.add('open');
            } else {
                // Active item unequipped
                this.activeTab = storageItems.length > 0 ? storageItems[0].clothingId : null;
                if (this.activeTab) {
                    this.renderDrawer(storageItems[0], true);
                    if (!this.isCollapsed) this.drawer.classList.add('open');
                } else {
                    this.drawer.classList.remove('open');
                    this.listContainer.innerHTML = '';
                }
            }
        } else if (storageItems.length > 0) {
            this.activeTab = storageItems[0].clothingId;
            this.renderDrawer(storageItems[0], true);
            if (!this.isCollapsed) this.drawer.classList.add('open');
        }
    },

    renderTower: function (storageItems) {
        const currentIds = Array.from(this.tower.children).map(el => el.dataset.id);
        const newIds = storageItems.map(i => i.clothingId);

        if (JSON.stringify(currentIds) === JSON.stringify(newIds)) {
            this.updateActiveTabVisuals(storageItems);
            return;
        }

        this.tower.innerHTML = '';
        storageItems.forEach(entry => {
            const tab = document.createElement('div');
            tab.className = 'tower-tab';
            tab.dataset.id = entry.clothingId;
            
            let iconHtml = entry.def.icon || '📦';
            if (iconHtml && !iconHtml.startsWith('<')) {
                const iconClass = iconHtml.includes('fa-') ? iconHtml : `fa-solid ${iconHtml}`;
                iconHtml = `<i class="${iconClass}"></i>`;
            }

            // Calculate total load across all pockets for capacity pip
            let totalLoad = 0;
            let totalCap = 0;
            if (entry.def.pockets) {
                entry.def.pockets.forEach(pDef => {
                    totalCap += pDef.capacity;
                    const contents = (entry.item.contents && entry.item.contents[pDef.id]) || [];
                    totalLoad += contents.reduce((acc, item) => acc + (item.size || 1), 0);
                });
            }

            let pipClass = 'pip-empty';
            if (totalLoad > 0) {
                const percent = (totalLoad / totalCap) * 100;
                if (percent >= 100) pipClass = 'pip-crit';
                else if (percent > 60) pipClass = 'pip-warn';
                else pipClass = 'pip-ok';
            }

            tab.innerHTML = `${iconHtml}<span class="tab-capacity-pip ${pipClass}"></span>`;
            tab.title = `${entry.def.name} (${totalLoad}/${totalCap})`;

            if (this.activeTab === entry.clothingId) tab.classList.add('active');

            tab.onclick = (e) => {
                e.stopPropagation();
                if (this.activeTab === entry.clothingId) {
                    // Toggle collapse if clicking current active tab
                    this.toggleCollapse();
                    this.updateActiveTabVisuals(storageItems);
                    return;
                }
                this.activeTab = entry.clothingId;
                this.isCollapsed = false;
                this.updateActiveTabVisuals(storageItems);
                this.renderDrawer(entry, true);
                this.drawer.classList.add('open');
            };

            this.tower.appendChild(tab);
        });
    },

    updateActiveTabVisuals: function (storageItems) {
        let activeIdx = 0;
        let activeEntry = null;

        Array.from(this.tower.children).forEach((tab, idx) => {
            const isTarget = tab.dataset.id === this.activeTab;
            if (isTarget) {
                tab.classList.add('active');
                activeIdx = idx;
            } else {
                tab.classList.remove('active');
            }

            // Update capacity pip dynamically if storageItems provided
            if (storageItems) {
                const entry = storageItems.find(i => i.clothingId === tab.dataset.id);
                if (isTarget) activeEntry = entry;

                if (entry && entry.def.pockets) {
                    let totalLoad = 0;
                    let totalCap = 0;
                    entry.def.pockets.forEach(pDef => {
                        totalCap += pDef.capacity;
                        const contents = (entry.item.contents && entry.item.contents[pDef.id]) || [];
                        totalLoad += contents.reduce((acc, item) => acc + (item.size || 1), 0);
                    });
                    const pip = tab.querySelector('.tab-capacity-pip');
                    if (pip) {
                        pip.className = 'tab-capacity-pip';
                        if (totalLoad === 0) pip.classList.add('pip-empty');
                        else if (totalLoad >= totalCap) pip.classList.add('pip-crit');
                        else if ((totalLoad / totalCap) > 0.6) pip.classList.add('pip-warn');
                        else pip.classList.add('pip-ok');
                    }
                    tab.title = `${entry.def.name} (${totalLoad}/${totalCap})`;
                }
            }
        });

        // Update Dock Active Apparel Pill
        const pillIcon = document.getElementById('pill-icon');
        const pillText = document.getElementById('pill-text');
        if (pillIcon && pillText && activeEntry && storageItems) {
            let iconHtml = activeEntry.def.icon || '📦';
            if (iconHtml && !iconHtml.startsWith('<')) {
                const iconClass = iconHtml.includes('fa-') ? iconHtml : `fa-solid ${iconHtml}`;
                iconHtml = `<i class="${iconClass}"></i>`;
            }
            pillIcon.innerHTML = iconHtml;
            pillText.textContent = `${activeEntry.def.name} (${activeIdx + 1}/${storageItems.length})`;
        }
    },

    renderDrawer: function (entry, shouldAnimate) {
        const currentHash = JSON.stringify({
            slot: entry.slotId,
            contents: entry.item.contents,
            anim: shouldAnimate
        });

        if (this.lastRenderedHash === currentHash && !shouldAnimate) {
            return;
        }
        this.lastRenderedHash = currentHash;

        this.listContainer.innerHTML = '';
        document.getElementById('drawer-title').innerText = entry.def.name;

        const pockets = entry.def.pockets;

        pockets.forEach((pocketDef, index) => {
            // Calc Capacity
            const contents = (entry.item.contents && entry.item.contents[pocketDef.id]) || [];
            const currentLoad = contents.reduce((acc, i) => acc + (i.size || 1), 0);
            const fillPercent = (currentLoad / pocketDef.capacity) * 100;

            let barColor = 'var(--gauge-ok)';
            if (fillPercent >= 100) barColor = 'var(--gauge-crit)';
            else if (fillPercent > 70) barColor = 'var(--gauge-warn)';

            const row = document.createElement('div');
            row.className = 'pocket-section';

            // Unified Hand Click Handler for Pocket Row (Stash: Left Click = Left Hand, Right Click = Right Hand)
            clickManager.bindElementHandClick(row, {
                onHandClick: (hand, e) => {
                    if (e.target.closest('.hud-item')) return;
                    console.log('[Inventory] Pocket Clicked:', pocketDef.id, 'Hand:', hand);
                    this.stashItem(entry.slotId, pocketDef.id, hand);
                }
            });

            row.innerHTML = `
                <div class="pocket-info">
                    <span class="pocket-name" title="${pocketDef.name}">${pocketDef.name}</span>
                    <span>${currentLoad}/${pocketDef.capacity}</span>
                </div>
                <div class="capacity-bar"><div class="capacity-fill" style="width:${fillPercent}%; background:${barColor};"></div></div>
                <div class="item-grid"></div>
            `;

            const grid = row.querySelector('.item-grid');

            contents.forEach((item, itemIdx) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'hud-item';
                const displayChar = item.name ? item.name.substring(0, 2) : '??';
                const iconHtml = item.icon ? `<i class="fa-solid ${item.icon}"></i>` : `<span>${displayChar}</span>`;

                itemEl.innerHTML = `${iconHtml}<span class="size-pip">${item.size || 1}</span>`;
                itemEl.title = item.name;

                // Unified Hand Click Handler for Pocket Items (Retrieve: Left Click = Left Hand, Right Click = Right Hand)
                clickManager.bindElementHandClick(itemEl, {
                    onHandClick: (hand, e) => {
                        this.retrieveItem(entry.slotId, pocketDef.id, item.uid, hand);
                    },
                    onDoubleClick: (e) => {
                        if (window.craftingUI && window.craftingUI.isOpen && window.craftingUI.currentStationId) {
                            window.craftingUI.depositFromInventory(entry.slotId, pocketDef.id, item.uid);
                            if (window.completeTutorialTask) {
                                window.completeTutorialTask('pocket_deposit');
                            }
                        }
                    }
                });

                grid.appendChild(itemEl);
            });

            // "Ghost Slot" indicator if space permits
            if (currentLoad < pocketDef.capacity) {
                const ghost = document.createElement('div');
                ghost.className = 'item-ghost';
                ghost.innerHTML = '<i class="fa-solid fa-plus"></i>';
                ghost.title = "Stash Here";

                clickManager.bindElementHandClick(ghost, {
                    onHandClick: (hand, e) => {
                        console.log('[Inventory] Ghost Clicked:', pocketDef.id, 'Hand:', hand);
                        this.stashItem(entry.slotId, pocketDef.id, hand);
                    }
                });

                grid.appendChild(ghost);
            }

            this.listContainer.appendChild(row);
        });
    },

    stashItem: function (slotId, pocketId, hand = 'left') {
        console.log('[Inventory] Stash to', slotId, pocketId, 'Hand:', hand);
        this.socket.emit('stashItemClicked', { targetSlot: slotId, targetPocket: pocketId, hand: hand });
    },

    retrieveItem: function (slotId, pocketId, itemUid, hand = 'left') {
        console.log('[Inventory] Retrieve', itemUid, 'Hand:', hand);
        this.socket.emit('retrieveItemClicked', { sourceSlot: slotId, sourcePocket: pocketId, itemUid: itemUid, hand: hand });
    },

    showToast: function (msg) {
        const el = document.getElementById('toast');
        if (el) {
            el.textContent = msg;
            el.style.opacity = 1;
            el.style.top = '-50px';
            setTimeout(() => { el.style.opacity = 0; el.style.top = '-40px'; }, 1500);
        }
    }
};
