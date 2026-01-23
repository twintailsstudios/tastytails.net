// Cache last known values to prevent DOM thrashing
const cache = {
    health: -1,
    maxHealth: -1,
    stamina: -1,
    maxStamina: -1,
    mana: -1,
    maxMana: -1
};

export function updateStatsUI(player) {
    if (!player) return;

    // Default values if stats are missing (backward compatibility)
    // Handle both nested .stats (legacy/full player object) and flat stats object
    const stats = (player && player.stats) ? player.stats : player;

    const { health = 100, maxHealth = 100, stamina = 100, maxStamina = 100, mana = 100, maxMana = 100 } = stats;

    // Helper to calculate percentage and update bar
    const updateBar = (id, current, max, cacheKeyCurrent, cacheKeyMax) => {
        // Check cache
        if (cache[cacheKeyCurrent] === current && cache[cacheKeyMax] === max) return;

        // Update Cache
        cache[cacheKeyCurrent] = current;
        cache[cacheKeyMax] = max;

        const percent = Math.max(0, Math.min(100, (current / max) * 100));
        const bar = document.getElementById(`${id}-bar-fill`);
        const text = document.getElementById(`${id}-text`);

        if (bar) bar.style.width = `${percent}%`;
        if (text) text.innerText = `${Math.floor(current)} / ${Math.floor(max)}`;
    };

    updateBar('health', health, maxHealth, 'health', 'maxHealth');
    updateBar('stamina', stamina, maxStamina, 'stamina', 'maxStamina');
    updateBar('mana', mana, maxMana, 'mana', 'maxMana');
}
