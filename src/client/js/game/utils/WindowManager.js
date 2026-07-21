
/**
 * WindowManager.js
 * Provides generic utilities for making DOM elements draggable and resizable.
 */

export class WindowManager {

    /**
     * Makes a specific element draggable via a handle.
     * @param {HTMLElement} windowEl - The window element to move.
     * @param {HTMLElement} handleEl - The element used as a drag handle (e.g., header).
     */
    static highestZ = 1000;

    /**
     * Brings an element to the front by increasing its z-index.
     * @param {HTMLElement} el 
     */
    static bringToFront(el) {
        if (!el) return;
        WindowManager.highestZ++;
        el.style.zIndex = WindowManager.highestZ;
    }

    /**
     * Makes a specific element draggable via a handle.
     * @param {HTMLElement} windowEl - The window element to move.
     * @param {HTMLElement} handleEl - The element used as a drag handle (e.g., header).
     */
    static makeDraggable(windowEl, handleEl) {
        if (!windowEl || !handleEl) return;

        let isDragging = false;
        let startX, startY, initialX, initialY;

        handleEl.onmousedown = (e) => {
            e.preventDefault();

            // Bring to front on start drag
            WindowManager.bringToFront(windowEl);

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = windowEl.getBoundingClientRect();

            // Ensure absolute positioning
            windowEl.style.position = 'absolute';
            // If transform exists, we might need to reset or account for it. 
            // For simplicity, we assume we drive Top/Left directly.
            windowEl.style.margin = '0';
            windowEl.style.transform = 'none';

            initialX = rect.left;
            initialY = rect.top;

            // Sync style to current computed rect to prevent jumps
            windowEl.style.left = `${initialX}px`;
            windowEl.style.top = `${initialY}px`;

            document.addEventListener('mousemove', dragElement, true);
            document.addEventListener('mouseup', stopDrag, true);
        };

        // Also bring to front on clicking the window body itself
        windowEl.addEventListener('mousedown', () => {
            WindowManager.bringToFront(windowEl);
        });

        const dragElement = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            windowEl.style.left = `${initialX + dx}px`;
            windowEl.style.top = `${initialY + dy}px`;
        };

        const stopDrag = () => {
            isDragging = false;
            document.removeEventListener('mousemove', dragElement, true);
            document.removeEventListener('mouseup', stopDrag, true);
        };
    }

    /**
     * Adds resize capabilities to a window element.
     * @param {HTMLElement} windowEl - The element to resize.
     * @param {Object} handles - Map of handle elements { r, b, br, l, t }.
     * @param {Object} constraints - Optional { minWidth, minHeight }.
     */
    static makeResizable(windowEl, handles, constraints = { minWidth: 200, minHeight: 150 }) {
        if (!windowEl) return;

        // Helper to bind a single handle
        const bindHandle = (handle, dir) => {
            if (!handle) return;

            let isResizing = false;
            let startX, startY, startWidth, startHeight, startLeft, startTop;

            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isResizing = true;

                startX = e.clientX;
                startY = e.clientY;

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

            const doResize = (e) => {
                if (!isResizing) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

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

            const stopResize = () => {
                isResizing = false;
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

function getCursorForDir(dir) {
    if (dir.right && dir.bottom) return 'nwse-resize';
    if (dir.right) return 'ew-resize';
    if (dir.left) return 'ew-resize';
    if (dir.bottom) return 'ns-resize';
    if (dir.top) return 'ns-resize';
    return 'default';
}
