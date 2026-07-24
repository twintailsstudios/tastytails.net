/**
 * targetSelection.js
 * 
 * Client-side manager for the Anatomical Target Selection System (Targeting Paper Doll).
 * Tracks window.currentTargetZone ('torso', 'head', 'arms', 'hands', 'legs', 'feet', 'groin', 'tail')
 * and syncs SVG highlights & intent glow themes.
 */

window.currentTargetZone = 'torso';

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

let hideTimer = null;

/**
 * Initializes the Target Selection widget SVG nodes & listeners.
 */
export function initTargetSelection() {
    const widget = document.getElementById('target-doll-widget');
    const popout = document.getElementById('target-lens-popout');
    const closeBtn = document.getElementById('target-lens-close');

    if (!widget) return;

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

    // Hover & Click triggers on mini widget
    widget.addEventListener('mouseenter', showLens);
    widget.addEventListener('mouseleave', scheduleHideLens);
    widget.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popout && popout.style.display === 'none') {
            showLens();
        }
    });

    if (popout) {
        popout.addEventListener('mouseenter', showLens);
        popout.addEventListener('mouseleave', scheduleHideLens);
        popout.addEventListener('click', (e) => e.stopPropagation());
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            hideLens();
        });
    }

    // Attach click listeners to all target zone nodes
    const nodes = widget.querySelectorAll('.target-zone-node');
    nodes.forEach(node => {
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            const zone = node.getAttribute('data-zone');
            if (zone) {
                setTargetZone(zone);
                // Grace delay before closing
                scheduleHideLens();
            }
        });
    });

    setTargetZone(window.currentTargetZone || 'torso');
}

/**
 * Sets the active target body zone and updates UI indicators.
 * @param {string} zoneKey - 'head' | 'torso' | 'groin' | 'arms' | 'hands' | 'legs' | 'feet' | 'tail'
 */
export function setTargetZone(zoneKey) {
    if (!ZONE_PREVIEWS[zoneKey]) zoneKey = 'torso';
    window.currentTargetZone = zoneKey;

    const widget = document.getElementById('target-doll-widget');
    const label = document.getElementById('target-zone-label');
    const lensTitle = document.getElementById('lens-zone-title');
    const lensHint = document.getElementById('lens-action-hint');

    const intent = window.currentIntent || 'friendly';
    const info = ZONE_PREVIEWS[zoneKey];
    const actionPreview = info[intent] || info.friendly;

    if (label) {
        label.innerText = info.name.toUpperCase();
    }

    if (lensTitle) {
        lensTitle.innerText = info.name.toUpperCase();
    }

    if (lensHint) {
        lensHint.innerText = actionPreview;
    }

    if (widget) {
        widget.setAttribute('title', `Target Zone: ${info.name} (${actionPreview})`);

        // Update active class on matching SVG paths
        const nodes = widget.querySelectorAll('.target-zone-node');
        nodes.forEach(node => {
            const nodeZone = node.getAttribute('data-zone');
            if (nodeZone === zoneKey) {
                node.classList.add('active');
            } else {
                node.classList.remove('active');
            }
        });

        // Theme intent class on container
        widget.className = `target-doll-dock-group intent-${intent}`;
    }
}

// Expose on window for global triggers
window.setTargetZone = setTargetZone;
window.initTargetSelection = initTargetSelection;

