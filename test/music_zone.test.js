import assert from 'assert';
import { MusicZoneManager } from '../src/client/js/game/audio/MusicZoneManager.js';

describe('MusicZoneManager', function () {
    it('should register rectangular music zones', function () {
        const mzm = new MusicZoneManager();
        mzm.registerZone({
            key: 'pub',
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            doorX: 200,
            doorY: 300,
            proximityRadius: 100
        });

        assert.strictEqual(mzm.zones.length, 1);
        assert.strictEqual(mzm.zones[0].key, 'pub');
    });

    it('should correctly evaluate position inside a zone box', function () {
        const mzm = new MusicZoneManager();
        mzm.registerZone({
            key: 'pub',
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            fadeTimeMs: 1200
        });

        // Test inside (150, 150)
        const res = mzm.evaluatePosition(150, 150, 1000);
        assert.strictEqual(res.targetZone, 'pub');
        assert.strictEqual(res.fadeTimeMs, 1200);

        // Test outside (50, 50) -> should evaluate to default 'overworld'
        const resOutside = mzm.evaluatePosition(50, 50, 2000);
        assert.strictEqual(resOutside.targetZone, 'overworld');
    });

    it('should calculate proximity blend ratio when near entrance door', function () {
        const mzm = new MusicZoneManager();
        mzm.registerZone({
            key: 'pub',
            x: 1000, // Far away box
            y: 1000,
            width: 200,
            height: 200,
            doorX: 500,
            doorY: 500,
            proximityRadius: 100
        });

        // Player at (500, 550) -> 50px away from door (radius 100px) -> ratio 0.5
        const resNear = mzm.evaluatePosition(500, 550, 1000);
        assert.strictEqual(resNear.proximityZone, 'pub');
        assert.strictEqual(resNear.proximityRatio.toFixed(2), '0.50');

        // Player at door (500, 500) -> 0px away -> ratio 1.0
        const resAtDoor = mzm.evaluatePosition(500, 500, 1000);
        assert.strictEqual(resAtDoor.proximityZone, 'pub');
        assert.strictEqual(resAtDoor.proximityRatio.toFixed(2), '1.00');
    });

    it('should enforce hysteresis debouncing between rapid shifts', function () {
        const mzm = new MusicZoneManager();
        mzm.registerZone({ key: 'pub', x: 100, y: 100, width: 100, height: 100 });

        // Step 1: Inside pub at time = 1000
        let res = mzm.evaluatePosition(150, 150, 1000);
        assert.strictEqual(res.targetZone, 'pub');

        // Step 2: Step outside 50ms later at time = 1050 (below debounceMs 300ms)
        res = mzm.evaluatePosition(10, 10, 1050);
        assert.strictEqual(res.targetZone, 'pub'); // Remains 'pub' due to debounce

        // Step 3: Step outside at time = 1500 (> 300ms later)
        res = mzm.evaluatePosition(10, 10, 1500);
        assert.strictEqual(res.targetZone, 'overworld'); // Switched to overworld
    });

    it('should reuse result object reference to avoid Garbage Collection allocations in hot loops', function () {
        const mzm = new MusicZoneManager();
        mzm.registerZone({ key: 'pub', x: 100, y: 100, width: 100, height: 100 });

        const res1 = mzm.evaluatePosition(150, 150, 1000);
        const res2 = mzm.evaluatePosition(50, 50, 2000);

        // References must be identical object instance to prevent GC sweeps
        assert.strictEqual(res1, res2);
    });

    it('should apply spatial hysteresis padding when checking active zone boundary', function () {
        const mzm = new MusicZoneManager();
        mzm.registerZone({ key: 'pub', x: 100, y: 100, width: 100, height: 100 });

        // Step 1: Player inside pub (150, 150)
        mzm.evaluatePosition(150, 150, 1000);
        assert.strictEqual(mzm.activeZone, 'pub');

        // Step 2: Player steps just 5px outside zone boundary at (95, 150) at t = 2000ms (> debounceMs)
        // Since hysteresisPadding is 16px, player is still within padding zone for active zone 'pub'
        const resNearBoundary = mzm.evaluatePosition(95, 150, 2000);
        assert.strictEqual(resNearBoundary.targetZone, 'pub');

        // Step 3: Player moves 25px outside boundary at (70, 150) at t = 2500ms (> 16px padding)
        const resFarOutside = mzm.evaluatePosition(70, 150, 2500);
        assert.strictEqual(resFarOutside.targetZone, 'overworld');
    });
});

