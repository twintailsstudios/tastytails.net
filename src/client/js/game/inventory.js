/**
 * @fileoverview inventory.js - Client-Side Apparel Storage & Satchel Drawer Manager
 * 
 * @description
 * Manages the UI rendering, state synchronization, and user interactions for clothing
 * storage pockets (satchel drawer, collar tabs clothing tower, pocket item grids).
 * Integrated with dual-hand click delegation (clickManager) and Socket.IO network events.
 * 
 * @module inventoryUI
 */

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
    toastTimer: null,
    lastActionTime: 0,
    ACTION_COOLDOWN_MS: 150,

    /**
     * Formats icon definition into FontAwesome HTML element or returns raw emoji/HTML.
     * @param {string} iconDef - Icon definition string from itemData.
     * @returns {string} Formatted HTML string.
     */
    getIconHtml: function (iconDef) {
        let iconHtml = iconDef || '📦';
        if (iconHtml && !iconHtml.startsWith('<')) {
            const iconClass = iconHtml.includes('fa-') ? iconHtml : `fa-solid ${iconHtml}`;
            return `<i class="${iconClass}"></i>`;
        }
        return iconHtml;
    },

    /**
     * Calculates combined item load and max capacity across all pockets for an apparel piece.
     * @param {Object} entry - Storage item entry containing item data and definition.
     * @returns {{ totalLoad: number, totalCap: number }} Computed load and capacity.
     */
    calculateStorageCapacity: function (entry) {
        let totalLoad = 0;
        let totalCap = 0;
        if (entry && entry.def && Array.isArray(entry.def.pockets)) {
            const contentsMap = (entry.item && entry.item.contents) || {};
            entry.def.pockets.forEach(pDef => {
                totalCap += (pDef.capacity || 0);
                const contents = contentsMap[pDef.id] || [];
                totalLoad += contents.reduce((acc, item) => acc + (item.size || 1), 0);
            });
        }
        return { totalLoad, totalCap };
    },

    /**
     * OPTIMIZATION: Computes a fast composite string hash across pocket contents.
     * Replaces expensive JSON.stringify serialization to eliminate GC allocations during game loop ticks.
     * @param {Object} contentsMap - Pocket contents dictionary mapped by pocket ID.
     * @returns {string} Composite hash string.
     */
    computeContentsHash: function (contentsMap) {
        if (!contentsMap) return '';
        let hash = '';
        for (const pocketId in contentsMap) {
            const items = contentsMap[pocketId] || [];
            hash += `|p:${pocketId}`;
            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                hash += `:${it.uid || ''}_${it.name || ''}_${it.size || 1}_${it.icon || ''}`;
            }
        }
        return hash;
    },

    /**
     * Initializes inventory drawer DOM container and binds toggle/collapse event handlers.
     * @param {Object} socket - Active Socket.IO client instance.
     */
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

        // Prevent pointer events inside satchel drawer from causing canvas movement
        if (this.drawer) {
            let drawerTimer = null;
            const suppressDrawerPointer = () => {
                window.isPointerDownOnUI = true;
                if (drawerTimer) clearTimeout(drawerTimer);
                drawerTimer = setTimeout(() => {
                    window.isPointerDownOnUI = false;
                }, 150);
            };
            ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
                this.drawer.addEventListener(evt, suppressDrawerPointer, true);
            });
        }

        // Bind Collapse / Toggle Controls (Handle Tab, Dock Pill, and Drawer Header Collapse Button)
        const handleTab = document.getElementById('pocket-collapse-handle');
        if (handleTab) {
            handleTab.onclick = (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                this.toggleCollapse();
            };
        }

        const activePill = document.getElementById('active-apparel-pill');
        if (activePill) {
            activePill.onclick = (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                this.toggleCollapse();
            };
        }

        const collapseBtn = document.getElementById('drawer-collapse-btn');
        if (collapseBtn) {
            collapseBtn.onclick = (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                this.toggleCollapse(true);
            };
        }
    },

    /**
     * Toggles the collapsed/expanded state of the satchel drawer sliding menu.
     * @param {boolean} [forceCollapse] - Optional explicit boolean to set collapse state.
     */
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

    /**
     * Main update loop called whenever player equipment state is synced from the server.
     * @param {Object} playerInfo - Synchronized player information object containing equipment data.
     */
    update: function (playerInfo) {
        if (!playerInfo || !playerInfo.equipment) return;

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

    /**
     * Renders collar tab elements ("clothing tower") for each equipped storage piece.
     * @param {Array<Object>} storageItems - Array of equipped storage item entries.
     */
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
            tab.dataset.slotId = entry.slotId;
            
            const iconHtml = this.getIconHtml(entry.def.icon);
            const { totalLoad, totalCap } = this.calculateStorageCapacity(entry);

            let pipClass = 'pip-empty';
            if (totalLoad > 0) {
                const percent = totalCap > 0 ? (totalLoad / totalCap) * 100 : 0;
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

    /**
     * OPTIMIZATION: Updates visual states and capacity pips using O(1) Map indexing by slotId.
     * @param {Array<Object>} storageItems - Array of equipped storage item entries.
     */
    updateActiveTabVisuals: function (storageItems) {
        let activeIdx = 0;
        let activeEntry = null;

        const itemMap = new Map(storageItems ? storageItems.map(i => [i.slotId, i]) : []);
        const children = this.tower.children;

        for (let idx = 0; idx < children.length; idx++) {
            const tab = children[idx];
            const isTarget = tab.dataset.id === this.activeTab;
            if (isTarget) {
                tab.classList.add('active');
                activeIdx = idx;
            } else {
                tab.classList.remove('active');
            }

            // Update capacity pip dynamically if storageItems provided
            if (storageItems) {
                const slotId = tab.dataset.slotId || tab.dataset.id;
                const entry = itemMap.get(slotId) || storageItems.find(i => i.clothingId === tab.dataset.id);
                if (isTarget) activeEntry = entry;

                if (entry && entry.def && entry.def.pockets) {
                    const { totalLoad, totalCap } = this.calculateStorageCapacity(entry);
                    const pip = tab.querySelector('.tab-capacity-pip');
                    if (pip) {
                        pip.className = 'tab-capacity-pip';
                        if (totalLoad === 0) pip.classList.add('pip-empty');
                        else if (totalLoad >= totalCap) pip.classList.add('pip-crit');
                        else if (totalCap > 0 && (totalLoad / totalCap) > 0.6) pip.classList.add('pip-warn');
                        else pip.classList.add('pip-ok');
                    }
                    tab.title = `${entry.def.name} (${totalLoad}/${totalCap})`;
                }
            }
        }

        // Update Dock Active Apparel Pill
        const pillIcon = document.getElementById('pill-icon');
        const pillText = document.getElementById('pill-text');
        const activePill = document.getElementById('active-apparel-pill');
        if (pillIcon && pillText && activeEntry && storageItems) {
            const itemName = activeEntry.def.name;
            const countText = `(${activeIdx + 1}/${storageItems.length})`;
            pillIcon.innerHTML = this.getIconHtml(activeEntry.def.icon);
            pillText.innerHTML = `<span class="pill-name">${itemName}</span><span class="pill-count">${countText}</span>`;
            if (activePill) {
                activePill.title = `Apparel Storage: ${itemName} ${countText}`;
            }
        }
    },

    /**
     * Builds and renders the satchel drawer pocket sections, items, and ghost slots for the active apparel item.
     * Uses hash-based memoization to skip redundant DOM updates.
     * @param {Object} entry - Active storage item entry.
     * @param {boolean} shouldAnimate - Whether to force drawer animation.
     */
    renderDrawer: function (entry, shouldAnimate) {
        const contentsHash = this.computeContentsHash(entry.item.contents);
        const currentHash = `${entry.slotId}:${contentsHash}:${shouldAnimate}`;

        if (this.lastRenderedHash === currentHash && !shouldAnimate) {
            return;
        }
        this.lastRenderedHash = currentHash;

        this.listContainer.innerHTML = '';
        const drawerTitle = document.getElementById('drawer-title');
        if (drawerTitle) drawerTitle.innerText = entry.def.name;

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
                let itemIcon = item.icon || (item.itemId && itemData[item.itemId] ? itemData[item.itemId].icon : null);
                if (!itemIcon) itemIcon = 'fa-solid fa-box-open';
                const fullClass = itemIcon.includes('fa-') ? (itemIcon.includes('fa-solid') ? itemIcon : `fa-solid ${itemIcon}`) : `fa-solid ${itemIcon}`;
                const colorStyle = item.color ? ` style="color: #${item.color.toString(16).padStart(6, '0')};"` : '';
                const iconHtml = `<i class="${fullClass}"${colorStyle}></i>`;

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

    /**
     * Emits socket request to stash item from active hand into specified pocket slot.
     * OPTIMIZATION: Throttled by 150ms cooldown to prevent multi-click socket spam.
     * @param {string} slotId - Equipment slot ID.
     * @param {string} pocketId - Pocket ID.
     * @param {string} [hand='left'] - Hand used ('left' or 'right').
     */
    stashItem: function (slotId, pocketId, hand = 'left') {
        const now = Date.now();
        if (now - this.lastActionTime < this.ACTION_COOLDOWN_MS) return;
        this.lastActionTime = now;

        console.log('[Inventory] Stash to', slotId, pocketId, 'Hand:', hand);
        this.socket.emit('stashItemClicked', { targetSlot: slotId, targetPocket: pocketId, hand: hand });
    },

    /**
     * Emits socket request to retrieve item from pocket into active hand.
     * OPTIMIZATION: Throttled by 150ms cooldown to prevent multi-click socket spam.
     * @param {string} slotId - Equipment slot ID.
     * @param {string} pocketId - Pocket ID.
     * @param {string} itemUid - Item unique identifier.
     * @param {string} [hand='left'] - Target hand ('left' or 'right').
     */
    retrieveItem: function (slotId, pocketId, itemUid, hand = 'left') {
        const now = Date.now();
        if (now - this.lastActionTime < this.ACTION_COOLDOWN_MS) return;
        this.lastActionTime = now;

        console.log('[Inventory] Retrieve', itemUid, 'Hand:', hand);
        this.socket.emit('retrieveItemClicked', { sourceSlot: slotId, sourcePocket: pocketId, itemUid: itemUid, hand: hand });
    },

    /**
     * Displays temporary toast notification pop-up.
     * Clears active timer handles to prevent message truncation.
     * @param {string} msg - Message text to display in toast notification.
     */
    showToast: function (msg) {
        const el = document.getElementById('toast');
        if (el) {
            if (this.toastTimer) clearTimeout(this.toastTimer);
            el.textContent = msg;
            el.style.opacity = 1;
            el.style.top = '-50px';
            this.toastTimer = setTimeout(() => { el.style.opacity = 0; el.style.top = '-40px'; }, 1500);
        }
    }
};
