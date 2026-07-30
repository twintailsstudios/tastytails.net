/**
 * @fileoverview Item Utilities & Definition Resolver (itemUtils.js)
 * 
 * @description
 * High-level architectural role: Static item definition lookup & lightweight dynamic item instantiation.
 * Triggered by: Server tick loops (world item updates), Socket interaction handlers (harvesting, using items),
 * and Socket crafting handlers (spawning newly crafted items).
 */

const resourceNodeData = require('../data/resourceNodeData');

/**
 * OPTIMIZATION: Shared immutable fallback object to eliminate GC object allocations on misses.
 */
const EMPTY_DEF = Object.freeze({});

/**
 * OPTIMIZATION: Shared immutable default position to eliminate object allocations on default parameters.
 */
const ZERO_POSITION = Object.freeze({ x: 0, y: 0 });

/**
 * Monotonic counter for collision-proof UID generation within the same millisecond.
 */
let itemCounter = 0;

/**
 * OPTIMIZATION: Shared descriptor template to eliminate GC allocations during Object.defineProperty calls.
 */
const PROP_DESC = {
    value: undefined,
    writable: true,
    enumerable: true,
    configurable: true
};

/**
 * Safely defines an own property on target object without triggering
 * non-writable prototype property assignment errors on frozen base definitions.
 * 
 * @param {Object} obj - Target item instance
 * @param {string} key - Property name
 * @param {*} val - Property value
 */
function setOwnProp(obj, key, val) {
    PROP_DESC.value = val;
    Object.defineProperty(obj, key, PROP_DESC);
    PROP_DESC.value = undefined; // Clear reference for GC safety
}

/**
 * Resolves the static definition for an item instance.
 * Checks itemId first, then falls back to texture.
 * 
 * @param {Object} item - The item instance (held item or world item)
 * @param {Object} itemData - The static item definition map
 * @returns {Object} The resolved static definition or empty object
 */
module.exports.resolveItemDef = (item, itemData) => {
    if (!item || !itemData) return EMPTY_DEF;
    return itemData[item.itemId] || itemData[item.texture] ||
           resourceNodeData[item.itemId] || resourceNodeData[item.texture] || EMPTY_DEF;
};

/**
 * Creates a new dynamic item instance.
 * Delegates static property lookups to base definition via prototype inheritance.
 * 
 * @param {string} itemId - The base item ID (e.g. 'alpha_bottle')
 * @param {Object} itemData - The global item definition map
 * @param {Object} [customData={}] - Custom properties (name, variant, icon, etc.)
 * @param {Object} [position={x:0, y:0}] - Initial position
 * @returns {Object} The new item instance
 */
module.exports.createDynamicItem = (itemId, itemData, customData = {}, position = ZERO_POSITION) => {
    const def = (itemData && itemData[itemId]) || EMPTY_DEF;

    // Prototype inheritance: instance properties override local state,
    // static properties (equipSlot, recipe, rendering) resolve via prototype chain.
    const newItem = Object.create(def);

    if (++itemCounter > 1e9) itemCounter = 0;
    const uid = `item_${Date.now()}_${itemCounter}_${Math.random().toString(36).slice(2, 7)}`;

    setOwnProp(newItem, 'uid', uid);
    setOwnProp(newItem, 'itemId', itemId);
    setOwnProp(newItem, 'name', def.name || itemId);
    setOwnProp(newItem, 'texture', def.texture || 'default_item');
    setOwnProp(newItem, 'icon', def.icon || '');
    setOwnProp(newItem, 'x', position ? (position.x || 0) : 0);
    setOwnProp(newItem, 'y', position ? (position.y || 0) : 0);

    if (customData && typeof customData === 'object') {
        for (const key in customData) {
            if (Object.prototype.hasOwnProperty.call(customData, key)) {
                setOwnProp(newItem, key, customData[key]);
            }
        }
    }

    return newItem;
};



