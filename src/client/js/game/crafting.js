/**
 * @fileoverview CraftingUI - Client-side Crafting Station Overlay & Manager
 * 
 * @description
 * Orchestrates all interactive crafting station UIs (Forges, Sewing Tables, Cooking Racks).
 * Manages blueprint rendering, input slot reconciliation, progress bar animations, dual-hand
 * equipment deposits/withdrawals, CSS theming, and pluggable sub-modules (e.g. SewingModule).
 * 
 * Triggered by: Socket events ('craftingUIOpen', 'craftingUpdateStation', 'craftingComplete', etc.),
 * inventory slot clicks, and game engine proximity updates in update.js.
 */

import { WindowManager } from './utils/WindowManager.js';
import { DockManager } from './utils/DockManager.js';
import { SewingModule } from './modules/SewingModule.js';
import itemData from './itemData.js';

export class CraftingUI {
    /**
     * Creates an instance of CraftingUI.
     * @param {Object} socket - Socket.IO client instance for server communication
     * @param {Object} player - Local player container / scene reference
     */
    constructor(socket, player) {
        this.socket = socket;
        this.player = player;
        this.isOpen = false;
        this.activeRecipe = null;
        this.currentStationId = null;
        this.localStationInventory = [];
        this.pausedState = null; // { recipeId, remainingTime }

        // DOM Elements
        this.uiContainer = document.getElementById('crafting-overlay');
        this.window = document.getElementById('crafting-window');
        this.header = document.getElementById('crafting-header'); // For drag
        this.recipeList = document.getElementById('recipe-list');
        this.craftBtn = document.getElementById('crafting-action-btn');
        this.inventoryList = document.getElementById('station-input-slot');
        this.outputSlot = document.getElementById('outputSlot');
        this.outputHint = document.getElementById('outputHint');
        this.statusText = document.getElementById('crafting-status-text');
        this.progressBar = document.getElementById('crafting-progress-bar');
        this.progressLabel = document.getElementById('crafting-progress-label');

        // Info Panel
        this.previewName = document.getElementById('previewName');
        this.previewDesc = document.getElementById('previewDesc');
        this.previewIcon = document.getElementById('previewIcon');
        this.costDisplay = document.getElementById('costDisplay');

        // Window Controls
        this.closeBtn = document.getElementById('crafting-btn-close');
        this.minimizeBtn = document.getElementById('crafting-btn-minimize');
        this.minimizedTab = document.getElementById('crafting-minimized-tab');
        this.tabStatusText = this.minimizedTab ? this.minimizedTab.querySelector('.tab-title') : null;
        this.tabProgressBar = document.getElementById('crafting-tab-progress');

        if (this.minimizedTab) {
            DockManager.register(this.minimizedTab, 'left');
        }

        // Satchel
        this.playerInventoryGrid = document.getElementById('playerInventory');

        this.setupWindowControls();

        // Prevent pointer clicks on crafting window from propagating to Phaser game world
        if (this.window) {
            const preventPhaserPropagation = (e) => {
                e.stopPropagation();
            };
            ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'touchstart', 'touchend'].forEach(evt => {
                this.window.addEventListener(evt, preventPhaserPropagation);
                if (this.minimizedTab) {
                    this.minimizedTab.addEventListener(evt, preventPhaserPropagation);
                }
            });
        }

        // [NEW] Save Default Layout for restoration
        const bodyEl = this.window.querySelector('.window-body');
        this.defaultBodyHTML = bodyEl ? bodyEl.innerHTML : "";
        this.isCustomLayout = false;

        this.setupListeners();
    }

    setupListeners() {
        if (this.closeBtn) this.closeBtn.onclick = () => this.close();
        if (this.craftBtn) this.craftBtn.onclick = () => this.startCrafting();

        // Listen for "Deposit" via the hidden button (or future satchel click)
        const depositBtn = document.getElementById('crafting-btn-deposit');
        if (depositBtn) {
            depositBtn.onclick = (e) => {
                e.preventDefault();
                this.depositInStation('left');
            };
            depositBtn.oncontextmenu = (e) => {
                e.preventDefault();
                this.depositInStation('right');
            };
        }

        // Socket Events
        this.socket.on('craftingUIOpen', (data) => {
            this.open(data);
        });

        this.socket.on('craftingUpdateStation', (data) => {
            // Check station ID just in case
            if (this.currentStationId === data.stationId) {
                this.updateStationInventory(data.stationInventory);
            }
        });

        this.socket.on('craftingComplete', (data) => {
            this.finishCrafting(data);
        });

        this.socket.on('craftingError', (msg) => {
            this.showFloatingText(msg, true);
        });

        this.socket.on('craftingPaused', (data) => {
            this.pauseCraftingUI(data);
        });

        // Window resize positioning listener
        window.addEventListener('resize', () => {
            if (this.uiContainer && this.uiContainer.classList.contains('active')) {
                this.positionWindow();
            }
        });

        // Pockets drawer toggle observer & transition tracking
        const drawer = document.getElementById('satchel-drawer');
        if (drawer) {
            if (typeof MutationObserver !== 'undefined') {
                const observer = new MutationObserver(() => {
                    if (this.uiContainer && this.uiContainer.classList.contains('active')) {
                        this.positionWindow();
                    }
                });
                observer.observe(drawer, { attributes: true, attributeFilter: ['class', 'style'] });
            }

            let drawerAnimId = null;
            const animateDrawerStacking = () => {
                if (this.uiContainer && this.uiContainer.classList.contains('active')) {
                    this.positionWindow();
                    drawerAnimId = requestAnimationFrame(animateDrawerStacking);
                }
            };

            drawer.addEventListener('transitionstart', () => {
                if (this.uiContainer && this.uiContainer.classList.contains('active')) {
                    if (drawerAnimId) cancelAnimationFrame(drawerAnimId);
                    drawerAnimId = requestAnimationFrame(animateDrawerStacking);
                }
            });

            drawer.addEventListener('transitionend', () => {
                if (drawerAnimId) cancelAnimationFrame(drawerAnimId);
                if (this.uiContainer && this.uiContainer.classList.contains('active')) {
                    this.positionWindow();
                }
            });
        }
    }

    positionWindow() {
        if (!this.window) return;
        // Do not override user's custom dragged/resized window position
        if (this.window.dataset.hasBeenDragged === 'true') return;

        requestAnimationFrame(() => {
            if (!this.window || this.window.dataset.hasBeenDragged === 'true') return;

            this.window.style.position = 'absolute';
            this.window.style.top = '50px';

            // X-Axis Centering relative to #phaserApp or body
            const phaserApp = document.getElementById('phaserApp') || document.body;
            const appRect = phaserApp.getBoundingClientRect();
            const appCenterX = appRect.left + (appRect.width / 2);
            const winWidth = this.window.offsetWidth || 800;
            const targetLeft = Math.max(10, appCenterX - (winWidth / 2));

            this.window.style.left = `${Math.round(targetLeft)}px`;
            this.window.style.transform = 'none';
            this.window.style.margin = '0';

            // Y-Axis Stacking: Positioned 12px above Active Hands UI or Pockets drawer
            const handsHud = document.getElementById('hands-hud');
            const drawer = document.getElementById('satchel-drawer');
            let bottomOffset = 78;

            // Live bounding rect check: if drawer is visible and has height on screen (open or transitioning)
            if (drawer) {
                const rect = drawer.getBoundingClientRect();
                if (rect.top > 0 && rect.height > 10) {
                    bottomOffset = window.innerHeight - rect.top + 12;
                } else if (handsHud) {
                    const handleTab = document.getElementById('pocket-collapse-handle');
                    const targetEl = (handleTab && handleTab.offsetHeight > 0 && !handleTab.classList.contains('hidden-hud') && !handleTab.classList.contains('collapsed')) ? handleTab : handsHud;
                    const hRect = targetEl.getBoundingClientRect();
                    if (hRect.top > 0) {
                        bottomOffset = window.innerHeight - hRect.top + 12;
                    }
                }
            } else if (handsHud) {
                const handleTab = document.getElementById('pocket-collapse-handle');
                const targetEl = (handleTab && handleTab.offsetHeight > 0 && !handleTab.classList.contains('hidden-hud') && !handleTab.classList.contains('collapsed')) ? handleTab : handsHud;
                const hRect = targetEl.getBoundingClientRect();
                if (hRect.top > 0) {
                    bottomOffset = window.innerHeight - hRect.top + 12;
                }
            }

            const availableHeight = Math.max(320, window.innerHeight - 50 - bottomOffset);
            this.window.style.height = `${Math.round(availableHeight)}px`;
        });
    }

    open(data) {
        this.isOpen = true;
        this.currentStationId = data.stationId;
        if (window.game && window.game.objectGroup) {
            this.currentStationObject = window.game.objectGroup.getChildren().find(obj => obj.objectInfo && obj.objectInfo.uniqueId === data.stationId) || null;
        }

        // Re-parent window back to overlay container if detached by dragging
        if (this.window && this.uiContainer && this.window.parentElement !== this.uiContainer) {
            this.uiContainer.appendChild(this.window);
        }

        // Reset dragged position style to cleanly center the window when opened
        if (this.window) {
            delete this.window.dataset.hasBeenDragged;
            this.window.style.position = '';
            this.window.style.left = '';
            this.window.style.top = '';
            this.window.style.transform = '';
            this.window.style.margin = '';
            this.window.style.display = '';
        }

        this.uiContainer.style.display = 'block';
        if (window.completeTutorialTask) {
            window.completeTutorialTask('crafting_open');
        }

        // Force Reflow to enable transition
        void this.uiContainer.offsetWidth;

        this.uiContainer.classList.add('active'); // Use CSS class for fade-in
        this.positionWindow();

        this.activeRecipe = null;
        this.localStationInventory = data.stationInventory || [];

        // Reset Base UI State
        this.progressBar.style.transition = 'none';
        this.progressBar.style.width = '0%';
        this.progressLabel.textContent = "";
        if (this.tabProgressBar) this.tabProgressBar.style.width = '0%';
        if (this.tabStatusText) this.tabStatusText.textContent = "";

        // [FIX] Store recipes BEFORE applying config, so custom modules can access them via this.craftingUI.allRecipes
        this.allRecipes = data.recipes;

        // [NEW] Apply Custom Text & Config FIRST so renderers use it
        this.applyStationConfig(data.uiConfig || {});

        // [NEW] Check for Resume State from Server
        if (data.craftingState) {
            console.log("[CraftingUI] Found existing session on station:", data.craftingState);
            this.pausedState = {
                recipeId: data.craftingState.recipeId,
                remainingTime: data.craftingState.remainingTime
            };
        } else {
            this.pausedState = null;
        }

        // this.allRecipes already set above
        this.renderRecipes(data.recipes);
        this.updateStationInventory(data.stationInventory);

        // Render Output Slot if item exists (Persistent persistent)
        if (data.outputItem) {
            this.renderOutputSlot(data.outputItem);
        } else {
            this.outputSlot.innerHTML = '';
            this.outputHint.textContent = (this.currentConfig && this.currentConfig.outputLabel) ? this.currentConfig.outputLabel : "Cooling Rack";
        }

        // [NEW] Auto-select recipe AND update Bar if resuming
        if (this.pausedState) {
            const resumedRecipe = data.recipes.find(r => r.id === this.pausedState.recipeId);
            if (resumedRecipe) {
                this.selectRecipe(resumedRecipe, data.recipes);

                // Calculate %
                const totalTime = resumedRecipe.time || 3000;
                const remaining = this.pausedState.remainingTime;
                const startPercent = Math.max(0, Math.min(100, ((totalTime - remaining) / totalTime) * 100));

                // Update Bar Visually (No transition, static state)
                this.progressBar.style.width = `${startPercent}%`;
                const progressText = "PAUSED";
                this.progressLabel.textContent = progressText;

                if (this.tabProgressBar) this.tabProgressBar.style.width = `${startPercent}%`;
                if (this.tabStatusText) this.tabStatusText.textContent = "Paused";
            }
        } else {
            this.updateUI(); // Reset UI state check
        }
    }

    mountCustomModule(module) {
        this.currentModule = module;
        this.activeRecipe = null; // Clear default
        this.isCustomLayout = true; // Mark as dirty
        if (this.currentConfig) this.currentConfig.isCustom = true;
        // The module takes over the .window-body
        // It updates itself via its own updateInventory method when we call updateStationInventory
    }

    restoreDefaultUI() {
        if (!this.isCustomLayout) return;

        console.log("Restoring Default Crafting UI...");
        const bodyEl = this.window.querySelector('.window-body');
        if (bodyEl) bodyEl.innerHTML = this.defaultBodyHTML;

        // Re-query DOM Elements that were lost
        this.recipeList = document.getElementById('recipe-list');
        this.craftBtn = document.getElementById('crafting-action-btn');
        this.inventoryList = document.getElementById('station-input-slot');
        this.outputSlot = document.getElementById('outputSlot');
        this.outputHint = document.getElementById('outputHint');
        this.statusText = document.getElementById('crafting-status-text');
        this.progressBar = document.getElementById('crafting-progress-bar');
        this.progressLabel = document.getElementById('crafting-progress-label');

        this.previewName = document.getElementById('previewName');
        this.previewDesc = document.getElementById('previewDesc');
        this.previewIcon = document.getElementById('previewIcon');
        this.costDisplay = document.getElementById('costDisplay');

        // Re-attach listeners for the restored elements
        if (this.craftBtn) this.craftBtn.onclick = () => this.startCrafting();

        if (this.currentModule && typeof this.currentModule.destroy === 'function') {
            this.currentModule.destroy();
        }

        this.isCustomLayout = false;
        this.currentModule = null;
    }

    applyStationConfig(config) {
        this.currentConfig = config; // Store for later use (e.g. in updateUI)

        const titleEl = document.getElementById('crafting-window-title');
        if (titleEl) titleEl.textContent = config.title || "The Hearthside Forge";

        const recipeHeaderEl = document.getElementById('crafting-recipe-header');
        if (recipeHeaderEl) recipeHeaderEl.textContent = config.recipeBookTitle || "Blueprints";

        const inputLabelEl = document.getElementById('crafting-input-label');
        if (inputLabelEl) inputLabelEl.textContent = config.inputLabel || "Crucible (Deposit Materials)";

        const outputHintEl = document.getElementById('outputHint');
        if (outputHintEl) outputHintEl.textContent = config.outputLabel || "Cooling Rack";

        // [NEW] Restore Default UI if needed (switching from Custom back to Standard)
        if (this.isCustomLayout && (!config.modules || config.modules.type !== 'sewing_custom')) {
            this.restoreDefaultUI();
        }

        // Apply Theme Class
        // Reset to base class first
        this.window.className = 'crafting-window';

        // [FIX] Clear inline styles that might interfere with theme dimensions (e.g. from previous resizing)
        this.window.style.width = '';
        this.window.style.height = '';
        this.window.style.fontFamily = '';

        if (config.theme) {
            this.window.classList.add(config.theme);
        }

        // [NEW] Update Minimized Tab Theme & Title
        if (this.minimizedTab) {
            this.minimizedTab.className = 'minimized-tab'; // Reset
            if (config.theme) {
                this.minimizedTab.classList.add(config.theme);
            }

            const titleEl = this.minimizedTab.querySelector('.tab-title, #minimized-tab-title');
            if (titleEl) {
                const titleStr = config.title || "Crafting Paused";
                titleEl.textContent = titleStr;
                titleEl.style.display = 'block';
                titleEl.style.opacity = '1';
                titleEl.style.visibility = 'visible';
            }
        }

        // [NEW] Dynamic Modules
        if (config.modules) {
            if (config.modules.recipeList === false) {
                this.window.classList.add('layout-single-col');
            }

            // [NEW] Check for Custom UI Module
            if (config.modules.type === 'sewing_custom') {
                this.mountCustomModule(new SewingModule(this.window.querySelector('.window-body'), this.socket, this));
                return; // Stop default rendering
            }
        }

        // If no recipe is selected, update the preview text to the prompt
        if (!this.activeRecipe) {
            this.previewName.textContent = config.recipeSelectPrompt || "Select a Blueprint";
            this.craftBtn.textContent = "Select Recipe";
        }
    }

    close() {
        this.isOpen = false;
        this.currentStationId = null;
        this.uiContainer.classList.remove('active');

        // [NEW] Notify server to pause/stop crafting so we can move
        this.socket.emit('craftingPause');

        // [NEW] Optimistically clear local crafting state to allow immediate movement
        if (this.player && this.player.playerInfo) {
            this.player.playerInfo.isCrafting = false;
        } else if (window.game && window.game.playerContainer && window.game.playerContainer.playerInfo) {
            window.game.playerContainer.playerInfo.isCrafting = false;
        }

        // Ensure minimized tab is hidden immediately
        if (this.minimizedTab) this.minimizedTab.style.display = 'none';

        // Re-parent window back to overlay container if detached by dragging
        if (this.window && this.uiContainer && this.window.parentElement !== this.uiContainer) {
            this.uiContainer.appendChild(this.window);
        }

        if (this.window) {
            delete this.window.dataset.hasBeenDragged;
            this.window.style.position = '';
            this.window.style.left = '';
            this.window.style.top = '';
            this.window.style.transform = '';
            this.window.style.margin = '';
        }

        // Delay display:none to allow transition
        setTimeout(() => {
            if (!this.isOpen) {
                this.uiContainer.style.display = 'none';
                if (this.window) this.window.style.display = 'none';
            }
        }, 200);
    }

    renderRecipes(recipes) {
        // [OPTIMIZED] DOM Reconciliation / Patching

        // 1. Mark all existing as "unseen"
        const seenIds = new Set();

        recipes.forEach(recipe => {
            seenIds.add(recipe.id);
            let el = document.getElementById(`recipe-row-${recipe.id}`);

            if (!el) {
                // Create New
                el = document.createElement('div');
                el.id = `recipe-row-${recipe.id}`;
                el.className = 'recipe-list-item';
                el.onclick = () => this.selectRecipe(recipe, recipes);

                // [OPTIMIZED] Data-Driven Icon
                // Priority: Recipe Icon -> Result Item Data Icon -> Result Custom Icon -> Default Tool
                let iconClass = recipe.icon; // e.g. 'fa-solid fa-sword'

                if (!iconClass && recipe.result && recipe.result.itemId && itemData[recipe.result.itemId]) {
                    iconClass = itemData[recipe.result.itemId].icon;
                }

                // Fallback to result custom data if recipe icon missing
                if (!iconClass && recipe.result && recipe.result.customData && recipe.result.customData.icon) {
                    const icon = recipe.result.customData.icon;
                    iconClass = icon.includes('fa-') ? (icon.includes('fa-solid') ? icon : `fa-solid ${icon}`) : `fa-solid ${icon}`;
                }

                // Ultimate fallback
                if (!iconClass) iconClass = 'fa-solid fa-box-open';
                iconClass = iconClass.includes('fa-') ? (iconClass.includes('fa-solid') ? iconClass : `fa-solid ${iconClass}`) : `fa-solid ${iconClass}`;

                // If iconClass is character (emoji)? No, moving to FontAwesome.
                // But some legacy might use emojis in ID? logic removed.

                let iconHtml = `<i class="${iconClass}"></i>`;

                el.innerHTML = `
                    <div class="recipe-icon">${iconHtml}</div>
                    <div class="recipe-details">
                        <h4>${recipe.name}</h4>
                        <p>Time: ${recipe.time / 1000}s</p>
                    </div>
                `;
                this.recipeList.appendChild(el);
            }

            // Update Class
            if (this.activeRecipe && this.activeRecipe.id === recipe.id) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });

        // 2. Cleanup Removed Recipes (if any)
        Array.from(this.recipeList.children).forEach(child => {
            // ID format: recipe-row-ID
            const id = child.id.replace('recipe-row-', '');
            if (!seenIds.has(id)) {
                child.remove();
            }
        });
    }

    // getIconForRecipe Removed - Data Driven Now

    selectRecipe(recipe, allRecipes) {
        // [OPTIMIZED] No Re-render needed

        // 1. Deselect Old
        if (this.activeRecipe) {
            const oldEl = document.getElementById(`recipe-row-${this.activeRecipe.id}`);
            if (oldEl) oldEl.classList.remove('selected');
        }

        // 2. Select New
        this.activeRecipe = recipe;
        const newEl = document.getElementById(`recipe-row-${recipe.id}`);
        if (newEl) newEl.classList.add('selected');

        // 3. Update UI (details panel)
        this.updateUI();
    }

    updateStationInventory(inventory) {
        this.localStationInventory = inventory;

        // [NEW] Delegate to Custom Module
        if (this.currentModule) {
            this.currentModule.updateInventory(inventory);
            return;
        }

        // Render slots (Optimized Reconciliation)
        const MAX_SLOTS = (this.currentConfig && this.currentConfig.inputSlots) ? this.currentConfig.inputSlots : 6;

        // Ensure correct number of slots exist
        let slots = this.inventoryList.children;
        while (slots.length < MAX_SLOTS) {
            const el = document.createElement('div');
            el.className = 'anvil-slot';
            this.inventoryList.appendChild(el);
        }
        while (slots.length > MAX_SLOTS) {
            this.inventoryList.removeChild(this.inventoryList.lastChild);
        }

        // Update Slot Content
        for (let i = 0; i < MAX_SLOTS; i++) {
            const el = slots[i];
            const item = inventory[i];
            const currentKey = item ? `${item.uid}_${item.count || 1}_${item.icon || ''}_${item.name || ''}` : 'empty';

            if (el.dataset.slotKey === currentKey) continue;
            el.dataset.slotKey = currentKey;

            if (item) {
                // Unified Rendering Logic
                let itemIcon = item.icon || (item.itemId && itemData[item.itemId] ? itemData[item.itemId].icon : null);
                let iconHtml = '';
                if (itemIcon) {
                    const iconClass = itemIcon.includes('fa-') ? (itemIcon.includes('fa-solid') ? itemIcon : `fa-solid ${itemIcon}`) : `fa-solid ${itemIcon}`;
                    iconHtml = `<i class="${iconClass}" style="font-size:24px; color: ${item.color ? '#' + item.color.toString(16).padStart(6, '0') : ''}"></i>`;
                } else {
                    iconHtml = `<i class="fa-solid fa-box-open" style="font-size:24px;"></i>`;
                }

                // Only touch DOM if changed
                if (el.innerHTML !== iconHtml) el.innerHTML = iconHtml;

                const newTitle = `${item.name} (L-Click for Left Hand, R-Click for Right Hand)`;
                if (el.title !== newTitle) el.title = newTitle;

                // Unified Hand Click Handler (Retrieve: Left Click = Left Hand, Right Click = Right Hand)
                clickManager.bindElementHandClick(el, {
                    onHandClick: (hand, e) => {
                        this.retrieveItem(item.uid, hand);
                    }
                });

                // Visual State
                if (el.style.opacity === '0.5') el.style.opacity = '1'; // Reset if needed

            } else {
                // Empty slot
                const emptyHtml = `<span style="opacity:0.2; font-size:20px;">⬇️</span>`;
                if (el.innerHTML !== emptyHtml) el.innerHTML = emptyHtml;

                const newTitle = "Deposit from Hand (L-Click: Left Hand, R-Click: Right Hand)";
                if (el.title !== newTitle) el.title = newTitle;

                // Unified Hand Click Handler (Deposit: Left Click = Left Hand, Right Click = Right Hand)
                clickManager.bindElementHandClick(el, {
                    onHandClick: (hand, e) => {
                        this.depositInStation(hand);
                    }
                });
            }
        }

        this.updateUI(); // Check requirements

        // [NEW] Attempt Auto-Select if Recipe List is hidden
        this.tryAutoSelectRecipe();
    }

    tryAutoSelectRecipe() {
        // Only run if the module config says recipeList is HIDDEN
        if (!this.currentConfig || !this.currentConfig.modules || this.currentConfig.modules.recipeList !== false) {
            return;
        }

        if (!this.allRecipes || this.allRecipes.length === 0) return;

        // Count current inventory
        const inventoryCounts = {};
        this.localStationInventory.forEach(item => {
            inventoryCounts[item.itemId] = (inventoryCounts[item.itemId] || 0) + 1;
        });

        // Find first matching recipe
        let matchedRecipe = null;

        for (const recipe of this.allRecipes) {
            if (!recipe.ingredients) continue;

            let possible = true;
            for (const ing of recipe.ingredients) {
                const has = inventoryCounts[ing.itemId] || 0;
                if (has < ing.count) {
                    possible = false;
                    break;
                }
            }

            if (possible) {
                matchedRecipe = recipe;
                break; // Found one!
            }
        }

        if (matchedRecipe) {
            // Only switch if different to avoid flickering? 
            // Actually, selectRecipe handles re-render, so it's fine.
            if (!this.activeRecipe || this.activeRecipe.id !== matchedRecipe.id) {
                console.log("[CraftingUI] Auto-selecting recipe:", matchedRecipe.name);
                this.selectRecipe(matchedRecipe, this.allRecipes);
            }
        } else {
            // Optional: If no match, clear selection?
            // Usually safer to clear so they don't craft the wrong thing if they pull items out.
            if (this.activeRecipe) {
                this.activeRecipe = null;
                this.updateUI();
            }
        }
    }

    retrieveItem(itemUid, hand = 'left') {
        if (!this.isOpen || !this.currentStationId) return;
        this.socket.emit('craftingRetrieveItem', {
            stationId: this.currentStationId,
            itemUid: itemUid,
            hand: hand
        });
    }

    updateUI() {
        if (!this.activeRecipe) {
            this.previewName.textContent = (this.currentConfig && this.currentConfig.recipeSelectPrompt) ? this.currentConfig.recipeSelectPrompt : "Select a Blueprint";
            this.previewDesc.textContent = "Choose a recipe from the left.";
            this.previewIcon.textContent = "?";
            this.costDisplay.innerHTML = "";
            this.craftBtn.classList.remove('ready');
            this.craftBtn.disabled = true;
            this.craftBtn.textContent = "Select Recipe";
            return;
        }

        // Populate Info
        const rName = this.activeRecipe.name || (this.activeRecipe.result && this.activeRecipe.result.customData && this.activeRecipe.result.customData.name) || "Unknown Item";
        const rDesc = this.activeRecipe.description || (this.activeRecipe.result && this.activeRecipe.result.customData && this.activeRecipe.result.customData.description) || "A craftable item.";

        this.previewName.textContent = rName;
        this.previewDesc.textContent = rDesc;

        let iconClass = this.activeRecipe.icon;
        if (!iconClass && this.activeRecipe.result && this.activeRecipe.result.itemId && itemData[this.activeRecipe.result.itemId]) {
            iconClass = itemData[this.activeRecipe.result.itemId].icon;
        }
        if (!iconClass && this.activeRecipe.result && this.activeRecipe.result.customData && this.activeRecipe.result.customData.icon) {
            const icon = this.activeRecipe.result.customData.icon;
            iconClass = icon.includes('fa-') ? (icon.includes('fa-solid') ? icon : `fa-solid ${icon}`) : `fa-solid ${icon}`;
        }
        if (!iconClass) iconClass = 'fa-solid fa-box-open';
        iconClass = iconClass.includes('fa-') ? (iconClass.includes('fa-solid') ? iconClass : `fa-solid ${iconClass}`) : `fa-solid ${iconClass}`;

        this.previewIcon.innerHTML = `<i class="${iconClass}"></i>`;

        // Calculate Costs
        let costHTML = '';
        let requirementsMet = true;

        // [OPTIMIZED] Context-Aware Counting with Map
        // O(N) complexity instead of O(N^2)

        const inventoryMap = new Map(); // Key -> count
        // We verify what we "have" locally to permit eager "Ready" state

        const getKey = (item) => {
            let key = item.itemId;
            if (key.startsWith('alpha_') && item.variant) {
                key += `|${item.variant}`;
            }
            return key;
        };

        this.localStationInventory.forEach(item => {
            const key = getKey(item);
            inventoryMap.set(key, (inventoryMap.get(key) || 0) + 1);
        });

        // We also need to track "used" counts if multiple ingredients use the same key
        // (Recipe ingredients list is usually small, so we can just clone the map or decrement a copy)
        const availableMap = new Map(inventoryMap);

        if (this.activeRecipe.ingredients) {
            this.activeRecipe.ingredients.forEach(ing => {
                let reqKey = ing.itemId;
                if (ing.customData && ing.customData.variant) {
                    reqKey += `|${ing.customData.variant}`;
                }

                const totalAvailable = availableMap.get(reqKey) || 0;
                const needed = ing.count;

                // For display "Has/Need", we show totalAvailable. 
                // But wait, if Ing 1 uses 1 Vodka, and Ing 2 uses 1 Vodka.
                // We have 1 Vodka.
                // Ing 1 sees 1. OK. Decrements.
                // Ing 2 sees 0. Fail.
                // So loop must consume.

                const isOk = totalAvailable >= needed;

                // Decrement for subsequent checks
                if (isOk) {
                    availableMap.set(reqKey, totalAvailable - needed);
                } else {
                    // Consume all we check to be correct? 
                    // Actually, if we fail, we fail. But for display let's show what we *had* for this slot.
                    availableMap.set(reqKey, 0);
                }

                if (!isOk) requirementsMet = false;

                // Friendly name formatting
                let name = ing.itemId.replace('ingot_', '').toUpperCase();
                if (ing.customData && ing.customData.name) {
                    name = ing.customData.name;
                }

                costHTML += `
                    <div class="cost-item" style="color:${isOk ? '#66bb6a' : '#ef5350'}">
                        ${name}: ${totalAvailable}/${needed}
                        <div class="status-dot ${isOk ? 'ok' : ''}"></div>
                    </div>
                `;
            });
        }
        this.costDisplay.innerHTML = costHTML;

        // Button State
        const canResume = this.pausedState && this.pausedState.recipeId === this.activeRecipe.id;

        if (requirementsMet || canResume) {
            this.craftBtn.classList.add('ready');
            this.craftBtn.disabled = false;

            if (canResume) {
                this.craftBtn.textContent = "Resume";
            } else {
                this.craftBtn.textContent = (this.currentConfig && this.currentConfig.buttonLabel) ? this.currentConfig.buttonLabel : "Strike Iron";
            }
        } else {
            this.craftBtn.classList.remove('ready');
            this.craftBtn.disabled = true;
            this.craftBtn.textContent = "Add Materials";
        }
    }

    depositInStation(hand) {
        // Deposit Held Item.
        this.socket.emit('craftingDepositItem', { 
            stationId: this.currentStationId,
            hand: hand || 'left'
        });
    }

    depositFromInventory(slotId, pocketId, itemUid) {
        if (!this.isOpen || !this.currentStationId) return;

        console.log(`[CraftingUI] Depositing from inventory: ${slotId}/${pocketId} -> ${itemUid}`);
        this.socket.emit('craftingDepositItem', {
            stationId: this.currentStationId,
            sourceSlot: slotId,
            sourcePocket: pocketId,
            itemUid: itemUid
        });
    }

    startCrafting() {
        if (!this.activeRecipe) return;

        this.socket.emit('craftingStart', { stationId: this.currentStationId, recipeId: this.activeRecipe.id });

        // Optimistic UI for Progress
        const progressText = (this.currentConfig && this.currentConfig.actionProgressLabel) ? this.currentConfig.actionProgressLabel : "HEATING...";
        this.progressLabel.textContent = progressText;
        if (this.tabStatusText) this.tabStatusText.textContent = progressText;

        this.progressBar.parentElement.style.display = 'block'; // Ensure container visible

        // Animate
        let duration = this.activeRecipe.time || 3000;
        let isResuming = false;

        // Check Resume match
        if (this.pausedState && this.pausedState.recipeId === this.activeRecipe.id) {
            duration = this.pausedState.remainingTime;
            isResuming = true;
            // Clear pause state so next time is fresh (unless we pause again)
            this.pausedState = null;
        }

        const totalTime = this.activeRecipe.time || 3000;
        let startPercent = 0;

        if (isResuming) {
            // Calculate where we should start: (Total - Remaining) / Total * 100
            startPercent = ((totalTime - duration) / totalTime) * 100;
        }

        // Set Start Position
        this.progressBar.style.transition = 'none';
        this.progressBar.style.width = `${startPercent}%`;

        if (this.tabProgressBar) {
            this.tabProgressBar.style.transition = 'none';
            this.tabProgressBar.style.width = `${startPercent}%`;
        }

        // Start Animation (Target 100% over REMAINING duration via non-blocking rAF)
        const triggerStartAnim = () => {
            this.progressBar.style.transition = `width ${duration}ms linear`;
            this.progressBar.style.width = '100%';

            if (this.tabProgressBar) {
                this.tabProgressBar.style.transition = `width ${duration}ms linear`;
                this.tabProgressBar.style.width = '100%';
            }
        };

        if (document.hidden) {
            triggerStartAnim();
        } else {
            requestAnimationFrame(() => {
                requestAnimationFrame(triggerStartAnim);
            });
        }

        // Lock UI
        this.craftBtn.disabled = true;
        this.craftBtn.textContent = (this.currentConfig && this.currentConfig.actionProgressLabel) ? this.currentConfig.actionProgressLabel : "Forging...";
        this.craftBtn.classList.remove('ready');
    }

    startCraftingOptimistic(recipeId, duration) {
        // Helper for modules to trigger bar animation without full recipe object
        const progressText = (this.currentConfig && this.currentConfig.actionProgressLabel) ? this.currentConfig.actionProgressLabel : "Crafting...";
        this.progressLabel.textContent = progressText;
        if (this.tabStatusText) this.tabStatusText.textContent = progressText;

        this.progressBar.parentElement.style.display = 'block';

        this.progressBar.style.transition = 'none';
        this.progressBar.style.width = '0%';

        const triggerOptimisticAnim = () => {
            this.progressBar.style.transition = `width ${duration}ms linear`;
            this.progressBar.style.width = '100%';

            if (this.tabProgressBar) {
                this.tabProgressBar.style.transition = `width ${duration}ms linear`;
                this.tabProgressBar.style.width = '100%';
            }
        };

        if (document.hidden) {
            triggerOptimisticAnim();
        } else {
            requestAnimationFrame(() => {
                requestAnimationFrame(triggerOptimisticAnim);
            });
        }
    }

    finishCrafting(data) {
        // Success Flash
        const flash = document.getElementById('flashOverlay');
        if (flash) {
            flash.style.animation = 'none';
            if (document.hidden) {
                flash.style.animation = 'success-flash 0.5s ease-out';
            } else {
                requestAnimationFrame(() => {
                    flash.style.animation = 'success-flash 0.5s ease-out';
                });
            }
        }

        // Reset Bar
        this.progressBar.style.transition = 'none';
        this.progressBar.style.width = '0%';
        this.progressLabel.textContent = "";

        // Restore Station Title
        if (this.tabStatusText && this.currentConfig) {
            this.tabStatusText.textContent = this.currentConfig.title || "Crafting Paused";
        }

        this.showFloatingText(data.message || "Crafted!");

        // Update Output Slot
        if (this.outputSlot && data.item) {
            this.renderOutputSlot(data.item);
            this.outputHint.textContent = "Item Crafted!";

            // Re-enable button if enough materials left (Optimistic check handled by updateUI, but specific check useful)
            this.updateUI();
        }
    }

    renderOutputSlot(item) {
        if (!this.outputSlot) return;

        let iconHtml = `<span style="font-size:32px;">🎁</span>`;
        if (item) {
            // Unified Rendering Logic
            let itemIcon = item.icon || (item.itemId && itemData[item.itemId] ? itemData[item.itemId].icon : null);
            if (itemIcon) {
                const iconClass = itemIcon.includes('fa-') ? (itemIcon.includes('fa-solid') ? itemIcon : `fa-solid ${itemIcon}`) : `fa-solid ${itemIcon}`;
                iconHtml = `<i class="${iconClass}" style="font-size:32px; color: ${item.color ? '#' + item.color.toString(16).padStart(6, '0') : ''}"></i>`;
            } else {
                iconHtml = `<i class="fa-solid fa-box-open" style="font-size:32px;"></i>`;
            }

            this.outputSlot.innerHTML = iconHtml;
            this.outputSlot.title = `${item.name} (L-Click for Left Hand, R-Click for Right Hand)`;

            // Unified Hand Click Interaction
            clickManager.bindElementHandClick(this.outputSlot, {
                onHandClick: (hand, e) => {
                    this.retrieveItem(item.uid, hand);
                    // Optimistic clear
                    this.outputSlot.innerHTML = '';
                    this.outputHint.textContent = (this.currentConfig && this.currentConfig.outputLabel) ? this.currentConfig.outputLabel : "Cooling Rack";
                    this.outputSlot.onclick = null;
                    this.outputSlot.oncontextmenu = null;
                }
            });
        } else {
            this.outputSlot.innerHTML = '';
            this.outputHint.textContent = (this.currentConfig && this.currentConfig.outputLabel) ? this.currentConfig.outputLabel : "Cooling Rack";
            this.outputSlot.onclick = null;
            this.outputSlot.oncontextmenu = null;
        }
    }

    setupWindowControls() {
        if (!this.header || !this.window) return;

        // Use shared WindowManager for Drag & Resize
        WindowManager.makeDraggable(this.window, this.header);

        const handles = {
            r: this.window.querySelector('.resize-handle.right'),
            b: this.window.querySelector('.resize-handle.bottom'),
            br: this.window.querySelector('.resize-handle.br'),
            l: this.window.querySelector('.resize-handle.left'),
            t: this.window.querySelector('.resize-handle.top')
        };

        WindowManager.makeResizable(this.window, handles, { minWidth: 600, minHeight: 400 });

        // --- Minimize/Restore ---
        if (this.minimizeBtn) {
            this.minimizeBtn.onclick = (e) => {
                e.stopPropagation();
                this.minimize();
            };
        }

        if (this.minimizedTab) {
            this.minimizedTab.onclick = (e) => {
                if (this.minimizedTab.dataset.isDragging !== 'true') {
                    this.restore();
                }
            };
        }
    }

    minimize() {
        if (!this.isOpen) return;
        this.uiContainer.style.display = 'none'; // Hide main overlay
        this.window.style.display = 'none';
        if (this.minimizedTab) {
            this.minimizedTab.style.display = 'flex';
            DockManager.updateLayout();
        }
    }

    restore() {
        if (!this.isOpen) return;
        this.uiContainer.style.display = 'flex'; // Restore overlay
        this.window.style.display = ''; // Revert to CSS default (block/flex)
        if (this.minimizedTab) this.minimizedTab.style.display = 'none';
    }

    showFloatingText(text, isError = false) {
        const parent = document.querySelector('.anvil-surface');
        if (!parent) return;

        const el = document.createElement('div');
        el.className = 'floating-text';
        if (isError) el.style.color = '#ef5350';
        el.textContent = text;
        el.style.left = '50%';
        el.style.top = '40%';
        el.style.transform = 'translate(-50%, -50%)';
        parent.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }

    showPauseConfirmation() {
        // Prevent duplicate modals
        if (document.querySelector('.pause-confirmation-modal')) return;

        const modal = document.createElement('div');
        modal.className = 'pause-confirmation-modal';

        // [NEW] Apply Station Theme
        if (this.currentConfig && this.currentConfig.theme) {
            modal.classList.add(this.currentConfig.theme);
        }
        modal.innerHTML = `
            <h3>Pause Crafting?</h3>
            <p>Do you want to stop crafting and move?</p>
            <div class="pause-buttons">
                <button class="pause-btn confirm">Yes</button>
                <button class="pause-btn cancel">No</button>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('.confirm').onclick = () => {
            console.log("Emitting craftingPause...");
            this.socket.emit('craftingPause');
            modal.remove();
        };

        modal.querySelector('.cancel').onclick = () => {
            modal.remove();
            // Do nothing, keep crafting
        };
    }

    pauseCraftingUI(data) {
        console.log("[CraftingUI] pauseCraftingUI triggered", data);

        // Store state for resume
        if (data.recipeId) {
            this.pausedState = {
                recipeId: data.recipeId,
                remainingTime: data.remainingTime
            };
        }

        // 1. Stop Progress Bar
        const computedWidth = getComputedStyle(this.progressBar).width;
        this.progressBar.style.transition = 'none';
        this.progressBar.style.width = computedWidth;

        if (this.tabProgressBar) {
            const computedTabWidth = getComputedStyle(this.tabProgressBar).width;
            this.tabProgressBar.style.transition = 'none';
            this.tabProgressBar.style.width = computedTabWidth;
        }

        this.progressLabel.textContent = "PAUSED";


        // 2. Enable Buttons / Update Text
        this.craftBtn.textContent = "Resume";
        this.craftBtn.disabled = false;
        this.craftBtn.classList.add('ready');

        // 3. Unlock Movement Locally (Immediate Feedback)
        // Check if we can access the player info object directly
        if (this.player && this.player.playerInfo) {
            this.player.playerInfo.isCrafting = false;
        } else if (window.game && window.game.playerContainer && window.game.playerContainer.playerInfo) {
            // Fallback to global access if this.player is not the container
            window.game.playerContainer.playerInfo.isCrafting = false;
        }
    }
}
