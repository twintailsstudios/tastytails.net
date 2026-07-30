/**
 * @fileoverview SemanticMapper.js - Character & World Semantic Translation Engine
 * 
 * @description
 * Converts raw game engine data (sprite keys, hex color codes, item IDs, biomes) into
 * human/AI-readable semantic tags for the State-Augmented Dataset used by the narrative system.
 * 
 * Target Dataset: src/data/semanticMap.json
 * Invoked by: MessageSystem.js (State-Augmented Dataset generator)
 */

const itemData = require('../data/itemData');
const semanticMap = require('../data/semanticMap.json');

/**
 * Converts a hex color string (0xRRGGBB or #RRGGBB) to an RGB object.
 * @param {string} hex - Hex color representation
 * @returns {{r: number, g: number, b: number}|null} RGB object or null if invalid
 */
const hexToRgb = (hex) => {
    if (!hex || typeof hex !== 'string') return null;
    if (hex.startsWith('0x') || hex.startsWith('0X')) hex = '#' + hex.substring(2);
    if (!hex.startsWith('#')) return null;
    const bigint = parseInt(hex.substring(1), 16);
    if (Number.isNaN(bigint)) return null;
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
};

/**
 * Calculates squared Euclidean distance between two RGB colors for fast nearest-neighbor matching.
 * @param {{r: number, g: number, b: number}} c1 
 * @param {{r: number, g: number, b: number}} c2 
 * @returns {number} Squared distance
 */
const getDistSq = (c1, c2) => {
    return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

// OPTIMIZATION: Pre-parse semanticMap colors to RGB objects once at module startup to eliminate runtime parsing
const preParsedColors = [];
// OPTIMIZATION: Pre-parse and normalize semanticMap hex color keys (lowercased) for O(1) exact lookup
const preParsedColorMap = new Map();

if (semanticMap && semanticMap.colors) {
    for (const [hexKey, name] of Object.entries(semanticMap.colors)) {
        if (!hexKey.startsWith('#')) continue;
        const lowerKey = hexKey.toLowerCase();
        preParsedColorMap.set(lowerKey, name);
        const rgb = hexToRgb(lowerKey);
        if (rgb) {
            preParsedColors.push({ rgb, name });
        }
    }
}

// OPTIMIZATION: Pre-index static itemData names to snake_case semantic tags at module load to avoid runtime regex formatting
const preParsedItemTags = new Map();
if (itemData) {
    for (const [id, def] of Object.entries(itemData)) {
        if (def && typeof def.name === 'string') {
            preParsedItemTags.set(id, def.name.toLowerCase().replace(/\s+/g, '_'));
        }
    }
}

// OPTIMIZATION: Global cache for resolved colors capped at 1,000 items with true LRU eviction to prevent OOM memory leaks
const MAX_COLOR_CACHE_SIZE = 1000;
const colorCache = new Map();

/**
 * Inserts or updates a key in the LRU color cache, maintaining the capacity limit.
 * @param {string} key - Normalized hex string
 * @param {string} val - Resolved color name
 */
const setCachedColor = (key, val) => {
    if (colorCache.has(key)) {
        colorCache.delete(key);
    } else if (colorCache.size >= MAX_COLOR_CACHE_SIZE) {
        const firstKey = colorCache.keys().next().value;
        colorCache.delete(firstKey);
    }
    colorCache.set(key, val);
};

// OPTIMIZATION: Pre-parse sprite internal_ids into space-separated display strings at startup for O(1) zero-allocation lookup
const preParsedSprites = new Map();
if (semanticMap && semanticMap.sprites) {
    for (const [key, val] of Object.entries(semanticMap.sprites)) {
        if (val && typeof val === 'object' && val.internal_id) {
            preParsedSprites.set(key, val.internal_id.replace(/_/g, ' '));
        } else if (typeof val === 'string') {
            preParsedSprites.set(key, val.replace(/_/g, ' '));
        }
    }
}

/**
 * Translates a hex color string or keyword into a human-readable color tag.
 * Uses exact lookup -> true LRU cache hit refresh -> nearest neighbor Euclidean match.
 * @param {string} color - Hex color code or color keyword
 * @returns {string} Human color name or fallback string
 */
const translateColor = (color) => {
    if (!color || typeof color !== 'string' || color === 'none') return '';
    let lowerColor = color.toLowerCase();
    if (lowerColor.startsWith('0x')) lowerColor = '#' + lowerColor.substring(2);

    // OPTIMIZATION: True LRU cache hit refresh (re-inserts key to update Map access order)
    if (colorCache.has(lowerColor)) {
        const cached = colorCache.get(lowerColor);
        colorCache.delete(lowerColor);
        colorCache.set(lowerColor, cached);
        return cached;
    }

    // 1. Exact Match via preParsedColorMap (normalized lowercase keys)
    const exactMatch = preParsedColorMap.get(lowerColor);
    if (exactMatch !== undefined) {
        setCachedColor(lowerColor, exactMatch);
        return exactMatch;
    }

    if (lowerColor === 'standard') {
        setCachedColor(lowerColor, 'natural');
        return 'natural';
    }

    // 2. Nearest Neighbor
    const inputRgb = hexToRgb(lowerColor);
    if (!inputRgb) {
        const fallback = lowerColor.replace('#', '');
        setCachedColor(lowerColor, fallback);
        return fallback;
    }

    let closestColorName = 'colored';
    let minDistSq = Infinity;

    for (let i = 0; i < preParsedColors.length; i++) {
        const target = preParsedColors[i];
        const distSq = getDistSq(inputRgb, target.rgb);
        if (distSq < minDistSq) {
            minDistSq = distSq;
            closestColorName = target.name;
        }
    }

    setCachedColor(lowerColor, closestColorName);
    return closestColorName;
};

/**
 * Translates an internal sprite key to a human-readable display string.
 * @param {string} spriteKey - Internal sprite identifier
 * @returns {string|null} Formatted sprite name or null if missing/none
 */
const translateSprite = (spriteKey) => {
    if (!spriteKey || typeof spriteKey !== 'string' || spriteKey === 'none') return null;

    const preParsed = preParsedSprites.get(spriteKey);
    if (preParsed !== undefined) {
        return preParsed;
    }

    return spriteKey.replace(/_/g, ' ');
};

/**
 * OPTIMIZATION: Hoisted body-part visual tag formatter to eliminate inner function closure allocations in getVisualContext.
 * @param {string} sprite - Sprite identifier
 * @param {string} color - Color identifier or hex string
 * @returns {string|null} Formatted visual tag (e.g. "blue fluffy tail") or null
 */
const formatPartTag = (sprite, color) => {
    if (!sprite || typeof sprite !== 'string' || sprite === 'none') return null;
    const spriteDesc = translateSprite(sprite);
    if (!spriteDesc) return null;

    const colorDesc = translateColor(color || 'standard');
    return (colorDesc && colorDesc !== 'natural' && colorDesc !== 'standard')
        ? `${colorDesc} ${spriteDesc}`
        : spriteDesc;
};

class SemanticMapper {

    /**
     * Converts a player's character appearance into a list of visual tags.
     * @param {Object} char - The character object from User.characters
     * @returns {string[]} Array of tags like ["blue_hair", "rabbit_tail"]
     */
    static getVisualContext(char) {
        const tags = [];
        if (!char || typeof char !== 'object') return tags;

        const hairTag = formatPartTag(char.hair?.sprite, char.hair?.color);
        if (hairTag) tags.push(hairTag);

        const tailTag = formatPartTag(char.tail?.sprite, char.tail?.color);
        if (tailTag) tags.push(tailTag);

        if (char.ear?.outerSprite && typeof char.ear.outerSprite === 'string') {
            const baseSprite = char.ear.outerSprite.split('-')[0];
            const earTag = formatPartTag(baseSprite, char.ear.outerColor);
            if (earTag) tags.push(earTag);
        }

        if (char.speciesName && typeof char.speciesName === 'string') {
            tags.push(char.speciesName.toLowerCase());
        }

        return tags;
    }

    /**
     * Determines the role of a nearby entity relative to the observer.
     * @param {Object} observer - Observing entity object
     * @param {Object} target - Target entity object
     * @returns {string} "Predator", "Prey", or "Neutral"
     */
    static getEntityRole(observer, target) {
        if (!observer || !target) return 'Neutral';
        if (target.consumedBy === observer.identifier) return 'Prey';
        if (observer.consumedBy === target.identifier) return 'Predator';
        return 'Neutral';
    }

    /**
     * Maps item UIDs or IDs to semantic names.
     * Uses pre-indexed item tags for fast lookup.
     * @param {Array} items - List of item objects
     * @returns {string[]} List of semantic names e.g. ["mug_ale", "sword"]
     */
    static getNearbyObjectTags(items) {
        if (!Array.isArray(items)) return [];
        return items.map(item => {
            if (!item || typeof item !== 'object') return 'unknown_object';
            if (item.itemId && preParsedItemTags.has(item.itemId)) {
                return preParsedItemTags.get(item.itemId);
            }
            if (item.name && typeof item.name === 'string') {
                return item.name.toLowerCase().replace(/\s+/g, '_');
            }
            return 'unknown_object';
        });
    }

    /**
     * Maps raw biome/zone strings to semantic tags.
     * @param {string} zoneType - Zone or biome identifier string
     * @returns {string} Formatted snake_case zone tag
     */
    static getBiomeTag(zoneType) {
        if (!zoneType || typeof zoneType !== 'string') return 'unknown_locations';
        return zoneType.toLowerCase().replace(/\s+/g, '_');
    }
}

module.exports = SemanticMapper;
