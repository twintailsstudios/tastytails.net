/**
 * clickManager.js
 * Centralized utility for handling mouse click interactions across all client UI components.
 * Standardizes: Left Click (Button 0) = Left Hand ('left') | Right Click (Button 2) = Right Hand ('right')
 */

export const clickManager = {
    /**
     * Determines target hand from a DOM MouseEvent or Phaser Pointer object.
     * @param {MouseEvent|Pointer} event 
     * @returns {'left'|'right'}
     */
    getHandFromEvent: function (event) {
        if (!event) return 'left';

        // Phaser Pointer object
        if (typeof event.rightButtonDown === 'function') {
            return event.rightButtonDown() ? 'right' : 'left';
        }

        // DOM MouseEvent
        const button = (event.button !== undefined) ? event.button : (event.which ? event.which - 1 : 0);
        return button === 2 ? 'right' : 'left';
    },

    /**
     * Binds unified left-click and right-click event listeners to an HTML element.
     * Suppresses default browser context menu.
     * 
     * @param {HTMLElement} element - The target DOM element
     * @param {Object} options
     * @param {Function} options.onHandClick - Callback receiving (hand, event)
     * @param {Function} [options.onLeftClick] - Optional specific left click callback (event)
     * @param {Function} [options.onRightClick] - Optional specific right click callback (event)
     * @param {Function} [options.onDoubleClick] - Optional double click callback (event)
     */
    bindElementHandClick: function (element, options = {}) {
        if (!element) return;

        // Suppress browser context menu
        element.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const hand = 'right';
            if (options.onRightClick) options.onRightClick(e);
            if (options.onHandClick) options.onHandClick(hand, e);
            return false;
        };

        let clickTimer = null;

        element.onclick = (e) => {
            e.stopPropagation();
            const hand = 'left';

            if (options.onDoubleClick) {
                if (clickTimer) {
                    clearTimeout(clickTimer);
                    clickTimer = null;
                    options.onDoubleClick(e);
                } else {
                    clickTimer = setTimeout(() => {
                        clickTimer = null;
                        if (options.onLeftClick) options.onLeftClick(e);
                        if (options.onHandClick) options.onHandClick(hand, e);
                    }, 250);
                }
            } else {
                if (options.onLeftClick) options.onLeftClick(e);
                if (options.onHandClick) options.onHandClick(hand, e);
            }
        };
    }
};

window.clickManager = clickManager;
