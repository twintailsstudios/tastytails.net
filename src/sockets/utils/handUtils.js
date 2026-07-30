/**
 * @fileoverview handUtils.js - Centralized server-side utility for hand node operations.
 * 
 * @description
 * High-level architectural role: Standardizes player hand node resolution, retrieval,
 * assignment, and clearing across socket event handlers (e.g. inventory and crafting).
 * Triggered by: Socket events (equipItemClicked, stashItemClicked, retrieveItemClicked, depositItemClicked, collectCraftedItemClicked).
 */

/**
 * Resolves a hand parameter into a strict 'left' or 'right' identifier.
 * Falls back to player's active hand if 'hand' is nullish, defaulting to 'left'.
 * 
 * @param {string|null|undefined} hand - Explicit hand identifier ('left' | 'right').
 * @param {Object|null} [player=null] - Player object containing actionHands state.
 * @returns {'left'|'right'} Standardized hand string.
 */
function resolveHand(hand, player = null) {
    const targetHand = hand || player?.actionHands?.activeHand;
    return (targetHand === 'right') ? 'right' : 'left';
}

/**
 * Safely retrieves the item currently held in a player's designated hand node.
 * 
 * @param {Object} player - Target player entity.
 * @param {string|null|undefined} hand - Hand parameter to inspect ('left' | 'right').
 * @returns {Object|null} Held item object, or null if empty/invalid.
 */
function getHandItem(player, hand) {
    if (!player || !player.actionHands) return null;
    const resolved = resolveHand(hand, player);
    const item = resolved === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
    return item || null;
}

/**
 * Sets an item into the specified hand node of a player.
 * 
 * @param {Object} player - Target player entity.
 * @param {string|null|undefined} hand - Target hand ('left' | 'right').
 * @param {Object|null} [item=null] - Item object to place into the hand.
 */
function setHandItem(player, hand, item = null) {
    if (!player || !player.actionHands) return;
    const resolved = resolveHand(hand, player);
    if (resolved === 'left') {
        player.actionHands.leftNode = item;
    } else {
        player.actionHands.rightNode = item;
    }
}

/**
 * Empties the specified hand node of a player.
 * 
 * @param {Object} player - Target player entity.
 * @param {string|null|undefined} hand - Target hand to clear ('left' | 'right').
 */
function clearHandItem(player, hand) {
    setHandItem(player, hand, null);
}

module.exports = {
    resolveHand,
    getHandItem,
    setHandItem,
    clearHandItem
};
