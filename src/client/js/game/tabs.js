/**
 * @fileoverview tabs.js - Game Client Side Navigation Tab Controller
 * 
 * @description
 * Manages the tabbed side menu interface in the TastyTails client UI. Handles click
 * event binding for menu tab buttons, toggles display panel visibility (.tabDisplay),
 * manages active CSS tab styling (.menuTabs.active), triggers external UI pop-outs
 * (such as opening the equipment manager window), and sets default tab state.
 * 
 * @module client/game/tabs
 * Triggered by: Phaser scene creation in create.js (initializeTabs)
 */

/**
 * Initializes click event listeners for the game client side menu tabs.
 * 
 * @function initializeTabs
 * @returns {void}
 * 
 * @description
 * Configures click event handling for all primary menu tabs ('look', 'apparel', 'spells',
 * 'map', 'vore', 'options'). Includes listener binding guards (dataset.tabBound) to safely
 * prevent duplicate listener stacking on Phaser scene restarts.
 */
export function initializeTabs() {
    const tabs = ['look', 'apparel', 'spells', 'map', 'vore', 'options'];

    tabs.forEach(tab => {
        const btn = document.getElementById(tab + 'Tab');
        if (btn) {
            // OPTIMIZATION: Guard against listener duplication on Phaser scene restart/reconnect
            if (btn.dataset.tabBound === 'true') return;
            btn.dataset.tabBound = 'true';

            btn.addEventListener('click', () => {
                // Hide all tab display containers
                document.querySelectorAll('.tabDisplay').forEach(el => el.style.display = 'none');

                // Show selected tab display container
                const display = document.getElementById(tab + 'Display');
                if (display) {
                    display.style.display = 'block';
                }

                // Update active tab button style
                document.querySelectorAll('.menuTabs').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');

                // Pop-out floating equipment window for Apparel tab
                if (tab === 'apparel' && window.equipmentManager) {
                    window.equipmentManager.open();
                }
            });
        }
    });

    // Default to Look tab if no tab is currently active
    const lookTab = document.getElementById('lookTab');
    if (lookTab && !document.querySelector('.menuTabs.active')) {
        lookTab.click();
    }
}

