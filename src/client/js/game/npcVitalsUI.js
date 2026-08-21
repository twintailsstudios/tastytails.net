/**
 * @fileoverview npcVitalsUI.js - Floating NPC Vitals & Dietary Ecology Inspector HUD
 * @subsystem NPC AI & Ecology Diagnostics
 * @description
 * Provides a real-time, draggable DOM inspection card for tracking NPC (Animal / Enemy)
 * biological needs (Hydration, Hunger, Thirst/Hunger thresholds, countdown timers, AI states,
 * sensory radii, disposition personality profiles, and dietary classifications).
 * Includes quick developer/player testing triggers to force thirst and hunger states instantly.
 */

class NpcVitalsUI {
    constructor() {
        this.activeTarget = null;
        this.container = null;
        this.isVisible = false;
        this.socket = null;
        this.updateInterval = null;

        // Global setting for overhead vitals HUD
        window.showNpcVitals = true;

        this.init();
    }

    /**
     * Initializes DOM elements and keyboard hotkey bindings.
     */
    init() {
        // Create Floating Inspector Card
        this.container = document.createElement('div');
        this.container.id = 'npc-vitals-inspector';
        this.container.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            width: 320px;
            max-height: calc(100vh - 90px);
            background: linear-gradient(145deg, rgba(20, 24, 33, 0.96), rgba(15, 18, 26, 0.98));
            border: 1px solid rgba(56, 189, 248, 0.4);
            border-radius: 12px;
            box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.75), 0 0 18px rgba(56, 189, 248, 0.2);
            color: #f1f5f9;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 12px;
            z-index: 10001;
            display: none;
            backdrop-filter: blur(10px);
            user-select: none;
            overflow-y: auto;
            overflow-x: hidden;
            transition: opacity 0.2s ease, transform 0.2s ease;
        `;

        this.container.innerHTML = `
            <!-- Header Bar -->
            <div id="npc-vitals-header" style="
                background: linear-gradient(90deg, rgba(14, 116, 144, 0.7), rgba(30, 41, 59, 0.85));
                padding: 10px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                cursor: move;
                border-bottom: 1px solid rgba(56, 189, 248, 0.35);
                position: sticky;
                top: 0;
                z-index: 10;
            ">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 15px;">🌱</span>
                    <span id="npc-vitals-title" style="font-weight: 700; font-size: 13px; color: #38bdf8; letter-spacing: 0.5px; font-family: 'Cinzel', Georgia, serif;">NPC Vitals & Ecology</span>
                </div>
                <button id="npc-vitals-close" style="
                    background: transparent;
                    border: none;
                    color: #94a3b8;
                    font-size: 18px;
                    cursor: pointer;
                    line-height: 1;
                    padding: 2px 6px;
                    border-radius: 4px;
                    transition: color 0.15s, background 0.15s;
                ">&times;</button>
            </div>

            <!-- Body Content -->
            <div style="padding: 12px 14px;">
                <!-- Entity Info & Classification -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                    <span id="npc-vitals-name" style="font-weight: 700; font-size: 14px; color: #f8fafc;">None</span>
                    <span id="npc-vitals-type-badge" style="font-size: 10px; font-weight: 600; color: #94a3b8; background: rgba(255,255,255,0.06); padding: 1px 6px; border-radius: 4px;">NPC</span>
                </div>
                <div id="npc-vitals-id" style="font-size: 10px; color: #64748b; margin-bottom: 10px; word-break: break-all;">ID: -</div>

                <!-- Health Bar -->
                <div style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px;">
                        <span style="color: #f87171; font-weight: 600;">❤️ Health</span>
                        <span id="npc-vitals-hp-text" style="font-weight: 700; color: #f8fafc;">100 / 100</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 7px;
                        background: rgba(15, 23, 42, 0.8);
                        border-radius: 4px;
                        overflow: hidden;
                        border: 1px solid rgba(239, 68, 68, 0.3);
                    ">
                        <div id="npc-vitals-hp-fill" style="
                            width: 100%;
                            height: 100%;
                            background: linear-gradient(90deg, #22c55e, #10b981);
                            border-radius: 3px;
                            transition: width 0.25s ease, background 0.25s ease;
                        "></div>
                    </div>
                </div>

                <!-- Section: Disposition & Behavioral Profile -->
                <div style="
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    padding: 9px 10px;
                    margin-bottom: 10px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #94a3b8; font-weight: 600; font-size: 11px;">Disposition:</span>
                        <span id="npc-vitals-disposition-badge" style="
                            background: rgba(245, 158, 11, 0.2);
                            color: #fbbf24;
                            border: 1px solid rgba(245, 158, 11, 0.4);
                            padding: 2px 8px;
                            border-radius: 6px;
                            font-weight: 700;
                            font-size: 11px;
                            letter-spacing: 0.3px;
                        ">TERRITORIAL</span>
                    </div>
                    <div id="npc-vitals-disposition-desc" style="
                        font-size: 10.5px;
                        color: #cbd5e1;
                        line-height: 1.35;
                        margin-bottom: 5px;
                    ">Guards its territory. Postures and warns players in outer warning radius; attacks if breach radius is violated; leashes back home.</div>
                    <div id="npc-vitals-radii" style="
                        font-size: 9.5px;
                        color: #94a3b8;
                        background: rgba(0,0,0,0.25);
                        padding: 3px 6px;
                        border-radius: 4px;
                        font-family: monospace;
                    ">Warning: 320px | Breach: 140px | Leash: 460px</div>
                </div>

                <!-- Section: Diet & Ecological Foraging -->
                <div style="
                    background: rgba(15, 23, 42, 0.6);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 8px;
                    padding: 9px 10px;
                    margin-bottom: 10px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="color: #94a3b8; font-weight: 600; font-size: 11px;">Diet & Feeding:</span>
                        <span id="npc-vitals-diet-badge" style="
                            background: rgba(52, 211, 153, 0.2);
                            color: #34d399;
                            border: 1px solid rgba(52, 211, 153, 0.4);
                            padding: 2px 8px;
                            border-radius: 6px;
                            font-weight: 700;
                            font-size: 11px;
                            letter-spacing: 0.3px;
                        ">OMNIVORE</span>
                    </div>
                    <div id="npc-vitals-diet-desc" style="
                        font-size: 10.5px;
                        color: #cbd5e1;
                        line-height: 1.35;
                    ">Forages both harvestable flora nodes and meat/prey sources based on shortest distance.</div>
                </div>

                <!-- Section: Live AI State & Goal -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                    <span style="color: #94a3b8; font-weight: 600; font-size: 11px;">Current AI State:</span>
                    <span id="npc-vitals-state" style="
                        background: rgba(56, 189, 248, 0.15);
                        color: #38bdf8;
                        padding: 2px 8px;
                        border-radius: 6px;
                        font-weight: 700;
                        font-size: 11px;
                        border: 1px solid rgba(56, 189, 248, 0.3);
                    ">IDLE</span>
                </div>

                <!-- Hydration Meter -->
                <div style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px;">
                        <span style="color: #38bdf8; font-weight: 600;">💧 Hydration Level</span>
                        <span id="npc-vitals-hyd-text" style="font-weight: 700; color: #f8fafc;">100% (100/100)</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 8px;
                        background: rgba(15, 23, 42, 0.8);
                        border-radius: 4px;
                        overflow: hidden;
                        border: 1px solid rgba(56, 189, 248, 0.25);
                        position: relative;
                    ">
                        <div id="npc-vitals-hyd-fill" style="
                            width: 100%;
                            height: 100%;
                            background: linear-gradient(90deg, #0284c7, #38bdf8);
                            border-radius: 3px;
                            transition: width 0.25s ease, background 0.25s ease;
                        "></div>
                        <!-- Thirst Marker at 40% -->
                        <div style="
                            position: absolute;
                            left: 40%;
                            top: 0;
                            bottom: 0;
                            width: 2px;
                            background: rgba(251, 191, 36, 0.8);
                        " title="Thirst Threshold (40%)"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 3px; font-size: 10px;">
                        <span id="npc-vitals-countdown" style="color: #38bdf8; font-weight: 600;">~120s to thirst</span>
                        <span id="npc-vitals-decay" style="color: #64748b;">-0.5% / sec</span>
                    </div>
                </div>

                <!-- Hunger / Satiety Meter -->
                <div id="npc-vitals-hunger-section" style="margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px;">
                        <span style="color: #10b981; font-weight: 600;">🍗 Hunger / Satiety</span>
                        <span id="npc-vitals-hunger-text" style="font-weight: 700; color: #f8fafc;">100% (100/100)</span>
                    </div>
                    <div style="
                        width: 100%;
                        height: 8px;
                        background: rgba(15, 23, 42, 0.8);
                        border-radius: 4px;
                        overflow: hidden;
                        border: 1px solid rgba(16, 185, 129, 0.25);
                        position: relative;
                    ">
                        <div id="npc-vitals-hunger-fill" style="
                            width: 100%;
                            height: 100%;
                            background: linear-gradient(90deg, #059669, #10b981);
                            border-radius: 3px;
                            transition: width 0.25s ease, background 0.25s ease;
                        "></div>
                        <!-- Hunger Marker at 40% -->
                        <div style="
                            position: absolute;
                            left: 40%;
                            top: 0;
                            bottom: 0;
                            width: 2px;
                            background: rgba(245, 158, 11, 0.8);
                        " title="Hunger Threshold (40%)"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 3px; font-size: 10px;">
                        <span id="npc-vitals-hunger-countdown" style="color: #10b981; font-weight: 600;">~200s to hunger</span>
                        <span id="npc-vitals-hunger-decay" style="color: #64748b;">-0.2% / sec</span>
                    </div>
                </div>

                <!-- Instant Testing & Ecology Debug Controls -->
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 10px;">
                    <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 6px; font-weight: 700;">
                        Ecology & Needs Testing:
                    </div>
                    <!-- Hydration Buttons -->
                    <div style="font-size: 9.5px; color: #38bdf8; font-weight: 600; margin-bottom: 4px;">Hydration Triggers:</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 8px;">
                        <button id="btn-force-thirsty" style="
                            background: rgba(245, 158, 11, 0.15);
                            border: 1px solid rgba(245, 158, 11, 0.4);
                            color: #fbbf24;
                            padding: 5px 2px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 10px;
                            font-weight: 600;
                            transition: background 0.15s;
                        ">⚡ Thirsty (30%)</button>

                        <button id="btn-force-parched" style="
                            background: rgba(239, 68, 68, 0.15);
                            border: 1px solid rgba(239, 68, 68, 0.4);
                            color: #f87171;
                            padding: 5px 2px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 10px;
                            font-weight: 600;
                            transition: background 0.15s;
                        ">🔥 Parched (10%)</button>

                        <button id="btn-force-quench" style="
                            background: rgba(56, 189, 248, 0.15);
                            border: 1px solid rgba(56, 189, 248, 0.4);
                            color: #38bdf8;
                            padding: 5px 2px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 10px;
                            font-weight: 600;
                            transition: background 0.15s;
                        ">✨ Quench (100%)</button>
                    </div>

                    <!-- Hunger Buttons -->
                    <div style="font-size: 9.5px; color: #10b981; font-weight: 600; margin-bottom: 4px;">Hunger Triggers:</div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px;">
                        <button id="btn-force-hungry" style="
                            background: rgba(245, 158, 11, 0.15);
                            border: 1px solid rgba(245, 158, 11, 0.4);
                            color: #fbbf24;
                            padding: 5px 2px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 10px;
                            font-weight: 600;
                            transition: background 0.15s;
                        ">🍗 Hungry (30%)</button>

                        <button id="btn-force-starving" style="
                            background: rgba(239, 68, 68, 0.15);
                            border: 1px solid rgba(239, 68, 68, 0.4);
                            color: #f87171;
                            padding: 5px 2px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 10px;
                            font-weight: 600;
                            transition: background 0.15s;
                        ">💀 Starving (10%)</button>

                        <button id="btn-force-satiate" style="
                            background: rgba(16, 185, 129, 0.15);
                            border: 1px solid rgba(16, 185, 129, 0.4);
                            color: #34d399;
                            padding: 5px 2px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 10px;
                            font-weight: 600;
                            transition: background 0.15s;
                        ">🍖 Satiate (100%)</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.container);

        // Header Dragging
        this._setupDraggable(this.container, document.getElementById('npc-vitals-header'));

        // Close Button
        document.getElementById('npc-vitals-close').onclick = () => this.hide();

        // Hydration Debug Buttons Handlers
        document.getElementById('btn-force-thirsty').onclick = () => this.sendHydrationOverride(30);
        document.getElementById('btn-force-parched').onclick = () => this.sendHydrationOverride(10);
        document.getElementById('btn-force-quench').onclick = () => this.sendHydrationOverride(100);

        // Hunger Debug Buttons Handlers
        document.getElementById('btn-force-hungry').onclick = () => this.sendHungerOverride(30);
        document.getElementById('btn-force-starving').onclick = () => this.sendHungerOverride(10);
        document.getElementById('btn-force-satiate').onclick = () => this.sendHungerOverride(100);

        // Keyboard Shortcut: 'H' toggles overhead HUD & inspector
        window.addEventListener('keydown', (e) => {
            if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }
            if (e.key === 'h' || e.key === 'H') {
                this.toggleOverheadHUD();
            }
        });

        // Add Floating Quick-Toggle Button in top HUD
        this._createHUDToggleButton();

        // Start 250ms UI refresher loop
        this.updateInterval = setInterval(() => this.refreshUI(), 250);
    }

    /**
     * Sets active socket reference.
     * @param {Object} socket 
     */
    setSocket(socket) {
        this.socket = socket;
    }

    /**
     * Inspects a specific entity (Animal or EnemySprite).
     * @param {Object} entity 
     */
    inspect(entity) {
        if (!entity) return;
        this.activeTarget = entity;
        this.show();
        this.refreshUI();
    }

    /**
     * Shows the inspector card.
     */
    show() {
        this.isVisible = true;
        this.container.style.display = 'block';
    }

    /**
     * Hides the inspector card.
     */
    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
        this.activeTarget = null;
    }

    /**
     * Toggles global overhead vitals HUD on/off.
     */
    toggleOverheadHUD() {
        window.showNpcVitals = !window.showNpcVitals;
        const status = window.showNpcVitals ? 'ENABLED' : 'DISABLED';
        console.log(`[VitalsUI] Overhead NPC Vitals HUD: ${status}`);

        // Update toggle button text
        const btn = document.getElementById('npc-vitals-toggle-btn');
        if (btn) {
            btn.style.borderColor = window.showNpcVitals ? '#38bdf8' : '#64748b';
            btn.style.color = window.showNpcVitals ? '#38bdf8' : '#94a3b8';
        }

        // Trigger Phaser scene entities to refresh HUD visibility
        if (window.gameScene) {
            if (window.gameScene.animalsMap) {
                window.gameScene.animalsMap.forEach(a => a.updateHUD && a.updateHUD());
            }
            if (window.gameScene.enemiesMap) {
                window.gameScene.enemiesMap.forEach(e => e.updateHUD && e.updateHUD());
            }
        }
    }

    /**
     * Sends debugSetHydration socket packet to server.
     * @param {number} value 
     */
    sendHydrationOverride(value) {
        if (!this.activeTarget) return;
        const targetId = this.activeTarget.id || (this.activeTarget.properties && this.activeTarget.properties.id) || (this.activeTarget.objectInfo && this.activeTarget.objectInfo.uniqueId);
        if (!targetId) return;

        const socket = this.socket || (window.gameScene && window.gameScene.socket);
        if (socket) {
            socket.emit('debugSetHydration', {
                entityId: targetId,
                hydration: value
            });
        }
    }

    /**
     * Sends debugSetHunger socket packet to server.
     * @param {number} value 
     */
    sendHungerOverride(value) {
        if (!this.activeTarget) return;
        const targetId = this.activeTarget.id || (this.activeTarget.properties && this.activeTarget.properties.id) || (this.activeTarget.objectInfo && this.activeTarget.objectInfo.uniqueId);
        if (!targetId) return;

        const socket = this.socket || (window.gameScene && window.gameScene.socket);
        if (socket) {
            socket.emit('debugSetHunger', {
                entityId: targetId,
                hunger: value
            });
        }
    }

    /**
     * Refreshes active target metrics in the inspector window.
     */
    refreshUI() {
        if (!this.isVisible || !this.activeTarget) return;

        const target = this.activeTarget;
        const isEnemy = !!target.isEnemy;
        const name = target.mobName || target.name || (target.properties && target.properties.name) || target.id || 'Creature';
        const state = target.serverState || target.state || 'IDLE';
        const disposition = (target.disposition || (target.properties && target.properties.disposition) || (isEnemy ? 'aggressive' : 'neutral')).toLowerCase();
        const diet = (target.diet || (target.properties && target.properties.diet) || (isEnemy ? 'none' : 'herbivore')).toLowerCase();

        // 1. Entity Info & Health
        document.getElementById('npc-vitals-name').innerText = name;
        document.getElementById('npc-vitals-id').innerText = `ID: ${target.id || (target.properties && target.properties.id) || '-'}`;
        document.getElementById('npc-vitals-type-badge').innerText = isEnemy ? (target.defId || 'Enemy NPC') : (target.properties && target.properties.species ? `Fauna: ${target.properties.species}` : 'Domestic Fauna');

        const health = typeof target.health === 'number' ? target.health : 100;
        const maxHealth = typeof target.maxHealth === 'number' ? target.maxHealth : 100;
        const hpPercent = Math.max(0, Math.min(100, Math.round((health / (maxHealth || 1)) * 100)));
        document.getElementById('npc-vitals-hp-text').innerText = `${health} / ${maxHealth} (${hpPercent}%)`;
        
        const hpFillEl = document.getElementById('npc-vitals-hp-fill');
        hpFillEl.style.width = `${hpPercent}%`;
        if (target.isEnraged) {
            hpFillEl.style.background = 'linear-gradient(90deg, #b91c1c, #ef4444)';
        } else if (hpPercent < 35) {
            hpFillEl.style.background = 'linear-gradient(90deg, #dc2626, #f87171)';
        } else if (hpPercent < 65) {
            hpFillEl.style.background = 'linear-gradient(90deg, #d97706, #fbbf24)';
        } else {
            hpFillEl.style.background = 'linear-gradient(90deg, #16a34a, #22c55e)';
        }

        // 2. Disposition Profile
        const dispBadge = document.getElementById('npc-vitals-disposition-badge');
        const dispDesc = document.getElementById('npc-vitals-disposition-desc');
        const radiiEl = document.getElementById('npc-vitals-radii');

        switch (disposition) {
            case 'aggressive':
                dispBadge.innerText = '⚔️ AGGRESSIVE';
                dispBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                dispBadge.style.color = '#f87171';
                dispBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                dispDesc.innerText = 'Hostile predator. Aggressively pursues players within range and prioritizes wounded or bleeding targets.';
                radiiEl.innerText = `Aggro: ${target.aggroRadius || 350}px | Deaggro: ${target.deaggroRadius || 500}px`;
                break;
            case 'territorial':
                dispBadge.innerText = '⚠️ TERRITORIAL';
                dispBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                dispBadge.style.color = '#fbbf24';
                dispBadge.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                dispDesc.innerText = 'Guards its territory. Postures and warns players in outer warning radius; attacks if breach radius is violated or warning expires; leashes back home.';
                radiiEl.innerText = `Warning: ${target.warningRadius || 320}px | Breach: ${target.breachRadius || 140}px | Leash: ${target.leashRadius || 460}px`;
                break;
            case 'neutral':
                dispBadge.innerText = '🛡️ NEUTRAL';
                dispBadge.style.background = 'rgba(148, 163, 184, 0.2)';
                dispBadge.style.color = '#cbd5e1';
                dispBadge.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                dispDesc.innerText = 'Peaceful unless provoked. Retaliates on damage and sounds social pack alerts to nearby species allies within 300px.';
                radiiEl.innerText = 'Passive Wander | Social Pack Defense: 300px';
                break;
            case 'runner':
                dispBadge.innerText = '💨 RUNNER';
                dispBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                dispBadge.style.color = '#34d399';
                dispBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                dispDesc.innerText = 'Skittish prey mob. Inverts threat vector and sprints away from players and predators upon proximity.';
                radiiEl.innerText = `Fear Radius: ${target.fearRadius || 200}px | Sprint: 1.4x`;
                break;
            default:
                dispBadge.innerText = disposition.toUpperCase();
                dispBadge.style.background = 'rgba(255, 255, 255, 0.1)';
                dispBadge.style.color = '#f8fafc';
                dispBadge.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                dispDesc.innerText = 'Autonomous entity.';
                radiiEl.innerText = '-';
                break;
        }

        // 3. Diet & Feeding
        const dietBadge = document.getElementById('npc-vitals-diet-badge');
        const dietDesc = document.getElementById('npc-vitals-diet-desc');

        switch (diet) {
            case 'carnivore':
                dietBadge.innerText = '🍖 CARNIVORE';
                dietBadge.style.background = 'rgba(249, 115, 22, 0.2)';
                dietBadge.style.color = '#fb923c';
                dietBadge.style.borderColor = 'rgba(249, 115, 22, 0.4)';
                dietDesc.innerText = 'Hunts domestic animals (sheep, etc.), wild runner mobs (bunnies), and forages dropped raw meat.';
                break;
            case 'herbivore':
                dietBadge.innerText = '🌿 HERBIVORE';
                dietBadge.style.background = 'rgba(52, 211, 153, 0.2)';
                dietBadge.style.color = '#34d399';
                dietBadge.style.borderColor = 'rgba(52, 211, 153, 0.4)';
                dietDesc.innerText = 'Grazes on harvestable flora nodes (orange trees, crop bushes) and consumes dropped produce.';
                break;
            case 'omnivore':
                dietBadge.innerText = '🍲 OMNIVORE';
                dietBadge.style.background = 'rgba(234, 179, 8, 0.2)';
                dietBadge.style.color = '#fde047';
                dietBadge.style.borderColor = 'rgba(234, 179, 8, 0.4)';
                dietDesc.innerText = 'Forages both harvestable flora nodes and meat/prey sources based on shortest distance.';
                break;
            case 'none':
            default:
                dietBadge.innerText = '⚙️ NONE';
                dietBadge.style.background = 'rgba(100, 116, 139, 0.2)';
                dietBadge.style.color = '#94a3b8';
                dietBadge.style.borderColor = 'rgba(100, 116, 139, 0.4)';
                dietDesc.innerText = 'Non-biological / mechanical entity with no dietary appetite.';
                break;
        }

        // 4. State & Activity Readout
        const stateEl = document.getElementById('npc-vitals-state');
        stateEl.innerText = state;
        switch (state) {
            case 'POSTURING':
                stateEl.innerText = '⚠️ POSTURING';
                stateEl.style.background = 'rgba(245, 158, 11, 0.2)';
                stateEl.style.color = '#fbbf24';
                stateEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                break;
            case 'FLEEING':
                stateEl.innerText = '💦 FLEEING';
                stateEl.style.background = 'rgba(56, 189, 248, 0.2)';
                stateEl.style.color = '#38bdf8';
                stateEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
                break;
            case 'SEEK_FOOD':
                stateEl.innerText = target.eatingTargetType === 'meat' || diet === 'carnivore' ? '🍖 HUNTING PREY' : '🌿 SEEKING FLORA';
                stateEl.style.background = 'rgba(234, 179, 8, 0.2)';
                stateEl.style.color = '#fde047';
                stateEl.style.borderColor = 'rgba(234, 179, 8, 0.4)';
                break;
            case 'EATING':
                stateEl.innerText = target.eatingTargetType === 'meat' || diet === 'carnivore' ? '🍖 EATING MEAT' : '🌿 GRAZING';
                stateEl.style.background = 'rgba(52, 211, 153, 0.2)';
                stateEl.style.color = '#34d399';
                stateEl.style.borderColor = 'rgba(52, 211, 153, 0.4)';
                break;
            case 'SEEK_WATER':
                stateEl.innerText = '💧 SEEKING WATER';
                stateEl.style.background = 'rgba(251, 191, 36, 0.2)';
                stateEl.style.color = '#fbbf24';
                stateEl.style.borderColor = 'rgba(251, 191, 36, 0.4)';
                break;
            case 'DRINKING':
                stateEl.innerText = '💧 DRINKING';
                stateEl.style.background = 'rgba(52, 211, 153, 0.2)';
                stateEl.style.color = '#34d399';
                stateEl.style.borderColor = 'rgba(52, 211, 153, 0.4)';
                break;
            case 'RETURN_TO_TERRITORY':
                stateEl.innerText = '🏠 RETURNING HOME';
                stateEl.style.background = 'rgba(148, 163, 184, 0.2)';
                stateEl.style.color = '#cbd5e1';
                stateEl.style.borderColor = 'rgba(148, 163, 184, 0.4)';
                break;
            case 'ORBIT_SPACING':
            case 'WINDUP':
            case 'FLASH':
            case 'ACTIVE':
                stateEl.innerText = '❗ COMBAT';
                stateEl.style.background = 'rgba(239, 68, 68, 0.2)';
                stateEl.style.color = '#f87171';
                stateEl.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                break;
            default:
                stateEl.style.background = 'rgba(56, 189, 248, 0.15)';
                stateEl.style.color = '#38bdf8';
                stateEl.style.borderColor = 'rgba(56, 189, 248, 0.3)';
                break;
        }

        // 5. Hydration Metrics
        const hydration = (typeof target.hydration === 'number') ? target.hydration : 100;
        const maxHyd = target.maxHydration || 100;
        const hydDecay = target.hydrationDecayRate || 0.5;
        const hydThreshold = target.thirstThreshold || 40;

        const hydPercent = Math.max(0, Math.min(100, Math.round((hydration / maxHyd) * 100)));
        document.getElementById('npc-vitals-hyd-text').innerText = `${hydPercent}% (${Math.round(hydration)}/${maxHyd})`;
        const hydFillEl = document.getElementById('npc-vitals-hyd-fill');
        hydFillEl.style.width = `${hydPercent}%`;

        if (hydration <= 15) {
            hydFillEl.style.background = 'linear-gradient(90deg, #dc2626, #f87171)';
        } else if (hydration <= hydThreshold) {
            hydFillEl.style.background = 'linear-gradient(90deg, #d97706, #fbbf24)';
        } else {
            hydFillEl.style.background = 'linear-gradient(90deg, #0284c7, #38bdf8)';
        }

        const hydCountdownEl = document.getElementById('npc-vitals-countdown');
        if (state === 'DRINKING') {
            hydCountdownEl.innerText = '💧 Drinking at water source!';
            hydCountdownEl.style.color = '#34d399';
        } else if (hydration <= hydThreshold) {
            hydCountdownEl.innerText = '🚨 Thirsty Now! Seeking water.';
            hydCountdownEl.style.color = '#fbbf24';
        } else {
            const secToThirst = Math.max(0, Math.round((hydration - hydThreshold) / (hydDecay || 0.5)));
            hydCountdownEl.innerText = `⏳ ~${secToThirst}s to thirst`;
            hydCountdownEl.style.color = '#38bdf8';
        }
        document.getElementById('npc-vitals-decay').innerText = `-${hydDecay.toFixed(1)}% / sec`;

        // 6. Hunger Metrics
        const hungerSection = document.getElementById('npc-vitals-hunger-section');
        const enableHunger = target.enableHunger !== false && diet !== 'none';
        if (enableHunger) {
            hungerSection.style.display = 'block';
            const hunger = (typeof target.hunger === 'number') ? target.hunger : 100;
            const maxHunger = target.maxHunger || 100;
            const hungerDecay = target.hungerDecayRate || 0.2;
            const hungerThreshold = target.hungerThreshold || 40;

            const hungerPercent = Math.max(0, Math.min(100, Math.round((hunger / maxHunger) * 100)));
            document.getElementById('npc-vitals-hunger-text').innerText = `${hungerPercent}% (${Math.round(hunger)}/${maxHunger})`;
            const hungerFillEl = document.getElementById('npc-vitals-hunger-fill');
            hungerFillEl.style.width = `${hungerPercent}%`;

            if (hunger <= 15) {
                hungerFillEl.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
            } else if (hunger <= hungerThreshold) {
                hungerFillEl.style.background = 'linear-gradient(90deg, #d97706, #f59e0b)';
            } else {
                hungerFillEl.style.background = 'linear-gradient(90deg, #059669, #10b981)';
            }

            const hungerCountdownEl = document.getElementById('npc-vitals-hunger-countdown');
            if (state === 'EATING') {
                hungerCountdownEl.innerText = '🍖 Eating / Grazing...';
                hungerCountdownEl.style.color = '#34d399';
            } else if (hunger <= hungerThreshold) {
                hungerCountdownEl.innerText = '🚨 Hungry Now! Seeking Food.';
                hungerCountdownEl.style.color = '#fbbf24';
            } else {
                const secToHunger = Math.max(0, Math.round((hunger - hungerThreshold) / (hungerDecay || 0.2)));
                hungerCountdownEl.innerText = `⏳ ~${secToHunger}s to hunger`;
                hungerCountdownEl.style.color = '#10b981';
            }
            document.getElementById('npc-vitals-hunger-decay').innerText = `-${hungerDecay.toFixed(1)}% / sec`;
        } else {
            hungerSection.style.display = 'none';
        }
    }

    /**
     * Creates a small floating button on the screen to toggle Vitals HUD.
     * @private
     */
    _createHUDToggleButton() {
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'npc-vitals-toggle-btn';
        toggleBtn.title = "Toggle NPC Hydration & Vitals HUD (Hotkey: 'H')";
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: rgba(15, 23, 42, 0.92);
            border: 1px solid #38bdf8;
            color: #38bdf8;
            padding: 8px 14px;
            border-radius: 8px;
            font-family: inherit;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s ease;
        `;
        toggleBtn.innerHTML = `💧 <span>NPC Vitals [H]</span>`;
        toggleBtn.onclick = () => {
            this.toggleOverheadHUD();
            if (this.activeTarget) {
                this.show();
            }
        };
        document.body.appendChild(toggleBtn);
    }

    /**
     * Draggable helper for modal positioning.
     * @private
     */
    _setupDraggable(modal, handle) {
        let isDragging = false;
        let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = modal.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            modal.style.right = 'auto'; // Break CSS right anchor
            modal.style.left = `${initialLeft}px`;
            modal.style.top = `${initialTop}px`;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            modal.style.left = `${Math.max(10, Math.min(window.innerWidth - 330, initialLeft + dx))}px`;
            modal.style.top = `${Math.max(10, Math.min(window.innerHeight - 300, initialTop + dy))}px`;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }
}

// Singleton Instance
window.NpcVitalsUI = new NpcVitalsUI();

