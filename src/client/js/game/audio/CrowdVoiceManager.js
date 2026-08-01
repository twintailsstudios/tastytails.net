/**
 * @fileoverview Spatial Crowd Control & Polyphony Manager for TastyTails.net
 * 
 * @description
 * Solves the "Noisy Room Problem" in crowded RP spaces by enforcing 3-Zone Spatial Attenuation,
 * a Polyphony Hard Cap (max 3 active voices), Priority Queue scoring, Voice Stealing,
 * and Dynamic Audio Ducking.
 */

export class CrowdVoiceManager {
    constructor() {
        /** @type {number} World grid tile size in pixels */
        this.tileSize = 32;

        // 3-Zone Distance Boundaries (in tile units)
        /** @type {number} Zone 1 Focus radius boundary in tiles (0 - 3 tiles) */
        this.zone1MaxTiles = 3.0;
        /** @type {number} Zone 2 Muffled radius boundary in tiles (3 - 6 tiles) */
        this.zone2MaxTiles = 6.0;

        // Polyphony & Priority Limits
        /** @type {number} Maximum concurrent active playing voice blurbs */
        this.maxPolyphony = 3;
        /** @type {boolean} User preference toggle: only allow voice audio from targeted characters */
        this.targetOnlyMode = false;
        /** @type {number} Background audio ducking gain factor (0.5 = -6dB) when Zone 1 voice is active */
        this.duckingGain = 0.5;

        /** @type {Array<{ voiceId: string, speakerId: string, priorityScore: number, startTimeSec: number, endTimeSec: number, isZone1: boolean }>} Currently active playing voice slots */
        this.activeVoices = [];

        // OPTIMIZATION: Zero-GC pre-allocated evaluation result object reference
        this._evalResult = {
            isMuted: false,
            gain: 1.0,
            filterCutoffHz: 4000,
            zone: 1,
            priorityScore: 1.0,
            dTiles: 0.0
        };
    }

    /**
     * Evaluates 3-Zone spatial attenuation, low-pass filter muffling, and priority score for a speaker position.
     * 
     * @param {{ x: number, y: number }} speakerPos - World coordinate of speaking character
     * @param {{ x: number, y: number }} listenerPos - World coordinate of listener / camera focus
     * @param {{ isTarget?: boolean, hasDialogue?: boolean }} [options={}] - Contextual flags
     * @returns {{
     *   isMuted: boolean,
     *   gain: number,
     *   filterCutoffHz: number,
     *   zone: number,
     *   priorityScore: number,
     *   dTiles: number
     * }} Pooled evaluation result reference
     */
    evaluateSpatialVoice(speakerPos, listenerPos, options = {}) {
        const sx = Number(speakerPos?.x || 0);
        const sy = Number(speakerPos?.y || 0);
        const lx = Number(listenerPos?.x || 0);
        const ly = Number(listenerPos?.y || 0);

        const isTarget = Boolean(options.isTarget);
        const hasDialogue = options.hasDialogue !== undefined ? Boolean(options.hasDialogue) : true;

        // Calculate distance in pixels and convert to tiles
        const dx = sx - lx;
        const dy = sy - ly;
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const dTiles = distPx / this.tileSize;

        // User Preference Gate: Mute all non-targeted voices if targetOnlyMode is active
        if (this.targetOnlyMode && !isTarget) {
            this._evalResult.isMuted = true;
            this._evalResult.gain = 0.0;
            this._evalResult.filterCutoffHz = 800;
            this._evalResult.zone = 3;
            this._evalResult.priorityScore = 0.0;
            this._evalResult.dTiles = Number(dTiles.toFixed(2));
            return this._evalResult;
        }

        let zone = 1;
        let gain = 1.0;
        let filterCutoffHz = 4000;
        let isMuted = false;

        if (dTiles > this.zone2MaxTiles) {
            // Zone 3: Hard Mute Cutoff (> 6 Tiles)
            zone = 3;
            gain = 0.0;
            filterCutoffHz = 800;
            isMuted = true;
        } else if (dTiles <= this.zone1MaxTiles) {
            // Zone 1: Focus Radius (0 - 3 Tiles)
            zone = 1;
            gain = 1.0;
            filterCutoffHz = 4000;
            isMuted = false;
        } else {
            // Zone 2: Muffled Proximity Radius (3 - 6 Tiles)
            zone = 2;
            isMuted = false;
            const ratio = (dTiles - this.zone1MaxTiles) / (this.zone2MaxTiles - this.zone1MaxTiles);
            // Exponential gain attenuation from 1.0 down to 0.2
            gain = Math.max(0.2, 1.0 - Math.pow(ratio, 1.5) * 0.8);
            // Low-pass filter frequency drops from 4000Hz down to 800Hz
            filterCutoffHz = Math.round(4000 - ratio * 3200);
        }

        // Priority Score Formula: P = (1 / (d + 0.1)) * (isTarget ? 2.0 : 1.0) * (hasDialogue ? 1.5 : 1.0)
        let priorityScore = (1.0 / (dTiles + 0.1));
        if (isTarget) priorityScore *= 2.0;
        if (hasDialogue) priorityScore *= 1.5;

        // Populate pre-allocated evaluation result buffer
        this._evalResult.isMuted = isMuted;
        this._evalResult.gain = Number(gain.toFixed(3));
        this._evalResult.filterCutoffHz = filterCutoffHz;
        this._evalResult.zone = zone;
        this._evalResult.priorityScore = Number(priorityScore.toFixed(3));
        this._evalResult.dTiles = Number(dTiles.toFixed(2));

        return this._evalResult;
    }

    /**
     * Requests a polyphony playback slot for an incoming speech blurb.
     * Enforces the hard polyphony cap and handles voice stealing for higher-priority candidates.
     * 
     * @param {string} voiceId - Unique blurb execution identifier
     * @param {string} speakerId - Identifier of speaking character
     * @param {number} priorityScore - Candidate voice priority score
     * @param {number} durationSec - Blurb audio duration in seconds
     * @param {number} [nowSec=0] - Current timestamp in seconds
     * @param {boolean} [isZone1=false] - Whether speaker is in Zone 1
     * @returns {{ allowed: boolean, evictedVoiceId: string|null }}
     */
    requestVoiceSlot(voiceId, speakerId, priorityScore, durationSec, nowSec = 0, isZone1 = false) {
        // 1. Prune expired active voices
        this.pruneActiveVoices(nowSec);

        // 2. If below maxPolyphony cap, grant slot immediately
        if (this.activeVoices.length < this.maxPolyphony) {
            this.activeVoices.push({
                voiceId,
                speakerId,
                priorityScore,
                startTimeSec: nowSec,
                endTimeSec: nowSec + durationSec,
                isZone1: Boolean(isZone1)
            });

            return { allowed: true, evictedVoiceId: null };
        }

        // 3. At maxPolyphony cap: Find lowest-priority active voice for potential voice stealing
        let lowestIndex = -1;
        let lowestScore = Infinity;

        for (let i = 0; i < this.activeVoices.length; i++) {
            if (this.activeVoices[i].priorityScore < lowestScore) {
                lowestScore = this.activeVoices[i].priorityScore;
                lowestIndex = i;
            }
        }

        // If incoming voice has a higher priority than lowest active voice, steal the slot
        if (lowestIndex !== -1 && priorityScore > lowestScore) {
            const evicted = this.activeVoices[lowestIndex];
            this.activeVoices.splice(lowestIndex, 1);

            this.activeVoices.push({
                voiceId,
                speakerId,
                priorityScore,
                startTimeSec: nowSec,
                endTimeSec: nowSec + durationSec,
                isZone1: Boolean(isZone1)
            });

            return { allowed: true, evictedVoiceId: evicted.voiceId };
        }

        // Polyphony cap reached and priority was lower -> drop incoming voice
        return { allowed: false, evictedVoiceId: null };
    }

    /**
     * Removes expired voice blurb records from active tracking array.
     * 
     * @param {number} [nowSec=0] - Current timestamp in seconds
     */
    pruneActiveVoices(nowSec = 0) {
        if (nowSec <= 0) return;
        this.activeVoices = this.activeVoices.filter(v => v.endTimeSec > nowSec);
    }

    /**
     * Calculates the active background audio ducking gain factor (0.5 = -6dB if Zone 1 voice is active, 1.0 otherwise).
     * 
     * @param {number} [nowSec=0] - Current timestamp in seconds
     * @returns {number} Audio gain multiplier for background music/chatter
     */
    getDuckingFactor(nowSec = 0) {
        this.pruneActiveVoices(nowSec);
        const hasZone1Voice = this.activeVoices.some(v => v.isZone1);
        return hasZone1Voice ? this.duckingGain : 1.0;
    }
}
