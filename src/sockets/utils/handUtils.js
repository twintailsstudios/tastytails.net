/**
 * handUtils.js
 * Centralized server-side utility for hand node operations.
 * Standardizes: hand parameter resolution ('left' | 'right').
 */

function resolveHand(hand) {
    return (hand === 'right') ? 'right' : 'left';
}

function getHandItem(player, hand) {
    if (!player || !player.actionHands) return null;
    const resolved = resolveHand(hand);
    return resolved === 'left' ? player.actionHands.leftNode : player.actionHands.rightNode;
}

function setHandItem(player, hand, item) {
    if (!player || !player.actionHands) return;
    const resolved = resolveHand(hand);
    if (resolved === 'left') {
        player.actionHands.leftNode = item;
    } else {
        player.actionHands.rightNode = item;
    }
}

function clearHandItem(player, hand) {
    setHandItem(player, hand, null);
}

module.exports = {
    resolveHand,
    getHandItem,
    setHandItem,
    clearHandItem
};
