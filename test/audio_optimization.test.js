import assert from 'assert';
import { AudioCache } from '../src/client/js/game/audio/AudioCache.js';

describe('AudioCache & Optimization', function () {
    it('should instantiate AudioCache instance cleanly', function () {
        const cache = new AudioCache();
        assert.strictEqual(cache.dbName, 'TastyTailsAudioDB');
        assert.strictEqual(cache.storeName, 'audio_buffers');
        assert.strictEqual(cache.db, null);
        assert.strictEqual(cache.initPromise, null);
        assert.strictEqual(cache.maxMemoryItems, 50);
        assert.ok(cache.memoryCache instanceof Map);
    });

    it('should store in L1 memory cache and return sliced copy to prevent decoder detachment', async function () {
        const cache = new AudioCache();
        const dummyBuffer = new ArrayBuffer(8);
        const view = new Uint8Array(dummyBuffer);
        view[0] = 42;

        await cache.setBuffer('sample-1', dummyBuffer);
        assert.strictEqual(cache.memoryCache.has('sample-1'), true);

        const fetchedBuffer = await cache.getBuffer('sample-1');
        assert.ok(fetchedBuffer instanceof ArrayBuffer);
        assert.notStrictEqual(fetchedBuffer, dummyBuffer, 'Must return a sliced clone, not same reference');
        assert.strictEqual(fetchedBuffer.byteLength, 8);
        assert.strictEqual(new Uint8Array(fetchedBuffer)[0], 42);
    });

    it('should evict oldest L1 cache entry when exceeding maxMemoryItems limit', async function () {
        const cache = new AudioCache();
        cache.maxMemoryItems = 3;

        await cache.setBuffer('k1', new ArrayBuffer(4));
        await cache.setBuffer('k2', new ArrayBuffer(4));
        await cache.setBuffer('k3', new ArrayBuffer(4));
        assert.strictEqual(cache.memoryCache.size, 3);

        await cache.setBuffer('k4', new ArrayBuffer(4));
        assert.strictEqual(cache.memoryCache.size, 3);
        assert.strictEqual(cache.memoryCache.has('k1'), false, 'Oldest entry k1 should have been evicted');
        assert.strictEqual(cache.memoryCache.has('k4'), true);
    });

    it('should delete memory cache entries cleanly', async function () {
        const cache = new AudioCache();
        await cache.setBuffer('sample-del', new ArrayBuffer(4));
        assert.strictEqual(cache.memoryCache.has('sample-del'), true);

        await cache.deleteBuffer('sample-del');
        assert.strictEqual(cache.memoryCache.has('sample-del'), false);
    });

    it('should clear memory cache cleanly', async function () {
        const cache = new AudioCache();
        await cache.setBuffer('s1', new ArrayBuffer(4));
        await cache.setBuffer('s2', new ArrayBuffer(4));

        await cache.clear();
        assert.strictEqual(cache.memoryCache.size, 0);
    });
});

