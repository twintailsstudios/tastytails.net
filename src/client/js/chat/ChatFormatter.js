/**
 * ChatFormatter.js
 * 
 * Static helper class for formatting text and time values within the chat.
 * Separated to ensure consistent formatting rules across the application.
 */
class ChatFormatter {
    /**
     * Formats an ISO string into a localized time string (HH:MM AM/PM).
     * @param {string} dateString - ISO Date String
     * @returns {string} Formatted time string
     */
    static formatTime(dateString) {
        if (!dateString) return '';
        return new Date(Date.parse(dateString)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Sanitizes raw text input to prevent XSS (if not handled server-side).
     * Currently a passthrough, but serves as a placeholder for client-side filtering.
     * @param {string} text 
     */
    static sanitize(text) {
        // Basic precaution, though server should sanitize too.
        // For now, we rely on the server's HTML or existing client logic.
        // If we need client-side sanitization, we can add it here.
        return text;
    }
}

window.ChatFormatter = ChatFormatter;
