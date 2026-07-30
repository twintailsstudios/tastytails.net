
/**
 * WindowManager.js
 * Provides generic utilities for making DOM elements draggable and resizable.
 */

/**
 * @fileoverview WindowManager.js - Client-Side Desktop Window Management System
 * 
 * @description
 * Stateless utility class that transforms standard DOM elements into interactive,
 * draggable, resizable desktop-style modal windows. Manages depth stacking (z-index focus),
 * DOM reparenting to document.body, and frame-throttled pointer translation.
 * 
 * Invoked by: Crafting, Equipment, Medical UI, Predator Controls, and Prey Struggle windows.
 */

// Track windows that already have body click handlers attached to prevent duplicate listeners
const boundWindows = new WeakSet();

export class WindowManager {

    /** @type {number} Global monotonically increasing z-index counter for depth stacking */
    static highestZ = 1000;

    /** @type {number} Maximum ceiling for window z-indexes to prevent obscuring fixed top overlays */
    static MAX_Z_INDEX = 9000;

    /**
     * Elevates a window element above all other managed windows by updating its z-index.
     * 
     * @param {HTMLElement} el - The window container element to bring to the front layer.
     */
    static bringToFront(el) {
        if (!el) return;
        // OPTIMIZATION: Clamp z-index to MAX_Z_INDEX to avoid overlapping top-level toasts or tooltips
        WindowManager.highestZ = Math.min(WindowManager.highestZ + 1, WindowManager.MAX_Z_INDEX);
        el.style.zIndex = WindowManager.highestZ;
    }

    /**
     * Binds pointer drag capabilities to a window element using a handle element (e.g. header bar).
     * 
     * @param {HTMLElement} windowEl - The main window container element to translate.
     * @param {HTMLElement} handleEl - The header element that acts as the pointer drag handle.
     */
    static makeDraggable(windowEl, handleEl) {
        if (!windowEl || !handleEl) return;

        let isDragging = false;
        let startX, startY, initialX, initialY;
        let rafId = null;
        let latestX = 0, latestY = 0;

        handleEl.onmousedown = (e) => {
            // RATIONALE: Ignore drag initiation when clicking interactive controls or buttons inside header
            if (
                e.target.closest('button, input, select, textarea, a, .no-drag, [data-no-drag]') ||
                e.target.closest('.window-action-btn') ||
                e.target.closest('.vore-window-btn') ||
                e.target.closest('.minimize-btn') ||
                e.target.closest('.close-btn') ||
                e.target.closest('.window-controls') ||
                e.target.closest('.vore-window-controls')
            ) {
                return;
            }

            e.preventDefault();

            // Bring window to front layer on initial click
            WindowManager.bringToFront(windowEl);

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            latestX = startX;
            latestY = startY;

            const rect = windowEl.getBoundingClientRect();

            // RATIONALE: Reparent to document.body to strip container CSS positioning offsets & transforms
            if (windowEl.parentElement !== document.body) {
                document.body.appendChild(windowEl);
            }

            // Ensure absolute positioning mode
            windowEl.dataset.hasBeenDragged = 'true';
            windowEl.style.position = 'absolute';
            windowEl.style.bottom = 'auto';
            windowEl.style.margin = '0';
            windowEl.style.transform = 'none';

            initialX = rect.left;
            initialY = rect.top;

            // Sync computed positioning to prevent visual shifts
            windowEl.style.left = `${initialX}px`;
            windowEl.style.top = `${initialY}px`;

            // OPTIMIZATION: Attach global capture listeners to guarantee pointer capture during rapid moves
            document.addEventListener('mousemove', dragElement, true);
            document.addEventListener('mouseup', stopDrag, true);
        };

        // OPTIMIZATION: WeakSet deduplication ensures we don't attach multiple mousedown handlers on re-render
        if (!boundWindows.has(windowEl)) {
            boundWindows.add(windowEl);
            windowEl.addEventListener('mousedown', () => {
                WindowManager.bringToFront(windowEl);
            });
        }

        /**
         * Translates window position based on drag deltas.
         * @param {number} x - Current client X coordinate
         * @param {number} y - Current client Y coordinate
         */
        const applyDragPosition = (x, y) => {
            const dx = x - startX;
            const dy = y - startY;
            windowEl.style.left = `${initialX + dx}px`;
            windowEl.style.top = `${initialY + dy}px`;
        };

        /**
         * Global mousemove event handler with requestAnimationFrame throttling.
         * @param {MouseEvent} e - Mouse move event object
         */
        const dragElement = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            // OPTIMIZATION: Synchronously record latest pointer coordinates before frame scheduling
            latestX = e.clientX;
            latestY = e.clientY;

            // OPTIMIZATION: Batch DOM updates to screen refresh frames via requestAnimationFrame
            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    rafId = null;
                    if (isDragging) {
                        applyDragPosition(latestX, latestY);
                    }
                });
            }
        };

        /**
         * Cleans up drag listeners and cancels pending animation frame requests.
         */
        const stopDrag = () => {
            isDragging = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                // OPTIMIZATION: Flush final position immediately on mouseup to eliminate snap-back visual artifacts
                applyDragPosition(latestX, latestY);
            }
            document.removeEventListener('mousemove', dragElement, true);
            document.removeEventListener('mouseup', stopDrag, true);
        };
    }

    /**
     * Unbinds the drag handle listener from a window header handle element.
     * 
     * @param {HTMLElement} windowEl - The main window container element.
     * @param {HTMLElement} handleEl - The drag handle element to unbind.
     */
    static unbind(windowEl, handleEl) {
        if (handleEl) {
            handleEl.onmousedown = null;
        }
    }

    /**
     * Binds multi-directional resizers to a window container using edge/corner handles.
     * 
     * @param {HTMLElement} windowEl - The element to resize.
     * @param {Object} handles - Handle elements map { r, b, br, l, t }.
     * @param {Object} [constraints={ minWidth: 200, minHeight: 150 }] - Dimension boundaries.
     */
    static makeResizable(windowEl, handles, constraints = { minWidth: 200, minHeight: 150 }) {
        if (!windowEl) return;

        /**
         * Binds mouse listener to a single directional handle.
         * @param {HTMLElement} handle - Handle element
         * @param {Object} dir - Direction flags { right, bottom, left, top }
         */
        const bindHandle = (handle, dir) => {
            if (!handle) return;

            let isResizing = false;
            let startX, startY, startWidth, startHeight, startLeft, startTop;
            let rafId = null;
            let latestX = 0, latestY = 0;

            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isResizing = true;

                startX = e.clientX;
                startY = e.clientY;
                latestX = startX;
                latestY = startY;

                const rect = windowEl.getBoundingClientRect();
                startWidth = rect.width;
                startHeight = rect.height;
                startLeft = rect.left;
                startTop = rect.top;

                // Ensure absolute positioning mode
                windowEl.style.position = 'absolute';
                windowEl.style.left = `${startLeft}px`;
                windowEl.style.top = `${startTop}px`;
                windowEl.style.margin = '0';
                windowEl.style.transform = 'none';

                document.addEventListener('mousemove', doResize, true);
                document.addEventListener('mouseup', stopResize, true);
                document.body.style.cursor = getCursorForDir(dir);
            });

            /**
             * Calculates and updates window dimensions based on pointer offset.
             * @param {number} x - Current client X coordinate
             * @param {number} y - Current client Y coordinate
             */
            const applyResizeDimensions = (x, y) => {
                const dx = x - startX;
                const dy = y - startY;

                if (dir.right) {
                    const newWidth = Math.max(constraints.minWidth, startWidth + dx);
                    windowEl.style.width = `${newWidth}px`;
                }
                if (dir.bottom) {
                    const newHeight = Math.max(constraints.minHeight, startHeight + dy);
                    windowEl.style.height = `${newHeight}px`;
                }
                if (dir.left) {
                    const newWidth = Math.max(constraints.minWidth, startWidth - dx);
                    if (newWidth !== startWidth) {
                        windowEl.style.width = `${newWidth}px`;
                        windowEl.style.left = `${startLeft + (startWidth - newWidth)}px`;
                    }
                }
                if (dir.top) {
                    const newHeight = Math.max(constraints.minHeight, startHeight - dy);
                    if (newHeight !== startHeight) {
                        windowEl.style.height = `${newHeight}px`;
                        windowEl.style.top = `${startTop + (startHeight - newHeight)}px`;
                    }
                }
            };

            /**
             * Mousemove handler for resizing with requestAnimationFrame batching.
             * @param {MouseEvent} e - Mouse move event object
             */
            const doResize = (e) => {
                if (!isResizing) return;
                latestX = e.clientX;
                latestY = e.clientY;

                if (!rafId) {
                    rafId = requestAnimationFrame(() => {
                        rafId = null;
                        if (isResizing) {
                            applyResizeDimensions(latestX, latestY);
                        }
                    });
                }
            };

            /**
             * Cleans up resize listeners and cancels pending frame requests.
             */
            const stopResize = () => {
                isResizing = false;
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                    // OPTIMIZATION: Flush final dimensions immediately on release
                    applyResizeDimensions(latestX, latestY);
                }
                document.removeEventListener('mousemove', doResize, true);
                document.removeEventListener('mouseup', stopResize, true);
                document.body.style.cursor = '';
            };
        };

        if (handles.r) bindHandle(handles.r, { right: true });
        if (handles.b) bindHandle(handles.b, { bottom: true });
        if (handles.br) bindHandle(handles.br, { right: true, bottom: true });
        if (handles.l) bindHandle(handles.l, { left: true });
        if (handles.t) bindHandle(handles.t, { top: true });
    }
}

/**
 * Helper function to determine the appropriate CSS cursor for a resize direction.
 * @param {Object} dir - Direction flags { right, bottom, left, top }
 * @returns {string} CSS cursor property string
 */
function getCursorForDir(dir) {
    if (dir.right && dir.bottom) return 'nwse-resize';
    if (dir.right) return 'ew-resize';
    if (dir.left) return 'ew-resize';
    if (dir.bottom) return 'ns-resize';
    if (dir.top) return 'ns-resize';
    return 'default';
}

if (typeof window !== 'undefined') {
    window.WindowManager = WindowManager;
}



