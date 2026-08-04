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
    leftEar: { name: 'Ear (L)', friendly: 'SCRATCH LEFT EAR', grabbing: 'LEFT EAR TUG', hostile: 'LEFT EAR TWIST' },
    rightEar: { name: 'Ear (R)', friendly: 'SCRATCH RIGHT EAR', grabbing: 'RIGHT EAR TUG', hostile: 'RIGHT EAR TWIST' },
    eyes: { name: 'Eyes', friendly: 'COVER EYES', grabbing: 'BLINDFOLD HOLD', hostile: 'EYE GOUGE' },
    mouth: { name: 'Snout', friendly: 'BOOP SNOUT', grabbing: 'COVER MOUTH', hostile: 'MOUTH STRIKE' },
    torso: { name: 'Torso', friendly: 'WARM HUG', grabbing: 'WAIST HOLD', hostile: 'CHEST PUNCH' },
    groin: { name: 'Groin', friendly: 'FRIENDLY PAT', grabbing: 'RESTRAINT HOLD', hostile: 'LOW BLOW' },
    leftArm: { name: 'Arm (L)', friendly: 'LINK LEFT ARM', grabbing: 'LEFT ARM GRAB', hostile: 'LEFT ARM STRIKE' },
    rightArm: { name: 'Arm (R)', friendly: 'LINK RIGHT ARM', grabbing: 'RIGHT ARM GRAB', hostile: 'RIGHT ARM STRIKE' },
    leftHand: { name: 'Hand (L)', friendly: 'LEFT HANDSHAKE', grabbing: 'LEFT WRIST GRAB', hostile: 'LEFT HAND CRUSH' },
    rightHand: { name: 'Hand (R)', friendly: 'RIGHT HANDSHAKE', grabbing: 'RIGHT WRIST GRAB', hostile: 'RIGHT HAND CRUSH' },
    leftLeg: { name: 'Leg (L)', friendly: 'LEFT LEG NUDGE', grabbing: 'LEFT LEG TACKLE', hostile: 'LEFT LEG KICK' },
    rightLeg: { name: 'Leg (R)', friendly: 'RIGHT LEG NUDGE', grabbing: 'RIGHT LEG TACKLE', hostile: 'RIGHT LEG KICK' },
    leftFoot: { name: 'Foot (L)', friendly: 'LEFT FOOT TAP', grabbing: 'LEFT ANKLE GRAB', hostile: 'LEFT FOOT STOMP' },
    rightFoot: { name: 'Foot (R)', friendly: 'RIGHT FOOT TAP', grabbing: 'RIGHT ANKLE GRAB', hostile: 'RIGHT FOOT STOMP' },
    tail: { name: 'Tail', friendly: 'PET TAIL', grabbing: 'CATCH TAIL', hostile: 'TAIL YANK' },
    // Legacy fallback keys
    arms: { name: 'Arms', friendly: 'LINK ARMS', grabbing: 'ARM GRAB', hostile: 'ARM STRIKE' },
    hands: { name: 'Hands', friendly: 'HANDSHAKE', grabbing: 'WRIST GRAB', hostile: 'HAND CRUSH' },
    legs: { name: 'Legs', friendly: 'LEG NUDGE', grabbing: 'LEG TACKLE', hostile: 'LEG KICK' },
    feet: { name: 'Feet', friendly: 'FOOT TAP', grabbing: 'ANKLE GRAB', hostile: 'FOOT STOMP' }
};

/** Module-scoped handle for popout lens hide auto-dismissal timer */
let hideTimer = null;

// OPTIMIZATION: Resilient DOM element reference cache to avoid repetitive getElementById lookups
let cachedWidget = null;
let cachedLabel = null;
let cachedLensTitle = null;
let cachedLensHint = null;
let cachedTooltip = null;
let cachedTooltipTitle = null;
let cachedTooltipHint = null;

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
        cachedTooltip = document.getElementById('target-anatomy-tooltip');
        cachedTooltipTitle = document.getElementById('anatomy-tooltip-title');
        cachedTooltipHint = document.getElementById('anatomy-tooltip-hint');
    }
    return Boolean(cachedWidget);
}

/**
 * Updates floating mouse-following parchment tooltip content and position.
 */
function updateTooltip(zoneKey, e) {
    if (!getDOMElements() || !cachedTooltip) return;
    const info = ZONE_PREVIEWS[zoneKey] || ZONE_PREVIEWS.torso;
    let intent = window.currentIntent || 'friendly';
    if (!VALID_INTENTS.includes(intent)) intent = 'friendly';

    const actionPreview = info[intent] || info.friendly;

    if (cachedTooltipTitle) cachedTooltipTitle.innerText = info.name.toUpperCase();
    if (cachedTooltipHint) cachedTooltipHint.innerText = actionPreview;

    if (e && typeof e.clientX === 'number' && typeof e.clientY === 'number') {
        const posX = Math.min(window.innerWidth - 140, Math.max(10, e.clientX + 14));
        const posY = Math.max(10, e.clientY - 45);
        cachedTooltip.style.left = `${posX}px`;
        cachedTooltip.style.top = `${posY}px`;
    }
    cachedTooltip.style.display = 'block';
}

function hideTooltip() {
    if (cachedTooltip) cachedTooltip.style.display = 'none';
}

/**
 * Previews hovered anatomy zone title & hint on popout lens footer without mutating active target selection.
 */
function previewHoverZone(zoneKey) {
    if (!getDOMElements() || !ZONE_PREVIEWS[zoneKey]) return;
    let intent = window.currentIntent || 'friendly';
    if (!VALID_INTENTS.includes(intent)) intent = 'friendly';

    const info = ZONE_PREVIEWS[zoneKey];
    const actionPreview = info[intent] || info.friendly;

    if (cachedLensTitle) cachedLensTitle.innerText = info.name.toUpperCase();
    if (cachedLensHint) cachedLensHint.innerText = actionPreview;
}

/**
 * Restores popout lens footer title & hint to the active target zone.
 */
function restoreActiveZonePreview() {
    if (!getDOMElements()) return;
    const activeZone = window.currentTargetZone || 'torso';
    const info = ZONE_PREVIEWS[activeZone] || ZONE_PREVIEWS.torso;
    let intent = window.currentIntent || 'friendly';
    if (!VALID_INTENTS.includes(intent)) intent = 'friendly';

    const actionPreview = info[intent] || info.friendly;

    if (cachedLensTitle) cachedLensTitle.innerText = info.name.toUpperCase();
    if (cachedLensHint) cachedLensHint.innerText = actionPreview;
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
        hideTooltip();
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
                showLens(); // Keep lens open while hovering
            }
        }
    };

    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'].forEach(evtType => {
        cachedWidget.addEventListener(evtType, suppressPointerEvents, true);
        if (popout) {
            popout.addEventListener(evtType, suppressPointerEvents, true);
        }
    });

    // Container-level Event Delegation for Hover Previews & Parchment Tooltips
    cachedWidget.addEventListener('mouseover', (e) => {
        const node = e.target && typeof e.target.closest === 'function' ? e.target.closest('.target-zone-node') : null;
        if (node) {
            const zone = node.getAttribute('data-zone');
            if (zone) {
                previewHoverZone(zone);
                updateTooltip(zone, e);
            }
        }
    }, true);

    cachedWidget.addEventListener('mousemove', (e) => {
        const node = e.target && typeof e.target.closest === 'function' ? e.target.closest('.target-zone-node') : null;
        if (node) {
            const zone = node.getAttribute('data-zone');
            if (zone) {
                updateTooltip(zone, e);
            }
        } else {
            restoreActiveZonePreview();
            hideTooltip();
        }
    }, true);

    cachedWidget.addEventListener('mouseout', (e) => {
        const relatedNode = e.relatedTarget && typeof e.relatedTarget.closest === 'function' ? e.relatedTarget.closest('.target-zone-node') : null;
        if (!relatedNode) {
            restoreActiveZonePreview();
            hideTooltip();
        }
    }, true);

    // Direct click listeners on SVG zone nodes
    const zoneNodes = cachedWidget.querySelectorAll('.target-zone-node');
    zoneNodes.forEach(node => {
        const zone = node.getAttribute('data-zone');
        ['pointerdown', 'mousedown', 'click'].forEach(evtType => {
            node.addEventListener(evtType, (e) => {
                e.stopPropagation();
                window.isPointerDownOnUI = true;
                if (zone) {
                    setTargetZone(zone);
                    showLens(); // Keep lens open while hovering
                }
            }, true);
        });
    });

    // Hover & Click triggers on mini widget & popout lens
    // NOTE: Popout lens only expands when clicking mini button (#target-dock-mini-btn), not on hover
    if (popout) {
        popout.addEventListener('mouseenter', showLens);
        popout.addEventListener('mouseleave', scheduleHideLens);
    }
    cachedWidget.addEventListener('mouseleave', scheduleHideLens);

    const miniBtn = document.getElementById('target-dock-mini-btn');
    const toggleLens = () => {
        if (popout) {
            if (popout.style.display === 'none' || !popout.style.display) {
                showLens();
            } else {
                hideLens();
            }
        }
    };

    if (miniBtn) {
        ['pointerdown', 'mousedown', 'click'].forEach(evtType => {
            miniBtn.addEventListener(evtType, (e) => {
                e.stopPropagation();
                window.isPointerDownOnUI = true;
                if (evtType === 'click') {
                    toggleLens();
                }
            }, true);
        });
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
                showLens(); // Keep lens open while selecting target nodes
            }
        } else {
            const clickedMini = e.target && typeof e.target.closest === 'function' ? e.target.closest('#target-dock-mini-btn') : null;
            if (clickedMini) {
                toggleLens();
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
 * @param {string} zoneKey - Active anatomical zone key
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

    cachedWidget.removeAttribute('title'); // Ensure native browser title tooltip is cleared

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


