import assert from 'assert';
import { CrowdVoiceManager } from '../src/client/js/game/audio/CrowdVoiceManager.js';

describe('CrowdVoiceManager', function () {
    let cvm;

    beforeEach(function () {
        cvm = new CrowdVoiceManager();
    });

    it('should evaluate Zone 1 (0 to 3 tiles) as clear audio with full gain and 4000Hz filter', function () {
        // Speaker at (32, 0) -> 1 tile away from listener (0, 0)
        const res = cvm.evaluateSpatialVoice({ x: 32, y: 0 }, { x: 0, y: 0 });
        assert.strictEqual(res.zone, 1);
        assert.strictEqual(res.isMuted, false);
        assert.strictEqual(res.gain, 1.0);
        assert.strictEqual(res.filterCutoffHz, 4000);
        assert.strictEqual(res.dTiles, 1.0);
    });

    it('should evaluate Zone 2 (3 to 6 tiles) with exponential gain decay and low-pass muffling', function () {
        // Speaker at (144, 0) -> 4.5 tiles away from listener (0, 0)
        const res = cvm.evaluateSpatialVoice({ x: 144, y: 0 }, { x: 0, y: 0 });
        assert.strictEqual(res.zone, 2);
        assert.strictEqual(res.isMuted, false);
        assert.ok(res.gain < 1.0 && res.gain > 0.2);
        assert.ok(res.filterCutoffHz < 4000 && res.filterCutoffHz >= 800);
        assert.strictEqual(res.dTiles, 4.5);
    });

    it('should evaluate Zone 3 (> 6 tiles) as hard muted (gain = 0.0, isMuted = true)', function () {
        // Speaker at (256, 0) -> 8 tiles away from listener (0, 0)
        const res = cvm.evaluateSpatialVoice({ x: 256, y: 0 }, { x: 0, y: 0 });
        assert.strictEqual(res.zone, 3);
        assert.strictEqual(res.isMuted, true);
        assert.strictEqual(res.gain, 0.0);
        assert.strictEqual(res.dTiles, 8.0);
    });

    it('should calculate higher priority scores for targeted speakers and dialogue messages', function () {
        // Read scalar priority score for untargeted non-dialogue speaker 2 tiles away
        const scoreUntargeted = cvm.evaluateSpatialVoice({ x: 64, y: 0 }, { x: 0, y: 0 }, { isTarget: false, hasDialogue: false }).priorityScore;

        // Read scalar priority score for targeted dialogue speaker 2 tiles away
        const scoreTargeted = cvm.evaluateSpatialVoice({ x: 64, y: 0 }, { x: 0, y: 0 }, { isTarget: true, hasDialogue: true }).priorityScore;

        assert.ok(scoreTargeted > scoreUntargeted);
        // Targeted multiplier (2.0) * dialogue multiplier (1.5) = 3.0x higher priority
        assert.strictEqual((scoreTargeted / scoreUntargeted).toFixed(1), '3.0');
    });

    it('should enforce polyphony cap (max 3 active voices) and reject lower priority candidate when full', function () {
        // Fill 3 polyphony slots
        assert.strictEqual(cvm.requestVoiceSlot('v1', 'spk1', 2.0, 1.5, 10.0).allowed, true);
        assert.strictEqual(cvm.requestVoiceSlot('v2', 'spk2', 1.8, 1.5, 10.0).allowed, true);
        assert.strictEqual(cvm.requestVoiceSlot('v3', 'spk3', 1.5, 1.5, 10.0).allowed, true);

        // Try to add 4th voice with lower priority (1.0) -> should be rejected
        const res4 = cvm.requestVoiceSlot('v4', 'spk4', 1.0, 1.5, 10.0);
        assert.strictEqual(res4.allowed, false);
        assert.strictEqual(res4.evictedVoiceId, null);
        assert.strictEqual(cvm.activeVoices.length, 3);
    });

    it('should perform voice stealing when polyphony cap is full and a higher priority voice arrives', function () {
        // Fill 3 polyphony slots
        cvm.requestVoiceSlot('v1', 'spk1', 2.0, 1.5, 10.0);
        cvm.requestVoiceSlot('v2', 'spk2', 1.8, 1.5, 10.0);
        cvm.requestVoiceSlot('v3', 'spk3', 0.8, 1.5, 10.0); // Lowest priority slot

        // Try to add 4th voice with higher priority (3.0) -> should evict v3 (score 0.8)
        const res4 = cvm.requestVoiceSlot('v4', 'spk4', 3.0, 1.5, 10.0);
        assert.strictEqual(res4.allowed, true);
        assert.strictEqual(res4.evictedVoiceId, 'v3');
        assert.strictEqual(cvm.activeVoices.length, 3);

        const ids = cvm.activeVoices.map(v => v.voiceId);
        assert.ok(ids.includes('v4'));
        assert.ok(!ids.includes('v3'));
    });

    it('should prune expired active voices automatically', function () {
        cvm.requestVoiceSlot('v1', 'spk1', 2.0, 1.0, 10.0); // Duration 1.0s -> ends at 11.0s
        assert.strictEqual(cvm.activeVoices.length, 1);

        // Prune at time = 12.0s (> 11.0s)
        cvm.pruneActiveVoices(12.0);
        assert.strictEqual(cvm.activeVoices.length, 0);
    });

    it('should return dynamic ducking factor of 0.5 (-6dB) when Zone 1 voice is active', function () {
        assert.strictEqual(cvm.getDuckingFactor(10.0), 1.0); // No active voices -> 1.0

        // Add Zone 1 voice
        cvm.requestVoiceSlot('v1', 'spk1', 2.0, 1.5, 10.0, true); // isZone1 = true
        assert.strictEqual(cvm.getDuckingFactor(10.5), 0.5); // Ducking active -> 0.5

        // After blurb ends (12.0s) -> ducking resets to 1.0
        assert.strictEqual(cvm.getDuckingFactor(12.0), 1.0);
    });

    it('should respect targetOnlyMode preference toggle', function () {
        cvm.targetOnlyMode = true;

        // Non-targeted speaker -> hard muted
        const resUntargeted = cvm.evaluateSpatialVoice({ x: 32, y: 0 }, { x: 0, y: 0 }, { isTarget: false });
        assert.strictEqual(resUntargeted.isMuted, true);
        assert.strictEqual(resUntargeted.gain, 0.0);

        // Targeted speaker -> clear audio
        const resTargeted = cvm.evaluateSpatialVoice({ x: 32, y: 0 }, { x: 0, y: 0 }, { isTarget: true });
        assert.strictEqual(resTargeted.isMuted, false);
        assert.strictEqual(resTargeted.gain, 1.0);
    });
});
