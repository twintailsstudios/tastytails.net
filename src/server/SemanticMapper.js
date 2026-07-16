/**
 * SemanticMapper.js
 * 
 * Helper utility to convert raw game data into semantic strings for the State-Augmented Dataset.
 * Handles the "translation" of sprite names, colors, and game states into human/AI-readable tags.
 */

const itemData = require('../data/itemData');
const semanticMap = require('../data/semanticMap.json');

const hexToRgb = (hex) => {
    if (!hex) return null;
    if (hex.startsWith('0x')) hex = '#' + hex.substring(2);
    if (!hex.startsWith('#')) return null;
    const bigint = parseInt(hex.substring(1), 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
};

const getDistSq = (c1, c2) => {
    return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

// Pre-parse semanticMap colors once at startup
const preParsedColors = [];
if (semanticMap && semanticMap.colors) {
    for (const [hexKey, name] of Object.entries(semanticMap.colors)) {
        if (!hexKey.startsWith('#')) continue;
        const rgb = hexToRgb(hexKey);
        if (rgb) {
            preParsedColors.push({ rgb, name });
        }
    }
}

// Global cache for resolved colors
const colorCache = new Map();

const translateColor = (color) => {
    if (!color || color === 'none') return '';
    let lowerColor = color.toLowerCase();
    if (lowerColor.startsWith('0x')) lowerColor = '#' + lowerColor.substring(2);

    const cached = colorCache.get(lowerColor);
    if (cached !== undefined) return cached;

    // 1. Exact Match
    if (semanticMap.colors[lowerColor]) {
        colorCache.set(lowerColor, semanticMap.colors[lowerColor]);
        return semanticMap.colors[lowerColor];
    }
    if (lowerColor === 'standard') {
        colorCache.set(lowerColor, 'natural');
        return 'natural';
    }

    // 2. Nearest Neighbor
    const inputRgb = hexToRgb(lowerColor);
    if (!inputRgb) {
        const fallback = lowerColor.replace('#', '');
        colorCache.set(lowerColor, fallback);
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

    colorCache.set(lowerColor, closestColorName);
    return closestColorName;
};

const translateSprite = (spriteKey) => {
    if (!spriteKey || spriteKey === 'none') return null;

    const lookup = semanticMap.sprites[spriteKey];
    if (lookup) {
        if (typeof lookup === 'object' && lookup.internal_id) {
            return lookup.internal_id.replace(/_/g, ' ');
        }
        return lookup;
    }

    return spriteKey.replace(/_/g, ' ');
};

class SemanticMapper {

    /**
     * Converts a player's character appearance into a list of visual tags.
     * @param {Object} char - The character object from User.characters
     * @returns {string[]} Array of tags like "blue_hair", "rabbit_tail"
     */
    static getVisualContext(char) {
        const tags = [];
        if (!char) return tags;

        // Helper to format "color_part"
        const addTag = (partObj) => {
            if (partObj && partObj.sprite && partObj.sprite !== 'none') {
                const spriteDesc = translateSprite(partObj.sprite);
                if (!spriteDesc) return;

                const colorDesc = translateColor(partObj.color || 'standard');

                // Combine: "red fluffy wolf tail" or just "fluffy wolf tail" if natural
                if (colorDesc && colorDesc !== 'natural' && colorDesc !== 'standard') {
                    tags.push(`${colorDesc} ${spriteDesc}`);
                } else {
                    tags.push(spriteDesc);
                }
            }
        };

        addTag(char.hair);
        addTag(char.tail);
        // Ears special handling (outer/inner) - usually we just describe the outer/main ear type
        if (char.ear && char.ear.outerSprite) {
            const baseSprite = char.ear.outerSprite.split('-')[0];
            const spriteDesc = translateSprite(baseSprite);
            const colorDesc = translateColor(char.ear.outerColor);
            if (spriteDesc) {
                if (colorDesc && colorDesc !== 'natural') {
                    tags.push(`${colorDesc} ${spriteDesc}`);
                } else {
                    tags.push(spriteDesc);
                }
            }
        }

        // Species tag
        if (char.speciesName) tags.push(char.speciesName.toLowerCase());

        return tags;
    }

    /**
     * Determines the role of a nearby entity relative to the observer.
     * @param {Object} observer 
     * @param {Object} target 
     * @returns {string} "Predator", "Prey", "Friend", "Neutral"
     */
    static getEntityRole(observer, target) {
        if (target.consumedBy === observer.identifier) return 'Prey';
        if (observer.consumedBy === target.identifier) return 'Predator';
        return 'Neutral';
    }

    /**
     * Maps item UIDs or IDs to semantic names.
     * @param {Array} items - List of item objects
     * @returns {string[]} List of semantic names e.g. "mug_ale", "sword"
     */
    static getNearbyObjectTags(items) {
        return items.map(item => {
            const def = itemData[item.itemId];
            if (def) {
                return def.name.toLowerCase().replace(/\s+/g, '_');
            }
            return item.name ? item.name.toLowerCase().replace(/\s+/g, '_') : 'unknown_object';
        });
    }

    /**
     * Map raw biome/zone strings to semantic tags.
     * @param {string} zoneType 
     */
    static getBiomeTag(zoneType) {
        if (!zoneType) return 'unknown_locations';
        return zoneType.toLowerCase().replace(/\s+/g, '_');
    }
}

module.exports = SemanticMapper;
