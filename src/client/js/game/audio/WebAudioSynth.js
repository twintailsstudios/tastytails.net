/**
 * @fileoverview Web Audio API Synthesizer & Sample Bank Engine for TastyTails.net
 * 
 * @description
 * Manages the Web Audio API AudioContext, 16-channel gain node buses, active voice allocation,
 * General MIDI sample buffer playback with ADSR envelopes, pitch shifting, pitch bend,
 * sustain pedal, stereo panning, expression controllers, and smooth crossfading.
 */

export class WebAudioSynth {
    constructor() {
        /** @type {AudioContext|null} */
        this.ctx = null;
        /** @type {GainNode|null} */
        this.masterGain = null;
        /** @type {Array<GainNode>} 16 per-channel gain nodes for Banjo-Kazooie stem mixing */
        this.channelGains = [];
        /** @type {Array<StereoPannerNode|null>} 16 per-channel stereo panner nodes */
        this.channelPanners = [];
        /** @type {Array<number>} 16 per-channel pitch bend values in semitones */
        this.channelPitchBends = new Array(16).fill(0);
        /** @type {Array<boolean>} 16 per-channel sustain pedal states */
        this.channelSustain = new Array(16).fill(false);
        /** @type {Array<number>} 16 per-channel expression controller values (0.0 - 1.0) */
        this.channelExpression = new Array(16).fill(1.0);
        /** @type {Array<number>} 16 per-channel MIDI CC 7 Volume controller values (0.0 - 1.0) */
        this.channelCc7Volumes = new Array(16).fill(1.0);
        /** @type {Array<number>} 16 per-channel Banjo-Kazooie stem target gains (0.0 - 1.0) */
        this.channelStemGains = new Array(16).fill(1.0);
        /** @type {Map<string, {buffer: AudioBuffer, rootNote: number}>} Loaded instrument sample map */
        this.sampleBank = new Map();
        /** @type {Array<Object>} Currently active playing voice objects for polyphony management */
        this.activeVoices = [];
        /** @type {number} Maximum concurrent polyphonic voices to prevent CPU strain */
        this.maxPolyphony = 64;
        /** @type {Map<number, string>} GM Program number (0-127) -> Instrument sample key mapping */
        this.gmPatchMap = new Map();

        this._initDefaultPatchMappings();
    }

    /**
     * Initializes the Web Audio Context and Node Graph.
     * Safe to call multiple times; will resume suspended contexts if user gesture is present.
     */
    init() {
        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.error('[WebAudioSynth] Web Audio API is not supported in this browser.');
                return;
            }
            this.ctx = new AudioContextClass();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);

            // DynamicsCompressorNode (Anti-Clipping Brickwall Limiter)
            this.limiter = this.ctx.createDynamicsCompressor();
            this.limiter.threshold.setValueAtTime(-6, this.ctx.currentTime);
            this.limiter.knee.setValueAtTime(12, this.ctx.currentTime);
            this.limiter.ratio.setValueAtTime(12, this.ctx.currentTime);
            this.limiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
            this.limiter.release.setValueAtTime(0.1, this.ctx.currentTime);

            // BiquadFilterNode for environmental low-pass muffling
            this.environmentalFilter = this.ctx.createBiquadFilter();
            this.environmentalFilter.type = 'lowpass';
            this.environmentalFilter.frequency.setValueAtTime(20000, this.ctx.currentTime); // Default 20kHz (unfiltered)

            this.masterGain.connect(this.limiter);
            this.limiter.connect(this.environmentalFilter);
            this.environmentalFilter.connect(this.ctx.destination);

            // Instantiate 16 discrete MIDI channel gain buses & stereo panners
            for (let c = 0; c < 16; c++) {
                const cg = this.ctx.createGain();
                cg.gain.setValueAtTime(0.0, this.ctx.currentTime);

                if (typeof this.ctx.createStereoPanner === 'function') {
                    const panner = this.ctx.createStereoPanner();
                    panner.pan.setValueAtTime(0, this.ctx.currentTime);
                    cg.connect(panner);
                    panner.connect(this.masterGain);
                    this.channelPanners.push(panner);
                } else {
                    cg.connect(this.masterGain);
                    this.channelPanners.push(null);
                }

                this.channelGains.push(cg);
            }

            console.log(`[WebAudioSynth] AudioContext initialized in state: '${this.ctx.state}'`);
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                console.log('[WebAudioSynth] AudioContext resumed successfully.');
            }).catch(err => {
                console.warn('[WebAudioSynth] AudioContext resume deferred (awaiting user gesture):', err);
            });
        }
    }

    /**
     * Maps General MIDI patch numbers to sample keys.
     * @private
     */
    _initDefaultPatchMappings() {
        // Default fallbacks for common General MIDI patches (0-indexed GM Program IDs)
        const defaultMap = {
            0: 'piano',       // Acoustic Grand Piano (GM 1 -> 0)
            1: 'piano',       // Bright Piano (GM 2 -> 1)
            24: 'guitar',     // Nylon Guitar (GM 25 -> 24)
            32: 'bass',       // Acoustic Bass (GM 33 -> 32)
            56: 'trumpet',    // Trumpet (GM 57 -> 56)
            72: 'flute',      // Flute (GM 73 -> 72)
            73: 'flute',      // Flute (1-indexed fallback)
            105: 'banjo',     // Banjo (GM 106 -> 105)
            21: 'accordion',  // Accordion (GM 22 -> 21)
            58: 'tuba',       // Tuba (GM 59 -> 58)
            11: 'marimba',    // Marimba (GM 12 -> 11)
            10: 'musicbox',   // Music Box (GM 11 -> 10)
            88: 'pad'         // Warm Synth Pad (GM 89 -> 88)
        };
        Object.entries(defaultMap).forEach(([program, key]) => {
            this.gmPatchMap.set(Number(program), key);
        });
    }

    /**
     * Registers a loaded AudioBuffer sample into the synth sample bank.
     * @param {string} key - Instrument sample identifier (e.g., 'piano', 'banjo')
     * @param {AudioBuffer} audioBuffer 
     * @param {number} [rootNote=60] - Native root MIDI note of the sample (default C4 = 60)
     */
    registerSample(key, audioBuffer, rootNote = 60) {
        this.sampleBank.set(key, { buffer: audioBuffer, rootNote: Number(rootNote) });
    }

    /**
     * Plays a single MIDI note on the specified channel.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} note - MIDI note number (0 - 127)
     * @param {number} velocity - MIDI velocity (0 - 127)
     * @param {number} program - Active GM program patch ID for this channel
     * @param {number} [whenTime] - Scheduled AudioContext timestamp in seconds
     */
    noteOn(channel, note, velocity, program = 0, whenTime = 0) {
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const scheduledTime = whenTime > 0 ? Math.max(whenTime, now) : now;
        const normalizedVol = Math.max(0, Math.min(1, velocity / 127));
        if (normalizedVol <= 0) return;

        // 1. Voice Deduplication: Gracefully release existing voice playing exact same note on this channel
        for (let i = this.activeVoices.length - 1; i >= 0; i--) {
            const existing = this.activeVoices[i];
            if (existing.channel === channel && existing.note === note) {
                existing.stopNow();
                this.activeVoices.splice(i, 1);
            }
        }

        // 2. Smart Polyphony Voice Stealing: Release suitable active voice if polyphony cap reached
        if (this.activeVoices.length >= this.maxPolyphony) {
            // OPTIMIZATION: Steals sustain-released or oldest active voice to enforce polyphony cap (64) without CPU strain
            let stealIdx = this.activeVoices.findIndex(v => v.isPendingSustainRelease);
            if (stealIdx === -1) {
                let oldestTime = Infinity;
                this.activeVoices.forEach((v, idx) => {
                    if (v.startTime < oldestTime) {
                        oldestTime = v.startTime;
                        stealIdx = idx;
                    }
                });
            }
            if (stealIdx === -1) {
                stealIdx = 0;
            }
            const stolenVoice = this.activeVoices.splice(stealIdx, 1)[0];
            if (stolenVoice) stolenVoice.stopNow();
        }

        const channelGainNode = this.channelGains[channel] || this.masterGain;
        const voiceGainNode = this.ctx.createGain();
        
        // Optional voice tone filter to round out harsh harmonics
        const toneFilter = this.ctx.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.setValueAtTime(6000, scheduledTime); // Smooth 6kHz cutoff for warm tone

        voiceGainNode.connect(toneFilter);
        toneFilter.connect(channelGainNode);

        // Instrument Family Synthesis Configuration (0-indexed GM patch IDs)
        let waveform = 'sine';
        let attack = 0.005;
        let decay = 0.1;
        let sustain = 0.7;
        let addVibrato = false;

        if (channel === 9) {
            // Percussion Channel
            waveform = 'triangle';
            attack = 0.001;
            decay = 0.08;
            sustain = 0.1;
        } else if (program >= 72 && program <= 79) {
            // Flute / Pipe Family (Program 72-79) - Soft wind attack & sustained vibrato
            waveform = 'triangle';
            attack = 0.06;  // 60ms soft wind breath
            decay = 0.12;
            sustain = 0.90; // High sustain
            addVibrato = true;
        } else if (program >= 0 && program <= 7) {
            // Piano Family (Program 0-7) - Percustive hammer attack & string decay
            waveform = 'sine';
            attack = 0.003; // 3ms instant strike
            decay = 0.35;
            sustain = 0.35;
        } else if ((program >= 24 && program <= 31) || program === 105) {
            // Guitar / Banjo Plucked String (Program 24-31, 105)
            waveform = 'sawtooth';
            attack = 0.002;
            decay = 0.22;
            sustain = 0.25;
        } else if (program >= 20 && program <= 23) {
            // Accordion / Harmonica (Program 20-23)
            waveform = 'sawtooth';
            attack = 0.03;
            decay = 0.08;
            sustain = 0.85;
        } else if (program >= 56 && program <= 63) {
            // Brass / Trumpet / Tuba (Program 56-63)
            waveform = 'square';
            attack = 0.04;
            decay = 0.10;
            sustain = 0.80;
        } else if (program >= 40 && program <= 55) {
            // Strings / Ensemble (Program 40-55)
            waveform = 'sawtooth';
            attack = 0.12;
            decay = 0.20;
            sustain = 0.92;
        } else {
            // General Synth Fallback
            waveform = 'square';
            attack = 0.01;
            decay = 0.1;
            sustain = 0.7;
        }

        const expression = this.channelExpression[channel] !== undefined ? this.channelExpression[channel] : 1.0;
        const peakVolume = normalizedVol * expression * 0.18;
        const sustainVolume = peakVolume * sustain;

        // AUDIO QUALITY: Mute gain node at current time to prevent pre-attack click/pop bleed on pre-scheduled notes
        voiceGainNode.gain.setValueAtTime(0.0001, now);
        voiceGainNode.gain.setValueAtTime(0.0001, scheduledTime);
        voiceGainNode.gain.linearRampToValueAtTime(peakVolume, scheduledTime + attack);
        voiceGainNode.gain.linearRampToValueAtTime(sustainVolume, scheduledTime + attack + decay);

        let sourceNode;
        const sampleKey = this.gmPatchMap.get(program) || 'piano';
        const sampleEntry = this.sampleBank.get(sampleKey);

        const bendSemitones = this.channelPitchBends[channel] || 0;
        const effectiveNote = note + bendSemitones;
        let sampleRootNote = 60;

        if (sampleEntry) {
            // --- SAMPLED INSTRUMENT VOICE ---
            const sampleBuffer = sampleEntry.buffer || sampleEntry;
            sampleRootNote = sampleEntry.rootNote !== undefined ? sampleEntry.rootNote : 60;
            sourceNode = this.ctx.createBufferSource();
            sourceNode.buffer = sampleBuffer;

            const pitchRatio = Math.pow(2, (effectiveNote - sampleRootNote) / 12);
            sourceNode.playbackRate.setValueAtTime(pitchRatio, scheduledTime);
        } else {
            // --- SYNTHESIZED WAVETABLE FALLBACK WITH INSTRUMENT TIMBRE ---
            sourceNode = this.ctx.createOscillator();
            sourceNode.type = waveform;

            const freq = 440 * Math.pow(2, (effectiveNote - 69) / 12);
            sourceNode.frequency.setValueAtTime(freq, scheduledTime);

            // Add Flute Vibrato LFO for wind instruments
            if (addVibrato) {
                try {
                    const lfo = this.ctx.createOscillator();
                    const lfoGain = this.ctx.createGain();
                    lfo.frequency.setValueAtTime(5.5, scheduledTime); // 5.5 Hz vibrato
                    lfoGain.gain.setValueAtTime(freq * 0.012, scheduledTime); // Gentle 1.2% pitch modulation
                    lfo.connect(lfoGain);
                    lfoGain.connect(sourceNode.frequency);
                    lfo.start(scheduledTime + 0.08); // Start vibrato after initial breath
                } catch (e) {}
            }
        }

        sourceNode.connect(voiceGainNode);
        sourceNode.start(scheduledTime);

        const voiceObj = {
            channel,
            note,
            rootNote: sampleRootNote,
            sourceNode,
            voiceGainNode,
            startTime: scheduledTime,
            isPendingSustainRelease: false,
            stopNow: () => {
                if (!this.ctx) return;
                try {
                    // OPTIMIZATION: Detach listener to prevent double-splice array race condition
                    sourceNode.onended = null;
                    const stopNowTime = this.ctx.currentTime;
                    voiceGainNode.gain.cancelScheduledValues(stopNowTime);
                    voiceGainNode.gain.linearRampToValueAtTime(0.0001, stopNowTime + 0.015);
                    sourceNode.stop(stopNowTime + 0.02);
                } catch (e) {}
            },
            release: (releaseTimeSeconds) => {
                if (!this.ctx) return;
                const relTime = releaseTimeSeconds > 0 ? Math.max(releaseTimeSeconds, this.ctx.currentTime) : this.ctx.currentTime;
                try {
                    sourceNode.onended = null;
                    voiceGainNode.gain.cancelScheduledValues(relTime);
                    voiceGainNode.gain.linearRampToValueAtTime(0.0001, relTime + 0.05);
                    sourceNode.stop(relTime + 0.06);
                } catch (e) {}
            }
        };

        // Automatic voice pruning on node end event
        sourceNode.onended = () => {
            const idx = this.activeVoices.indexOf(voiceObj);
            if (idx !== -1) {
                this.activeVoices.splice(idx, 1);
            }
        };

        this.activeVoices.push(voiceObj);
    }

    /**
     * Releases (Note Off) a playing note on the specified channel.
     * Respects CC 64 Sustain Pedal state.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} note - MIDI note number (0 - 127)
     * @param {number} [whenTime] - Scheduled AudioContext timestamp in seconds
     */
    noteOff(channel, note, whenTime = 0) {
        if (!this.ctx) return;
        const releaseTime = whenTime > 0 ? whenTime : this.ctx.currentTime;
        const isSustained = this.channelSustain[channel] || false;

        for (let i = this.activeVoices.length - 1; i >= 0; i--) {
            const v = this.activeVoices[i];
            if (v.channel === channel && v.note === note) {
                if (isSustained) {
                    v.isPendingSustainRelease = true;
                } else {
                    v.release(releaseTime);
                    this.activeVoices.splice(i, 1);
                }
                break;
            }
        }
    }

    /**
     * Sets MIDI Pitch Bend value for a channel.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} bendValue - Signed pitch bend value (-8192 to 8191)
     * @param {number} [bendRangeSemitones=2] - Sensitivity range in semitones (default 2)
     */
    setPitchBend(channel, bendValue, bendRangeSemitones = 2) {
        const semitones = (bendValue / 8192) * bendRangeSemitones;
        this.channelPitchBends[channel] = semitones;

        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // AUDIO QUALITY: Reference v.rootNote per voice to prevent octave jumping/distortion on non-piano instruments
        this.activeVoices.forEach(v => {
            if (v.channel === channel && v.sourceNode) {
                const effectiveNote = v.note + semitones;
                if (v.sourceNode.playbackRate) {
                    const root = v.rootNote !== undefined ? v.rootNote : 60;
                    const ratio = Math.pow(2, (effectiveNote - root) / 12);
                    v.sourceNode.playbackRate.setValueAtTime(ratio, now);
                } else if (v.sourceNode.frequency) {
                    const freq = 440 * Math.pow(2, (effectiveNote - 69) / 12);
                    v.sourceNode.frequency.setValueAtTime(freq, now);
                }
            }
        });
    }

    /**
     * Sets Sustain Pedal (CC 64) state for a channel.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} isSustained - True if sustain pedal is depressed
     */
    setSustain(channel, isSustained) {
        this.channelSustain[channel] = Boolean(isSustained);

        if (!isSustained && this.ctx) {
            const now = this.ctx.currentTime;
            for (let i = this.activeVoices.length - 1; i >= 0; i--) {
                const v = this.activeVoices[i];
                if (v.channel === channel && v.isPendingSustainRelease) {
                    v.release(now);
                    this.activeVoices.splice(i, 1);
                }
            }
        }
    }

    /**
     * Sets Expression (CC 11) volume scaling for a channel.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} expressionValue - Expression level (0.0 to 1.0)
     */
    setChannelExpression(channel, expressionValue) {
        this.channelExpression[channel] = Math.max(0, Math.min(1, expressionValue));
    }

    /**
     * Sets Stereo Pan (CC 10) position for a channel.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} panValue - Pan value (-1.0 Left, 0.0 Center, 1.0 Right)
     */
    setChannelPan(channel, panValue) {
        if (!this.ctx || !this.channelPanners[channel]) return;
        const panner = this.channelPanners[channel];
        const clampedPan = Math.max(-1, Math.min(1, panValue));
        panner.pan.setValueAtTime(clampedPan, this.ctx.currentTime);
    }

    /**
     * Sets MIDI Channel Volume (CC 7) for a channel and updates the effective gain node volume.
     * Preserves active Banjo-Kazooie zone stem crossfade multipliers.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} volume - Volume level (0.0 to 1.0)
     */
    setChannelCc7Volume(channel, volume) {
        const clampedVol = Math.max(0, Math.min(1, Number(volume) || 0));
        this.channelCc7Volumes[channel] = clampedVol;

        if (!this.ctx || !this.channelGains[channel]) return;

        const stemGain = this.channelStemGains[channel] !== undefined ? this.channelStemGains[channel] : 1.0;
        const effectiveVol = clampedVol * stemGain;
        const gainNode = this.channelGains[channel];
        const now = this.ctx.currentTime;

        if (typeof gainNode.gain.cancelAndHoldAtTime === 'function') {
            gainNode.gain.cancelAndHoldAtTime(now);
        } else {
            const currentVal = gainNode.gain.value;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(currentVal, now);
        }
        gainNode.gain.setValueAtTime(effectiveVol, now);
    }

    /**
     * Smoothly crossfades or sets the volume gain of a specific MIDI channel.
     * Crucial for Banjo-Kazooie style multi-track stem crossfading.
     * 
     * @param {number} channel - MIDI channel index (0 - 15)
     * @param {number} volume - Target volume (0.0 to 1.0)
     * @param {number} [fadeTimeMs=0] - Crossfade transition time in milliseconds
     */
    setChannelVolume(channel, volume, fadeTimeMs = 0) {
        if (!this.ctx || !this.channelGains[channel]) return;

        const gainNode = this.channelGains[channel];
        const clampedVol = Math.max(0, Math.min(1, Number(volume) || 0));
        this.channelStemGains[channel] = clampedVol;

        const cc7Vol = this.channelCc7Volumes[channel] !== undefined ? this.channelCc7Volumes[channel] : 1.0;
        const effectiveVol = clampedVol * cc7Vol;
        const now = this.ctx.currentTime;

        if (typeof gainNode.gain.cancelAndHoldAtTime === 'function') {
            gainNode.gain.cancelAndHoldAtTime(now);
        } else {
            const currentVal = gainNode.gain.value;
            gainNode.gain.cancelScheduledValues(now);
            gainNode.gain.setValueAtTime(currentVal, now);
        }

        if (fadeTimeMs > 0) {
            const durationSec = fadeTimeMs / 1000;
            gainNode.gain.linearRampToValueAtTime(effectiveVol, now + durationSec);
        } else {
            gainNode.gain.setValueAtTime(effectiveVol, now);
        }
    }

    /**
     * Atomically sets target volumes across multiple MIDI channels at the same AudioContext timestamp.
     * Multiplies requested stem crossfade gains by each channel's active MIDI CC 7 volume to guarantee
     * smooth, gradual, and click-free audio zone transitions.
     * 
     * @param {Object<number, number>} channelGainsMap - Map of channelIndex -> targetVolume
     * @param {number} [fadeTimeMs=1000] - Crossfade transition time in milliseconds
     */
    setMultiChannelVolumes(channelGainsMap, fadeTimeMs = 1000) {
        if (!this.ctx || !channelGainsMap) return;
        const now = this.ctx.currentTime;
        const durationSec = fadeTimeMs > 0 ? (fadeTimeMs / 1000) : 0;

        Object.entries(channelGainsMap).forEach(([chStr, stemVol]) => {
            const ch = Number(chStr);
            const gainNode = this.channelGains[ch];
            if (!gainNode) return;

            const clampedStemGain = Math.max(0, Math.min(1, Number(stemVol)));
            this.channelStemGains[ch] = clampedStemGain;

            const cc7Vol = this.channelCc7Volumes[ch] !== undefined ? this.channelCc7Volumes[ch] : 1.0;
            const effectiveTargetVol = clampedStemGain * cc7Vol;

            if (typeof gainNode.gain.cancelAndHoldAtTime === 'function') {
                gainNode.gain.cancelAndHoldAtTime(now);
            } else {
                const currentVal = gainNode.gain.value;
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(currentVal, now);
            }

            if (durationSec > 0) {
                gainNode.gain.linearRampToValueAtTime(effectiveTargetVol, now + durationSec);
            } else {
                gainNode.gain.setValueAtTime(effectiveTargetVol, now);
            }
        });
    }

    /**
     * Applies environmental acoustic low-pass filtering (e.g. muffled sound behind closed doors or underwater).
     * 
     * @param {'none'|'muffled'|'underwater'|string} filterType - Filter preset name
     * @param {number} [customCutoffHz] - Optional explicit cutoff frequency in Hz
     * @param {number} [rampMs=300] - Ramp transition time in milliseconds
     */
    setEnvironmentalFilter(filterType, customCutoffHz, rampMs = 300) {
        if (!this.ctx || !this.environmentalFilter) return;

        let targetFreq = 20000;
        if (customCutoffHz !== undefined) {
            targetFreq = customCutoffHz;
        } else if (filterType === 'muffled') {
            targetFreq = 800; // Warm indoor/wall muffling
        } else if (filterType === 'underwater') {
            targetFreq = 400; // Deep aquatic muffling
        }

        const now = this.ctx.currentTime;
        this.environmentalFilter.frequency.cancelScheduledValues(now);
        this.environmentalFilter.frequency.setValueAtTime(this.environmentalFilter.frequency.value, now);
        this.environmentalFilter.frequency.exponentialRampToValueAtTime(Math.max(20, targetFreq), now + (rampMs / 1000));
    }

    /**
     * Prunes ended voice objects from activeVoices array to prevent memory leaks.
     */
    pruneEndedVoices() {
        if (!this.ctx) return;
        this.activeVoices = this.activeVoices.filter(v => v && v.sourceNode);
    }

    /**
     * Sets global master music volume.
     * @param {number} volume - Volume (0.0 to 1.0)
     */
    setMasterVolume(volume) {
        if (!this.ctx || !this.masterGain) return;
        const clamped = Math.max(0, Math.min(1, volume));
        this.masterGain.gain.setValueAtTime(clamped, this.ctx.currentTime);
    }

    /**
     * Stops all active notes immediately.
     */
    stopAllVoices() {
        this.activeVoices.forEach(v => v.stopNow());
        this.activeVoices = [];
    }
}

