/**
 * @fileoverview medicalUI.js - Client-Side Medical Paper Doll HUD & Sensory Overlay Manager
 * 
 * @description
 * Manages the interactive Medieval Parchment Medical Paper Doll window, sensory screen overlays
 * (eye damage vignette, blood loss darkness), and Socket.IO real-time anatomical updates.
 * Integrates WindowManager & DockManager for dragging, resizing, minimizing, and side-docking.
 * 
 * Triggered by: Socket.IO 'anatomyStatsUpdate' server events, HUD health bar clicks, and EJS remedy buttons.
 */

import { WindowManager } from './utils/WindowManager.js';
import { DockManager } from './utils/DockManager.js';

let currentStats = null;
let selectedLimb = 'torso';
let hoveredLimb = null;
let socketRef = null;
let windowInitialized = false;

// OPTIMIZATION: Module-scoped DOM Element Cache with .isConnected validation to eliminate redundant document.getElementById lookups
const domCache = new Map();

/**
 * Retrieves a cached DOM element by ID, re-querying if the element is missing or detached from the document.
 * @param {string} id - DOM element ID
 * @returns {HTMLElement|null} Valid DOM element reference
 */
function getCachedEl(id) {
    const cached = domCache.get(id);
    if (cached && cached.isConnected) {
        return cached;
    }
    const fresh = document.getElementById(id);
    if (fresh) domCache.set(id, fresh);
    return fresh;
}

// OPTIMIZATION: Per-limb/remedy action cooldown map preventing Socket.IO command flooding on button spam
const remedyCooldowns = new Map();
const REMEDY_COOLDOWN_MS = 200;

// Body Limb SVG Layout Paths (1:1 align with Target Anatomy Lens layout)
const LIMB_PATHS = {
    leftEar: 'M 80 22 L 56 0 C 56 0, 62 18, 72 28 Z',
    rightEar: 'M 100 22 L 124 0 C 124 0, 118 18, 108 28 Z',
    head: 'M 90 18 C 70 18, 70 58, 90 58 C 110 58, 110 18, 90 18 Z',
    eyes: 'M 72 32 C 72 24, 85 24, 90 31 C 95 24, 108 24, 108 32 C 108 40, 95 40, 90 35 C 85 40, 72 40, 72 32 Z',
    mouth: 'M 76 43 C 76 54, 86 58, 90 49 C 94 58, 104 54, 104 43 C 104 54, 94 60, 90 60 C 86 60, 76 54, 76 43 Z',
    torso: 'M 68 64 L 112 64 L 106 132 L 74 132 Z',
    groin: 'M 74 134 L 106 134 L 90 148 Z',
    tail: 'M 104 136 C 114 140, 134 165, 142 172 C 130 160, 112 148, 98 144 Z',
    leftArm: 'M 64 64 L 40 68 L 30 134 L 54 132 L 64 88 Z',
    rightArm: 'M 116 64 L 140 68 L 150 134 L 126 132 L 116 88 Z',
    leftHand: 'M 30 136 L 54 134 L 52 154 L 28 154 Z',
    rightHand: 'M 126 134 L 150 136 L 152 154 L 128 154 Z',
    leftLeg: 'M 74 150 L 86 148 L 78 214 L 62 214 Z',
    rightLeg: 'M 94 148 L 106 150 L 118 214 L 102 214 Z',
    leftFoot: 'M 62 216 L 80 216 L 80 230 L 52 230 Z',
    rightFoot: 'M 100 216 L 118 216 L 128 230 L 100 230 Z'
};

/** Anatomical display order: ears -> head -> eyes -> mouth -> torso -> groin -> tail -> arms -> hands -> legs -> feet */
const LIMB_KEYS = [
    'leftEar', 'rightEar', 'head', 'eyes', 'mouth', 'torso', 'groin', 'tail',
    'leftArm', 'rightArm', 'leftHand', 'rightHand',
    'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot'
];

/** User-facing anatomical zone names */
const LIMB_NAMES = {
    head: 'Head',
    leftEar: 'Ear (L)',
    rightEar: 'Ear (R)',
    eyes: 'Eyes',
    mouth: 'Snout',
    torso: 'Torso',
    groin: 'Groin',
    tail: 'Tail',
    leftArm: 'Arm (L)',
    rightArm: 'Arm (R)',
    leftHand: 'Hand (L)',
    rightHand: 'Hand (R)',
    leftLeg: 'Leg (L)',
    rightLeg: 'Leg (R)',
    leftFoot: 'Foot (L)',
    rightFoot: 'Foot (R)'
};

window.triggerSecondWind = function() {
    if (socketRef) {
        socketRef.emit('triggerSecondWind');
    }
    hideSecondWindWindow();
};

export function showSecondWindWindow() {
    const windowEl = getCachedEl('second-wind-window');
    if (windowEl) {
        windowEl.style.display = 'flex';
        WindowManager.bringToFront(windowEl);
    }
}

export function hideSecondWindWindow() {
    const windowEl = getCachedEl('second-wind-window');
    if (windowEl) windowEl.style.display = 'none';
}

/**
 * Socket listener callback for anatomy updates.
 * @param {Object} data - Server event payload containing anatomical stats
 */
function handleAnatomyStatsUpdate(data) {
    if (data && data.stats) {
        updateMedicalStats(data.stats);
    }
    if (data && data.secondWindReady) {
        showSecondWindWindow();
    } else {
        hideSecondWindWindow();
    }
}

/**
 * Initializes the Medical Paper Doll UI, registers WindowManager drag/resize hooks, and sets up Socket.IO listeners.
 * @param {Object} socket - Active Socket.IO client instance reference
 */
export function initMedicalUI(socket) {
    domCache.clear();
    remedyCooldowns.clear();

    // Clean up existing listener to prevent handler stacking on reconnect
    if (socketRef) {
        socketRef.off('anatomyStatsUpdate', handleAnatomyStatsUpdate);
    }
    socketRef = socket;

    // Listen for anatomy updates from server
    if (socketRef) {
        socketRef.on('anatomyStatsUpdate', handleAnatomyStatsUpdate);
    }

    const windowEl = getCachedEl('medical-window');
    const headerEl = getCachedEl('medical-header');
    const minimizeBtn = getCachedEl('medical-btn-minimize');
    const closeBtn = getCachedEl('medical-btn-close');
    const minimizedTab = getCachedEl('medical-minimized-tab');
    const restoreBtn = getCachedEl('medical-tab-restore');

    // Register Draggable & Resizable Window controls once
    if (windowEl && !windowInitialized) {
        windowInitialized = true;

        if (headerEl) {
            WindowManager.makeDraggable(windowEl, headerEl);
        }

        // Register Second Wind Window with WindowManager
        const secondWindWindow = getCachedEl('second-wind-window');
        const secondWindHeader = getCachedEl('second-wind-header');
        const secondWindClose = getCachedEl('second-wind-btn-close');
        if (secondWindWindow && secondWindHeader) {
            WindowManager.makeDraggable(secondWindWindow, secondWindHeader);
        }
        if (secondWindClose) {
            secondWindClose.onclick = () => hideSecondWindWindow();
        }

        // Attach resize handles
        const handles = {
            t: windowEl.querySelector('.resize-handle.top'),
            l: windowEl.querySelector('.resize-handle.left'),
            r: windowEl.querySelector('.resize-handle.right'),
            b: windowEl.querySelector('.resize-handle.bottom'),
            br: windowEl.querySelector('.resize-handle.br')
        };
        WindowManager.makeResizable(windowEl, handles, { minWidth: 540, minHeight: 460 });

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

        // Attach click listener to health bar container once
        const healthContainer = getCachedEl('health-bar-container') || document.getElementById('health-bar-fill')?.parentElement;
        if (healthContainer) {
            healthContainer.style.pointerEvents = 'auto';
            healthContainer.style.cursor = 'pointer';
            healthContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMedicalModal();
            });
        }
    }

    // Render initial Paper Doll SVG elements
    renderPaperDollSVG();
}

/**
 * Global helper function to handle limb selection from SVG or Pill clicks.
 * @param {string} limbKey - Key of the anatomical limb selected
 */
window.selectMedicalLimb = function(limbKey) {
    if (!LIMB_KEYS.includes(limbKey)) return;
    selectedLimb = limbKey;
    renderMedicalView();
};

window.toggleMedicalModal = toggleMedicalModal;
window.showMedicalModal = showMedicalModal;
window.hideMedicalModal = hideMedicalModal;
window.minimizeMedicalModal = minimizeMedicalModal;
window.triggerRemedy = (remedyType) => {
    sendRemedyAction(remedyType);
};

/**
 * Displays the Medical Paper Doll modal window.
 */
export function showMedicalModal() {
    const windowEl = getCachedEl('medical-window');
    const minimizedTab = getCachedEl('medical-minimized-tab');
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
    const windowEl = getCachedEl('medical-window');
    const minimizedTab = getCachedEl('medical-minimized-tab');
    if (windowEl) windowEl.style.display = 'none';
    if (minimizedTab) minimizedTab.style.display = 'none';
}

/**
 * Minimizes the Medical Paper Doll window into a docked side pill.
 */
export function minimizeMedicalModal() {
    const windowEl = getCachedEl('medical-window');
    const minimizedTab = getCachedEl('medical-minimized-tab');

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
    const windowEl = getCachedEl('medical-window');
    const minimizedTab = getCachedEl('medical-minimized-tab');

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

    // OPTIMIZATION: Only trigger DOM view updates if either modal window or dock pill is visible, preventing layout thrashing while hidden
    const windowEl = getCachedEl('medical-window');
    const minimizedTab = getCachedEl('medical-minimized-tab');
    if ((windowEl && windowEl.style.display !== 'none') || (minimizedTab && minimizedTab.style.display !== 'none')) {
        renderMedicalView();
    }
    updateSensoryOverlays();
}

/**
 * Updates full-screen vignette and sensory blur/darkness overlays.
 */
function updateSensoryOverlays() {
    if (!currentStats) return;

    // 1. Eye Damage Vignette
    const sensory = currentStats.sensory || {};
    const eyeDmg = sensory.eyeDamage || 0;
    const vignette = getCachedEl('eye-damage-vignette');
    if (vignette) {
        const bloodLossRatio = Math.max(0, (3000 - (currentStats.bloodVolume || 5000)) / 3000);
        const vignetteIntensity = Math.min(180, Math.round((eyeDmg * 1.5) + (bloodLossRatio * 140)));
        vignette.style.boxShadow = `inset 0 0 ${vignetteIntensity}px rgba(0, 0, 0, ${Math.min(0.95, vignetteIntensity / 150)})`;
    }
}

/**
 * Renders the Paper Doll SVG element dynamically.
 */
function renderPaperDollSVG() {
    const container = getCachedEl('paper-doll-svg-container');
    if (!container) return;

    let svgHtml = `<svg viewBox="0 0 180 240" class="doll-svg-wrapper" xmlns="http://www.w3.org/2000/svg">`;

    for (const limbKey of LIMB_KEYS) {
        const pathD = LIMB_PATHS[limbKey];
        svgHtml += `
            <path id="doll-node-${limbKey}"
                  class="doll-limb-node node-${limbKey}"
                  d="${pathD}"
                  fill="#3a3026"
                  stroke="#5e4c3a"
                  stroke-width="2"
                  data-limb="${limbKey}" />
        `;
    }
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;

    // Attach click and hover events to nodes
    for (const limbKey of LIMB_KEYS) {
        const nodeEl = getCachedEl(`doll-node-${limbKey}`);
        if (nodeEl) {
            nodeEl.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedLimb = limbKey;
                renderMedicalView();
            });
            nodeEl.addEventListener('mouseenter', () => {
                hoveredLimb = limbKey;
                renderMedicalView();
            });
            nodeEl.addEventListener('mouseleave', () => {
                if (hoveredLimb === limbKey) {
                    hoveredLimb = null;
                    renderMedicalView();
                }
            });
        }
    }
}

/**
 * Helper to retrieve effective HP, parent HP, and localized status for a limb/sub-part node.
 */
function getPartEffectiveData(parts, limbKey, sensory) {
    const parentKey = ['leftEar', 'rightEar', 'eyes', 'mouth'].includes(limbKey) ? 'head'
                    : limbKey === 'groin' ? 'torso'
                    : limbKey;
    const parentPart = parts[parentKey] || { hp: 100, maxHp: 100 };
    const subPart = parts[limbKey] || {};

    const hp = typeof parentPart.hp === 'number' ? parentPart.hp : 100;
    const maxHp = parentPart.maxHp || 100;
    const brute = subPart.brute || 0;
    const burn = subPart.burn || 0;
    const bleeding = subPart.bleeding || 0;
    const fractured = subPart.fractured || false;
    const splinted = subPart.splinted || false;

    let sensoryLevel = 0;
    if (limbKey === 'eyes') sensoryLevel = sensory?.eyeDamage || 0;
    if (limbKey === 'leftEar' || limbKey === 'rightEar') sensoryLevel = sensory?.earDamage || 0;

    return { hp, maxHp, brute, burn, bleeding, fractured, splinted, sensoryLevel, parentKey };
}

/**
 * Determines color coding for limb status.
 */
function getLimbColor(limbKey, parts, sensory) {
    const data = getPartEffectiveData(parts, limbKey, sensory);
    if (data.fractured || data.bleeding > 0) return '#a82c2c'; // Dark Red
    if (data.brute > 20 || data.burn > 20 || data.sensoryLevel > 30) return '#8c382e'; // Orange/Red
    if (data.brute > 0 || data.burn > 0 || data.sensoryLevel > 0) return '#8c772e'; // Yellow/Gold

    const ratio = data.hp / data.maxHp;
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

    // Ensure missing sub-parts default cleanly
    for (const key of LIMB_KEYS) {
        if (!parts[key]) {
            parts[key] = { hp: 100, maxHp: 100, brute: 0, burn: 0, bleeding: 0 };
        }
    }

    // 1. Update SVG Node Colors
    for (const limbKey of LIMB_KEYS) {
        const nodeEl = getCachedEl(`doll-node-${limbKey}`);
        if (nodeEl) {
            const color = getLimbColor(limbKey, parts, currentStats.sensory);
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
    const bloodVolEl = getCachedEl('med-blood-volume');
    const bleedRateEl = getCachedEl('med-bleed-rate');
    const totalHealthEl = getCachedEl('med-total-health');
    const dockHealthEl = getCachedEl('dock-health-text');

    const bloodVal = typeof currentStats.bloodVolume === 'number' ? currentStats.bloodVolume : 5000;
    const hpText = `${Math.round(currentStats.health || 100)} / ${currentStats.maxHealth || 100}`;
    if (bloodVolEl) bloodVolEl.innerText = `${Math.round(bloodVal)} / ${currentStats.maxBloodVolume || 5000} mL`;
    if (bleedRateEl) bleedRateEl.innerText = currentStats.bleedingRate > 0 ? `${currentStats.bleedingRate.toFixed(1)} mL/s (BLEEDING)` : '0 mL/s (None)';
    if (totalHealthEl) totalHealthEl.innerText = hpText;
    if (dockHealthEl) dockHealthEl.innerText = `${Math.round(currentStats.health || 100)} HP`;

    // 3. Render Floating Paper Doll HP Status Pills
    renderPaperDollPills(parts, currentStats.sensory);

    // 4. Render Anatomical Condition & Status Description Panel for selected limb
    renderLimbDetailPanel(selectedLimb, parts, currentStats.sensory);
}

/**
 * Renders floating color-coded HP pills for the 11 main HP pool regions on the paper doll stage.
 */
function renderPaperDollPills(parts, sensory) {
    const pillsContainer = getCachedEl('paper-doll-pills-container');
    if (!pillsContainer) return;

    let html = '';

    /** The 11 primary anatomical HP pools */
    const HP_POOL_KEYS = [
        'head', 'torso', 'leftArm', 'rightArm', 'leftHand', 'rightHand',
        'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot', 'tail'
    ];

    // Relative offset placements for paper doll stage (viewBox 0 0 180 240)
    const PILL_POSITIONS = {
        head: { top: '2%', left: '50%', transform: 'translateX(-50%)' },
        torso: { top: '40%', right: '8%' },
        leftArm: { top: '32%', left: '4%' },
        rightArm: { top: '32%', right: '4%' },
        leftHand: { top: '54%', left: '3%' },
        rightHand: { top: '54%', right: '3%' },
        tail: { top: '64%', right: '4%' },
        leftLeg: { top: '76%', left: '16%' },
        rightLeg: { top: '76%', right: '16%' },
        leftFoot: { top: '91%', left: '12%' },
        rightFoot: { top: '91%', right: '12%' }
    };

    for (const poolKey of HP_POOL_KEYS) {
        const data = getPartEffectiveData(parts, poolKey, sensory);
        const pos = PILL_POSITIONS[poolKey];
        if (!pos) continue;

        // Check if selected or hovered limb belongs to this HP pool cluster
        const isSelected = poolKey === selectedLimb ||
            (poolKey === 'head' && ['leftEar', 'rightEar', 'eyes', 'mouth'].includes(selectedLimb)) ||
            (poolKey === 'torso' && selectedLimb === 'groin');

        const isHovered = poolKey === hoveredLimb ||
            (poolKey === 'head' && ['leftEar', 'rightEar', 'eyes', 'mouth'].includes(hoveredLimb)) ||
            (poolKey === 'torso' && hoveredLimb === 'groin');

        // Check if pool or any of its sub-parts are injured
        let isInjured = false;
        let badgeClass = 'badge-ok';
        let pillText = `${Math.round(data.hp)} HP`;

        if (poolKey === 'head') {
            const eyeDmg = sensory?.eyeDamage || 0;
            const earDmg = sensory?.earDamage || 0;
            const headBrute = (parts.head?.brute || 0) + (parts.eyes?.brute || 0) + (parts.leftEar?.brute || 0) + (parts.rightEar?.brute || 0) + (parts.mouth?.brute || 0);
            const headBurn = (parts.head?.burn || 0) + (parts.eyes?.burn || 0) + (parts.leftEar?.burn || 0) + (parts.rightEar?.burn || 0) + (parts.mouth?.burn || 0);
            const headBleed = (parts.head?.bleeding || 0) + (parts.eyes?.bleeding || 0) + (parts.leftEar?.bleeding || 0) + (parts.rightEar?.bleeding || 0) + (parts.mouth?.bleeding || 0);
            
            isInjured = data.hp < 99.5 || headBrute > 0 || headBurn > 0 || headBleed > 0 || eyeDmg > 0 || earDmg > 0;

            if (headBleed > 0) { badgeClass = 'badge-bad'; pillText = 'BLEED'; }
            else if (eyeDmg > 0) { badgeClass = eyeDmg > 40 ? 'badge-bad' : 'badge-hurt'; pillText = `${eyeDmg}% BLUR`; }
            else if (earDmg > 0) { badgeClass = earDmg > 40 ? 'badge-bad' : 'badge-hurt'; pillText = `${earDmg}% DEAF`; }
            else if (headBurn > 0) { badgeClass = headBurn > 30 ? 'badge-bad' : 'badge-hurt'; pillText = 'BURN'; }
            else if (headBrute > 0) { badgeClass = headBrute > 30 ? 'badge-bad' : 'badge-hurt'; pillText = 'CUT'; }
            else if (data.hp < 40) { badgeClass = 'badge-bad'; pillText = `${Math.round(data.hp)} HP`; }
            else if (data.hp < 80) { badgeClass = 'badge-hurt'; pillText = `${Math.round(data.hp)} HP`; }
        } else if (poolKey === 'torso') {
            const torsoBrute = (parts.torso?.brute || 0) + (parts.groin?.brute || 0);
            const torsoBurn = (parts.torso?.burn || 0) + (parts.groin?.burn || 0);
            const torsoBleed = (parts.torso?.bleeding || 0) + (parts.groin?.bleeding || 0);
            
            isInjured = data.hp < 99.5 || torsoBrute > 0 || torsoBurn > 0 || torsoBleed > 0;

            if (torsoBleed > 0) { badgeClass = 'badge-bad'; pillText = 'BLEED'; }
            else if (torsoBurn > 0) { badgeClass = torsoBurn > 30 ? 'badge-bad' : 'badge-hurt'; pillText = 'BURN'; }
            else if (torsoBrute > 0) { badgeClass = torsoBrute > 30 ? 'badge-bad' : 'badge-hurt'; pillText = 'CUT'; }
            else if (data.hp < 40) { badgeClass = 'badge-bad'; pillText = `${Math.round(data.hp)} HP`; }
            else if (data.hp < 80) { badgeClass = 'badge-hurt'; pillText = `${Math.round(data.hp)} HP`; }
        } else {
            isInjured = data.hp < 99.5 || data.brute > 0 || data.burn > 0 || data.bleeding > 0 || data.fractured;

            if (data.fractured) { badgeClass = 'badge-fractured'; pillText = data.splinted ? 'SPLINT' : 'BROKEN'; }
            else if (data.bleeding > 0) { badgeClass = 'badge-bad'; pillText = 'BLEED'; }
            else if (data.burn > 0) { badgeClass = data.burn > 30 ? 'badge-bad' : 'badge-hurt'; pillText = 'BURN'; }
            else if (data.brute > 0) { badgeClass = data.brute > 30 ? 'badge-bad' : 'badge-hurt'; pillText = 'CUT'; }
            else if (data.hp < 40) { badgeClass = 'badge-bad'; pillText = `${Math.round(data.hp)} HP`; }
            else if (data.hp < 80) { badgeClass = 'badge-hurt'; pillText = `${Math.round(data.hp)} HP`; }
        }

        // OPTION 1 INJURED-ONLY FILTER: Hide pill if limb is completely healthy and not selected/hovered!
        if (!isInjured && !isSelected && !isHovered) {
            continue;
        }

        const styleStr = Object.entries(pos).map(([k, v]) => `${k}:${v}`).join(';');

        html += `
            <div class="doll-hp-pill ${badgeClass} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}"
                 style="${styleStr}"
                 onclick="window.selectMedicalLimb('${poolKey}')"
                 title="${LIMB_NAMES[poolKey] || poolKey}">
                ${pillText}
            </div>
        `;
    }

    pillsContainer.innerHTML = html;
}

/**
 * Renders the detailed Anatomical Condition Description Panel for the selected limb.
 */
function renderLimbDetailPanel(limbKey, parts, sensory) {
    const titleEl = getCachedEl('med-detail-title');
    const badgeEl = getCachedEl('med-detail-badge');
    const bodyEl = getCachedEl('med-detail-body');
    if (!titleEl || !badgeEl || !bodyEl) return;

    const data = getPartEffectiveData(parts, limbKey, sensory);
    const displayName = LIMB_NAMES[limbKey] || limbKey;
    const parentPart = parts[data.parentKey] || { hp: 100, maxHp: 100 };
    const subPart = parts[limbKey] || {};

    const hadSevereWound = Boolean(parentPart.hadSevereWound || subPart.hadSevereWound);

    titleEl.innerText = `SELECTED: ${displayName.toUpperCase()}`;

    // Overall status badge calculation
    if (data.fractured) {
        badgeEl.className = 'detail-badge badge-fractured';
        badgeEl.innerText = data.splinted ? 'SPLINTED' : 'BROKEN BONE';
    } else if (data.bleeding > 0) {
        badgeEl.className = 'detail-badge badge-bad';
        badgeEl.innerText = 'BLEEDING';
    } else if (data.sensoryLevel > 30) {
        badgeEl.className = 'detail-badge badge-bad';
        badgeEl.innerText = limbKey === 'eyes' ? 'SEVERE BLUR' : 'SEVERE DEAF';
    } else if (data.brute > 30 || data.burn > 30) {
        badgeEl.className = 'detail-badge badge-bad';
        badgeEl.innerText = 'SEVERE WOUND';
    } else if (data.brute > 0 || data.burn > 0 || data.sensoryLevel > 0) {
        badgeEl.className = 'detail-badge badge-hurt';
        badgeEl.innerText = 'INJURED';
    } else if (data.hp < 75) {
        badgeEl.className = 'detail-badge badge-hurt';
        badgeEl.innerText = 'DAMAGED';
    } else {
        badgeEl.className = 'detail-badge badge-ok';
        badgeEl.innerText = 'HEALTHY';
    }

    // Build diagnostic rows
    let html = '';

    // 1. Natural Recovery & Soft Cap Status
    if (hadSevereWound) {
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-triangle-exclamation detail-icon" style="color: #ff7a45;"></i>
                <div class="detail-content">
                    <span class="detail-label">Natural Recovery Soft Cap:</span>
                    <span class="diag-warn">75 / 100 HP</span> (Capped due to prior severe trauma - Requires surgical care or full mending to restore 100 HP cap)
                </div>
            </div>
        `;
    } else {
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-heart-pulse detail-icon" style="color: #52c41a;"></i>
                <div class="detail-content">
                    <span class="detail-label">Natural Recovery Soft Cap:</span>
                    <span class="diag-ok">100 / 100 HP</span> (Unrestricted natural regeneration)
                </div>
            </div>
        `;
    }

    // 2. Skeletal & Bone Integrity
    const splintable = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'tail'].includes(limbKey);
    if (splintable) {
        if (subPart.fractured) {
            if (subPart.splinted) {
                const timerText = subPart.mendTimer ? ` (Mending in progress: ${subPart.mendTimer}s remaining)` : '';
                html += `
                    <div class="detail-row">
                        <i class="fa-solid fa-bone detail-icon" style="color: #faad14;"></i>
                        <div class="detail-content">
                            <span class="detail-label">Bone Integrity:</span>
                            <span class="diag-notice">Splinted Fracture</span>${timerText}
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="detail-row">
                        <i class="fa-solid fa-bone detail-icon" style="color: #ff4d4f;"></i>
                        <div class="detail-content">
                            <span class="detail-label">Bone Integrity:</span>
                            <span class="diag-danger">UNSTABILIZED FRACTURE</span> (Heavy movement & action penalties applied)
                        </div>
                    </div>
                `;
            }
        } else {
            html += `
                <div class="detail-row">
                    <i class="fa-solid fa-bone detail-icon" style="color: #52c41a;"></i>
                    <div class="detail-content">
                        <span class="detail-label">Bone Integrity:</span>
                        <span class="diag-ok">Skeletal Structure Intact</span>
                    </div>
                </div>
            `;
        }
    } else {
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-shield detail-icon" style="color: #52c41a;"></i>
                <div class="detail-content">
                    <span class="detail-label">Structural Integrity:</span>
                    <span class="diag-ok">Skeletal Support Normal</span>
                </div>
            </div>
        `;
    }

    // 3. Cut & Laceration Wounds & Bleeding
    const brute = subPart.brute || 0;
    let cutText = '<span class="diag-ok">No Lacerations or Physical Wounds</span>';
    if (brute > 60) cutText = `<span class="diag-danger">Severe Traumatic Tissue Tear</span> (${brute} brute damage)`;
    else if (brute > 35) cutText = `<span class="diag-danger">Deep Open Laceration</span> (${brute} brute damage)`;
    else if (brute > 15) cutText = `<span class="diag-warn">Moderate Cut & Laceration</span> (${brute} brute damage)`;
    else if (brute > 0) cutText = `<span class="diag-notice">Minor Laceration</span> (${brute} brute damage)`;

    let bleedText = '';
    if (subPart.bleeding > 0 || (currentStats.bleedingRate > 0 && brute > 0)) {
        bleedText = ` - <span class="diag-danger">ACTIVE BLEEDING (${(currentStats.bleedingRate || 0).toFixed(1)} mL/s)</span>`;
    }

    html += `
        <div class="detail-row">
            <i class="fa-solid fa-bandage detail-icon" style="color: ${brute > 0 ? '#ff7a45' : '#52c41a'};"></i>
            <div class="detail-content">
                <span class="detail-label">Laceration & Wounds:</span>
                ${cutText}${bleedText}
            </div>
        </div>
    `;

    // 4. Thermal & Burn Trauma
    const burn = subPart.burn || 0;
    let burnText = '<span class="diag-ok">No Thermal Wounds / Burns</span>';
    if (burn > 35) burnText = `<span class="diag-danger">Third-Degree Charring Burn</span> (${burn} burn damage)`;
    else if (burn > 15) burnText = `<span class="diag-warn">Second-Degree Blistering Burn</span> (${burn} burn damage)`;
    else if (burn > 0) burnText = `<span class="diag-notice">First-Degree Scald</span> (${burn} burn damage)`;

    html += `
        <div class="detail-row">
            <i class="fa-solid fa-fire detail-icon" style="color: ${burn > 0 ? '#ff7a45' : '#52c41a'};"></i>
            <div class="detail-content">
                <span class="detail-label">Thermal Trauma:</span>
                ${burnText}
            </div>
        </div>
    `;

    // 5. Sensory & Specialized Conditions
    if (limbKey === 'eyes') {
        const eyeDmg = sensory?.eyeDamage || 0;
        const eyeText = eyeDmg > 0
            ? `<span class="diag-warn">Ocular Impairment: ${eyeDmg}%</span> (Visual blur & darkness vignette active)`
            : `<span class="diag-ok">Ocular Vision Clear</span>`;
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-eye detail-icon" style="color: ${eyeDmg > 0 ? '#ff7a45' : '#52c41a'};"></i>
                <div class="detail-content">
                    <span class="detail-label">Sensory Condition:</span>
                    ${eyeText}
                </div>
            </div>
        `;
    } else if (limbKey === 'leftEar' || limbKey === 'rightEar') {
        const earDmg = sensory?.earDamage || 0;
        const earText = earDmg > 0
            ? `<span class="diag-warn">Auditory Trauma: ${earDmg}%</span> (Aural muffling & tinnitus active)`
            : `<span class="diag-ok">Auditory Perception Normal</span>`;
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-ear-listen detail-icon" style="color: ${earDmg > 0 ? '#ff7a45' : '#52c41a'};"></i>
                <div class="detail-content">
                    <span class="detail-label">Sensory Condition:</span>
                    ${earText}
                </div>
            </div>
        `;
    } else if (limbKey === 'mouth') {
        const mouthText = (brute > 0 || burn > 0)
            ? `<span class="diag-notice">Facial Laceration / Vocal Strain</span>`
            : `<span class="diag-ok">Vocal & Facial Structures Normal</span>`;
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-comment-dots detail-icon" style="color: ${(brute > 0 || burn > 0) ? '#ff7a45' : '#52c41a'};"></i>
                <div class="detail-content">
                    <span class="detail-label">Facial Condition:</span>
                    ${mouthText}
                </div>
            </div>
        `;
    } else if (limbKey === 'groin') {
        const groinText = (brute > 0 || burn > 0)
            ? `<span class="diag-warn">Pelvic Trauma / Stamina Drain Penalty</span>`
            : `<span class="diag-ok">Pelvic Region Normal</span>`;
        html += `
            <div class="detail-row">
                <i class="fa-solid fa-user-shield detail-icon" style="color: ${(brute > 0 || burn > 0) ? '#ff7a45' : '#52c41a'};"></i>
                <div class="detail-content">
                    <span class="detail-label">Pelvic Condition:</span>
                    ${groinText}
                </div>
            </div>
        `;
    }

    // 6. Recommended Treatment & Remedy Guidance Box
    let recHeader = 'Recommended Treatment:';
    let recIcon = 'fa-lightbulb';
    let recText = 'No active remedies required. Limb is fully functional.';
    let recColor = '#52c41a';

    if (data.bleeding > 0) {
        recIcon = 'fa-bandage';
        recText = 'Apply clean Linen Bandage or Gauze to dress wounds and stop active hemorrhage.';
        recColor = '#ff4d4f';
    } else if (data.fractured && !data.splinted) {
        recIcon = 'fa-bone';
        recText = 'Bind with a Bone Splint immediately to stabilize fracture and initiate 10-minute bone mending.';
        recColor = '#ff4d4f';
    } else if (data.burn > 0) {
        recIcon = 'fa-jar';
        recText = 'Apply soothing Sovereign Salve or Ointment to treat thermal burns and restore tissue.';
        recColor = '#ff7a45';
    } else if (data.sensoryLevel > 0) {
        recIcon = 'fa-flask-vial';
        recText = limbKey === 'eyes'
            ? 'Apply Sovereign Salve or Spirit Salts to soothe ocular trauma and clear visual blur.'
            : 'Apply Sovereign Salve or Spirit Salts to soothe auditory trauma and restore hearing.';
        recColor = '#ff7a45';
    } else if (data.brute > 0) {
        recIcon = 'fa-bandage';
        recText = 'Apply Linen Bandage or Salve to dress remaining lacerations and speed HP recovery.';
        recColor = '#faad14';
    } else if (hadSevereWound) {
        recIcon = 'fa-kit-medical';
        recText = 'Prior severe trauma caps natural recovery at 75 HP. Full mending or surgical care required for 100 HP cap.';
        recColor = '#faad14';
    }

    html += `
        <div class="treatment-box">
            <div class="treatment-header" style="color: ${recColor};">
                <i class="fa-solid ${recIcon}"></i> ${recHeader}
            </div>
            <div class="treatment-text">
                ${recText}
            </div>
        </div>
    `;

    bodyEl.innerHTML = html;
}

/**
 * Triggers a remedy application via chat command emit.
 */
export function sendRemedyAction(remedyType) {
    if (!socketRef) return;

    const key = `${remedyType}:${selectedLimb}`;
    const lastUsed = remedyCooldowns.get(key) || 0;
    const now = Date.now();

    if (now - lastUsed < REMEDY_COOLDOWN_MS) {
        return; // Throttled duplicate action
    }
    remedyCooldowns.set(key, now);

    const command = `/remedy ${remedyType} ${selectedLimb}`;
    socketRef.emit('chatMessage', { message: command });
}

