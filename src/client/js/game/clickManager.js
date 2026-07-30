/**
 * @fileoverview clickManager.js - Centralized Dual-Handed UI Mouse Interaction Manager
 * 
 * @description
 * Architectural Utility for standardizing mouse interactions across TastyTails client UI modules.
 * Translates low-level browser DOM MouseEvents and Phaser Pointer events into game-domain
 * dual-handed actions ('left' hand vs. 'right' hand).
 * 
 * Key Responsibilities:
 * - Standardizing Left Click (Button 0) = Left Hand ('left') & Right Click (Button 2) = Right Hand ('right').
 * - Suppressing native browser context menus on interactive UI elements to enable right-click gameplay actions.
 * - Disambiguating single-click and double-click events using a configurable debouncing timer (default 250ms).
 * - Preventing event listener memory leaks and orphaned timers when UI components dynamically re-render.
 */

export const clickManager = {
    /**
     * Normalizes a DOM MouseEvent or Phaser Pointer object into a target hand identifier.
     * 
     * @param {MouseEvent|Phaser.Input.Pointer|Object} event - The source mouse or pointer event
     * @returns {'left'|'right'} Target hand identifier ('left' or 'right')
     */
    getHandFromEvent: function (event) {
        if (!event) return 'left';

        // Phaser Pointer object API check
        if (typeof event.rightButtonDown === 'function') {
            return event.rightButtonDown() ? 'right' : 'left';
        }

        // Standard DOM MouseEvent normalization (event.button: 0 = Left, 2 = Right)
        const button = (event.button !== undefined) ? event.button : (event.which ? event.which - 1 : 0);
        return button === 2 ? 'right' : 'left';
    },

    /**
     * Unbinds clickManager event listeners and clears any active double-click timers from a DOM element.
     * 
     * OPTIMIZATION: Prevents memory leaks and orphaned timers when UI slots (inventory, equipment, crafting)
     * are unmounted, destroyed, or re-rendered.
     * 
     * @param {HTMLElement} element - Target DOM element to unbind
     */
    unbindElementHandClick: function (element) {
        if (!element) return;
        
        // Clear active double-click timer if pending
        if (element.__clickManager_timer__) {
            clearTimeout(element.__clickManager_timer__);
            element.__clickManager_timer__ = null;
        }
        
        // Detach event listeners via registered cleanup handler
        if (typeof element.__clickManager_cleanup__ === 'function') {
            element.__clickManager_cleanup__();
            delete element.__clickManager_cleanup__;
        }
    },

    /**
     * Binds unified left-click, right-click, and double-click event listeners to an HTML element.
     * Automatically suppresses native browser context menus and guards against listener stacking.
     * 
     * OPTIMIZATION: Uses addEventListener with namespaced cleanup handlers stored directly on element properties
     * (__clickManager_cleanup__, __clickManager_timer__) to eliminate memory leaks and guarantee safe re-binding.
     * 
     * @param {HTMLElement} element - Target DOM element to bind
     * @param {Object} [options={}] - Interaction options and callback handles
     * @param {Function} [options.onHandClick] - Unified callback receiving (hand: 'left'|'right', event: MouseEvent)
     * @param {Function} [options.onLeftClick] - Callback for left-click events receiving (event: MouseEvent)
     * @param {Function} [options.onRightClick] - Callback for right-click events receiving (event: MouseEvent)
     * @param {Function} [options.onDoubleClick] - Callback for double-click events receiving (event: MouseEvent)
     * @param {number} [options.doubleClickDelay=250] - Timer threshold in ms for double-click disambiguation
     * @returns {Function} Unbind cleanup function for manual lifecycle teardown
     */
    bindElementHandClick: function (element, options = {}) {
        if (!element) return () => {};

        // OPTIMIZATION: Automatically unbind existing listeners before re-binding to prevent listener stacking
        this.unbindElementHandClick(element);

        // Suppress browser context menu and execute right-click callbacks
        const handleContextMenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const hand = 'right';
            try {
                if (options.onRightClick) options.onRightClick(e);
                if (options.onHandClick) options.onHandClick(hand, e);
            } catch (err) {
                console.error('[clickManager] Error in right click callback:', err);
            }
            return false;
        };

        // Disambiguate single vs. double left-clicks
        const handleClick = (e) => {
            e.stopPropagation();
            const hand = 'left';

            if (options.onDoubleClick) {
                if (element.__clickManager_timer__) {
                    // Second click within threshold: cancel single-click timer and fire double-click
                    clearTimeout(element.__clickManager_timer__);
                    element.__clickManager_timer__ = null;
                    try {
                        options.onDoubleClick(e);
                    } catch (err) {
                        console.error('[clickManager] Error in double click callback:', err);
                    }
                } else {
                    // First click: start timer for double-click detection
                    const delay = options.doubleClickDelay || 250;
                    element.__clickManager_timer__ = setTimeout(() => {
                        element.__clickManager_timer__ = null;
                        try {
                            if (options.onLeftClick) options.onLeftClick(e);
                            if (options.onHandClick) options.onHandClick(hand, e);
                        } catch (err) {
                            console.error('[clickManager] Error in left click callback:', err);
                        }
                    }, delay);
                }
            } else {
                // Immediate left-click execution when no double-click handler is registered
                try {
                    if (options.onLeftClick) options.onLeftClick(e);
                    if (options.onHandClick) options.onHandClick(hand, e);
                } catch (err) {
                    console.error('[clickManager] Error in left click callback:', err);
                }
            }
        };

        // Suppress pointerdown/mousedown propagation to prevent canvas click-to-move
        const handlePointerDown = (e) => {
            e.stopPropagation();
        };

        element.addEventListener('contextmenu', handleContextMenu);
        element.addEventListener('click', handleClick);
        element.addEventListener('pointerdown', handlePointerDown);
        element.addEventListener('mousedown', handlePointerDown);

        element.__clickManager_cleanup__ = () => {
            element.removeEventListener('contextmenu', handleContextMenu);
            element.removeEventListener('click', handleClick);
            element.removeEventListener('pointerdown', handlePointerDown);
            element.removeEventListener('mousedown', handlePointerDown);
        };

        return () => this.unbindElementHandClick(element);
    }
};

// Global non-module binding for legacy script compatibility
window.clickManager = clickManager;
