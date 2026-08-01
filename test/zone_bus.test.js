import assert from 'assert';
import { ZoneBusManager } from '../src/client/js/game/audio/ZoneBusManager.js';

describe('ZoneBusManager', function () {
    it('should initialize default zone mappings for overworld, pub, cave, underwater', function () {
        const zb = new ZoneBusManager();
        const summary = zb.getDebugSummary();

        assert.deepStrictEqual(summary.mappings.overworld, [0, 1, 2, 3]);
        assert.deepStrictEqual(summary.mappings.pub, [4, 5, 6, 7]);
        assert.deepStrictEqual(summary.mappings.cave, [8, 9, 10, 11]);
        assert.deepStrictEqual(summary.mappings.underwater, [12, 13, 14, 15]);
    });

    it('should calculate correct channel gain targets when transitioning to pub zone', function () {
        const zb = new ZoneBusManager();
        const gains = zb.calculateGainsForZone('pub');

        // Pub channels (4, 5, 6, 7) should be 1.0
        assert.strictEqual(gains[4], 1.0);
        assert.strictEqual(gains[5], 1.0);
        assert.strictEqual(gains[6], 1.0);
        assert.strictEqual(gains[7], 1.0);

        // Overworld channels (0, 1, 2, 3) should be 0.0
        assert.strictEqual(gains[0], 0.0);
        assert.strictEqual(gains[1], 0.0);
        assert.strictEqual(gains[2], 0.0);
        assert.strictEqual(gains[3], 0.0);
    });

    it('should calculate proximity blend gains correctly at 50% between overworld and pub', function () {
        const zb = new ZoneBusManager();
        const gains = zb.calculateGainsForProximity('overworld', 'pub', 0.5);

        // Overworld channels (0-3) should be 0.5
        assert.strictEqual(gains[0], 0.5);
        assert.strictEqual(gains[1], 0.5);

        // Pub channels (4-7) should be 0.5
        assert.strictEqual(gains[4], 0.5);
        assert.strictEqual(gains[5], 0.5);

        // Other channels (8-15) should be 0.0
        assert.strictEqual(gains[8], 0.0);
    });

    it('should respect channel mute and solo overrides', function () {
        const zb = new ZoneBusManager();
        
        // Mute channel 5
        zb.muteChannel(5);
        let gains = zb.calculateGainsForZone('pub');
        assert.strictEqual(gains[4], 1.0);
        assert.strictEqual(gains[5], 0.0); // Muted

        // Solo channel 4
        zb.soloChannel(4);
        gains = zb.calculateGainsForZone('pub');
        assert.strictEqual(gains[4], 1.0); // Soloed
        assert.strictEqual(gains[6], 0.0); // Silenced because non-soloed
    });

    it('should calculate equal-power proximity blend gains when requested', function () {
        const zb = new ZoneBusManager();
        const gains = zb.calculateGainsForProximity('overworld', 'pub', 0.5, true);

        // Overworld channels (0-3) should be ~0.7071 (cos(PI/4))
        assert.strictEqual(Math.round(gains[0] * 1000) / 1000, 0.707);
        // Pub channels (4-7) should be ~0.7071 (sin(PI/4))
        assert.strictEqual(Math.round(gains[4] * 1000) / 1000, 0.707);
    });

    it('should support passing pre-allocated target gains buffer to avoid GC churn', function () {
        const zb = new ZoneBusManager();
        const customBuffer = {};
        const returned = zb.calculateGainsForZone('overworld', customBuffer);

        // Should populate and return customBuffer
        assert.strictEqual(returned, customBuffer);
        assert.strictEqual(customBuffer[0], 1.0);
    });
});


