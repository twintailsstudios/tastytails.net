import assert from 'assert';
import { getPreset, getAllPresets, sanitizeProfile } from '../src/client/js/game/audio/VoiceProfilePresets.js';
import { VoiceStudioPanel } from '../src/client/js/creator/VoiceStudioPanel.js';

describe('VoiceProfilePresets', function () {
    it('should retrieve presets by key cleanly', function () {
        const femMid = getPreset('fem_mid');
        assert.strictEqual(femMid.name, 'Feminine - Medium');
        assert.strictEqual(femMid.basePitch, 1.65);

        const mascLow = getPreset('masc_low');
        assert.strictEqual(mascLow.name, 'Masculine - Low');
        assert.strictEqual(mascLow.basePitch, 1.00);
    });

    it('should fall back to default fem_mid preset for unknown keys', function () {
        const unknown = getPreset('invalid_key_xyz');
        assert.strictEqual(unknown.key, 'fem_mid');
    });

    it('should return all 6 available presets in a list', function () {
        const all = getAllPresets();
        assert.ok(Array.isArray(all));
        assert.strictEqual(all.length, 6);
        assert.ok(all.some(p => p.key === 'fem_high'));
        assert.ok(all.some(p => p.key === 'masc_high'));
    });

    it('should sanitize and clamp profile properties within valid audio bounds', function () {
        const wildProfile = {
            basePitch: 99.0,         // Clamps to 2.20
            pitchVariance: -5.0,      // Clamps to 0.05
            syllableRate: 100.0,      // Clamps to 11.5
            lowPassCutoffHz: 10,      // Clamps to 1000
            oscillatorType: 'invalid' // Falls back to 'triangle'
        };

        const clean = sanitizeProfile(wildProfile);
        assert.strictEqual(clean.basePitch, 2.20);
        assert.strictEqual(clean.pitchVariance, 0.05);
        assert.strictEqual(clean.syllableRate, 11.5);
        assert.strictEqual(clean.lowPassCutoffHz, 1000);
        assert.strictEqual(clean.oscillatorType, 'triangle');
    });
});

describe('VoiceStudioPanel', function () {
    let panel;

    beforeEach(function () {
        panel = new VoiceStudioPanel(null, getPreset('fem_mid'));
    });

    it('should initialize with sanitized voice profile', function () {
        const profile = panel.getProfileJSON();
        assert.strictEqual(profile.basePitch, 1.65);
        assert.strictEqual(profile.oscillatorType, 'triangle');
    });

    it('should allow updating fields and clamping updated values', function () {
        panel.updateField('basePitch', 1.8);
        assert.strictEqual(panel.getProfileJSON().basePitch, 1.8);

        panel.updateField('lowPassCutoffHz', 2500);
        assert.strictEqual(panel.getProfileJSON().lowPassCutoffHz, 2500);
    });

    it('should select preset profiles and load sanitized properties', function () {
        panel.selectPreset('masc_low');
        const profile = panel.getProfileJSON();
        assert.strictEqual(profile.basePitch, 1.00);
        assert.strictEqual(profile.oscillatorType, 'sawtooth');
    });

    it('should execute test blurb synthesis cleanly without errors', function () {
        const resNormal = panel.testBlurb('"Testing standard voice blurb."', '');
        assert.ok(resNormal.blurb !== null);
        assert.ok(resNormal.blurb.scheduledCount > 0);

        const resLaugh = panel.testBlurb('"Testing laugh emote voice blurb!"', '/laugh');
        assert.ok(resLaugh.blurb !== null);
        assert.strictEqual(resLaugh.emotePrefix, '/laugh');
    });
});
