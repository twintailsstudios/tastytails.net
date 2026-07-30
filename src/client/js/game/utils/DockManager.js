/**
 * @fileoverview DockManager.js - Client-Side Dock Layout & Drag Manager
 * 
 * @description
 * Manages vertical stacking towers (Left & Right edges), mouse-based side-snapping,
 * real-time drag-and-drop tower reordering, and auto-layout adjustments for all
 * minimized window pills across the TastyTails user interface.
 * 
 * Invoked by: Window minimization events in crafting.js, equipment.js, medicalUI.js, ui.js,
 * DOM mutation observers, window resize listeners, and user mouse drag interactions.
 */

export class DockManager {
    /** @type {number} Top px offset for left-side dock tower (safely below HUD) */
    static startTopLeft = 160;

    /** @type {number} Top px offset for right-side dock tower */
    static startTopRight = 160;

    /** @type {number} Vertical spacing (px) between stacked pills */
    static pillGap = 10;

    /** @type {Set<HTMLElement>} Registry of all registered window pill DOM elements */
    static registeredPills = new Set();

    /** @type {WeakMap<HTMLElement, MutationObserver>} Map tracking DOM mutation observers per pill */
    static observerMap = new WeakMap();

    /** @type {boolean} Flag indicating whether global resize listener has been attached */
    static initialized = false;

    /** @type {number|null} Animation frame handle for window resize debouncing */
    static resizeRaf = null;

    /**
     * Registers a minimized pill element with DockManager.
     * @param {HTMLElement|string} pill - DOM element or string ID selector
     * @param {'left'|'right'} [defaultSide='left'] - Initial dock tower side
     * @returns {void}
     */
    static register(pill, defaultSide = 'left') {
        const el = typeof pill === 'string' ? document.getElementById(pill) : pill;
        if (!el) return;

        if (this.registeredPills.has(el)) return;
        this.registeredPills.add(el);

        el.dataset.dockSide = el.dataset.dockSide || defaultSide;
        el.dataset.dockRegistered = 'true';

        this.makePillDraggable(el);

        // OPTIMIZATION: Attach MutationObserver to auto-update stack layout when pill visibility/style changes
        const observer = new MutationObserver(() => {
            DockManager.updateLayout();
        });
        observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
        this.observerMap.set(el, observer);

        // OPTIMIZATION: Debounce global window resize listener with requestAnimationFrame
        if (!this.initialized) {
            this.initialized = true;
            window.addEventListener('resize', () => {
                if (DockManager.resizeRaf) return;
                DockManager.resizeRaf = requestAnimationFrame(() => {
                    DockManager.resizeRaf = null;
                    DockManager.updateLayout();
                });
            });
        }

        DockManager.updateLayout();
    }

    /**
     * Unregisters a minimized pill element and disconnects its MutationObserver.
     * @param {HTMLElement|string} pill - DOM element or string ID selector
     * @returns {void}
     */
    static unregister(pill) {
        const el = typeof pill === 'string' ? document.getElementById(pill) : pill;
        if (!el) return;

        if (this.registeredPills.has(el)) {
            this.registeredPills.delete(el);
        }

        // OPTIMIZATION: Disconnect and delete MutationObserver to prevent DOM memory leaks
        if (this.observerMap.has(el)) {
            this.observerMap.get(el).disconnect();
            this.observerMap.delete(el);
        }

        DockManager.updateLayout();
    }

    /**
     * Recalculates vertical stacked positions for all currently visible minimized pills.
     * @returns {void}
     */
    static updateLayout() {
        const pillsArray = Array.from(this.registeredPills);

        // OPTIMIZATION: Step 1 - Batch Reads (Single synchronous measurement pass to prevent forced reflow layout thrashing)
        const measurements = pillsArray.map(pill => {
            if (!document.body.contains(pill)) return null;
            const style = getComputedStyle(pill);
            const isVisible = pill.offsetWidth > 0 && pill.offsetHeight > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            return {
                el: pill,
                isVisible,
                height: pill.offsetHeight || 44,
                side: pill.dataset.dockSide || 'left',
                isDragging: pill.dataset.isDragging === 'true'
            };
        }).filter(Boolean);

        // OPTIMIZATION: Step 2 - Batch Writes (Single synchronous style update pass)
        let currentTopLeft = DockManager.startTopLeft;
        let currentTopRight = DockManager.startTopRight;

        measurements.forEach(item => {
            if (!item.isVisible || item.isDragging) return;
            const pill = item.el;
            pill.style.position = 'fixed';
            pill.style.bottom = 'auto';
            pill.style.transition = 'top 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), left 0.25s ease, right 0.25s ease';

            if (item.side === 'left') {
                pill.style.top = `${currentTopLeft}px`;
                pill.style.left = '20px';
                pill.style.right = 'auto';
                currentTopLeft += item.height + DockManager.pillGap;
            } else {
                pill.style.top = `${currentTopRight}px`;
                pill.style.right = '20px';
                pill.style.left = 'auto';
                currentTopRight += item.height + DockManager.pillGap;
            }
        });
    }

    /**
     * Makes a pill element draggable up/down and snap-swappable between Left/Right sides.
     * Suppresses window restore click event if pill was dragged past 5px threshold.
     * @param {HTMLElement} pillEl - DOM element for the minimized pill
     * @returns {void}
     */
    static makePillDraggable(pillEl) {
        let isDragging = false;
        let wasDragged = false;
        let startX = 0;
        let startY = 0;
        let initialTop = 0;
        let mouseMoveRaf = null;

        // OPTIMIZATION: Capture phase click listener cancels window restore if pill was dragged
        pillEl.addEventListener('click', (e) => {
            if (wasDragged) {
                e.stopImmediatePropagation();
                e.preventDefault();
                wasDragged = false;
            }
        }, true);

        const onMouseDown = (e) => {
            // Do not start drag if user clicked the restore button '☐'
            if (e.target.closest('.restore-btn')) return;

            e.preventDefault();
            e.stopPropagation();

            isDragging = true;
            wasDragged = false;
            startX = e.clientX;
            startY = e.clientY;
            initialTop = pillEl.getBoundingClientRect().top;
            pillEl.dataset.isDragging = 'true';
            pillEl.style.transition = 'none';
            pillEl.style.zIndex = '10010';

            document.addEventListener('mousemove', onMouseMove, true);
            document.addEventListener('mouseup', onMouseUp, true);
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);

            // Flag as dragged synchronously if moved past threshold
            if (dx > 5 || dy > 5) {
                wasDragged = true;
            }

            const clientX = e.clientX;
            const clientY = e.clientY;

            // OPTIMIZATION: Throttle drag mousemove updates via requestAnimationFrame
            if (mouseMoveRaf) return;
            mouseMoveRaf = requestAnimationFrame(() => {
                mouseMoveRaf = null;
                if (!isDragging) return;

                const rawDy = clientY - startY;
                const newTop = Math.max(80, initialTop + rawDy); // Keep below top viewport edge
                pillEl.style.top = `${newTop}px`;

                // Detect Left vs Right side based on cursor X relative to viewport center
                const viewportWidth = window.innerWidth;
                const targetSide = clientX < (viewportWidth / 2) ? 'left' : 'right';

                if (pillEl.dataset.dockSide !== targetSide) {
                    pillEl.dataset.dockSide = targetSide;
                    if (targetSide === 'left') {
                        pillEl.style.left = '20px';
                        pillEl.style.right = 'auto';
                    } else {
                        pillEl.style.right = '20px';
                        pillEl.style.left = 'auto';
                    }
                }

                // Real-time reordering in tower stack
                DockManager.reorderInTower(pillEl, newTop, targetSide);
            });
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;

            // OPTIMIZATION: Cancel pending rAF to prevent post-drag style overwrites
            if (mouseMoveRaf) {
                cancelAnimationFrame(mouseMoveRaf);
                mouseMoveRaf = null;
            }

            delete pillEl.dataset.isDragging;
            pillEl.style.zIndex = '';

            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('mouseup', onMouseUp, true);

            // Snap cleanly to nearest tower slot
            DockManager.updateLayout();
        };

        pillEl.addEventListener('mousedown', onMouseDown);
    }

    /**
     * Swaps pill position in registered array based on vertical drag position.
     * @param {HTMLElement} draggedPill - Active dragged pill element
     * @param {number} currentTop - Current top px position of dragged pill
     * @param {'left'|'right'} side - Active dock side tower
     * @returns {void}
     */
    static reorderInTower(draggedPill, currentTop, side) {
        const pillsArray = Array.from(this.registeredPills);
        const siblings = pillsArray.filter(p => {
            if (p === draggedPill || !document.body.contains(p)) return false;
            const style = getComputedStyle(p);
            return p.offsetWidth > 0 && style.display !== 'none' && (p.dataset.dockSide || 'left') === side;
        });

        for (let sibling of siblings) {
            const rect = sibling.getBoundingClientRect();
            const siblingMiddle = rect.top + (rect.height / 2);

            const draggedIndex = pillsArray.indexOf(draggedPill);
            const siblingIndex = pillsArray.indexOf(sibling);

            if (currentTop < siblingMiddle && draggedIndex > siblingIndex) {
                // Swap places in array
                pillsArray.splice(draggedIndex, 1);
                pillsArray.splice(siblingIndex, 0, draggedPill);
                this.registeredPills = new Set(pillsArray);
                DockManager.updateLayout();
                break;
            } else if (currentTop > siblingMiddle && draggedIndex < siblingIndex) {
                pillsArray.splice(draggedIndex, 1);
                pillsArray.splice(siblingIndex, 0, draggedPill);
                this.registeredPills = new Set(pillsArray);
                DockManager.updateLayout();
                break;
            }
        }
    }
}

window.DockManager = DockManager;

if (typeof document !== 'undefined') {
    const autoRegisterPills = () => {
        const apparelPill = document.getElementById('apparel-minimized-tab');
        const craftingPill = document.getElementById('crafting-minimized-tab');
        if (apparelPill) DockManager.register(apparelPill, 'left');
        if (craftingPill) DockManager.register(craftingPill, 'left');
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoRegisterPills);
    } else {
        setTimeout(autoRegisterPills, 50);
    }
}
