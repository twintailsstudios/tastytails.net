/**
 * ChatMessage.js
 * 
 * Responsible for generating the HTML structure of individual chat messages.
 * This class takes raw message data and produces the DOM string string used by ChatUI.
 * It handles:
 * - Message type variance (Say, OOC, Environmental, etc.)
 * - Timestamp formatting
 * - Avatar creation logic
 * - Reaction bar rendering
 */
class ChatMessage {
    constructor() {
    }

    /**
     * Main render method. Converts a message object into an HTML string.
     * @param {Object} msg - The message data object from the server.
     * @returns {string} The HTML string representing the message row.
     */
    render(msg) {
        const rawTime = msg.message[msg.message.length - 1].time;
        const time = ChatFormatter.formatTime(rawTime);
        const username = msg.name;
        const content = msg.message[msg.message.length - 1].content;
        const spoilerStatus = msg.spoiler.status;
        const msgId = msg._id;
        const identifier = msg.identifier;
        const type = msg.type || 'Default';
        const scope = msg.scope || 'global';
        const senderProfile = msg.senderProfile || {};
        const reactions = msg.reactions || {};

        // Environmental Message (Special Formatting)
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


        // Avatars
        const avatarHtml = this.renderAvatar(senderProfile, msgId);

        // Reactions
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
                    <div class="${contentClasses}" data-spoiler-type="${spoilerStatus}">
                        ${content}
                    </div>
                    ${reactionsHtml}
                </div>
            </div >
        `;
    }

    /**
     * Renders the reaction bar with pill counts.
     * @param {Object} reactions - Map of reaction types to array of userIds
     * @param {string} msgId - The ID of the message
     */
    renderReactions(reactions, msgId) {
        let html = '<div class="reaction-bar">';
        const reactionMap = { heart: '❤️', blush: '😳', laugh: '😂', thumbsup: '👍', thumbsdown: '👎' };
        const myCharId = this.getMyCharId();

        for (const [type, users] of Object.entries(reactions)) {
            if (users && users.length > 0) {
                const isActive = users.includes(myCharId) ? 'active' : '';
                html += `<div class="reaction-pill ${isActive}" data-reaction-toggle="${type}" data-msg-id="${msgId}">${reactionMap[type]} <span class="count">${users.length}</span></div>`;
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
     */
    renderAvatar(profile, msgId) {
        if (!profile || !profile.head || !profile.head.sprite) return '';

        let style = '';
        let className = 'avatar-container pixel-art avatar-placeholder'; // Default to placeholder

        // Try synchronous cache first to avoid flicker
        if (window.avatarRenderer) {
            const cachedUrl = window.avatarRenderer.getCached(profile);
            if (cachedUrl) {
                style = `background-image: url('${cachedUrl}');`;
                className = 'avatar-container pixel-art'; // Remove placeholder animation if ready
            } else {
                // Queue Async Render
                window.avatarRenderer.render(profile).then(url => {
                    const el = document.getElementById(`avatar-${msgId}`);
                    // Only update if element exists exists and URL is valid
                    if (el && url) {
                        el.style.backgroundImage = `url('${url}')`;
                        el.classList.remove('avatar-placeholder');
                    }
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

    getMyCharId() {
        const parts = document.location.href.split('play/');
        return parts.length > 1 ? parts[1] : '';
    }
}

window.ChatMessage = ChatMessage;
