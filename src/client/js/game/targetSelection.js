/**
 * @fileoverview targetSelection.js - Client-Side Anatomical Target Selection Manager
 * 
 * @description
 * Manages the Anatomical Target Selection System (Targeting Paper Doll HUD widget).
 * Tracks the player's active body zone selection (`window.currentTargetZone`),
 * updates mini-dock labels and popout lens hints based on active intent (`friendly`, `grabbing`, `hostile`),
 * toggles active highlighting on SVG body paths, and syncs intent color themes.
 * 
 * Invoked by:
 * - `create()` in src/client/js/game/create.js on game boot
 * - `window.updateIntentUI()` in src/views/partials/gameOverlay.ejs on intent change
 * - DOM click & hover events on #target-doll-widget and .target-zone-node elements
 */

window.currentTargetZone = 'torso';

/** Supported intent modes for theme styling and action hint previews */
const VALID_INTENTS = ['friendly', 'grabbing', 'hostile'];

/**
 * Anatomical zone action preview dictionary mapping zone keys to user-facing labels across intent modes.
 */
const ZONE_PREVIEWS = {
    head: { name: 'Head', friendly: 'HEADPAT / RUFFLE', grabbing: 'SCRUFF GRAB', hostile: 'HEAD STRIKE' },
    torso: { name: 'Torso', friendly: 'WARM HUG', grabbing: 'WAIST HOLD', hostile: 'CHEST PUNCH' },
    groin: { name: 'Groin', friendly: 'FRIENDLY PAT', grabbing: 'RESTRAINT HOLD', hostile: 'LOW BLOW' },
    arms: { name: 'Arms', friendly: 'LINK ARMS', grabbing: 'ARM GRAB', hostile: 'ARM STRIKE' },
    hands: { name: 'Hands', friendly: 'HANDSHAKE', grabbing: 'WRIST GRAB', hostile: 'HAND CRUSH' },
    legs: { name: 'Legs', friendly: 'LEG NUDGE', grabbing: 'LEG TACKLE', hostile: 'LEG KICK' },
    feet: { name: 'Feet', friendly: 'FOOT TAP', grabbing: 'ANKLE GRAB', hostile: 'FOOT STOMP' },
    tail: { name: 'Tail', friendly: 'PET TAIL', grabbing: 'CATCH TAIL', hostile: 'TAIL YANK' }
};

/** Module-scoped handle for popout lens hide auto-dismissal timer */
let hideTimer = null;

// OPTIMIZATION: Resilient DOM element reference cache to avoid repetitive getElementById lookups
let cachedWidget = null;
let cachedLabel = null;
let cachedLensTitle = null;
let cachedLensHint = null;

/**
 * Helper to fetch and cache DOM element references safely.
 * Self-invalidates if the widget container has been detached or re-rendered in the DOM.
 * @returns {boolean} True if elements are valid and available.
 */
function getDOMElements() {
    if (!cachedWidget || !document.body.contains(cachedWidget)) {
        cachedWidget = document.getElementById('target-doll-widget');
        cachedLabel = document.getElementById('target-zone-label');
        cachedLensTitle = document.getElementById('lens-zone-title');
        cachedLensHint = document.getElementById('lens-action-hint');
    }
    return Boolean(cachedWidget);
}

/**
 * Initializes the Target Selection widget SVG nodes & event listeners.
 * Employs container-level event delegation and initialization guards to prevent listener duplication.
 */
export function initTargetSelection() {
    if (!getDOMElements()) return;

    // RATIONALE: Guard against duplicate event listener attachment if scene or UI re-initializes
    if (cachedWidget.dataset.targetSelectionInitialized === 'true') {
        setTargetZone(window.currentTargetZone || 'torso');
        return;
    }
    cachedWidget.dataset.targetSelectionInitialized = 'true';

    const popout = document.getElementById('target-lens-popout');
    const closeBtn = document.getElementById('target-lens-close');

    const showLens = () => {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        if (popout) popout.style.display = 'flex';
    };

    const hideLens = () => {
        if (popout) popout.style.display = 'none';
    };

    const scheduleHideLens = () => {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            hideLens();
        }, 1000);
    };

    // Suppress pointer/mouse/touch events and set UI interaction state to prevent canvas click-to-move navigation
    let uiStateTimer = null;
    const suppressPointerEvents = (e) => {
        e.stopPropagation();
        window.isPointerDownOnUI = true;
        if (uiStateTimer) clearTimeout(uiStateTimer);
        uiStateTimer = setTimeout(() => {
            window.isPointerDownOnUI = false;
        }, 150);

        // Direct zone selection trigger on pointerdown/mousedown for immediate responsive target switching
        const node = e.target && typeof e.target.closest === 'function' ? e.target.closest('.target-zone-node') : null;
        if (node) {
            const zone = node.getAttribute('data-zone');
            if (zone) {
                setTargetZone(zone);
                scheduleHideLens();
            }
        }
    };

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'].forEach(evtType => {
        cachedWidget.addEventListener(evtType, suppressPointerEvents, true);
        if (popout) {
            popout.addEventListener(evtType, suppressPointerEvents, true);
        }
    });

    // Attach direct listeners on all SVG zone nodes for maximum hit-test accuracy
    const zoneNodes = cachedWidget.querySelectorAll('.target-zone-node');
    zoneNodes.forEach(node => {
        ['pointerdown', 'mousedown', 'click'].forEach(evtType => {
            node.addEventListener(evtType, (e) => {
                e.stopPropagation();
                window.isPointerDownOnUI = true;
                const zone = node.getAttribute('data-zone');
                if (zone) {
                    setTargetZone(zone);
                    scheduleHideLens();
                }
            }, true);
        });
    });

    // Hover & Click triggers on mini widget & popout lens
    cachedWidget.addEventListener('mouseenter', showLens);
    cachedWidget.addEventListener('mouseleave', scheduleHideLens);

    if (popout) {
        popout.addEventListener('mouseenter', showLens);
        popout.addEventListener('mouseleave', scheduleHideLens);
    }

    // Hardened Event Delegation: Handles clicks on all present and future .target-zone-node SVG paths and widget elements
    cachedWidget.addEventListener('click', (e) => {
        e.stopPropagation();
        window.isPointerDownOnUI = true;
        const node = e.target && typeof e.target.closest === 'function' ? e.target.closest('.target-zone-node') : null;
        if (node) {
            const zone = node.getAttribute('data-zone');
            if (zone) {
                setTargetZone(zone);
                scheduleHideLens();
            }
        } else {
            // Clicking mini button or non-node background of lens toggles/shows lens
            if (popout && popout.style.display === 'none') {
                showLens();
            }
        }
    }, true);

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideLens();
        });
    }

    setTargetZone(window.currentTargetZone || 'torso');
}

/**
 * Sets the active target body zone, updates text labels, toggles SVG path active state, and updates intent theme styling.
 * @param {string} zoneKey - 'head' | 'torso' | 'groin' | 'arms' | 'hands' | 'legs' | 'feet' | 'tail'
 * @param {string|null} [overrideIntent=null] - Optional intent override ('friendly' | 'grabbing' | 'hostile')
 */
export function setTargetZone(zoneKey, overrideIntent = null) {
    if (!ZONE_PREVIEWS[zoneKey]) zoneKey = 'torso';
    window.currentTargetZone = zoneKey;

    if (!getDOMElements()) return;

    let intent = overrideIntent || window.currentIntent || 'friendly';
    if (!VALID_INTENTS.includes(intent)) intent = 'friendly';

    const info = ZONE_PREVIEWS[zoneKey];
    const actionPreview = info[intent] || info.friendly;

    if (cachedLabel) {
        cachedLabel.innerText = info.name.toUpperCase();
    }

    if (cachedLensTitle) {
        cachedLensTitle.innerText = info.name.toUpperCase();
    }

    if (cachedLensHint) {
        cachedLensHint.innerText = actionPreview;
    }

    cachedWidget.setAttribute('title', `Target Zone: ${info.name} (${actionPreview})`);

    // Dynamically query matching SVG paths to guarantee correctness across fresh SVG node renders
    const nodes = cachedWidget.querySelectorAll('.target-zone-node');
    nodes.forEach(node => {
        const nodeZone = node.getAttribute('data-zone');
        if (nodeZone === zoneKey) {
            node.classList.add('active');
        } else {
            node.classList.remove('active');
        }
    });

    // RATIONALE: Update intent theme classes non-destructively to preserve base styling and custom modifier classes
    VALID_INTENTS.forEach(i => cachedWidget.classList.remove(`intent-${i}`));
    cachedWidget.classList.add(`intent-${intent}`);
}

// Expose on window for global triggers and legacy compatibility
window.setTargetZone = setTargetZone;
window.initTargetSelection = initTargetSelection;


