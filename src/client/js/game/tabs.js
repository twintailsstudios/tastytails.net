export function initializeTabs() {
    const tabs = ['look', 'apparel', 'spells', 'map', 'vore', 'options'];

    tabs.forEach(tab => {
        const btn = document.getElementById(tab + 'Tab');
        if (btn) {
            btn.addEventListener('click', () => {
                // Hide all displays
                document.querySelectorAll('.tabDisplay').forEach(el => el.style.display = 'none');

                // Show selected
                const display = document.getElementById(tab + 'Display');
                if (display) {
                    display.style.display = 'block';
                }

                // Update active tab style
                document.querySelectorAll('.menuTabs').forEach(el => el.classList.remove('active'));
                btn.classList.add('active');

                // Pop-out floating window action for Apparel tab
                if (tab === 'apparel' && window.equipmentManager) {
                    window.equipmentManager.open();
                }
            });
        }
    });

    // Default to Look tab if nothing is active
    const lookTab = document.getElementById('lookTab');
    if (lookTab) {
        lookTab.click();
    }
}
