/**
 * @fileoverview ChatMessage.js - HTML Template Renderer for Individual Chat Messages
 * 
 * @description
 * Responsible for generating the HTML structure of individual chat message rows in TastyTails.net.
 * Acts as a pure client-side View Template Generator in the chat subsystem architecture.
 * Takes raw server message data models and produces sanitized DOM HTML strings for ChatUI.
 * 
 * Triggered by:
 * - WebSocket `message-output` broadcasts (via `ChatSystem.onMessageOutput`)
 * - WebSocket `reactions-output` updates (via `ChatSystem.onReactionUpdate`)
 * - WebSocket `older-chats-output` history hydration (via `ChatSystem.onOlderChatsOutput`)
 * - Local optimistic ghost message creation (via `ChatSystem.renderGhostMessage`)
 */

/**
 * OPTIMIZATION: Static frozen map of reaction keys to emojis.
 * Prevents transient object allocations on hot-loop message rendering.
 */
const REACTION_MAP = Object.freeze({
    heart: '❤️',
    blush: '😳',
    laugh: '😂',
    thumbsup: '👍',
    thumbsdown: '👎'
});

class ChatMessage {
    constructor() {
        /** @private {string} Track last URL location to invalidate character ID cache when switching characters */
        this._lastHref = '';
        /** @private {string} Cached character ID parsed from current URL */
        this._cachedCharId = '';
    }

    /**
     * Main render method. Converts a server message object into a structured HTML string.
     * @param {Object} msg - The raw message data object from the server or ghost system.
     * @returns {string} The HTML string representing the complete message row.
     */
    render(msg) {
        // RELIABILITY: Guard against null or non-object payloads to avoid throwing uncaught errors
        if (!msg || typeof msg !== 'object') return '';

        // RELIABILITY: Safely extract message revisions and fallback to safe defaults if payload is malformed
        const msgChain = Array.isArray(msg.message) ? msg.message : [];
        const latestMsg = msgChain.length > 0 ? msgChain[msgChain.length - 1] : { time: Date.now(), content: '' };
        const rawTime = latestMsg.time || Date.now();
        const time = ChatFormatter.formatTime(rawTime);
        const username = msg.name || 'Anonymous';
        const content = latestMsg.content || '';
        const spoilerStatus = msg.spoiler?.status || 'none';
        const msgId = msg._id || `temp-fallback-${Math.random().toString(36).substring(2, 11)}`;
        const identifier = msg.identifier || '';
        const type = msg.type || 'Default';
        const scope = msg.scope || 'global';
        const senderProfile = msg.senderProfile || {};
        const reactions = msg.reactions || {};

        // Environmental Message (Special Full-Width Formatting)
        if (username === 'Environment' || type === 'Environmental') {
            return `
                <div id="${msgId}" class="chat-message environmental-message" data-timestamp="${rawTime}">
                    <div class="message-content">
                        ${content}
                    </div>
                </div>
            `;
        }

        // Content Classes (Handling Spoilers)
        let contentClasses = "message-content";
        if (spoilerStatus !== 'none') {
            contentClasses += ` spoiled-content spoiled-${spoilerStatus}`;
        }

        // Message Container Classes (Handling Message Types)
        let messageClasses = "chat-message";
        if (type === 'Say') messageClasses += " say-message";
        if (type === 'Unique') messageClasses += " unique-message";
        if (type === 'Interactional') messageClasses += " interactional-message";
        if (type === 'OOC') messageClasses += " ooc-message";

        // Render Avatar HTML Container
        const avatarHtml = this.renderAvatar(senderProfile, msgId);

        // Render Interactive Reactions Bar
        const reactionsHtml = this.renderReactions(reactions, msgId);

        return `
            <div id="${msgId}" class="${messageClasses} scope-${scope}" data-timestamp="${rawTime}" data-scope="${scope}">
                ${avatarHtml}
                <div class="message-body" style="flex: 1; min-width: 0;">
                    <div class="msg-title-bar">
                        <div>
                            <span class="postTime">${time} </span>
                            <span class="msgUsername"><strong>${username}:</strong></span>
                        </div>
                        <button class="msg-control-btn material-icons" data-dropdown-button data-id="${msgId}" data-sender-id="${identifier}" title="Options">more_vert</button>
                    </div>
                    <div class="${contentClasses}" data-spoiler-type="${spoilerStatus}">${content}</div>
                    ${reactionsHtml}
                </div>
            </div>`;
    }

    /**
     * Renders the reaction bar with pill counts and active status.
     * @param {Object.<string, Array.<string>>} reactions - Map of reaction types to array of user IDs
     * @param {string} msgId - The unique ID of the message
     * @returns {string} HTML string representing the reaction bar
     */
    renderReactions(reactions, msgId) {
        let html = '<div class="reaction-bar">';
        const myCharId = this.getMyCharId();

        for (const [type, users] of Object.entries(reactions)) {
            if (users && users.length > 0) {
                const isActive = users.includes(myCharId) ? 'active' : '';
                // OPTIMIZATION: Read from static frozen REACTION_MAP dictionary
                const emoji = REACTION_MAP[type] || type;
                html += `<div class="reaction-pill ${isActive}" data-reaction-toggle="${type}" data-msg-id="${msgId}">${emoji} <span class="count">${users.length}</span></div>`;
            }
        }

        // Add Shortcut Button
        html += `<div class="reaction-pill add-reaction-btn" data-msg-id="${msgId}" title="Add Reaction"><i class="fas fa-plus"></i> <i class="far fa-smile"></i></div>`;
        html += '</div>';

        return html;
    }

    /**
     * Generates the avatar container HTML.
     * Includes logic for synchronous cache checking vs async loading placeholder.
     * @param {Object} profile - Character profile object containing sprite data
     * @param {string} msgId - Unique message ID
     * @returns {string} HTML snippet for the avatar container
     */
    renderAvatar(profile, msgId) {
        if (!profile || !profile.head || !profile.head.sprite) return '';

        let style = '';
        let className = 'avatar-container pixel-art avatar-placeholder'; // Default to placeholder

        // Try synchronous cache first to avoid UI flicker
        if (window.avatarRenderer) {
            const cachedUrl = window.avatarRenderer.getCached(profile);
            if (cachedUrl) {
                style = `background-image: url('${cachedUrl}');`;
                className = 'avatar-container pixel-art'; // Remove placeholder animation if ready
            } else {
                // Queue Async Canvas Render
                window.avatarRenderer.render(profile).then(url => {
                    const el = document.getElementById(`avatar-${msgId}`);
                    // RELIABILITY: Only update if element is still connected to DOM and URL is valid
                    if (el && url) {
                        el.style.backgroundImage = `url('${url}')`;
                        el.classList.remove('avatar-placeholder');
                        // Re-trigger 1-play animation cleanly when image arrives
                        el.style.animation = 'none';
                        void el.offsetHeight; // Force DOM reflow
                        el.style.animation = '';
                    }
                }).catch(err => {
                    // RELIABILITY: Catch canvas render failures without crashing
                    console.warn(`[ChatMessage] Avatar render failed for message ${msgId}:`, err);
                });
            }
        }

        return `
            <div id="avatar-${msgId}" 
                 class="${className}" 
                 style="${style}">
            </div>
        `;
    }

    /**
     * Parses the current character ID from the page URL.
     * OPTIMIZATION: Caches result and invalidates if document.location.href changes (e.g. character switch).
     * @returns {string} Active character ID or empty string
     */
    getMyCharId() {
        const currentHref = document.location ? document.location.href : '';
        if (this._lastHref === currentHref && this._cachedCharId) {
            return this._cachedCharId;
        }
        this._lastHref = currentHref;
        const parts = currentHref.split('play/');
        this._cachedCharId = parts.length > 1 ? parts[1].split('/')[0].split('?')[0] : '';
        return this._cachedCharId;
    }
}

/**
 * Cross-Module Export: Expose REACTION_MAP on ChatMessage static property
 * so dependent modules (e.g. ChatContextMenu.js) can share the dictionary.
 */
ChatMessage.REACTION_MAP = REACTION_MAP;
window.ChatMessage = ChatMessage;
