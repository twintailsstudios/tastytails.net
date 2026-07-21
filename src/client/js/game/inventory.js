
import { clickManager } from './clickManager.js';
import itemData from './itemData.js';

export const inventoryUI = {
    socket: null,
    container: null,
    drawer: null,
    listContainer: null,
    tower: null,
    activeTab: null,
    lastRenderedHash: '',

    init: function (socket) {
        this.socket = socket;

        // Target specific slots (New Layout)
        const drawerSlot = document.getElementById('inventory-drawer-slot');
        const tabsSlot = document.getElementById('inventory-tabs-slot');

        if (!drawerSlot || !tabsSlot) {
            console.error('Inventory slots not found!');
            return;
        }

        // Inject Drawer HTML
        drawerSlot.innerHTML = `
            <!-- The Sliding Drawer -->
            <div id="satchel-drawer">
                <div class="drawer-header" id="drawer-title"></div>
                <div class="pocket-list" id="pocket-list-container"></div>
            </div>
        `;

        // Inject Tabs HTML
        tabsSlot.innerHTML = `
            <!-- The Connected Tabs -->
            <div class="clothing-tower" id="clothing-tower"></div>
        `;

        this.drawer = document.getElementById('satchel-drawer');
        this.listContainer = document.getElementById('pocket-list-container');
        this.tower = document.getElementById('clothing-tower');

        // console.log('[InventoryUI] Initialized (Split Column Layout)');
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

        // Render Tower (Sidebar)
        this.renderTower(storageItems);

        // Render Active Drawer
        if (this.activeTab) {
            const activeItem = storageItems.find(i => i.clothingId === this.activeTab);
            if (activeItem) {
                this.renderDrawer(activeItem, false);
                this.drawer.classList.add('open');
            } else {
                // Active item unequipped
                this.activeTab = storageItems.length > 0 ? storageItems[0].clothingId : null;
                if (this.activeTab) {
                    this.renderDrawer(storageItems[0], true);
                    this.drawer.classList.add('open');
                } else {
                    this.drawer.classList.remove('open');
                    this.listContainer.innerHTML = '';
                    // this.container.classList.add('hidden-hud'); // No longer needed with new structure
                }
            }
        } else if (storageItems.length > 0) {
            // First time load or auto-select
            // Don't auto-open on load? Or yes? Demo auto-opened.
            this.activeTab = storageItems[0].clothingId;
            this.renderDrawer(storageItems[0], true);
            this.drawer.classList.add('open');
        } else {
            this.drawer.classList.remove('open');
            this.listContainer.innerHTML = '';
        }
    },

    renderTower: function (storageItems) {
        // Simple rebuild for now to keep it synced
        // Optimize later if click flicker issues

        const currentIds = Array.from(this.tower.children).map(el => el.dataset.id);
        const newIds = storageItems.map(i => i.clothingId);

        if (JSON.stringify(currentIds) === JSON.stringify(newIds)) {
            this.updateActiveTabVisuals();
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
            tab.innerHTML = iconHtml;
            tab.title = entry.def.name; // Tooltip handled by CSS

            if (this.activeTab === entry.clothingId) tab.classList.add('active');

            tab.onclick = () => {
                if (this.activeTab === entry.clothingId) {
                    // Toggle Close?
                    this.activeTab = null;
                    this.drawer.classList.remove('open');
                    this.updateActiveTabVisuals();
                    return;
                }
                this.activeTab = entry.clothingId;
                this.updateActiveTabVisuals();
                this.renderDrawer(entry, true);
                this.drawer.classList.add('open');
            };

            this.tower.appendChild(tab);
        });
    },

    updateActiveTabVisuals: function () {
        Array.from(this.tower.children).forEach(tab => {
            if (tab.dataset.id === this.activeTab) tab.classList.add('active');
            else tab.classList.remove('active');
        });
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
