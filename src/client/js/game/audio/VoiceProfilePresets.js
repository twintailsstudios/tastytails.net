/**
 * @fileoverview Voice Profile Presets & Sanitizer for TastyTails.net
 * 
 * @description
 * Defines pre-configured character voice profile templates (e.g. Cute & Fluffy, Gruff & Deep,
 * Squeaky Sprite, Digital Synth, Muffled Murmur) and provides safety bounds clamping.
 */

export const VOICE_PRESETS = {
    fem_low: {
        key: 'fem_low',
        name: 'Feminine - Low',
        group: 'Feminine',
        basePitch: 1.35,
        pitchVariance: 0.15,
        syllableRate: 8.5,
        legatoOverlap: 0.02,
        lowPassCutoffHz: 3500,
        oscillatorType: 'triangle'
    },
    fem_mid: {
        key: 'fem_mid',
        name: 'Feminine - Medium',
        group: 'Feminine',
        basePitch: 1.65,
        pitchVariance: 0.20,
        syllableRate: 9.5,
        legatoOverlap: 0.02,
        lowPassCutoffHz: 4500,
        oscillatorType: 'triangle'
    },
    fem_high: {
        key: 'fem_high',
        name: 'Feminine - High',
        group: 'Feminine',
        basePitch: 2.00,
        pitchVariance: 0.25,
        syllableRate: 10.5,
        legatoOverlap: 0.025,
        lowPassCutoffHz: 5500,
        oscillatorType: 'sine'
    },
    masc_low: {
        key: 'masc_low',
        name: 'Masculine - Low',
        group: 'Masculine',
        basePitch: 1.00,
        pitchVariance: 0.10,
        syllableRate: 7.0,
        legatoOverlap: 0.02,
        lowPassCutoffHz: 2200,
        oscillatorType: 'sawtooth'
    },
    masc_mid: {
        key: 'masc_mid',
        name: 'Masculine - Medium',
        group: 'Masculine',
        basePitch: 1.20,
        pitchVariance: 0.12,
        syllableRate: 8.5,
        legatoOverlap: 0.02,
        lowPassCutoffHz: 3200,
        oscillatorType: 'triangle'
    },
    masc_high: {
        key: 'masc_high',
        name: 'Masculine - High',
        group: 'Masculine',
        basePitch: 1.45,
        pitchVariance: 0.18,
        syllableRate: 9.5,
        legatoOverlap: 0.02,
        lowPassCutoffHz: 4000,
        oscillatorType: 'triangle'
    }
};

const LEGACY_PRESET_MAP = {
    cute_fluffy: 'fem_mid',
    tavern_chirper: 'fem_mid',
    gruff_hunter: 'masc_low',
    stout_adventurer: 'masc_low',
    squeaky_sprite: 'fem_high',
    squeaky_scout: 'fem_high',
    smooth_chiptune: 'masc_mid',
    bardic_minstrel: 'masc_mid',
    muffled_mystery: 'masc_low',
    hooded_wanderer: 'masc_low'
};

/**
 * Retrieves a preset voice profile by key, falling back to 'fem_mid' if invalid.
 * Supports backward-compatibility for legacy preset keys.
 * 
 * @param {string} key 
 * @returns {Object}
 */
export function getPreset(key) {
    let k = String(key || '').toLowerCase();
    if (LEGACY_PRESET_MAP[k]) {
        k = LEGACY_PRESET_MAP[k];
    }
    const preset = VOICE_PRESETS[k] || VOICE_PRESETS.fem_mid;
    return Object.assign({}, preset);
}

/**
 * Returns a randomly selected voice preset template.
 * 
 * @returns {Object}
 */
export function getRandomPreset() {
    const keys = Object.keys(VOICE_PRESETS);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    return getPreset(randomKey);
}

/**
 * Returns a list of all registered voice presets for UI dropdowns.
 * 
 * @returns {Array<{ key: string, name: string, profile: Object }>}
 */
export function getAllPresets() {
    return Object.keys(VOICE_PRESETS).map(key => ({
        key,
        name: VOICE_PRESETS[key].name,
        profile: Object.assign({}, VOICE_PRESETS[key])
    }));
}

/**
 * Sanitizes and clamps voice profile properties within valid audio engine bounds.
 * 
 * @param {Object} [raw={}] 
 * @returns {{
 *   basePitch: number,
 *   pitchVariance: number,
 *   syllableRate: number,
 *   lowPassCutoffHz: number,
 *   oscillatorType: string
 * }} Clamped and sanitized profile
 */
export function sanitizeProfile(raw = {}) {
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch (e) {
            raw = {};
        }
    }
    if (!raw || typeof raw !== 'object') {
        raw = {};
    }

    const validOscillators = ['triangle', 'sine', 'sawtooth', 'square'];

    const basePitch = Math.max(1.00, Math.min(2.20, Number(raw.basePitch !== undefined ? raw.basePitch : raw.pitch) || 1.35));
    const pitchVariance = Math.max(0.05, Math.min(0.30, Number(raw.pitchVariance !== undefined ? raw.pitchVariance : raw.variance) || 0.15));
    const syllableRate = Math.max(6.5, Math.min(11.5, Number(raw.syllableRate !== undefined ? raw.syllableRate : raw.rate) || 9.5));
    const lowPassCutoffHz = Math.max(1000, Math.min(6000, Math.round(Number(raw.lowPassCutoffHz !== undefined ? raw.lowPassCutoffHz : raw.muffle) || 4000)));
    const legatoOverlap = Math.max(0.01, Math.min(0.035, Number(raw.legatoOverlap !== undefined ? raw.legatoOverlap : raw.legato) || 0.02));

    let oscillatorType = String(raw.oscillatorType || raw.timbre || 'triangle').toLowerCase();
    if (!validOscillators.includes(oscillatorType)) {
        oscillatorType = 'triangle';
    }

    return {
        basePitch: Number(basePitch.toFixed(2)),
        pitchVariance: Number(pitchVariance.toFixed(2)),
        syllableRate: Number(syllableRate.toFixed(1)),
        lowPassCutoffHz,
        legatoOverlap: Number(legatoOverlap.toFixed(3)),
        oscillatorType
    };
}

if (typeof window !== 'undefined') {
    window.VoiceProfilePresets = { getPreset, getAllPresets, getRandomPreset, sanitizeProfile, VOICE_PRESETS };
}
