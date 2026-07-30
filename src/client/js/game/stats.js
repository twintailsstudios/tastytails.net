/**
 * @fileoverview stats.js - Client-Side HUD Vitality Stats & Medical Modal Gateway
 * 
 * @description
 * Controls the rendering and state caching for the player's core vitality bars (Health, Stamina, Mana).
 * Features Flyweight value caching to prevent DOM layout thrashing during frame ticks and provides
 * a lazy interactive entry point to toggle the Medical Paper Doll HUD.
 * 
 * Triggered by: Main engine update loop in update.js when player stats change.
 */

import { toggleMedicalModal, updateMedicalStats } from './medicalUI.js';

// OPTIMIZATION: Module-scoped value cache to prevent layout thrashing and redundant DOM mutations on identical frames
const cache = {
    health: -1,
    maxHealth: -1,
    stamina: -1,
    maxStamina: -1,
    mana: -1,
    maxMana: -1
};

// OPTIMIZATION: DOM Element cache with .isConnected validation to eliminate repeated document.getElementById lookups
const domCache = new Map();

/**
 * Retrieves a cached DOM element by ID, querying the document if un-cached or detached.
 * @param {string} id - DOM element ID
 * @returns {HTMLElement|null} Valid DOM element reference
 */
function getCachedElement(id) {
    const cached = domCache.get(id);
    if (cached && cached.isConnected) {
        return cached;
    }
    const fresh = document.getElementById(id);
    if (fresh) {
        domCache.set(id, fresh);
    }
    return fresh;
}

/**
 * Extracted helper to calculate fill percentage and update bar width and text labels.
 * Extracted out of updateStatsUI to avoid closure allocation per tick call.
 * 
 * @param {string} id - Stat bar prefix ('health', 'stamina', 'mana')
 * @param {number} current - Current stat value
 * @param {number} max - Maximum stat value
 * @param {string} cacheKeyCurrent - Cache key for current value
 * @param {string} cacheKeyMax - Cache key for max value
 */
function updateBar(id, current, max, cacheKeyCurrent, cacheKeyMax) {
    // Early exit if stat values haven't changed since last tick
    if (cache[cacheKeyCurrent] === current && cache[cacheKeyMax] === max) {
        return;
    }

    cache[cacheKeyCurrent] = current;
    cache[cacheKeyMax] = max;

    // Safety guards against negative stats or division by zero
    const safeMax = Math.max(0, max);
    const safeCurrent = Math.max(0, current);
    const percent = safeMax > 0 ? Math.max(0, Math.min(100, (safeCurrent / safeMax) * 100)) : 0;

    const bar = getCachedElement(`${id}-bar-fill`);
    const text = getCachedElement(`${id}-text`);

    if (bar) {
        bar.style.width = `${percent}%`;
    }
    if (text) {
        text.innerText = `${Math.floor(safeCurrent)} / ${Math.floor(safeMax)}`;
    }
}

/**
 * Main export for updating client HUD vitality stats.
 * 
 * @param {Object} player - Player entity or player info object containing stat data
 */
export function updateStatsUI(player) {
    if (!player) return;

    // Lazily attach click listener to health bar parent container (resilient to DOM re-renders via dataset attribute)
    const healthContainer = getCachedElement('health-bar-container') || document.getElementById('health-bar-fill')?.closest('.stat-bar-container');
    if (healthContainer && !healthContainer.dataset.medicalClickAttached) {
        healthContainer.style.cursor = 'pointer';
        healthContainer.title = 'Click to open Medical Paper Doll HUD';
        healthContainer.addEventListener('click', toggleMedicalModal);
        healthContainer.dataset.medicalClickAttached = 'true';
    }

    // Defensive fallback extraction for backward compatibility
    const stats = (player && player.stats) ? player.stats : player;
    const {
        health = 100,
        maxHealth = 100,
        stamina = 100,
        maxStamina = 100,
        mana = 100,
        maxMana = 100
    } = stats;

    // Forward detailed anatomical stats to Medical UI manager
    if (player && player.stats && player.stats.bodyParts) {
        updateMedicalStats(player.stats);
    }

    updateBar('health', health, maxHealth, 'health', 'maxHealth');
    updateBar('stamina', stamina, maxStamina, 'stamina', 'maxStamina');
    updateBar('mana', mana, maxMana, 'mana', 'maxMana');
}

