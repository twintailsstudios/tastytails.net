import assert from 'assert';
import { MidiWorkerTimer } from '../src/client/js/game/audio/MidiWorkerTimer.js';

describe('MidiWorkerTimer Unit Tests', function () {
    it('should instantiate clean MidiWorkerTimer instance with default properties', function () {
        let tickCount = 0;
        const timer = new MidiWorkerTimer(() => tickCount++, 25);

        assert.strictEqual(timer.intervalMs, 25);
        assert.strictEqual(timer.running, false);
        assert.strictEqual(timer.fallbackTimerId, null);
        timer.destroy();
    });

    it('should set running state to true on start() and false on stop()', function () {
        let tickCount = 0;
        const timer = new MidiWorkerTimer(() => tickCount++, 25);

        timer.start();
        assert.strictEqual(timer.running, true);

        timer.stop();
        assert.strictEqual(timer.running, false);
        assert.strictEqual(timer.fallbackTimerId, null);
        timer.destroy();
    });

    it('should trigger callback cleanly via main-thread fallback timer', function (done) {
        let tickCount = 0;
        // Instantiate without worker support simulation
        const timer = new MidiWorkerTimer(() => {
            tickCount++;
            if (tickCount >= 2) {
                timer.stop();
                assert.strictEqual(timer.running, false);
                assert.ok(tickCount >= 2);
                timer.destroy();
                done();
            }
        }, 10);

        // Force fallback mode for Node unit test environment where Worker / Blob URLs differ
        timer.worker = null;
        timer.start();
    });

    it('should handle tick callback errors gracefully without throwing', function (done) {
        let attempts = 0;
        const timer = new MidiWorkerTimer(() => {
            attempts++;
            if (attempts === 1) {
                throw new Error('Simulated callback error');
            }
            if (attempts === 2) {
                timer.stop();
                timer.destroy();
                done();
            }
        }, 10);

        timer.worker = null;
        timer.start();
    });

    it('should safely terminate and destroy timer instance', function () {
        const timer = new MidiWorkerTimer(() => {}, 25);
        timer.start();
        timer.destroy();

        assert.strictEqual(timer.running, false);
        assert.strictEqual(timer.worker, null);
        assert.strictEqual(timer.fallbackTimerId, null);
    });
});
