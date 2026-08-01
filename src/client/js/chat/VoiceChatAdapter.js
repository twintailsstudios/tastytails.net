/**
 * @fileoverview Network & Chat Audio Adapter for TastyTails.net
 * 
 * @description
 * Bridges Socket.IO chat message broadcasts with the Voice Engine.
 * Evaluates spatial player distances, parses dialogue/punctuation, enforces crowd control polyphony caps,
 * and triggers procedural character voice blurbs upon message delivery.
 */

import { PunctuationParser } from '../game/audio/PunctuationParser.js';
import { VoiceSynthEngine } from '../game/audio/VoiceSynthEngine.js';
import { CrowdVoiceManager } from '../game/audio/CrowdVoiceManager.js';
import { getPreset, sanitizeProfile } from '../game/audio/VoiceProfilePresets.js';

export class VoiceChatAdapter {
    /**
     * @param {Object|null} [chatSystem=null] Reference to central ChatSystem coordinator
     */
    constructor(chatSystem = null) {
        /** @type {Object|null} */
        this.chatSystem = chatSystem;

        /** @type {PunctuationParser} */
        this.parser = new PunctuationParser();
        /** @type {VoiceSynthEngine} */
        this.synth = new VoiceSynthEngine();
        /** @type {CrowdVoiceManager} */
        this.crowdManager = new CrowdVoiceManager();
    }

    /**
     * Processes inbound chat message payloads from Socket.IO network broadcasts.
     * Evaluates spatial positioning, punctuation inflections, and polyphony caps before triggering voice synthesis.
     * 
     * @param {Array<Object>|Object} data - Raw inbound chat message or array of messages
     * @param {{ x: number, y: number }} [listenerPosOverride=null] - Optional listener position for testing
     * @returns {Array<Object>} List of processing summary objects per message
     */
    processIncomingMessages(data, listenerPosOverride = null) {
        if (!data) return [];
        const messages = Array.isArray(data) ? data : [data];
        const results = [];

        // Determine listener position (from game scene player or override or fallback)
        const listenerPos = listenerPosOverride || this._getListenerPosition();

        for (const msg of messages) {
            if (!msg) continue;

            const res = this._processSingleMessage(msg, listenerPos);
            results.push(res);
        }

        return results;
    }

    /**
     * Evaluates and synthesizes voice for a single chat message object.
     * 
     * @private
     * @param {Object} msg 
     * @param {{ x: number, y: number }} listenerPos 
     * @returns {Object} Processing summary
     */
    _processSingleMessage(msg, listenerPos) {
        // Deduplicate ghost message confirmation to prevent double playback
        if (msg.clientMsgId) {
            if (this.playedClientMsgIds && this.playedClientMsgIds.has(msg.clientMsgId)) {
                return { handled: false, reason: 'duplicate_client_msg' };
            }
            if (!this.playedClientMsgIds) this.playedClientMsgIds = new Set();
            this.playedClientMsgIds.add(msg.clientMsgId);
            if (this.playedClientMsgIds.size > 50) {
                const first = this.playedClientMsgIds.keys().next().value;
                this.playedClientMsgIds.delete(first);
            }
        }

        let rawContent = '';
        if (typeof msg.content === 'string') {
            rawContent = msg.content;
        } else if (Array.isArray(msg.message) && msg.message.length > 0) {
            const latest = msg.message[msg.message.length - 1];
            rawContent = (latest && typeof latest.content === 'string') ? latest.content : (typeof latest === 'string' ? latest : '');
        } else if (typeof msg.message === 'string') {
            rawContent = msg.message;
        }

        // Strip HTML tags (e.g. <p>, <br>, <b>) to extract plain text string
        const content = rawContent.replace(/<[^>]*>/g, '').trim();
        if (!content) {
            return { handled: false, reason: 'empty_content' };
        }

        // Enforce 15-second age cutoff threshold for live voice playback
        const rawTime = msg.timestamp || msg.createdAt || msg.time || msg.date;
        if (rawTime) {
            const msgTimeMs = new Date(rawTime).getTime();
            if (!isNaN(msgTimeMs)) {
                const ageMs = Date.now() - msgTimeMs;
                if (ageMs > 15000) {
                    return { handled: false, reason: 'message_too_old', ageMs };
                }
            }
        }

        // Filter out System, Environmental, OOC, and non-character messages
        const senderName = String(msg.name || msg.sender || '').toLowerCase();
        const msgType = String(msg.type || '').toLowerCase();
        const rawIdent = msg.identifier;
        let speakerId = 'unknown';
        if (typeof rawIdent === 'string') {
            speakerId = rawIdent;
        } else if (rawIdent && typeof rawIdent === 'object') {
            speakerId = String(rawIdent.character || rawIdent.account || 'unknown');
        } else if (msg.charId) {
            speakerId = String(msg.charId);
        } else if (msg.senderId) {
            speakerId = String(msg.senderId);
        }

        if (
            senderName === 'system' ||
            senderName === 'environment' ||
            msgType === 'system' ||
            msgType === 'environmental' ||
            msgType === 'ooc' ||
            speakerId.toLowerCase() === 'system' ||
            speakerId.toLowerCase() === 'environment'
        ) {
            return { handled: false, reason: 'system_message' };
        }

        const myId = typeof window !== 'undefined' && window.localPlayerInfo ? (window.localPlayerInfo._id || window.localPlayerInfo.charId) : null;
        const isMe = Boolean(myId && (speakerId === myId || String(speakerId) === String(myId)));

        // Determine speaker and listener positions with safeguards for initial login
        let speakerPos = msg.position || (msg.x !== undefined && msg.y !== undefined ? { x: Number(msg.x), y: Number(msg.y) } : null);
        let effectiveListenerPos = listenerPos;

        if (!effectiveListenerPos) {
            effectiveListenerPos = speakerPos || { x: 0, y: 0 };
        }
        if (!speakerPos) {
            speakerPos = effectiveListenerPos;
        }

        // If local player is speaking on initial login before camera/listener is tracked, evaluate at distance 0
        if (isMe && (!listenerPos || (listenerPos.x === 0 && listenerPos.y === 0 && typeof window !== 'undefined' && (!window.gameScene || !window.gameScene.player)))) {
            effectiveListenerPos = speakerPos;
        }

        // Extract optional emote prefix (e.g. /laugh, /blush, /playful)
        let emotePrefix = '';
        let cleanedContent = content;
        if (content.startsWith('/')) {
            const parts = content.split(' ');
            emotePrefix = parts[0];
            cleanedContent = parts.slice(1).join(' ');
        }

        // 1. Parse dialogue quotes & punctuation inflections
        const parsed = this.parser.parseMessage(cleanedContent || content);

        // If message contains no spoken dialogue (e.g. pure action *gives a hug*), skip vocal audio
        if (!parsed.hasDialogue) {
            return { handled: false, reason: 'no_dialogue', isPureAction: parsed.isPureAction };
        }

        // 2. Evaluate 3-Zone Spatial Attenuation & Priority
        const activeTargetId = typeof window !== 'undefined' ? window.activeTargetId : null;
        const isTarget = Boolean(msg.isTarget || (activeTargetId && activeTargetId === speakerId) || isMe);
        const spatialEval = this.crowdManager.evaluateSpatialVoice(speakerPos, effectiveListenerPos, {
            isTarget,
            hasDialogue: true
        });

        // If speaker is in Zone 3 (> 6 tiles away), hard mute (visual text bubble only)
        if (spatialEval.isMuted) {
            return { handled: false, reason: 'spatial_muted', dTiles: spatialEval.dTiles };
        }

        // 3. Request Polyphony Slot (Max 3 active voices client-wide)
        const voiceId = `voice_${speakerId}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const estimatedDuration = Math.max(1.0, Math.min(2.5, parsed.clauses.length * 0.8));
        const nowSec = (this.synth.ctx ? this.synth.ctx.currentTime : Date.now() / 1000.0);
        const isZone1 = (spatialEval.zone === 1);

        const slotReq = this.crowdManager.requestVoiceSlot(
            voiceId,
            speakerId,
            spatialEval.priorityScore,
            estimatedDuration,
            nowSec,
            isZone1
        );

        if (!slotReq.allowed) {
            return { handled: false, reason: 'polyphony_capped', priorityScore: spatialEval.priorityScore };
        }

        // 4. Retrieve Character Voice Profile & Apply Emote Overrides
        let rawProfile = msg.voiceProfile || msg.senderProfile?.voiceProfile;

        if (!rawProfile && typeof window !== 'undefined') {
            if (isMe) {
                rawProfile = window.localPlayerInfo?.voiceProfile;
            } else if (window.gameScene && window.gameScene.otherPlayersMap) {
                const otherPlayer = window.gameScene.otherPlayersMap.get(speakerId);
                rawProfile = otherPlayer?.playerInfo?.voiceProfile || otherPlayer?.voiceProfile;
            }
        }

        const profile = sanitizeProfile(rawProfile || getPreset('tavern_chirper'));

        // Apply emote overrides if present
        const prefix = String(emotePrefix).toLowerCase();
        if (prefix === '/sing') {
            profile.musicalScale = true;
            profile.glissando = true;
            profile.basePitch *= 1.15;
        } else if (prefix === '/grumpy' || prefix === '/angry') {
            profile.quantizePitch = true;
            profile.basePitch *= 0.80;
            profile.syllableRate *= 0.85;
        } else if (prefix === '/laugh') {
            profile.basePitch *= 1.30;
            profile.syllableRate *= 1.40;
            profile.pitchVariance = Math.min(0.5, profile.pitchVariance * 1.8);
        } else if (prefix === '/blush') {
            profile.basePitch *= 1.15;
            profile.syllableRate *= 0.75;
            profile.lowPassCutoffHz = Math.max(500, Math.round(profile.lowPassCutoffHz * 0.7));
        } else if (prefix === '/playful' || prefix === '/silly') {
            profile.vibrato = true;
            profile.basePitch *= 1.20;
            profile.pitchVariance = Math.min(0.5, profile.pitchVariance * 1.8);
        } else if (prefix === '/whisper') {
            profile.lowPassCutoffHz = 800;
            profile.volumeModifier = 0.60;
            profile.syllableRate *= 0.85;
        }

        // Apply spatial low-pass muffling from Zone 2
        profile.lowPassCutoffHz = Math.min(profile.lowPassCutoffHz, spatialEval.filterCutoffHz);

        // 5. Synthesize Procedural Speech Blurb
        const blurb = this.synth.synthesizeBlurb(parsed, profile);

        return {
            handled: true,
            voiceId,
            speakerId,
            blurb,
            spatialEval,
            evictedVoiceId: slotReq.evictedVoiceId
        };
    }

    /**
     * Helper to retrieve active listener/camera position from Phaser game scene.
     * @private
     * @returns {{ x: number, y: number }}
     */
    _getListenerPosition() {
        if (typeof window !== 'undefined' && window.gameScene && window.gameScene.player) {
            return {
                x: Number(window.gameScene.player.x || 0),
                y: Number(window.gameScene.player.y || 0)
            };
        }
        return { x: 0, y: 0 };
    }
}

if (typeof window !== 'undefined') {
    window.VoiceChatAdapter = VoiceChatAdapter;
}
