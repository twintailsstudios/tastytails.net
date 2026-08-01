/**
 * @fileoverview High-Precision Client-Side MIDI Music Engine for TastyTails.net
 * 
 * @description
 * Coordinates MIDI parsing (MidiParser.js) and Web Audio synthesis (WebAudioSynth.js).
 * Implements a high-precision lookahead scheduler loop to prevent audio timing jitter,
 * handles song looping, browser Autoplay policy unlocking, and multi-channel stem crossfading.
 */

import { MidiParser } from './MidiParser.js';
import { WebAudioSynth } from './WebAudioSynth.js';
import { ZoneBusManager } from './ZoneBusManager.js';
import { MusicZoneManager } from './MusicZoneManager.js';
import { AudioCache } from './AudioCache.js';
import { MidiWorkerTimer } from './MidiWorkerTimer.js';

export class MidiEngine {
    constructor() {
        /** @type {WebAudioSynth} */
        this.synth = new WebAudioSynth();
        /** @type {ZoneBusManager} */
        this.zoneBus = new ZoneBusManager();
        /** @type {MusicZoneManager} */
        this.spatialZones = new MusicZoneManager();
        /** @type {AudioCache} */
        this.audioCache = new AudioCache();

        /** @type {Object<number, number>} Pre-allocated reusable gain map buffer for spatial crossfading */
        this._spatialGainsBuffer = {};

        /** @type {Object|null} Active parsed MIDI object */
        this.parsedMidi = null;
        /** @type {Array<number>} Active GM program patch ID for each of the 16 channels */
        this.channelPrograms = new Array(16).fill(0);
        
        /** @type {number} User master volume preference (0.0 - 1.0) */
        this.masterVolume = 0.8;
        /** @type {boolean} Mute audio preference */
        this.isMuted = false;

        this.loadSettings();
        
        /** @type {boolean} State flag indicating if MIDI is playing */
        this.isPlaying = false;
        /** @type {boolean} State flag for song looping */
        this.isLooping = true;
        
        // --- LOOKAHEAD SCHEDULER CONSTANTS ---
        /** @type {number} Scheduler loop interval frequency in milliseconds */
        this.lookaheadMs = 25;
        /** @type {number} Lookahead scheduling window in seconds ahead of currentTime */
        this.scheduleAheadSec = 0.100; // 100ms
        
        /** @type {MidiWorkerTimer} Off-thread Web Worker timer scheduler */
        this.workerTimer = new MidiWorkerTimer(() => this._schedulerLoop(), this.lookaheadMs);
        /** @type {number} AudioContext.currentTime when playback started */
        this.playbackStartTime = 0;
        /** @type {number} Current song position offset in seconds */
        this.songOffsetSec = 0;
        /** @type {Array<number>} Event pointer index per track */
        this.trackPointers = [];
        /** @type {number} Total song length in seconds */
        this.totalDurationSec = 0;
        /** @type {number} Loop start point in seconds */
        this.loopStartSec = 0;
        /** @type {number} Loop end point in seconds */
        this.loopEndSec = 0;

        /** @type {number} Timestamp of last spatial proximity calculation */
        this._lastSpatialCheck = 0;
        /** @type {number} Last applied proximity blend ratio */
        this._lastProximityRatio = 0;
        /** @type {number} Timestamp of last AudioContext auto-resume attempt */
        this._lastResumeAttempt = 0;

        this._setupAutoplayUnlockListeners();
    }

    /**
     * Initializes the Web Audio synth context and unlocks browser Autoplay policies.
     */
    init() {
        this.synth.init();
    }

    /**
     * Attaches global DOM gesture listeners to silently resume AudioContext on user interaction.
     * @private
     */
    _setupAutoplayUnlockListeners() {
        const unlockAudio = () => {
            if (this.synth) {
                this.synth.init();
            }
            window.removeEventListener('pointerdown', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };

        window.addEventListener('pointerdown', unlockAudio);
        window.addEventListener('keydown', unlockAudio);
        window.addEventListener('touchstart', unlockAudio);
    }

    /**
     * Asynchronously fetches and parses a standard MIDI file (.mid).
     * 
     * @param {string} url - URL path to the .mid file (e.g. '/assets/music/test_theme.mid')
     * @returns {Promise<Object>} The parsed MIDI sequence object
     */
    async loadMidi(url) {
        try {
            console.log(`[MidiEngine] Fetching MIDI asset from: ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status} loading MIDI file`);
            }

            const arrayBuffer = await response.arrayBuffer();
            this.parsedMidi = MidiParser.parse(arrayBuffer);
            this._processMidiMetadata();

            console.log(`[MidiEngine] MIDI file loaded successfully. Tracks: ${this.parsedMidi.tracks.length}, Duration: ${this.totalDurationSec.toFixed(2)}s`);
            return this.parsedMidi;
        } catch (err) {
            console.error(`[MidiEngine] Failed to load MIDI file from ${url}:`, err);
            throw err;
        }
    }

    /**
     * Pre-loads General MIDI instrument sample buffers into the synth.
     * 
     * @param {Object<string, string>} sampleUrlsMap - Map of sampleKey -> audio file URL
     */
    async loadSampleBank(sampleUrlsMap) {
        this.init();
        if (!this.synth.ctx) return;

        const promises = Object.entries(sampleUrlsMap).map(async ([key, url]) => {
            try {
                const res = await fetch(url);
                if (!res.ok) return;
                const arrayBuffer = await res.arrayBuffer();
                const decodedBuffer = await this.synth.ctx.decodeAudioData(arrayBuffer);
                this.synth.registerSample(key, decodedBuffer);
                console.log(`[MidiEngine] SoundFont sample '${key}' loaded & decoded.`);
            } catch (err) {
                console.warn(`[MidiEngine] Failed to load SoundFont sample '${key}' from ${url}:`, err);
            }
        });

        await Promise.all(promises);
    }

    /**
     * Inspects parsed MIDI markers and event boundaries to calculate total duration & loop points.
     * @private
     */
    _processMidiMetadata() {
        if (!this.parsedMidi) return;

        let maxTime = 0;
        this.parsedMidi.tracks.forEach(track => {
            if (track.length > 0) {
                const lastEvent = track[track.length - 1];
                if (lastEvent.timeSeconds > maxTime) {
                    maxTime = lastEvent.timeSeconds;
                }
            }
        });

        this.totalDurationSec = maxTime;
        this.loopStartSec = 0;
        this.loopEndSec = maxTime;

        // Check for loop markers embedded in MIDI meta events
        if (this.parsedMidi.markers) {
            this.parsedMidi.markers.forEach(m => {
                const txt = m.text ? m.text.toLowerCase() : '';
                if (txt.includes('loopstart')) {
                    this.loopStartSec = m.timeSeconds || 0;
                } else if (txt.includes('loopend')) {
                    this.loopEndSec = m.timeSeconds || maxTime;
                }
            });
        }

        this._resetTrackPointers();
    }

    /**
     * Resets event index pointers for all tracks to 0 or target offset.
     * @private
     */
    _resetTrackPointers(targetSec = 0) {
        if (!this.parsedMidi) return;

        this.trackPointers = new Array(this.parsedMidi.tracks.length).fill(0);
        
        if (targetSec > 0) {
            this.parsedMidi.tracks.forEach((track, tIdx) => {
                let idx = 0;
                while (idx < track.length && track[idx].timeSeconds < targetSec) {
                    idx++;
                }
                this.trackPointers[tIdx] = idx;
            });
        }
    }

    /**
     * Restores channel instrument programs and controller states up to targetSec.
     * @private
     */
    _restoreChannelStateAt(targetSec = 0) {
        if (!this.parsedMidi) return;

        this.channelPrograms.fill(0);
        for (let c = 0; c < 16; c++) {
            this.synth.setPitchBend(c, 0);
            this.synth.setSustain(c, false);
            this.synth.setChannelExpression(c, 1.0);
            this.synth.setChannelPan(c, 0);
        }

        const tracks = this.parsedMidi.tracks;
        for (let t = 0; t < tracks.length; t++) {
            const track = tracks[t];
            if (!track) continue;
            for (let e = 0; e < track.length; e++) {
                const evt = track[e];
                if (evt.timeSeconds > targetSec) break;

                const type = evt.type;
                if (type !== 'programChange' && type !== 'pitchBend' && type !== 'controller') {
                    continue;
                }

                if (type === 'programChange') {
                    this.channelPrograms[evt.channel] = evt.program;
                } else if (type === 'pitchBend') {
                    this.synth.setPitchBend(evt.channel, evt.value);
                } else if (type === 'controller') {
                    if (evt.controller === 7) {
                        this.synth.setChannelCc7Volume(evt.channel, evt.value / 127);
                    } else if (evt.controller === 11) {
                        this.synth.setChannelExpression(evt.channel, evt.value / 127);
                    } else if (evt.controller === 10) {
                        this.synth.setChannelPan(evt.channel, (evt.value - 64) / 64);
                    } else if (evt.controller === 64) {
                        this.synth.setSustain(evt.channel, evt.value >= 64);
                    }
                }
            }
        }
    }

    /**
     * Starts or resumes MIDI playback.
     */
    play() {
        this.init();
        if (!this.parsedMidi || this.isPlaying) return;

        this.isPlaying = true;
        this.playbackStartTime = this.synth.ctx.currentTime - this.songOffsetSec;

        console.log(`[MidiEngine] Starting playback at offset ${this.songOffsetSec.toFixed(2)}s`);
        this.workerTimer.start();
    }

    /**
     * Pauses MIDI playback.
     */
    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        if (this.synth.ctx) {
            this.songOffsetSec = this.synth.ctx.currentTime - this.playbackStartTime;
        }
        this.workerTimer.stop();
        this.synth.stopAllVoices();
        console.log(`[MidiEngine] Playback paused at offset ${this.songOffsetSec.toFixed(2)}s`);
    }

    /**
     * Stops MIDI playback and resets song position to start.
     */
    stop() {
        this.isPlaying = false;
        this.workerTimer.stop();
        this.songOffsetSec = 0;
        this._resetTrackPointers(0);
        this.synth.stopAllVoices();
        console.log('[MidiEngine] Playback stopped.');
    }

    /**
     * High-precision lookahead event scheduling loop.
     * @private
     */
    _schedulerLoop() {
        if (!this.isPlaying || !this.parsedMidi || !this.synth.ctx) return;

        if (this.synth.ctx.state === 'suspended') {
            const nowMs = performance.now();
            if (!this._lastResumeAttempt || (nowMs - this._lastResumeAttempt) > 2000) {
                this._lastResumeAttempt = nowMs;
                this.synth.ctx.resume().catch(() => {});
            }
            return;
        }
        if (this.synth.ctx.state !== 'running') return;

        const currentSongTime = this.synth.ctx.currentTime - this.playbackStartTime;
        const scheduleUntilTime = currentSongTime + this.scheduleAheadSec;

        // Check if song reached end/loop point
        if (currentSongTime >= this.loopEndSec) {
            if (this.isLooping) {
                console.log(`[MidiEngine] Song reached end (${this.loopEndSec.toFixed(2)}s). Seamlessly looping to start.`);
                this.synth.stopAllVoices();
                this.songOffsetSec = this.loopStartSec;
                this.playbackStartTime = this.synth.ctx.currentTime - this.loopStartSec;
                this._restoreChannelStateAt(this.loopStartSec);
                this._resetTrackPointers(this.loopStartSec);
                return;
            } else {
                this.stop();
                return;
            }
        }

        const tracks = this.parsedMidi.tracks;
        if (!tracks) return;
        const trackCount = tracks.length;

        // Iterate through all tracks using indexed loops (no GC allocations)
        for (let tIdx = 0; tIdx < trackCount; tIdx++) {
            const track = tracks[tIdx];
            if (!track) continue;

            let p = this.trackPointers[tIdx] || 0;

            while (p < track.length) {
                const evt = track[p];
                if (!evt || evt.timeSeconds > scheduleUntilTime) {
                    break; // Event is beyond lookahead window, stop checking this track for now
                }

                // Calculate exact AudioContext scheduling timestamp
                const scheduledAudioTime = this.playbackStartTime + evt.timeSeconds;
                const type = evt.type;

                if (type === 'noteOn') {
                    const program = this.channelPrograms[evt.channel] || 0;
                    this.synth.noteOn(evt.channel, evt.note, evt.velocity, program, scheduledAudioTime);
                } else if (type === 'noteOff') {
                    this.synth.noteOff(evt.channel, evt.note, scheduledAudioTime);
                } else if (type === 'programChange') {
                    this.channelPrograms[evt.channel] = evt.program;
                } else if (type === 'pitchBend') {
                    this.synth.setPitchBend(evt.channel, evt.value);
                } else if (type === 'controller') {
                    if (evt.controller === 7) { // Channel Volume controller
                        const vol = evt.value / 127;
                        this.synth.setChannelCc7Volume(evt.channel, vol);
                    } else if (evt.controller === 11) { // Expression controller
                        this.synth.setChannelExpression(evt.channel, evt.value / 127);
                    } else if (evt.controller === 10) { // Pan controller
                        this.synth.setChannelPan(evt.channel, (evt.value - 64) / 64);
                    } else if (evt.controller === 64) { // Sustain Pedal
                        this.synth.setSustain(evt.channel, evt.value >= 64);
                    } else if (evt.controller === 121) { // Reset All Controllers
                        this.synth.setSustain(evt.channel, false);
                        this.synth.setPitchBend(evt.channel, 0);
                        this.synth.setChannelExpression(evt.channel, 1.0);
                    } else if (evt.controller === 123) { // All Notes Off
                        this.synth.stopAllVoices();
                    }
                }

                p++;
            }

            this.trackPointers[tIdx] = p;
        }
    }

    /**
     * Smoothly crossfades active music stems to the target zone (e.g., 'pub', 'overworld', 'cave').
     * Core mechanism for Banjo-Kazooie adaptive music transitions.
     * 
     * @param {string} zoneKey - Target zone identifier (e.g., 'pub')
     * @param {number} [fadeTimeMs=1000] - Crossfade transition time in milliseconds
     */
    fadeToZone(zoneKey, fadeTimeMs = 1000) {
        if (!this.zoneBus) return;
        const targetGains = this.zoneBus.calculateGainsForZone(zoneKey, this._spatialGainsBuffer);
        this.synth.setMultiChannelVolumes(targetGains, fadeTimeMs);
        console.log(`[MidiEngine] Fading to zone '${zoneKey}' over ${fadeTimeMs}ms`);
    }

    /**
     * Blends channel gains continuously between two zones based on spatial proximity ratio.
     * Uses equal-power crossfading (cos/sin curve) to maintain constant acoustic loudness.
     * 
     * @param {string} fromZone - Outgoing zone key
     * @param {string} toZone - Incoming zone key
     * @param {number} ratio - Proximity ratio (0.0 = 100% fromZone, 1.0 = 100% toZone)
     * @param {number} [fadeTimeMs=100] - Quick interpolation smoothing time in milliseconds
     */
    setZoneProximity(fromZone, toZone, ratio, fadeTimeMs = 100, maxBlend = 0.6) {
        if (!this.zoneBus) return;
        const targetGains = this.zoneBus.calculateGainsForProximity(fromZone, toZone, ratio, true, this._spatialGainsBuffer, maxBlend);
        this.synth.setMultiChannelVolumes(targetGains, fadeTimeMs);
    }

    /**
     * Evaluates local player coordinates against registered Tiled spatial music zones
     * and automatically triggers stem crossfading or proximity blending.
     * 
     * @param {number} px - Player X coordinate
     * @param {number} py - Player Y coordinate
     * @param {Object} [options] - Options object
     * @param {boolean} [options.force=false] - Force zone volume application even if zone key hasn't changed
     * @param {number} [options.fadeTimeMs] - Custom override crossfade time in ms
     */
    updatePlayerPosition(px, py, options = {}) {
        if (!this.spatialZones) return;

        const evalResult = this.spatialZones.evaluatePosition(px, py);
        const currentZone = this.getCurrentZone();
        const force = Boolean(options.force);
        const overrideFadeTime = options.fadeTimeMs !== undefined ? options.fadeTimeMs : null;

        // 1. Discrete Zone Boundary Change or Forced Initial Sync: Process immediately!
        if (force || (evalResult.targetZone && evalResult.targetZone !== currentZone)) {
            this._lastProximityRatio = 0;
            const fadeTime = overrideFadeTime !== null ? overrideFadeTime : (evalResult.fadeTimeMs || 1000);
            this.fadeToZone(evalResult.targetZone, fadeTime);
            return;
        }

        if (!this.isPlaying) return;

        // OPTIMIZATION: Throttle continuous door proximity updates to 20Hz (50ms) and enforce a 1% delta threshold
        // to prevent Web Audio AudioParam gain node zipper noise and crackling during high-framerate player movement.
        const now = performance.now();
        if (this._lastSpatialCheck && (now - this._lastSpatialCheck) < 50) {
            return;
        }
        this._lastSpatialCheck = now;

        if (evalResult.proximityZone && evalResult.proximityRatio > 0) {
            if (Math.abs((this._lastProximityRatio || 0) - evalResult.proximityRatio) > 0.01) {
                this._lastProximityRatio = evalResult.proximityRatio;
                this.setZoneProximity(currentZone, evalResult.proximityZone, evalResult.proximityRatio, 100);
            }
        }
    }

    /**
     * Instantly evaluates spawn coordinates (px, py) and applies initial zone channel gain levels with 0ms crossfade.
     * Called during character spawn before audio playback starts or loading overlay screen fades out.
     * 
     * @param {number} px - Character spawn X coordinate
     * @param {number} py - Character spawn Y coordinate
     */
    applyInitialZoneState(px, py) {
        this.init();
        this.updatePlayerPosition(px, py, { force: true, fadeTimeMs: 0 });
    }

    /**
     * Returns currently active zone key.
     * @returns {string}
     */
    getCurrentZone() {
        return this.zoneBus ? this.zoneBus.currentZone : 'overworld';
    }

    /**
     * Solos a specific channel for debugging.
     * @param {number} channel 
     */
    soloChannel(channel) {
        if (!this.zoneBus) return;
        this.zoneBus.soloChannel(channel);
        this.fadeToZone(this.getCurrentZone(), 100);
    }

    /**
     * Clears all channel solos.
     */
    unsoloAll() {
        if (!this.zoneBus) return;
        this.zoneBus.unsoloAll();
        this.fadeToZone(this.getCurrentZone(), 100);
    }

    /**
     * Mutes a specific channel.
     * @param {number} channel 
     */
    muteChannel(channel) {
        if (!this.zoneBus) return;
        this.zoneBus.muteChannel(channel);
        this.fadeToZone(this.getCurrentZone(), 100);
    }

    /**
     * Unmutes a specific channel.
     * @param {number} channel 
     */
    unmuteChannel(channel) {
        if (!this.zoneBus) return;
        this.zoneBus.unmuteChannel(channel);
        this.fadeToZone(this.getCurrentZone(), 100);
    }

    /**
     * Loads saved audio settings from localStorage.
     */
    loadSettings() {
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem('tastytails_audio_settings');
            if (raw) {
                const settings = JSON.parse(raw);
                if (settings.masterVolume !== undefined) {
                    this.masterVolume = Math.max(0, Math.min(1, Number(settings.masterVolume)));
                }
                if (settings.isMuted !== undefined) {
                    this.isMuted = Boolean(settings.isMuted);
                }
            }
        } catch (err) {}
    }

    /**
     * Saves active audio settings to localStorage.
     */
    saveSettings() {
        if (typeof localStorage === 'undefined') return;
        try {
            const payload = {
                masterVolume: this.masterVolume,
                isMuted: this.isMuted
            };
            localStorage.setItem('tastytails_audio_settings', JSON.stringify(payload));
        } catch (err) {}
    }

    /**
     * Toggles master audio muting.
     * @returns {boolean} New mute state
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.setMasterVolume(this.masterVolume);
        this.saveSettings();
        return this.isMuted;
    }

    /**
     * Sets master music volume and persists choice to localStorage.
     * @param {number} volume - Volume level (0.0 to 1.0)
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, Number(volume)));
        const effectiveVol = this.isMuted ? 0.0 : this.masterVolume;
        this.synth.setMasterVolume(effectiveVol);
        this.saveSettings();
    }

    /**
     * Destroys engine instance and cleans up audio nodes & timers.
     */
    destroy() {
        this.stop();
        if (this.workerTimer) {
            this.workerTimer.destroy();
        }
        if (this.spatialZones) {
            this.spatialZones.clearZones();
        }
        if (this.synth) {
            this.synth.stopAllVoices();
        }
        console.log('[MidiEngine] Engine instance destroyed.');
    }
}

