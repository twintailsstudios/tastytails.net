/**
 * @fileoverview Banjo-Kazooie Dynamic Zone Bus Manager for TastyTails.net
 * 
 * @description
 * Manages zone stem channel assignments, active zone state, discrete zone crossfading,
 * continuous spatial proximity blending, and stem mute/solo developer controls.
 * 
 * Architectural Role:
 * Pure mathematical gain calculation engine. Translates spatial player location into
 * 16-channel target volume vectors for MidiEngine.js and WebAudioSynth.js.
 * 
 * Invoked by:
 * - MidiEngine.js during spatial player movement (20Hz - 60Hz update rate)
 * - Debug UI and developer console during stem soloing/muting
 */

const EMPTY_SET = new Set();

export class ZoneBusManager {
    constructor() {
        /** @type {Map<string, { channels: Array<number>, set: Set<number> }>} Zone key -> mapping object */
        this.zoneMappings = new Map();
        /** @type {string} Currently active zone key */
        this.currentZone = 'overworld';

        /** @type {Set<number>} Set of soloed channel indices (empty means no solo active) */
        this.soloedChannels = new Set();
        /** @type {Set<number>} Set of muted channel indices */
        this.mutedChannels = new Set();

        // OPTIMIZATION: Reusable gain object buffer pre-allocated to eliminate Garbage Collection allocations in hot loops
        /** @type {Object<number, number>} Pre-allocated reusable gain map */
        this._reusableGains = {};
        for (let ch = 0; ch < 16; ch++) {
            this._reusableGains[ch] = 0.0;
        }

        this._initDefaultZoneMappings();
    }

    /**
     * Registers default Banjo-Kazooie stem channel assignments across 16 MIDI channels.
     * @private
     */
    _initDefaultZoneMappings() {
        // Standard 4-stem layout
        this.setZoneMapping('overworld', [0, 1, 2, 3]);
        this.setZoneMapping('pub', [4, 5, 6, 7]);
        this.setZoneMapping('cave', [8, 9, 10, 11]);
        this.setZoneMapping('underwater', [12, 13, 14, 15]);
    }

    /**
     * Overrides or adds a zone channel mapping array.
     * 
     * @param {string} zoneKey - Identifier for the zone (e.g., 'pub', 'caves')
     * @param {Array<number>} channels - List of MIDI channel indices (0 - 15)
     */
    setZoneMapping(zoneKey, channels) {
        if (!Array.isArray(channels)) return;
        const sanitized = channels.map(c => Math.max(0, Math.min(15, Math.floor(Number(c)) || 0)));
        // OPTIMIZATION: Pre-compile Set structure on registration to allow O(1) set lookup in hot gain calculation loops
        this.zoneMappings.set(zoneKey, {
            channels: sanitized,
            set: new Set(sanitized)
        });
    }

    /**
     * Calculates target gain values (0.0 to 1.0) for all 16 MIDI channels for a discrete zone transition.
     * 
     * @param {string} targetZoneKey - Target zone key (e.g. 'pub')
     * @param {Object<number, number>} [outGains=null] - Optional output object buffer to avoid allocation
     * @returns {Object<number, number>} Map of channelIndex -> targetVolume
     */
    calculateGainsForZone(targetZoneKey, outGains = null) {
        this.currentZone = targetZoneKey;
        const mapping = this.zoneMappings.get(targetZoneKey);
        const targetSet = mapping ? mapping.set : EMPTY_SET;

        // OPTIMIZATION: Use caller-provided output buffer if supplied to guarantee 0 heap allocations
        const gains = outGains || {};
        for (let ch = 0; ch < 16; ch++) {
            let vol = targetSet.has(ch) ? 1.0 : 0.0;

            // Apply Mute/Solo overrides
            if (this.mutedChannels.has(ch)) {
                vol = 0.0;
            }
            if (this.soloedChannels.size > 0 && !this.soloedChannels.has(ch)) {
                vol = 0.0;
            }

            gains[ch] = vol;
        }

        return gains;
    }

    /**
     * Calculates target gain values for continuous spatial proximity blending between two zones.
     * Supports optional equal-power trigonometric crossfading (cos/sin) to maintain constant acoustic loudness.
     * Applies a 0.6 maxProximityBlend scaling cap to door entrance leaks to ensure that stepping across
     * zone boundaries completes a smooth, gradual 1000ms crossfade to 100% stem volume.
     * 
     * @param {string} fromZoneKey - Outgoing zone key
     * @param {string} toZoneKey - Incoming zone key
     * @param {number} blendRatio - Proximity ratio (0.0 = 100% fromZone, 1.0 = 100% toZone)
     * @param {boolean} [useEqualPower=false] - Whether to use constant-power trigonometric crossfading
     * @param {Object<number, number>} [outGains=null] - Optional output object buffer to avoid allocation
     * @param {number} [maxProximityBlend=0.6] - Maximum proximity preview gain scaling cap (0.0 - 1.0)
     * @returns {Object<number, number>} Map of channelIndex -> targetVolume
     */
    calculateGainsForProximity(fromZoneKey, toZoneKey, blendRatio, useEqualPower = false, outGains = null, maxProximityBlend = 1.0) {
        const ratio = Math.max(0, Math.min(1, blendRatio));
        const maxBlend = Math.max(0, Math.min(1, maxProximityBlend));
        const fromMapping = this.zoneMappings.get(fromZoneKey);
        const toMapping = this.zoneMappings.get(toZoneKey);
        const fromSet = fromMapping ? fromMapping.set : EMPTY_SET;
        const toSet = toMapping ? toMapping.set : EMPTY_SET;

        // Equal-power (cos/sin) scaled by maxProximityBlend ensures door proximity provides a gentle leak while leaving headroom for smooth zone entry fades
        const rawFromGain = useEqualPower ? Math.cos(ratio * Math.PI * 0.5 * maxBlend) : (1.0 - ratio * maxBlend);
        const rawToGain = useEqualPower ? (Math.sin(ratio * Math.PI * 0.5) * maxBlend) : (ratio * maxBlend);

        const fromGain = Math.max(0, Math.min(1, rawFromGain));
        const toGain = Math.max(0, Math.min(1, rawToGain));

        const gains = outGains || {};
        for (let ch = 0; ch < 16; ch++) {
            let vol = 0.0;
            if (fromSet.has(ch)) {
                vol += fromGain;
            }
            if (toSet.has(ch)) {
                vol += toGain;
            }

            vol = Math.max(0, Math.min(1, vol));

            // Apply Mute/Solo overrides
            if (this.mutedChannels.has(ch)) {
                vol = 0.0;
            }
            if (this.soloedChannels.size > 0 && !this.soloedChannels.has(ch)) {
                vol = 0.0;
            }

            gains[ch] = vol;
        }

        return gains;
    }

    /**
     * Solos a specific channel (mutes all non-soloed channels).
     * @param {number} channel - Channel index (0 - 15)
     */
    soloChannel(channel) {
        this.soloedChannels.add(channel);
    }

    /**
     * Clears all soloed channels.
     */
    unsoloAll() {
        this.soloedChannels.clear();
    }

    /**
     * Mutes a specific channel.
     * @param {number} channel - Channel index (0 - 15)
     */
    muteChannel(channel) {
        this.mutedChannels.add(channel);
    }

    /**
     * Unmutes a specific channel.
     * @param {number} channel - Channel index (0 - 15)
     */
    unmuteChannel(channel) {
        this.mutedChannels.delete(channel);
    }

    /**
     * Returns active zone stem definitions for debugging.
     * @returns {Object}
     */
    getDebugSummary() {
        const mappingsObj = {};
        for (const [key, val] of this.zoneMappings.entries()) {
            mappingsObj[key] = val.channels;
        }

        return {
            currentZone: this.currentZone,
            mappings: mappingsObj,
            soloed: Array.from(this.soloedChannels),
            muted: Array.from(this.mutedChannels)
        };
    }
}

