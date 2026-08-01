import { phonemeLoader } from './PhonemeLoader.js';

export class VoiceSynthEngine {
    /**
     * @param {AudioContext|null} [audioContext=null] Optional existing AudioContext instance
     */
    constructor(audioContext = null) {
        /** @type {AudioContext|null} */
        this.ctx = audioContext;

        /** @type {Object} Default baseline voice profile settings */
        this.defaultProfile = {
            basePitch: 1.0,
            pitchVariance: 0.15,
            syllableRate: 7.0,      // Syllables per second
            syllableGap: 0.02,      // Syllable gap in seconds
            legatoOverlap: 0.02,    // Crossfade overlap in seconds
            lowPassCutoffHz: 4000,
            highPassCutoffHz: 150,
            oscillatorType: 'triangle', // 'sine', 'triangle', 'sawtooth', 'square'
            vibratoDepth: 0.05,
            vibratoSpeed: 6.0
        };

        this._initAudioContextIfNeeded();
    }

    /**
     * Ensures AudioContext is available and triggers background preloading of phonemes.
     * @private
     */
    _initAudioContextIfNeeded() {
        if (!this.ctx && typeof window !== 'undefined') {
            if (window.midiEngine?.synth?.ctx) {
                this.ctx = window.midiEngine.synth.ctx;
            } else if (window.audioCtx) {
                this.ctx = window.audioCtx;
            } else {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) {
                    try {
                        this.ctx = new AudioCtx();
                    } catch (e) {
                        this.ctx = null;
                    }
                }
            }
        }

        if (this.ctx && typeof window !== 'undefined') {
            phonemeLoader.preloadAll(this.ctx).catch(() => {});

            if (!this._gestureListenerAttached) {
                this._gestureListenerAttached = true;
                const unlockAudio = () => {
                    if (this.ctx && this.ctx.state === 'suspended') {
                        this.ctx.resume().catch(() => {});
                    }
                    phonemeLoader.preloadAll(this.ctx).catch(() => {});
                };
                ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
                    window.addEventListener(evt, unlockAudio, { capture: true, passive: true });
                });
            }
        }
    }

    /**
     * Synthesizes a procedural speech blurb from a parsed message object and voice profile.
     * 
     * @param {Object} parsedMessage - Result object from PunctuationParser.parseMessage()
     * @param {Object} [profileOverrides={}] - Character custom voice profile settings
     * @param {ArrayBuffer|AudioBuffer} [sampleBuffer=null] - Optional audio buffer override
     * @returns {{
     *   scheduledCount: number,
     *   durationSec: number,
     *   startTimeSec: number,
     *   endTimeSec: number
     * }|null} Speech blurb metadata or null if no dialogue to synthesize
     */
    synthesizeBlurb(parsedMessage, profileOverrides = {}, sampleBuffer = null) {
        if (!parsedMessage || !parsedMessage.hasDialogue || !parsedMessage.clauses || parsedMessage.clauses.length === 0) {
            return null;
        }

        this._initAudioContextIfNeeded();

        // Auto-resume AudioContext if suspended by browser autoplay policy
        if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
            this.ctx.resume().catch(() => {});
        }

        const profile = Object.assign({}, this.defaultProfile, profileOverrides);
        const startTime = this.ctx ? this.ctx.currentTime : 0;
        let currentTimeCursor = startTime;
        let scheduledCount = 0;

        // Continuous Portamento Pitch Cursor across sentence phrase
        let phrasePitchCursor = profile.basePitch;
        const highVowels = ['e', 'i', 'y', 'ee'];
        const backVowels = ['o', 'u'];
        const allVowels = ['a', 'e', 'i', 'o', 'u', 'y', 'ee'];

        const MAX_PHONEMES = 20;
        const MAX_DURATION_SEC = 2.5;
        let capReached = false;

        for (const clause of parsedMessage.clauses) {
            if (capReached) break;

            const cvSyllables = (clause.cvSyllables && clause.cvSyllables.length > 0) ? clause.cvSyllables : [];
            const tokens = (clause.phonemeTokens && clause.phonemeTokens.length > 0) ? clause.phonemeTokens : [];
            const effectiveRate = profile.syllableRate * clause.rateModifier;
            const phonemeDuration = Math.max(0.06, 0.85 / effectiveRate);
            const overlap = Math.min(0.04, profile.legatoOverlap || 0.02);

            if (cvSyllables.length > 0) {
                // Syllable-bound Consonant-Vowel (CV) synthesis
                for (let i = 0; i < cvSyllables.length; i++) {
                    if (scheduledCount >= MAX_PHONEMES || (currentTimeCursor - startTime) >= MAX_DURATION_SEC) {
                        capReached = true;
                        break;
                    }

                    const syl = cvSyllables[i];
                    const isFinalSyl = (i === cvSyllables.length - 1);
                    const isPenultimateSyl = (i === cvSyllables.length - 2);

                    let targetPitch = profile.basePitch * clause.pitchModifier;
                    const randomOffset = (Math.random() - 0.5) * profile.pitchVariance;
                    targetPitch *= (1 + randomOffset);

                    const vChar = String(syl.vowel || 'a').toLowerCase();

                    // Pentatonic Musical Scale Snapping (/sing emote)
                    if (profile.musicalScale) {
                        const pentatonicScale = [1.000, 1.122, 1.260, 1.498, 1.682, 2.000, 1.682, 1.498, 1.260, 1.122];
                        const scaleDegree = pentatonicScale[i % pentatonicScale.length];
                        targetPitch = profile.basePitch * scaleDegree;
                    } else if (profile.quantizePitch) {
                        // Semitone Pitch Quantization (/grumpy & /angry emotes)
                        const semitones = Math.round(12 * Math.log2(targetPitch));
                        targetPitch = Math.pow(2, semitones / 12.0);
                    } else {
                        // Vowel Pitch Bounce (Formant Pitch Contours)
                        if (highVowels.includes(vChar)) {
                            targetPitch *= 1.18; // +18% pitch bounce jump on high vowels (e, i, y)
                        } else if (backVowels.includes(vChar)) {
                            targetPitch *= 0.92; // -8% pitch dip on back vowels (o, u)
                            targetPitch = Math.max(0.98, targetPitch); // Clamp minimum pitch floor to 0.98x
                        } else if (vChar === 'w') {
                            targetPitch *= 1.05; // +5% pitch uplift for 'w' initial transient
                        }
                    }

                    if (clause.glissando && (isFinalSyl || isPenultimateSyl)) {
                        targetPitch *= isFinalSyl ? 1.25 : 1.12;
                    }

                    let volume = Math.max(0.05, Math.min(1.0, 0.45 * clause.volumeModifier));
                    let vDuration = phonemeDuration;

                    // Pitch-Adaptive Equal-Loudness Compensation (+35% max boost at 1.00x pitch)
                    const pitchCompGain = Math.max(1.0, Math.min(1.35, 1.35 / Math.max(0.5, phrasePitchCursor)));
                    volume *= pitchCompGain;

                    // Universal Vowel Sustaining & Gain Boost
                    if (allVowels.includes(vChar)) {
                        vDuration *= 1.25; // Sustained vowel body
                    }

                    if (highVowels.includes(vChar)) {
                        volume = Math.min(1.0, volume * 1.30); // +3dB boost for high vowels
                    } else if (backVowels.includes(vChar) || vChar === 'w' || vChar === 'a') {
                        volume = Math.min(1.0, volume * 1.22); // +2.5dB boost for back vowels (o, u), w, a
                    }

                    // ALL CAPS Shouting Volume Boost (+35%)
                    const isShouting = Boolean(clause.volumeModifier > 1.2 || profile.overdrive);
                    if (isShouting) {
                        volume = Math.min(1.0, volume * 1.35);
                    }

                    // 300ms Smooth Audio Release Decay near Golden Cap limit
                    const elapsedTime = currentTimeCursor - startTime;
                    if (scheduledCount >= (MAX_PHONEMES - 4) || elapsedTime >= (MAX_DURATION_SEC - 0.4)) {
                        const remaining = Math.max(0.0, MAX_DURATION_SEC - elapsedTime);
                        const releaseFactor = Math.max(0.05, remaining / 0.4);
                        volume *= releaseFactor;
                    }

                    // 1. Schedule initial consonant transient (truncated to 15ms)
                    if (syl.consonant && scheduledCount < MAX_PHONEMES) {
                        const consBuffer = sampleBuffer || phonemeLoader.getBuffer(syl.consonant);
                        if (this.ctx && this.ctx.state !== 'closed' && consBuffer) {
                            this._scheduleSyllableNode({
                                ctx: this.ctx,
                                time: currentTimeCursor,
                                duration: 0.015,
                                startPitch: phrasePitchCursor,
                                endPitch: targetPitch,
                                volume: volume * 0.75,
                                profile,
                                clause,
                                sampleBuffer: consBuffer,
                                isConsonant: true,
                                isShouting
                            });
                        }
                        scheduledCount++;
                    }

                    // 2. Schedule main vowel body
                    if (scheduledCount < MAX_PHONEMES) {
                        const vowelBuffer = sampleBuffer || phonemeLoader.getBuffer(syl.vowel || 'a');
                        if (this.ctx && this.ctx.state !== 'closed') {
                            this._scheduleSyllableNode({
                                ctx: this.ctx,
                                time: currentTimeCursor,
                                duration: vDuration,
                                startPitch: phrasePitchCursor,
                                endPitch: targetPitch,
                                volume,
                                profile,
                                clause,
                                sampleBuffer: vowelBuffer,
                                isConsonant: false,
                                isShouting
                            });
                        }
                        scheduledCount++;
                    }

                    // 3. Schedule trailing consonant tail (truncated to 15ms)
                    if (syl.trailingConsonant && scheduledCount < MAX_PHONEMES) {
                        const tailBuffer = sampleBuffer || phonemeLoader.getBuffer(syl.trailingConsonant);
                        if (this.ctx && this.ctx.state !== 'closed' && tailBuffer) {
                            this._scheduleSyllableNode({
                                ctx: this.ctx,
                                time: currentTimeCursor + (vDuration * 0.7),
                                duration: 0.015,
                                startPitch: targetPitch,
                                endPitch: targetPitch,
                                volume: volume * 0.65,
                                profile,
                                clause,
                                sampleBuffer: tailBuffer,
                                isConsonant: true,
                                isShouting
                            });
                        }
                        scheduledCount++;
                    }

                    phrasePitchCursor = targetPitch;
                    currentTimeCursor += Math.max(0.02, vDuration - overlap);
                }
            } else if (tokens.length > 0) {
                // Synthesize from tokenized Animalese phoneme list
                for (let i = 0; i < tokens.length; i++) {
                    if (scheduledCount >= MAX_PHONEMES || (currentTimeCursor - startTime) >= MAX_DURATION_SEC) {
                        capReached = true;
                        break;
                    }

                    const token = tokens[i];
                    const isFinalToken = (i === tokens.length - 1);
                    const isPenultimateToken = (i === tokens.length - 2);

                    let targetPitch = profile.basePitch * clause.pitchModifier;
                    const randomOffset = (Math.random() - 0.5) * profile.pitchVariance;
                    targetPitch *= (1 + randomOffset);

                    const tokChar = String(token).toLowerCase();
                    if (profile.musicalScale) {
                        const pentatonicScale = [1.000, 1.122, 1.260, 1.498, 1.682, 2.000, 1.682, 1.498, 1.260, 1.122];
                        targetPitch = profile.basePitch * pentatonicScale[i % pentatonicScale.length];
                    } else if (profile.quantizePitch) {
                        const semitones = Math.round(12 * Math.log2(targetPitch));
                        targetPitch = Math.pow(2, semitones / 12.0);
                    } else if (highVowels.includes(tokChar)) {
                        targetPitch *= 1.18;
                    } else if (backVowels.includes(tokChar)) {
                        targetPitch *= 0.92;
                        targetPitch = Math.max(0.98, targetPitch);
                    } else if (tokChar === 'w') {
                        targetPitch *= 1.05;
                    }

                    if (clause.glissando && (isFinalToken || isPenultimateToken)) {
                        targetPitch *= isFinalToken ? 1.25 : 1.12;
                    }

                    let volume = Math.max(0.05, Math.min(1.0, 0.45 * clause.volumeModifier));
                    let tokDuration = phonemeDuration;

                    const pitchCompGain = Math.max(1.0, Math.min(1.35, 1.35 / Math.max(0.5, phrasePitchCursor)));
                    volume *= pitchCompGain;

                    if (allVowels.includes(tokChar)) {
                        tokDuration *= 1.25;
                    }

                    if (highVowels.includes(tokChar)) {
                        volume = Math.min(1.0, volume * 1.30);
                    } else if (backVowels.includes(tokChar) || tokChar === 'w' || tokChar === 'a') {
                        volume = Math.min(1.0, volume * 1.22);
                    }

                    const isShouting = Boolean(clause.volumeModifier > 1.2 || profile.overdrive);
                    if (isShouting) {
                        volume = Math.min(1.0, volume * 1.35);
                    }

                    // 300ms Smooth Audio Release Decay near Golden Cap limit
                    const elapsedTime = currentTimeCursor - startTime;
                    if (scheduledCount >= (MAX_PHONEMES - 4) || elapsedTime >= (MAX_DURATION_SEC - 0.4)) {
                        const remaining = Math.max(0.0, MAX_DURATION_SEC - elapsedTime);
                        const releaseFactor = Math.max(0.05, remaining / 0.4);
                        volume *= releaseFactor;
                    }

                    const targetBuffer = sampleBuffer || phonemeLoader.getBuffer(token);

                    if (this.ctx && this.ctx.state !== 'closed') {
                        this._scheduleSyllableNode({
                            ctx: this.ctx,
                            time: currentTimeCursor,
                            duration: tokDuration,
                            startPitch: phrasePitchCursor,
                            endPitch: targetPitch,
                            volume,
                            profile,
                            clause,
                            sampleBuffer: targetBuffer,
                            isConsonant: !highVowels.includes(tokChar) && !backVowels.includes(tokChar),
                            isShouting
                        });
                    }

                    phrasePitchCursor = targetPitch;
                    scheduledCount++;
                    currentTimeCursor += Math.max(0.02, tokDuration - overlap);
                }
            } else {
                // Fallback to word-count loop if tokens unavailable
                const words = clause.text.split(/\s+/).filter(Boolean);
                const wordCount = words.length || 1;
                const syllableCount = Math.max(3, Math.min(7, Math.round(wordCount * 0.4)));

                for (let i = 0; i < syllableCount; i++) {
                    if (scheduledCount >= MAX_PHONEMES || (currentTimeCursor - startTime) >= MAX_DURATION_SEC) {
                        capReached = true;
                        break;
                    }

                    const isFinalSyllable = (i === syllableCount - 1);
                    const isPenultimateSyllable = (i === syllableCount - 2);

                    let targetPitch = profile.basePitch * clause.pitchModifier;
                    const randomOffset = (Math.random() - 0.5) * profile.pitchVariance;
                    targetPitch *= (1 + randomOffset);

                    if (clause.glissando && (isFinalSyllable || isPenultimateSyllable)) {
                        targetPitch *= isFinalSyllable ? 1.25 : 1.12;
                    }

                    const volume = Math.max(0.05, Math.min(1.0, 0.4 * clause.volumeModifier));
                    const targetBuffer = sampleBuffer || phonemeLoader.getBuffer('a');

                    if (this.ctx && this.ctx.state !== 'closed') {
                        this._scheduleSyllableNode({
                            ctx: this.ctx,
                            time: currentTimeCursor,
                            duration: phonemeDuration,
                            startPitch: phrasePitchCursor,
                            endPitch: targetPitch,
                            volume,
                            profile,
                            clause,
                            sampleBuffer: targetBuffer,
                            isConsonant: false
                        });
                    }

                    phrasePitchCursor = targetPitch;
                    scheduledCount++;
                    currentTimeCursor += Math.max(0.02, phonemeDuration - overlap);
                }
            }

            // Apply pause after clause punctuation (e.g. comma, tilde, ellipsis)
            if (clause.pauseAfterMs > 0 && !capReached) {
                currentTimeCursor += (clause.pauseAfterMs / 1000.0);
            }
        }

        const durationSec = Number((currentTimeCursor - startTime).toFixed(3));

        return {
            scheduledCount,
            durationSec,
            startTimeSec: Number(startTime.toFixed(3)),
            endTimeSec: Number(currentTimeCursor.toFixed(3))
        };
    }

    /**
     * Creates a WaveShaper distortion curve for megaphonic shouting overdrive.
     * 
     * @private
     * @param {number} amount 
     * @returns {Float32Array}
     */
    _createDistortionCurve(amount = 25) {
        const k = typeof amount === 'number' ? amount : 25;
        const nSamples = 44100;
        const curve = new Float32Array(nSamples);
        const deg = Math.PI / 180;
        for (let i = 0; i < nSamples; ++i) {
            const x = (i * 2) / nSamples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    /**
     * Schedules a single Web Audio API node (BufferSource or Oscillator) with filters and envelope gain.
     * 
     * @private
     * @param {Object} params
     */
    _scheduleSyllableNode({ ctx, time, duration, startPitch = 1.0, endPitch = 1.0, pitchMultiplier = 1.0, volume, profile, clause, sampleBuffer, isConsonant = false, isShouting = false }) {
        try {
            const initialPitch = startPitch || pitchMultiplier || 1.0;
            const targetPitch = endPitch || initialPitch;

            // Master gain node for syllable envelope
            const gainNode = ctx.createGain();
            
            // Soft S-Curve Envelope: 30ms for vowels, 10ms for consonants to eliminate hard clicks
            const attackTime = isConsonant ? 0.010 : 0.030;
            const deClickFadeMs = 0.003; // 3ms micro zero-crossing fade-in
            const decayTime = Math.max(0.02, duration - attackTime);

            // 3ms zero-crossing micro fade-in (DC offset de-clicker)
            gainNode.gain.setValueAtTime(0.0001, time);
            gainNode.gain.linearRampToValueAtTime(volume * 0.1, time + deClickFadeMs);

            // Equal-Power raised cosine attack ramp
            gainNode.gain.linearRampToValueAtTime(volume, time + attackTime);

            // Equal-Power smooth exponential decay
            gainNode.gain.exponentialRampToValueAtTime(0.0001, time + attackTime + decayTime);

            // 2.8kHz Peaking Presence Filter for bright Animalese acoustic presence
            const presenceFilter = ctx.createBiquadFilter();
            presenceFilter.type = 'peaking';
            presenceFilter.frequency.setValueAtTime(2800, time);
            presenceFilter.Q.setValueAtTime(1.5, time);
            
            // Automatically scale down presence boost if lowPassCutoffHz is below 1500Hz for muffled profiles
            const muffleHz = profile.lowPassCutoffHz || 4000;
            const presenceGain = muffleHz < 1500 ? 0.0 : 4.0; // +4dB boost
            presenceFilter.gain.setValueAtTime(presenceGain, time);

            // Biquad filters for muffling
            const lowPass = ctx.createBiquadFilter();
            lowPass.type = 'lowpass';
            lowPass.frequency.setValueAtTime(profile.lowPassCutoffHz || 4000, time);

            const highPass = ctx.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.setValueAtTime(profile.highPassCutoffHz || 80, time);

            // Megaphone Overdrive WaveShaperNode for ALL CAPS shouting
            let waveShaperNode = null;
            if (isShouting || profile.overdrive) {
                waveShaperNode = ctx.createWaveShaper();
                waveShaperNode.curve = this._createDistortionCurve(25);
                waveShaperNode.oversample = '4x';
            }

            // Connect filter chain: Source -> HighPass -> WaveShaper -> PeakingPresence -> LowPass -> Gain -> Destination
            if (waveShaperNode) {
                highPass.connect(waveShaperNode);
                waveShaperNode.connect(presenceFilter);
            } else {
                highPass.connect(presenceFilter);
            }
            presenceFilter.connect(lowPass);
            lowPass.connect(gainNode);
            gainNode.connect(ctx.destination);

            let sourceNode;

            if (sampleBuffer && sampleBuffer instanceof AudioBuffer) {
                // BufferSourceNode branch for Animalese phonemes
                sourceNode = ctx.createBufferSource();
                sourceNode.buffer = sampleBuffer;
                
                // Continuous Portamento Pitch Curve: Glide pitch smoothly across phoneme
                sourceNode.playbackRate.setValueAtTime(initialPitch, time);
                if (Math.abs(targetPitch - initialPitch) > 0.01) {
                    sourceNode.playbackRate.exponentialRampToValueAtTime(Math.max(0.3, targetPitch), time + duration);
                } else {
                    const microGlideEnd = Math.max(0.3, initialPitch * 0.95);
                    sourceNode.playbackRate.linearRampToValueAtTime(microGlideEnd, time + duration);
                }

                sourceNode.connect(highPass);
                sourceNode.start(time);
                sourceNode.stop(time + duration + 0.05);
            } else {
                // Procedural OscillatorNode fallback
                sourceNode = ctx.createOscillator();
                sourceNode.type = profile.oscillatorType || 'triangle';
                const baseFreqHz = 220.0 * initialPitch;
                sourceNode.frequency.setValueAtTime(baseFreqHz, time);

                if (Math.abs(targetPitch - initialPitch) > 0.01) {
                    sourceNode.frequency.exponentialRampToValueAtTime(220.0 * targetPitch, time + duration);
                }

                if (clause.vibrato) {
                    const lfo = ctx.createOscillator();
                    const lfoGain = ctx.createGain();
                    lfo.frequency.setValueAtTime(profile.vibratoSpeed || 6.0, time);
                    lfoGain.gain.setValueAtTime(baseFreqHz * (profile.vibratoDepth || 0.05), time);
                    lfo.connect(lfoGain);
                    lfoGain.connect(sourceNode.frequency);
                    lfo.start(time);
                    lfo.stop(time + duration);
                }

                sourceNode.connect(highPass);
                sourceNode.start(time);
                sourceNode.stop(time + duration);
            }

            // Cleanup nodes on completion
            sourceNode.onended = () => {
                try {
                    sourceNode.disconnect();
                    highPass.disconnect();
                    lowPass.disconnect();
                    gainNode.disconnect();
                } catch (e) {}
            };
        } catch (err) {
            // Audio scheduling errors silenced for clean playback
        }
    }
}

if (typeof window !== 'undefined') {
    window.VoiceSynthEngine = VoiceSynthEngine;
}
