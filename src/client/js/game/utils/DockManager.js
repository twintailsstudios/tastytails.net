/**
 * DockManager.js
 * Manages vertical stacking towers, side-snapping (Left/Right),
 * and drag-and-drop reordering for all minimized window pills.
 */

export class DockManager {
    static startTopLeft = 160;   // Safely below Health/Stamina/Mana HUD (20px top + ~120px height)
    static startTopRight = 160;  // Top offset for right-side dock tower
    static pillGap = 10;         // Vertical gap between stacked pills
    static registeredPills = new Set();
    static initialized = false;

    /**
     * Registers a minimized pill element with DockManager.
     * @param {HTMLElement|string} pill - DOM element or ID selector
     * @param {'left'|'right'} defaultSide
     */
    static register(pill, defaultSide = 'left') {
        const el = typeof pill === 'string' ? document.getElementById(pill) : pill;
        if (!el) return;

        if (this.registeredPills.has(el)) return;
        this.registeredPills.add(el);

        el.dataset.dockSide = el.dataset.dockSide || defaultSide;
        el.dataset.dockRegistered = 'true';

        this.makePillDraggable(el);

        // Watch for display or style mutations (e.g. display: flex vs display: none)
        const observer = new MutationObserver(() => {
            DockManager.updateLayout();
        });
        observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });

        // Lazy init global resize listener
        if (!this.initialized) {
            this.initialized = true;
            window.addEventListener('resize', () => DockManager.updateLayout());
        }

        DockManager.updateLayout();
    }

    /**
     * Recalculates vertical stacked positions for all currently visible minimized pills.
     */
    static updateLayout() {
        const pillsArray = Array.from(this.registeredPills);

        const visibleLeft = [];
        const visibleRight = [];

        pillsArray.forEach(pill => {
            if (!document.body.contains(pill)) return;
            const style = getComputedStyle(pill);
            const isVisible = pill.offsetWidth > 0 && pill.offsetHeight > 0 && style.display !== 'none' && style.visibility !== 'hidden';

            if (isVisible) {
                const side = pill.dataset.dockSide || 'left';
                if (side === 'left') {
                    visibleLeft.push(pill);
                } else {
                    visibleRight.push(pill);
                }
            }
        });

        // Stack Left Side Pills
        let currentTopLeft = DockManager.startTopLeft;
        visibleLeft.forEach(pill => {
            if (pill.dataset.isDragging === 'true') return; // Don't disrupt actively dragged pill

            const height = pill.offsetHeight || 44;
            pill.style.position = 'fixed';
            pill.style.top = `${currentTopLeft}px`;
            pill.style.left = '20px';
            pill.style.right = 'auto';
            pill.style.bottom = 'auto';
            pill.style.transition = 'top 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), left 0.25s ease, right 0.25s ease';

            currentTopLeft += height + DockManager.pillGap;
        });

        // Stack Right Side Pills
        let currentTopRight = DockManager.startTopRight;
        visibleRight.forEach(pill => {
            if (pill.dataset.isDragging === 'true') return;

            const height = pill.offsetHeight || 44;
            pill.style.position = 'fixed';
            pill.style.top = `${currentTopRight}px`;
            pill.style.right = '20px';
            pill.style.left = 'auto';
            pill.style.bottom = 'auto';
            pill.style.transition = 'top 0.25s cubic-bezier(0.25, 0.8, 0.25, 1), left 0.25s ease, right 0.25s ease';

            currentTopRight += height + DockManager.pillGap;
        });
    }

    /**
     * Makes a pill element draggable up/down and snap-swappable between Left/Right sides.
     * Prevents window restore action if pill was dragged.
     * @param {HTMLElement} pillEl 
     */
    static makePillDraggable(pillEl) {
        let isDragging = false;
        let wasDragged = false;
        let startX = 0;
        let startY = 0;
        let initialTop = 0;

        // Capture phase click listener to suppress window restore after dragging
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

            // Flag as dragged if moved past threshold
            if (dx > 5 || dy > 5) {
                wasDragged = true;
            }

            const rawDy = e.clientY - startY;
            const newTop = Math.max(80, initialTop + rawDy); // Keep below top edge
            pillEl.style.top = `${newTop}px`;

            // Detect Left vs Right side based on cursor X relative to viewport center
            const mouseX = e.clientX;
            const viewportWidth = window.innerWidth;
            const targetSide = mouseX < (viewportWidth / 2) ? 'left' : 'right';

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
        };

        const onMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
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
