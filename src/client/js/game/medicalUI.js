/**
 * medicalUI.js
 * 
 * Client-side interface manager for the Medieval Parchment Medical Paper Doll HUD
 * and sensory feedback overlays. Integrates WindowManager & DockManager for drag,
 * resize, minimize, and restore functionality.
 */

import { WindowManager } from './utils/WindowManager.js';
import { DockManager } from './utils/DockManager.js';

let currentStats = null;
let selectedLimb = 'torso';
let socketRef = null;
let windowInitialized = false;

// Body Limb SVG Layout Paths
const LIMB_PATHS = {
    head: 'M 75 25 C 75 10, 105 10, 105 25 C 105 40, 75 40, 75 25 Z',
    torso: 'M 70 45 L 110 45 L 105 130 L 75 130 Z',
    leftArm: 'M 48 48 L 66 48 L 60 115 L 45 115 Z',
    rightArm: 'M 114 48 L 132 48 L 135 115 L 120 115 Z',
    leftHand: 'M 44 118 L 60 118 L 58 138 L 42 138 Z',
    rightHand: 'M 120 118 L 136 118 L 138 138 L 122 138 Z',
    leftLeg: 'M 73 134 L 88 134 L 85 215 L 70 215 Z',
    rightLeg: 'M 92 134 L 107 134 L 110 215 L 95 215 Z',
    leftFoot: 'M 66 218 L 85 218 L 82 235 L 63 235 Z',
    rightFoot: 'M 95 218 L 114 218 L 117 235 L 98 235 Z',
    tail: 'M 105 125 C 145 145, 140 190, 155 220 C 140 210, 125 170, 100 135 Z'
};

/**
 * Initializes the Medical Paper Doll UI and registers socket listeners.
 */
export function initMedicalUI(socket) {
    socketRef = socket;

    // Listen for anatomy updates from server
    if (socketRef) {
        socketRef.on('anatomyStatsUpdate', (data) => {
            if (data && data.stats) {
                updateMedicalStats(data.stats);
            }
        });
    }

    const windowEl = document.getElementById('medical-window');
    const headerEl = document.getElementById('medical-header');
    const minimizeBtn = document.getElementById('medical-btn-minimize');
    const closeBtn = document.getElementById('medical-btn-close');
    const minimizedTab = document.getElementById('medical-minimized-tab');
    const restoreBtn = document.getElementById('medical-tab-restore');

    // Register Draggable & Resizable Window controls once
    if (windowEl && !windowInitialized) {
        windowInitialized = true;

        if (headerEl) {
            WindowManager.makeDraggable(windowEl, headerEl);
        }

        // Attach resize handles
        const handles = {
            t: windowEl.querySelector('.resize-handle.top'),
            l: windowEl.querySelector('.resize-handle.left'),
            r: windowEl.querySelector('.resize-handle.right'),
            b: windowEl.querySelector('.resize-handle.bottom'),
            br: windowEl.querySelector('.resize-handle.br')
        };
        WindowManager.makeResizable(windowEl, handles, { minWidth: 540, minHeight: 340 });

        // Register minimized tab with DockManager and attach click restore handler
        if (minimizedTab) {
            DockManager.register(minimizedTab, 'left');
            minimizedTab.onclick = (e) => {
                if (minimizedTab.dataset.isDragging !== 'true') {
                    showMedicalModal();
                }
            };
        }

        // Window Control Listeners
        if (closeBtn) {
            closeBtn.addEventListener('click', hideMedicalModal);
        }
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', minimizeMedicalModal);
        }
        if (restoreBtn) {
            restoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showMedicalModal();
            });
        }
    }

    // Attach click listener to health bar container
    const healthContainer = document.getElementById('health-bar-container') || document.getElementById('health-bar-fill')?.parentElement;
    if (healthContainer) {
        healthContainer.style.pointerEvents = 'auto';
        healthContainer.style.cursor = 'pointer';
        healthContainer.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMedicalModal();
        });
    }

    // Render initial paper doll SVG paths if container exists
    renderPaperDollSVG();
}

// Expose modal toggles globally on window for inline HTML triggers
window.toggleMedicalModal = toggleMedicalModal;
window.showMedicalModal = showMedicalModal;
window.hideMedicalModal = hideMedicalModal;
window.minimizeMedicalModal = minimizeMedicalModal;

/**
 * Shows/Restores the Medical Paper Doll window.
 */
export function showMedicalModal() {
    const windowEl = document.getElementById('medical-window');
    const minimizedTab = document.getElementById('medical-minimized-tab');

    if (minimizedTab) minimizedTab.style.display = 'none';

    if (windowEl) {
        windowEl.style.display = 'flex';
        WindowManager.bringToFront(windowEl);
        if (!currentStats) {
            updateMedicalStats({ health: 100, maxHealth: 100 });
        } else {
            renderMedicalView();
        }
    }
}

/**
 * Hides the Medical Paper Doll window.
 */
export function hideMedicalModal() {
    const windowEl = document.getElementById('medical-window');
    const minimizedTab = document.getElementById('medical-minimized-tab');
    if (windowEl) windowEl.style.display = 'none';
    if (minimizedTab) minimizedTab.style.display = 'none';
}

/**
 * Minimizes the Medical Paper Doll window into a docked side pill.
 */
export function minimizeMedicalModal() {
    const windowEl = document.getElementById('medical-window');
    const minimizedTab = document.getElementById('medical-minimized-tab');

    if (windowEl) windowEl.style.display = 'none';
    if (minimizedTab) {
        minimizedTab.style.display = 'flex';
        DockManager.updateLayout();
    }
}

/**
 * Toggles the Medical Paper Doll window visibility.
 */
export function toggleMedicalModal() {
    const windowEl = document.getElementById('medical-window');
    const minimizedTab = document.getElementById('medical-minimized-tab');

    const isVisible = (windowEl && windowEl.style.display !== 'none') || (minimizedTab && minimizedTab.style.display !== 'none');
    if (isVisible) {
        hideMedicalModal();
    } else {
        showMedicalModal();
    }
}

/**
 * Updates stats reference and refreshes view & sensory overlays.
 */
export function updateMedicalStats(stats) {
    if (!stats) return;

    if (!stats.bodyParts) {
        stats.bodyParts = {
            head: { hp: 100, maxHp: 100, brute: 0, burn: 0, toxin: 0, suffocation: 0 },
            torso: { hp: 100, maxHp: 100, brute: 0, burn: 0, toxin: 0, suffocation: 0 },
            leftArm: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false },
            rightArm: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false },
            leftHand: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
            rightHand: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
            leftLeg: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, splinted: false },
            rightLeg: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false, splinted: false },
            leftFoot: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
            rightFoot: { hp: 100, maxHp: 100, brute: 0, burn: 0 },
            tail: { hp: 100, maxHp: 100, brute: 0, burn: 0, fractured: false }
        };
    }
    if (typeof stats.bloodVolume !== 'number') stats.bloodVolume = 5000;
    if (typeof stats.maxBloodVolume !== 'number') stats.maxBloodVolume = 5000;
    if (typeof stats.bleedingRate !== 'number') stats.bleedingRate = 0;

    currentStats = stats;
    renderMedicalView();
    updateSensoryOverlays(stats);
}

/**
 * Updates sensory visual overlays (eye damage darkness vignette & pain flash).
 */
function updateSensoryOverlays(stats) {
    const vignette = document.getElementById('eye-damage-vignette');
    if (vignette) {
        const eyeDmg = (stats.sensory && stats.sensory.eyeDamage) || 0;
        const bloodVol = stats.bloodVolume || 5000;
        const maxBlood = stats.maxBloodVolume || 5000;
        const bloodLossRatio = Math.max(0, 1 - (bloodVol / maxBlood));

        const vignetteIntensity = Math.min(180, Math.round((eyeDmg * 1.5) + (bloodLossRatio * 140)));
        vignette.style.boxShadow = `inset 0 0 ${vignetteIntensity}px rgba(0, 0, 0, ${Math.min(0.95, vignetteIntensity / 150)})`;
    }
}

/**
 * Renders the Paper Doll SVG element dynamically.
 */
function renderPaperDollSVG() {
    const container = document.getElementById('paper-doll-svg-container');
    if (!container) return;

    let svgHtml = `<svg viewBox="0 0 180 250" class="doll-svg-wrapper" xmlns="http://www.w3.org/2000/svg">`;

    for (const [limbKey, pathD] of Object.entries(LIMB_PATHS)) {
        svgHtml += `
            <path id="doll-node-${limbKey}"
                  class="doll-limb-node"
                  d="${pathD}"
                  fill="#3a3026"
                  stroke="#5e4c3a"
                  stroke-width="2"
                  data-limb="${limbKey}" />
        `;
    }
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;

    // Attach click events to nodes
    for (const limbKey of Object.keys(LIMB_PATHS)) {
        const nodeEl = document.getElementById(`doll-node-${limbKey}`);
        if (nodeEl) {
            nodeEl.addEventListener('click', () => {
                selectedLimb = limbKey;
                renderMedicalView();
            });
        }
    }
}

/**
 * Determines color coding for limb status.
 */
function getLimbColor(part) {
    if (!part) return '#3a3026';
    if (part.fractured) return '#a82c2c'; // Dark Red
    const ratio = part.hp / (part.maxHp || 100);
    if (ratio > 0.8) return '#2e5934'; // Green
    if (ratio > 0.4) return '#8c772e'; // Yellow/Gold
    return '#8c382e'; // Orange/Red
}

/**
 * Refreshes the Medical UI panel contents.
 */
function renderMedicalView() {
    if (!currentStats || !currentStats.bodyParts) return;

    const parts = currentStats.bodyParts;

    // 1. Update SVG Node Colors
    for (const limbKey of Object.keys(LIMB_PATHS)) {
        const nodeEl = document.getElementById(`doll-node-${limbKey}`);
        if (nodeEl) {
            const part = parts[limbKey];
            const color = getLimbColor(part);
            nodeEl.setAttribute('fill', color);
            if (limbKey === selectedLimb) {
                nodeEl.setAttribute('stroke', '#f0c987');
                nodeEl.setAttribute('stroke-width', '3.5');
            } else {
                nodeEl.setAttribute('stroke', '#5e4c3a');
                nodeEl.setAttribute('stroke-width', '2');
            }
        }
    }

    // 2. Update Overview Summary
    const bloodVolEl = document.getElementById('med-blood-volume');
    const bleedRateEl = document.getElementById('med-bleed-rate');
    const totalHealthEl = document.getElementById('med-total-health');
    const dockHealthEl = document.getElementById('dock-health-text');

    const hpText = `${Math.round(currentStats.health || 100)} / ${currentStats.maxHealth || 100}`;
    if (bloodVolEl) bloodVolEl.innerText = `${Math.round(currentStats.bloodVolume || 5000)} / ${currentStats.maxBloodVolume || 5000} mL`;
    if (bleedRateEl) bleedRateEl.innerText = currentStats.bleedingRate > 0 ? `${currentStats.bleedingRate.toFixed(1)} mL/s (BLEEDING)` : '0 mL/s (None)';
    if (totalHealthEl) totalHealthEl.innerText = hpText;
    if (dockHealthEl) dockHealthEl.innerText = `${Math.round(currentStats.health || 100)} HP`;

    // 3. Render Limb List Items
    const listContainer = document.getElementById('med-limb-list');
    if (listContainer) {
        let listHtml = '';
        for (const [limbKey, part] of Object.entries(parts)) {
            const isSelected = limbKey === selectedLimb;
            let badgeClass = 'badge-ok';
            let badgeText = 'OK';

            if (part.fractured) {
                badgeClass = 'badge-fractured';
                badgeText = part.splinted ? 'SPLINTED' : 'BROKEN';
            } else if (part.hp < 40) {
                badgeClass = 'badge-bad';
                badgeText = `${Math.round(part.hp)} HP`;
            } else if (part.hp < 80) {
                badgeClass = 'badge-hurt';
                badgeText = `${Math.round(part.hp)} HP`;
            } else {
                badgeText = `${Math.round(part.hp)} HP`;
            }

            listHtml += `
                <div class="limb-item ${isSelected ? 'selected' : ''}" onclick="window.selectMedicalLimb('${limbKey}')">
                    <span class="limb-name">${limbKey}</span>
                    <span class="limb-badge ${badgeClass}">${badgeText}</span>
                </div>
            `;
        }
        listContainer.innerHTML = listHtml;
    }

    // Expose select helper on window
    window.selectMedicalLimb = (limbKey) => {
        selectedLimb = limbKey;
        renderMedicalView();
    };
}

/**
 * Triggers a remedy application via chat command emit.
 */
export function sendRemedyAction(remedyType) {
    if (!socketRef) return;
    const command = `/remedy ${remedyType} ${selectedLimb}`;
    socketRef.emit('chatMessage', { message: command });
}

// Expose remedy trigger on window for HTML button onclicks
window.triggerRemedy = (remedyType) => {
    sendRemedyAction(remedyType);
};
