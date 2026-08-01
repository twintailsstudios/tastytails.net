/**
 * @fileoverview Phoneme Audio Asset Preloader & Buffer Cache for TastyTails.net
 * 
 * @description
 * Asynchronously preloads all 32 pre-recorded Animalese phoneme WAV files from /assets/vocals/
 * into Web Audio AudioBuffers upon game client initialization. Provides synchronous buffer retrieval
 * for VoiceSynthEngine.js.
 */

export const PHONEME_KEYS = [
    'a', 'b', 'c', 'ch', 'd', 'dot', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
    'm', 'n', 'o', 'p', 'ph', 'q', 'r', 's', 'sh', 't', 'th', 'u', 'v', 'w',
    'wh', 'x', 'y', 'z'
];

export class PhonemeLoader {
    constructor() {
        /** @type {Map<string, AudioBuffer>} */
        this.cache = new Map();
        /** @type {boolean} */
        this.isLoaded = false;
        /** @type {boolean} */
        this.isLoading = false;
        /** @type {Promise<boolean>|null} */
        this.loadPromise = null;
    }

    /**
     * Preloads and decodes all phoneme WAV files into Web Audio AudioBuffers.
     * 
     * @param {AudioContext} [audioContext=null] 
     * @returns {Promise<boolean>} True if preloading completed successfully
     */
    async preloadAll(audioContext = null) {
        if (this.isLoaded) return true;
        if (this.isLoading && this.loadPromise) return this.loadPromise;

        const ctx = audioContext || (typeof window !== 'undefined' ? (window.audioCtx || window.midiEngine?.synth?.ctx) : null);
        if (!ctx) {
            console.warn('[PhonemeLoader] AudioContext not available for preloading phonemes.');
            return false;
        }

        this.isLoading = true;

        this.loadPromise = (async () => {
            const fetchPromises = PHONEME_KEYS.map(async (key) => {
                try {
                    const response = await fetch(`/assets/vocals/${key}.wav`);
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status} loading /assets/vocals/${key}.wav`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
                    this.cache.set(key, audioBuffer);
                } catch (err) {
                    console.warn(`[PhonemeLoader] Failed to load phoneme '${key}':`, err);
                }
            });

            await Promise.all(fetchPromises);
            this.isLoaded = true;
            this.isLoading = false;
            return true;
        })();

        return this.loadPromise;
    }

    /**
     * Synchronously retrieves a cached AudioBuffer by phoneme key, with fallback to default vowel 'a'.
     * 
     * @param {string} key 
     * @returns {AudioBuffer|null}
     */
    getBuffer(key) {
        const k = String(key || '').toLowerCase().trim();
        if (this.cache.has(k)) {
            return this.cache.get(k);
        }
        // Fallback to default vowel buffer 'a' or 'o'
        if (this.cache.has('a')) return this.cache.get('a');
        if (this.cache.has('o')) return this.cache.get('o');
        return null;
    }

    /**
     * Helper to check if a phoneme key exists in the loaded cache.
     * 
     * @param {string} key 
     * @returns {boolean}
     */
    hasBuffer(key) {
        return this.cache.has(String(key || '').toLowerCase().trim());
    }
}

export const phonemeLoader = new PhonemeLoader();

if (typeof window !== 'undefined') {
    window.PhonemeLoader = PhonemeLoader;
    window.phonemeLoader = phonemeLoader;
}
