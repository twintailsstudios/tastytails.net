/**
 * @fileoverview Character Creator Voice Synthesizer Studio UI Component for TastyTails.net
 * 
 * @description
 * Manages the Voice Synthesizer Studio UI panel in character creation, offering preset templates,
 * real-time parameter sliders, interactive test blurbs, emote audio preview triggers,
 * and profile JSON serialization.
 */

import { VoiceSynthEngine } from '../game/audio/VoiceSynthEngine.js';
import { PunctuationParser } from '../game/audio/PunctuationParser.js';
import { getPreset, getAllPresets, getRandomPreset, sanitizeProfile } from '../game/audio/VoiceProfilePresets.js';

export class VoiceStudioPanel {
    /**
     * @param {HTMLElement|null} [containerElement=null] Parent DOM element for UI rendering
     * @param {Object} [initialProfile=null] Optional starting voice profile
     */
    constructor(containerElement = null, initialProfile = null) {
        /** @type {HTMLElement|null} */
        this.container = containerElement;

        /** @type {VoiceSynthEngine} */
        this.synth = new VoiceSynthEngine();
        /** @type {PunctuationParser} */
        this.parser = new PunctuationParser();

        /** @type {Object} Active voice profile settings */
        this.currentProfile = sanitizeProfile(initialProfile || getRandomPreset());

        if (this.container && typeof document !== 'undefined') {
            this.renderUI();
        }
    }

    /**
     * Loads a new voice profile object into the studio.
     * 
     * @param {Object} profileObj 
     */
    loadProfile(profileObj) {
        this.currentProfile = sanitizeProfile(profileObj);
        if (this.container) {
            this._syncUIFromProfile();
        }
    }

    /**
     * Selects a preset voice profile by key (e.g. 'fem_mid', 'masc_low').
     * 
     * @param {string} presetKey 
     */
    selectPreset(presetKey) {
        const preset = getPreset(presetKey);
        this.loadProfile(preset);
    }

    /**
     * Updates a single voice profile property and clamps it within valid bounds.
     * 
     * @param {string} key 
     * @param {any} val 
     */
    updateField(key, val) {
        if (!key) return;
        this.currentProfile[key] = val;
        this.currentProfile = sanitizeProfile(this.currentProfile);
    }

    /**
     * Returns sanitized voice profile JSON object for character saving.
     * 
     * @returns {Object}
     */
    getProfileJSON() {
        return Object.assign({}, this.currentProfile);
    }

    /**
     * Synthesizes an interactive preview speech blurb using current voice profile settings.
     * Supports optional emote command overrides (/laugh, /blush, /playful).
     * 
     * @param {string} [textInput='"Hello! How are you today?"'] - Test text
     * @param {string} [emotePrefix=''] - Optional emote command (e.g. '/laugh')
     * @returns {{
     *   text: string,
     *   emotePrefix: string,
     *   blurb: Object|null
     * }} Preview result metadata
     */
    testBlurb(textInput = '"Hello! How are you today?"', emotePrefix = '') {
        const fullText = emotePrefix ? `${emotePrefix} ${textInput}` : textInput;
        const parsed = this.parser.parseMessage(fullText);

        // Apply emote Audio DSP overrides if present
        const effectiveProfile = Object.assign({}, this.currentProfile);
        const prefix = String(emotePrefix).toLowerCase();

        if (prefix === '/laugh') {
            effectiveProfile.basePitch *= 1.30;
            effectiveProfile.syllableRate *= 1.40;
            effectiveProfile.pitchVariance = Math.min(0.5, effectiveProfile.pitchVariance * 1.5);
        } else if (prefix === '/blush') {
            effectiveProfile.basePitch *= 1.15;
            effectiveProfile.syllableRate *= 0.75;
            effectiveProfile.lowPassCutoffHz = Math.max(500, Math.round(effectiveProfile.lowPassCutoffHz * 0.7));
        } else if (prefix === '/playful') {
            effectiveProfile.basePitch *= 1.20;
            effectiveProfile.pitchVariance = Math.min(0.5, effectiveProfile.pitchVariance * 1.8);
        }

        const blurb = this.synth.synthesizeBlurb(parsed, effectiveProfile);

        return {
            text: fullText,
            emotePrefix,
            blurb
        };
    }

    /**
     * Renders the Voice Studio UI elements inside the container element.
     */
    renderUI() {
        if (!this.container || typeof document === 'undefined') return;

        this.container.innerHTML = '';
        this.container.className = 'voice-studio-panel';

        const presets = getAllPresets();
        const femPresets = presets.filter(p => p.profile.group === 'Feminine');
        const mascPresets = presets.filter(p => p.profile.group === 'Masculine');

        // Template HTML structure for Voice Studio UI
        const html = `
            <div class="voice-studio-header">
                <h3>Voice Synthesizer Studio</h3>
                <p>Customize your character's procedural speech sound & tone</p>
            </div>

            <div class="voice-preset-row">
                <label for="voice-preset-select">Preset Template: <span class="info-token" tabindex="0" data-tooltip="Pick a pre-made voice style to quickly set your character's vocal baseline.">i</span></label>
                <select id="voice-preset-select" class="voice-select">
                    <optgroup label="Feminine">
                        ${femPresets.map(p => `<option value="${p.key}">${p.name}</option>`).join('')}
                    </optgroup>
                    <optgroup label="Masculine">
                        ${mascPresets.map(p => `<option value="${p.key}">${p.name}</option>`).join('')}
                    </optgroup>
                </select>
            </div>

            <div class="voice-controls-grid">
                <div class="control-group">
                    <label>Base Pitch (<span id="val-pitch">${this.currentProfile.basePitch}</span>x) <span class="info-token" tabindex="0" data-tooltip="Controls how high or deep your voice sounds. Slide left for a deep, heavy voice or right for a high, squeaky voice.">i</span></label>
                    <input type="range" id="slider-pitch" min="1.00" max="2.20" step="0.01" value="${this.currentProfile.basePitch}" />
                </div>

                <div class="control-group">
                    <label>Pitch Variance (<span id="val-variance">${this.currentProfile.pitchVariance}</span>) <span class="info-token" tabindex="0" data-tooltip="Controls pitch bouncing while speaking. Keep it low for a steady, serious voice or turn it up for a silly, expressive voice.">i</span></label>
                    <input type="range" id="slider-variance" min="0.05" max="0.30" step="0.01" value="${this.currentProfile.pitchVariance}" />
                </div>

                <div class="control-group">
                    <label>Speech Cadence (<span id="val-rate">${this.currentProfile.syllableRate}</span> /s) <span class="info-token" tabindex="0" data-tooltip="Controls how fast your character talks. Slide left for slow, sleepy speech or right for rapid, hyperactive chatter.">i</span></label>
                    <input type="range" id="slider-rate" min="6.5" max="11.5" step="0.5" value="${this.currentProfile.syllableRate}" />
                </div>

                <div class="control-group">
                    <label>Tone Muffle / Low-Pass (<span id="val-muffle">${this.currentProfile.lowPassCutoffHz}</span>Hz) <span class="info-token" tabindex="0" data-tooltip="Controls voice clarity. Turn down to sound like speaking through a helmet or wall, or turn up for crisp, clear speech.">i</span></label>
                    <input type="range" id="slider-muffle" min="1000" max="6000" step="100" value="${this.currentProfile.lowPassCutoffHz}" />
                </div>

                <div class="control-group">
                    <label>Speech Legato / Blurring (<span id="val-legato">${this.currentProfile.legatoOverlap ?? 0.02}</span>s) <span class="info-token" tabindex="0" data-tooltip="Controls how letter sounds blend. Turn down for distinct, dotted speech or turn up for smooth, continuous bubbly babble.">i</span></label>
                    <input type="range" id="slider-legato" min="0.010" max="0.035" step="0.005" value="${this.currentProfile.legatoOverlap ?? 0.02}" />
                </div>
            </div>

            <div class="voice-test-studio">
                <label for="voice-test-input">Test Speech Sentence:</label>
                <input type="text" id="voice-test-input" value='"Hello! How are you today?"' class="voice-input" />
                
                <div class="voice-test-buttons">
                    <button type="button" id="btn-test-normal" class="btn-voice">Play Standard</button>
                    <button type="button" id="btn-test-laugh" class="btn-voice">Test /laugh</button>
                    <button type="button" id="btn-test-blush" class="btn-voice">Test /blush</button>
                    <button type="button" id="btn-test-playful" class="btn-voice">Test /playful</button>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
        this._bindUIEvents();
    }

    /**
     * Binds DOM event listeners to UI inputs and sliders.
     * @private
     */
    _bindUIEvents() {
        if (!this.container) return;

        const presetSelect = this.container.querySelector('#voice-preset-select');
        const pitchSlider = this.container.querySelector('#slider-pitch');
        const varianceSlider = this.container.querySelector('#slider-variance');
        const rateSlider = this.container.querySelector('#slider-rate');
        const muffleSlider = this.container.querySelector('#slider-muffle');
        const legatoSlider = this.container.querySelector('#slider-legato');
        const testInput = this.container.querySelector('#voice-test-input');

        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => this.selectPreset(e.target.value));
        }

        if (pitchSlider) {
            pitchSlider.addEventListener('input', (e) => {
                this.updateField('basePitch', e.target.value);
                const el = this.container.querySelector('#val-pitch');
                if (el) el.textContent = this.currentProfile.basePitch;
            });
        }

        if (varianceSlider) {
            varianceSlider.addEventListener('input', (e) => {
                this.updateField('pitchVariance', e.target.value);
                const el = this.container.querySelector('#val-variance');
                if (el) el.textContent = this.currentProfile.pitchVariance;
            });
        }

        if (rateSlider) {
            rateSlider.addEventListener('input', (e) => {
                this.updateField('syllableRate', e.target.value);
                const el = this.container.querySelector('#val-rate');
                if (el) el.textContent = this.currentProfile.syllableRate;
            });
        }

        if (muffleSlider) {
            muffleSlider.addEventListener('input', (e) => {
                this.updateField('lowPassCutoffHz', e.target.value);
                const el = this.container.querySelector('#val-muffle');
                if (el) el.textContent = this.currentProfile.lowPassCutoffHz;
            });
        }

        if (legatoSlider) {
            legatoSlider.addEventListener('input', (e) => {
                this.updateField('legatoOverlap', e.target.value);
                const el = this.container.querySelector('#val-legato');
                if (el) el.textContent = this.currentProfile.legatoOverlap;
            });
        }

        const btnNormal = this.container.querySelector('#btn-test-normal');
        const btnLaugh = this.container.querySelector('#btn-test-laugh');
        const btnBlush = this.container.querySelector('#btn-test-blush');
        const btnPlayful = this.container.querySelector('#btn-test-playful');

        const getTestText = () => (testInput ? testInput.value : '"Hello! How are you today?"');

        if (btnNormal) btnNormal.addEventListener('click', () => this.testBlurb(getTestText(), ''));
        if (btnLaugh) btnLaugh.addEventListener('click', () => this.testBlurb(getTestText(), '/laugh'));
        if (btnBlush) btnBlush.addEventListener('click', () => this.testBlurb(getTestText(), '/blush'));
        if (btnPlayful) btnPlayful.addEventListener('click', () => this.testBlurb(getTestText(), '/playful'));
    }

    /**
     * Synchronizes UI input values from the current voice profile.
     * @private
     */
    _syncUIFromProfile() {
        if (!this.container) return;

        const pitchSlider = this.container.querySelector('#slider-pitch');
        const varianceSlider = this.container.querySelector('#slider-variance');
        const rateSlider = this.container.querySelector('#slider-rate');
        const muffleSlider = this.container.querySelector('#slider-muffle');

        if (pitchSlider) pitchSlider.value = this.currentProfile.basePitch;
        if (varianceSlider) varianceSlider.value = this.currentProfile.pitchVariance;
        if (rateSlider) rateSlider.value = this.currentProfile.syllableRate;
        if (muffleSlider) muffleSlider.value = this.currentProfile.lowPassCutoffHz;

        const valPitch = this.container.querySelector('#val-pitch');
        const valVariance = this.container.querySelector('#val-variance');
        const valRate = this.container.querySelector('#val-rate');
        const valMuffle = this.container.querySelector('#val-muffle');

        if (valPitch) valPitch.textContent = this.currentProfile.basePitch;
        if (valVariance) valVariance.textContent = this.currentProfile.pitchVariance;
        if (valRate) valRate.textContent = this.currentProfile.syllableRate;
        if (valMuffle) valMuffle.textContent = this.currentProfile.lowPassCutoffHz;
    }
}

if (typeof window !== 'undefined') {
    window.VoiceStudioPanel = VoiceStudioPanel;
}
