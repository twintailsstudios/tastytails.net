/**
 * @fileoverview AlembicModule.js - Custom Alchemist Alembic Station UI Module
 * 
 * @description
 * Pluggable client-side crafting module for the `alembic` station.
 * Mounted within `CraftingUI` (`crafting.js`) to provide real-time liquid proportion mixing,
 * integer charge stepping controls, dual-beaker offscreen canvas preview, and recipe matching.
 * 
 * @module AlembicModule
 */

import itemData from '../itemData.js';
import { clickManager } from '../clickManager.js';

export class AlembicModule {
    /**
     * Creates an instance of AlembicModule.
     * @param {HTMLElement} container - Parent DOM container element (.window-body)
     * @param {Object} socket - Socket.IO client instance
     * @param {Object} craftingUI - Host CraftingUI manager instance
     */
    constructor(container, socket, craftingUI) {
        this.container = container;
        this.socket = socket;
        this.craftingUI = craftingUI;
        this.active = true;

        // Inventory state initialization
        this.inventory = [];
        this.outputItem = null;

        // Selected stepping uses for Slot 1 and Slot 2
        this.slot1Uses = 5;
        this.slot2Uses = 5;

        // Matched recipe reference
        this.matchedRecipe = null;

        // Render custom UI layout
        this.renderLayout();

        // Initial inventory setup
        this.updateInventory(this.craftingUI.localStationInventory || [], this.craftingUI.outputItem || null);
    }

    /**
     * Renders the custom HTML layout inside the crafting window body.
     */
    renderLayout() {
        this.container.innerHTML = `
            <div class="alembic-container">
                <div class="alembic-header">
                    <i class="fa-solid fa-vial-circle-check"></i>
                    <span>Place 2 Liquid Ingredients & Adjust Stepping Ratio</span>
                </div>

                <div class="alembic-workspace">
                    <!-- Left Ingredient Slot -->
                    <div class="alembic-slot-card" id="alembic-slot1-card">
                        <div class="slot-title">Ingredient 1</div>
                        <div class="alembic-slot" id="alembic-slot-0" data-slot-index="0">
                            <i class="fa-solid fa-flask slot-placeholder-icon"></i>
                        </div>
                        <div class="item-name" id="alembic-slot0-name">Empty Slot</div>
                        <div class="uses-badge" id="alembic-slot0-uses">-- / -- Uses</div>
                        
                        <div class="stepper-control" id="alembic-slot0-stepper" style="display: none;">
                            <label>Portion (Uses):</label>
                            <div class="stepper-buttons">
                                <button class="stepper-btn" id="slot0-minus">-</button>
                                <span class="stepper-value" id="slot0-val">5</span>
                                <button class="stepper-btn" id="slot0-plus">+</button>
                            </div>
                        </div>
                    </div>

                    <!-- Central Alembic Liquid Mixer Canvas -->
                    <div class="alembic-mixer-view">
                        <canvas id="alembic-canvas" width="180" height="180"></canvas>
                        <div class="mixer-ratio-indicator" id="alembic-ratio-text">5 : 5 Ratio</div>
                    </div>

                    <!-- Right Ingredient Slot -->
                    <div class="alembic-slot-card" id="alembic-slot2-card">
                        <div class="slot-title">Ingredient 2</div>
                        <div class="alembic-slot" id="alembic-slot-1" data-slot-index="1">
                            <i class="fa-solid fa-flask slot-placeholder-icon"></i>
                        </div>
                        <div class="item-name" id="alembic-slot1-name">Empty Slot</div>
                        <div class="uses-badge" id="alembic-slot1-uses">-- / -- Uses</div>

                        <div class="stepper-control" id="alembic-slot1-stepper" style="display: none;">
                            <label>Portion (Uses):</label>
                            <div class="stepper-buttons">
                                <button class="stepper-btn" id="slot1-minus">-</button>
                                <span class="stepper-value" id="slot1-val">5</span>
                                <button class="stepper-btn" id="slot1-plus">+</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Output Receiver Card & Action Bar -->
                <div class="alembic-footer">
                    <div class="alembic-output-preview" id="alembic-output-card">
                        <div class="output-slot-container">
                            <div class="alembic-output-slot" id="alembic-output-slot">
                                <i class="fa-solid fa-box-open"></i>
                            </div>
                        </div>
                        <div class="output-details">
                            <div class="output-name" id="alembic-output-name">Select 2 Ingredients</div>
                            <div class="output-desc" id="alembic-output-desc">Combine cauldron-crafted liquids to distill new compounds.</div>
                        </div>
                    </div>

                    <div class="alembic-action-panel">
                        <div class="alembic-progress-container" id="alembic-progress-wrap" style="display: none;">
                            <div class="alembic-progress-bar" id="alembic-progress-bar"></div>
                            <span class="alembic-progress-text" id="alembic-progress-text">Distilling...</span>
                        </div>
                        <button class="alembic-craft-btn" id="alembic-craft-btn" disabled>Blend & Distill</button>
                    </div>
                </div>
            </div>
        `;

        // Cache DOM elements
        this.dom = {
            slot0: this.container.querySelector('#alembic-slot-0'),
            slot0Name: this.container.querySelector('#alembic-slot0-name'),
            slot0Uses: this.container.querySelector('#alembic-slot0-uses'),
            slot0Stepper: this.container.querySelector('#alembic-slot0-stepper'),
            slot0Minus: this.container.querySelector('#slot0-minus'),
            slot0Plus: this.container.querySelector('#slot0-plus'),
            slot0Val: this.container.querySelector('#slot0-val'),

            slot1: this.container.querySelector('#alembic-slot-1'),
            slot1Name: this.container.querySelector('#alembic-slot1-name'),
            slot1Uses: this.container.querySelector('#alembic-slot1-uses'),
            slot1Stepper: this.container.querySelector('#alembic-slot1-stepper'),
            slot1Minus: this.container.querySelector('#slot1-minus'),
            slot1Plus: this.container.querySelector('#slot1-plus'),
            slot1Val: this.container.querySelector('#slot1-val'),

            canvas: this.container.querySelector('#alembic-canvas'),
            ratioText: this.container.querySelector('#alembic-ratio-text'),

            outputSlot: this.container.querySelector('#alembic-output-slot'),
            outputName: this.container.querySelector('#alembic-output-name'),
            outputDesc: this.container.querySelector('#alembic-output-desc'),
            craftBtn: this.container.querySelector('#alembic-craft-btn'),
            progressWrap: this.container.querySelector('#alembic-progress-wrap'),
            progressBar: this.container.querySelector('#alembic-progress-bar'),
            progressText: this.container.querySelector('#alembic-progress-text')
        };

        // Attach event listeners
        this.attachEvents();
        this.drawMixerCanvas();
    }

    attachEvents() {
        // Stepper Slot 0
        if (this.dom.slot0Minus) {
            this.dom.slot0Minus.onclick = () => {
                if (this.slot1Uses > 1) {
                    this.slot1Uses--;
                    this.updateUIState();
                }
            };
        }
        if (this.dom.slot0Plus) {
            this.dom.slot0Plus.onclick = () => {
                const item0 = this.inventory[0];
                const maxAvailable = item0 ? Math.max(1, (item0.maxUses || 9) - (item0.timesUsed || 0)) : 9;
                if (this.slot1Uses < maxAvailable) {
                    this.slot1Uses++;
                    this.updateUIState();
                }
            };
        }

        // Stepper Slot 1
        if (this.dom.slot1Minus) {
            this.dom.slot1Minus.onclick = () => {
                if (this.slot2Uses > 1) {
                    this.slot2Uses--;
                    this.updateUIState();
                }
            };
        }
        if (this.dom.slot1Plus) {
            this.dom.slot1Plus.onclick = () => {
                const item1 = this.inventory[1];
                const maxAvailable = item1 ? Math.max(1, (item1.maxUses || 9) - (item1.timesUsed || 0)) : 9;
                if (this.slot2Uses < maxAvailable) {
                    this.slot2Uses++;
                    this.updateUIState();
                }
            };
        }

        // Craft Action Button
        if (this.dom.craftBtn) {
            this.dom.craftBtn.onclick = () => this.startCrafting();
        }
    }

    /**
     * Called by CraftingUI whenever station inventory changes.
     */
    updateInventory(inventory, outputItem) {
        this.inventory = inventory || [];
        this.outputItem = outputItem || null;

        const item0 = this.inventory[0] || null;
        const item1 = this.inventory[1] || null;

        // Render Slot 0
        this.renderSlot(this.dom.slot0, this.dom.slot0Name, this.dom.slot0Uses, this.dom.slot0Stepper, item0, 0);
        // Render Slot 1
        this.renderSlot(this.dom.slot1, this.dom.slot1Name, this.dom.slot1Uses, this.dom.slot1Stepper, item1, 1);

        // Clamp stepper uses to current item remaining uses
        if (item0) {
            const avail0 = Math.max(1, (item0.maxUses || 9) - (item0.timesUsed || 0));
            this.slot1Uses = Math.min(this.slot1Uses, avail0);
        } else {
            this.slot1Uses = 5;
        }

        if (item1) {
            const avail1 = Math.max(1, (item1.maxUses || 9) - (item1.timesUsed || 0));
            this.slot2Uses = Math.min(this.slot2Uses, avail1);
        } else {
            this.slot2Uses = 5;
        }

        // Render Output Slot
        this.renderOutputSlot();

        // Update recipe match and UI
        this.updateUIState();
    }

    renderSlot(slotEl, nameEl, usesEl, stepperEl, item, slotIndex) {
        if (!slotEl) return;

        if (item) {
            const def = itemData[item.itemId] || {};
            const maxUses = item.maxUses || def.maxUses || 9;
            const remaining = Math.max(0, maxUses - (item.timesUsed || 0));

            const rawColor = item.color || def.color;
            const hexColor = rawColor !== undefined ? `#${rawColor.toString(16).padStart(6, '0')}` : '#38bdf8';

            slotEl.innerHTML = `
                <div class="item-icon-wrapper">
                    <i class="${item.icon || def.icon || 'fa-solid fa-bottle-droplet'}" style="font-size: 28px; color: ${hexColor}"></i>
                </div>
            `;
            if (nameEl) nameEl.textContent = item.name || def.name || 'Liquid Ingredient';
            if (usesEl) usesEl.textContent = `${remaining} / ${maxUses} Uses`;
            if (stepperEl) stepperEl.style.display = 'flex';

            slotEl.title = `${item.name || def.name} (L-Click for Left Hand, R-Click for Right Hand)`;

            clickManager.bindElementHandClick(slotEl, {
                onHandClick: (hand) => {
                    this.socket.emit('craftingRetrieveItem', {
                        stationId: this.craftingUI.currentStationId,
                        itemUid: item.uid,
                        hand: hand || 'right'
                    });
                }
            });
        } else {
            slotEl.innerHTML = `<i class="fa-solid fa-flask slot-placeholder-icon" style="font-size: 24px;"></i>`;
            if (nameEl) nameEl.textContent = 'Empty Slot';
            if (usesEl) usesEl.textContent = '-- / -- Uses';
            if (stepperEl) stepperEl.style.display = 'none';

            slotEl.title = "Deposit from Hand (L-Click: Left Hand, R-Click: Right Hand)";

            clickManager.bindElementHandClick(slotEl, {
                onHandClick: (hand) => {
                    this.craftingUI.depositInStation(hand || 'left');
                }
            });
        }
    }

    renderOutputSlot() {
        if (!this.dom.outputSlot) return;

        if (this.outputItem) {
            const def = itemData[this.outputItem.itemId] || {};
            const rawColor = this.outputItem.color || def.color;
            const hexColor = rawColor !== undefined ? `#${rawColor.toString(16).padStart(6, '0')}` : '#38bdf8';

            this.dom.outputSlot.classList.add('has-output-item');
            this.dom.outputSlot.innerHTML = `
                <div class="item-icon-wrapper">
                    <i class="${this.outputItem.icon || def.icon || 'fa-solid fa-bottle-droplet'}" style="font-size: 28px; color: ${hexColor}"></i>
                </div>
            `;
            if (this.dom.outputName) this.dom.outputName.textContent = this.outputItem.name || def.name;
            if (this.dom.outputDesc) this.dom.outputDesc.textContent = `Distillate Ready! Click to take (${(this.outputItem.maxUses || 9) - (this.outputItem.timesUsed || 0)} uses)`;

            this.dom.outputSlot.title = `${this.outputItem.name || def.name} (L-Click for Left Hand, R-Click for Right Hand)`;

            clickManager.bindElementHandClick(this.dom.outputSlot, {
                onHandClick: (hand) => {
                    this.socket.emit('craftingRetrieveItem', {
                        stationId: this.craftingUI.currentStationId,
                        itemUid: this.outputItem.uid,
                        hand: hand || 'right'
                    });
                }
            });
        } else if (this.matchedRecipe) {
            this.dom.outputSlot.classList.remove('has-output-item');
            const resultDef = itemData[this.matchedRecipe.result.itemId] || {};
            const hexColor = resultDef.color !== undefined ? `#${resultDef.color.toString(16).padStart(6, '0')}` : '#38bdf8';

            this.dom.outputSlot.innerHTML = `
                <div class="item-icon-wrapper preview-mode">
                    <i class="${resultDef.icon || 'fa-solid fa-bottle-droplet'}" style="font-size: 28px; color: ${hexColor}"></i>
                </div>
            `;
            if (this.dom.outputName) this.dom.outputName.textContent = resultDef.name || this.matchedRecipe.name;
            if (this.dom.outputDesc) this.dom.outputDesc.textContent = resultDef.flavor || resultDef.description || 'Valid mixture ratio!';

            clickManager.unbindElementHandClick(this.dom.outputSlot);
        } else {
            this.dom.outputSlot.classList.remove('has-output-item');
            this.dom.outputSlot.innerHTML = `<i class="fa-solid fa-box-open" style="font-size: 24px;"></i>`;
            if (this.dom.outputName) this.dom.outputName.textContent = 'Select 2 Ingredients';
            if (this.dom.outputDesc) this.dom.outputDesc.textContent = 'Combine cauldron-crafted liquids to distill new compounds.';

            clickManager.unbindElementHandClick(this.dom.outputSlot);
        }
    }

    updateUIState() {
        if (this.dom.slot0Val) this.dom.slot0Val.textContent = `${this.slot1Uses} Uses`;
        if (this.dom.slot1Val) this.dom.slot1Val.textContent = `${this.slot2Uses} Uses`;

        if (this.dom.ratioText) {
            this.dom.ratioText.textContent = `${this.slot1Uses} : ${this.slot2Uses} Ratio`;
        }

        // Match Recipe
        this.matchedRecipe = this.findMatchingRecipe();

        this.renderOutputSlot();
        this.drawMixerCanvas();

        // Enable / Disable Craft Button
        if (this.dom.craftBtn) {
            if (this.matchedRecipe && !this.outputItem && this.inventory.length >= 2) {
                this.dom.craftBtn.disabled = false;
                this.dom.craftBtn.textContent = `Distill ${this.matchedRecipe.name}`;
            } else {
                this.dom.craftBtn.disabled = true;
                if (this.outputItem) {
                    this.dom.craftBtn.textContent = 'Retrieve Output First';
                } else if (this.inventory.length < 2) {
                    this.dom.craftBtn.textContent = 'Deposit 2 Ingredients';
                } else {
                    this.dom.craftBtn.textContent = 'Invalid Ratio / Mixture';
                }
            }
        }
    }

    findMatchingRecipe() {
        if (!this.inventory || this.inventory.length < 2) return null;

        const item0 = this.inventory[0];
        const item1 = this.inventory[1];
        if (!item0 || !item1) return null;

        const recipes = this.craftingUI.allRecipes || [];
        const alembicRecipes = recipes.filter(r => r.station === 'alembic' || (r.recipe && r.recipe.station === 'alembic'));

        // Search itemData directly for alembic recipes if not present in allRecipes
        const candidates = [];
        Object.entries(itemData).forEach(([itemId, def]) => {
            if (def.recipe && def.recipe.station === 'alembic') {
                candidates.push({
                    id: itemId,
                    name: def.name,
                    result: { itemId: itemId },
                    ingredients: def.recipe.ingredients,
                    time: def.recipe.time || 2000
                });
            }
        });

        const allCandidates = [...alembicRecipes, ...candidates];

        for (const recipe of allCandidates) {
            const ing = recipe.ingredients;
            if (!ing || ing.length !== 2) continue;

            // Check match order 1: item0 = ing[0], item1 = ing[1]
            const match1 = (item0.itemId === ing[0].itemId && (ing[0].usesConsumed || 1) === this.slot1Uses) &&
                           (item1.itemId === ing[1].itemId && (ing[1].usesConsumed || 1) === this.slot2Uses);

            // Check match order 2: item0 = ing[1], item1 = ing[0]
            const match2 = (item0.itemId === ing[1].itemId && (ing[1].usesConsumed || 1) === this.slot1Uses) &&
                           (item1.itemId === ing[0].itemId && (ing[0].usesConsumed || 1) === this.slot2Uses);

            if (match1 || match2) {
                return recipe;
            }
        }

        return null;
    }

    drawMixerCanvas() {
        const canvas = this.dom ? this.dom.canvas : null;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const inventory = this.inventory || [];
        const item0 = inventory[0] || null;
        const item1 = inventory[1] || null;

        const def0 = item0 ? itemData[item0.itemId] || {} : null;
        const def1 = item1 ? itemData[item1.itemId] || {} : null;

        const c0 = item0 && item0.color !== undefined ? item0.color : (def0 && def0.color !== undefined ? def0.color : 0x475569);
        const c1 = item1 && item1.color !== undefined ? item1.color : (def1 && def1.color !== undefined ? def1.color : 0x475569);

        const hex0 = `#${c0.toString(16).padStart(6, '0')}`;
        const hex1 = `#${c1.toString(16).padStart(6, '0')}`;

        // Calculate blended color
        let blendHex = '#3b82f6';
        if (def0 && def1) {
            const r0 = (c0 >> 16) & 0xFF, g0 = (c0 >> 8) & 0xFF, b0 = c0 & 0xFF;
            const r1 = (c1 >> 16) & 0xFF, g1 = (c1 >> 8) & 0xFF, b1 = c1 & 0xFF;

            const totalUses = (this.slot1Uses + this.slot2Uses) || 10;
            const w0 = this.slot1Uses / totalUses;
            const w1 = this.slot2Uses / totalUses;

            const r = Math.round(r0 * w0 + r1 * w1);
            const g = Math.round(g0 * w0 + g1 * w1);
            const b = Math.round(b0 * w0 + b1 * w1);

            blendHex = `rgb(${r}, ${g}, ${b})`;
        } else if (def0) {
            blendHex = hex0;
        } else if (def1) {
            blendHex = hex1;
        }

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Draw Left Tube
        ctx.fillStyle = hex0;
        ctx.beginPath();
        ctx.moveTo(35, 20);
        ctx.lineTo(35, 70);
        ctx.lineTo(cx - 15, cy - 10);
        ctx.lineWidth = 6;
        ctx.strokeStyle = hex0;
        ctx.stroke();

        // Draw Right Tube
        ctx.fillStyle = hex1;
        ctx.beginPath();
        ctx.moveTo(canvas.width - 35, 20);
        ctx.lineTo(canvas.width - 35, 70);
        ctx.lineTo(cx + 15, cy - 10);
        ctx.lineWidth = 6;
        ctx.strokeStyle = hex1;
        ctx.stroke();

        // Draw Central Flask Vessel
        ctx.beginPath();
        ctx.arc(cx, cy + 25, 38, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#38bdf8';
        ctx.stroke();

        // Draw Liquid in Central Flask
        ctx.beginPath();
        ctx.arc(cx, cy + 25, 32, 0, Math.PI * 2);
        ctx.fillStyle = blendHex;
        ctx.fill();

        // Glass Highlight Overlay
        ctx.beginPath();
        ctx.arc(cx - 10, cy + 15, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fill();
    }

    startCrafting() {
        if (!this.matchedRecipe || !this.craftingUI.currentStationId) return;

        if (this.dom.craftBtn) this.dom.craftBtn.disabled = true;
        if (this.dom.progressWrap) this.dom.progressWrap.style.display = 'block';

        const duration = this.matchedRecipe.time || 2000;
        if (this.dom.progressBar) {
            this.dom.progressBar.style.transition = 'none';
            this.dom.progressBar.style.width = '0%';
            void this.dom.progressBar.offsetWidth; // Force reflow
            this.dom.progressBar.style.transition = `width ${duration}ms linear`;
            this.dom.progressBar.style.width = '100%';
        }

        // Emit crafting start to server
        this.socket.emit('craftingStart', {
            stationId: this.craftingUI.currentStationId,
            recipeId: this.matchedRecipe.id
        });
    }

    finishCrafting(data) {
        this.outputItem = data.item || null;
        if (this.dom.progressWrap) this.dom.progressWrap.style.display = 'none';
        if (this.dom.progressBar) {
            this.dom.progressBar.style.transition = 'none';
            this.dom.progressBar.style.width = '0%';
        }
        if (this.craftingUI) {
            this.craftingUI.showFloatingText(data.message || "Distilled!");
        }
        this.updateUIState();
    }

    destroy() {
        this.active = false;
        if (this.dom && this.dom.slot0) clickManager.unbindElementHandClick(this.dom.slot0);
        if (this.dom && this.dom.slot1) clickManager.unbindElementHandClick(this.dom.slot1);
        if (this.dom && this.dom.outputSlot) clickManager.unbindElementHandClick(this.dom.outputSlot);
    }
}
