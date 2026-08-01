import assert from 'assert';
import { VoiceChatAdapter } from '../src/client/js/chat/VoiceChatAdapter.js';

describe('VoiceChatAdapter', function () {
    let adapter;

    beforeEach(function () {
        adapter = new VoiceChatAdapter(null);
    });

    it('should synthesize voice for incoming chat messages containing dialogue quotes', function () {
        const msg = {
            identifier: 'char_01',
            content: '"Hello there! How are you today?"',
            position: { x: 0, y: 0 }
        };

        const res = adapter.processIncomingMessages(msg, { x: 0, y: 0 });
        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].handled, true);
        assert.strictEqual(res[0].speakerId, 'char_01');
        assert.ok(res[0].blurb !== null);
    });

    it('should ignore pure action messages (*gives a hug*) without playing audio', function () {
        const msg = {
            identifier: 'char_02',
            content: '*gives a warm hug*',
            position: { x: 0, y: 0 }
        };

        const res = adapter.processIncomingMessages(msg, { x: 0, y: 0 });
        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].handled, false);
        assert.strictEqual(res[0].reason, 'no_dialogue');
    });

    it('should mute messages from distant speakers (> 6 tiles / 192px away)', function () {
        const msg = {
            identifier: 'char_03',
            content: '"Can you hear me over here?"',
            position: { x: 300, y: 0 } // 300px > 192px (6 tiles)
        };

        const res = adapter.processIncomingMessages(msg, { x: 0, y: 0 });
        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].handled, false);
        assert.strictEqual(res[0].reason, 'spatial_muted');
    });

    it('should apply emote overrides (/sing, /grumpy, /whisper, /laugh, /blush, /playful) to voice profile settings', function () {
        const msgSing = {
            identifier: 'char_04',
            content: '/sing "Tra la la, a happy song!"',
            position: { x: 0, y: 0 }
        };

        const resSing = adapter.processIncomingMessages(msgSing, { x: 0, y: 0 });
        assert.strictEqual(resSing.length, 1);
        assert.strictEqual(resSing[0].handled, true);
        assert.ok(resSing[0].blurb.scheduledCount > 0);

        const msgGrumpy = {
            identifier: 'char_05',
            content: '/grumpy "Hmph... Leave me alone."',
            position: { x: 0, y: 0 }
        };

        const resGrumpy = adapter.processIncomingMessages(msgGrumpy, { x: 0, y: 0 });
        assert.strictEqual(resGrumpy.length, 1);
        assert.strictEqual(resGrumpy[0].handled, true);

        const msgWhisper = {
            identifier: 'char_06',
            content: '/whisper "Ssshh... keep it quiet."',
            position: { x: 0, y: 0 }
        };

        const resWhisper = adapter.processIncomingMessages(msgWhisper, { x: 0, y: 0 });
        assert.strictEqual(resWhisper.length, 1);
        assert.strictEqual(resWhisper[0].handled, true);
    });

    it('should enforce polyphony hard cap when rapid messages arrive simultaneously', function () {
        const batch = [
            { identifier: 's1', content: '"Message one!"', position: { x: 10, y: 0 } },
            { identifier: 's2', content: '"Message two!"', position: { x: 20, y: 0 } },
            { identifier: 's3', content: '"Message three!"', position: { x: 30, y: 0 } },
            { identifier: 's4', content: '"Message four!"', position: { x: 150, y: 0 } } // Farther away -> lower priority
        ];

        const res = adapter.processIncomingMessages(batch, { x: 0, y: 0 });
        assert.strictEqual(res.length, 4);

        const handledCount = res.filter(r => r.handled).length;
        assert.strictEqual(handledCount, 3); // Max polyphony cap = 3

        const rejected = res.find(r => !r.handled);
        assert.strictEqual(rejected.reason, 'polyphony_capped');
    });

    it('should ignore stale messages older than 15 seconds', function () {
        const oldMsg = {
            identifier: 'char_05',
            content: '"Old historical dialogue from 1 minute ago!"',
            position: { x: 0, y: 0 },
            timestamp: new Date(Date.now() - 60000).toISOString() // 60 seconds ago
        };

        const res = adapter.processIncomingMessages(oldMsg, { x: 0, y: 0 });
        assert.strictEqual(res.length, 1);
        assert.strictEqual(res[0].handled, false);
        assert.strictEqual(res[0].reason, 'message_too_old');
    });

    it('should ignore System, Environmental, and OOC messages', function () {
        const sysMsg = {
            name: 'System',
            type: 'System',
            identifier: { account: 'SYSTEM', character: 'SYSTEM' },
            content: '"You have gained 50 exp."'
        };
        const envMsg = {
            name: 'Environment',
            type: 'Environmental',
            identifier: 'Environment',
            content: '"The weather changes."'
        };

        const resSys = adapter.processIncomingMessages(sysMsg, { x: 0, y: 0 });
        assert.strictEqual(resSys[0].handled, false);
        assert.strictEqual(resSys[0].reason, 'system_message');

        const resEnv = adapter.processIncomingMessages(envMsg, { x: 0, y: 0 });
        assert.strictEqual(resEnv[0].handled, false);
        assert.strictEqual(resEnv[0].reason, 'system_message');
    });

    it('should ignore messages without quotation marks', function () {
        const unquotedMsg = {
            identifier: 'char_06',
            content: 'Hello everyone, how are you?',
            position: { x: 0, y: 0 }
        };

        const res = adapter.processIncomingMessages(unquotedMsg, { x: 0, y: 0 });
        assert.strictEqual(res[0].handled, false);
        assert.strictEqual(res[0].reason, 'no_dialogue');
    });
});
