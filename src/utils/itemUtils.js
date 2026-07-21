const resourceNodeData = require('../data/resourceNodeData');

/**
 * Resolves the static definition for an item instance.
 * Checks itemId first, then falls back to texture.
 * 
 * @param {Object} item - The item instance (held item or world item)
 * @param {Object} itemData - The static item definition map
 * @returns {Object} The resolved static definition or empty object
 */
module.exports.resolveItemDef = (item, itemData) => {
    if (!item) return {};
    return itemData[item.itemId] || itemData[item.texture] ||
           resourceNodeData[item.itemId] || resourceNodeData[item.texture] || {};
};

/**
 * Creates a new dynamic item instance.
 * Merges base definition with custom data.
 * 
 * @param {string} itemId - The base item ID (e.g. 'alpha_bottle')
 * @param {Object} itemData - The global item definition map
 * @param {Object} [customData={}] - Custom properties (name, variant, icon, etc.)
 * @param {Object} [position={x:0, y:0}] - Initial position
 * @returns {Object} The new item instance
 */
module.exports.createDynamicItem = (itemId, itemData, customData = {}, position = { x: 0, y: 0 }) => {
    const def = itemData[itemId];

    // Base Identity
    let newItem = {
        // [FIX] Inherit all static properties (equipSlot, maxUses, etc.)
        ...def,

        // Instance-specific overrides
        uid: 'item_' + Date.now() + Math.random().toString(36).substr(2, 5),
        itemId: itemId,

        // Ensure core props exist if def is missing
        name: def ? def.name : itemId,
        texture: def ? def.texture : 'default_item',
        icon: def ? def.icon : '',

        // Standard Props
        x: position.x,
        y: position.y
    };

    // Merge Custom Data (Dynamic Overrides)
    if (customData) {
        newItem = { ...newItem, ...customData };
    }

    return newItem;
};
