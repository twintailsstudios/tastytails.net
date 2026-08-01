import assert from 'assert';
import { PunctuationParser } from '../src/client/js/game/audio/PunctuationParser.js';
import { VoiceSynthEngine } from '../src/client/js/game/audio/VoiceSynthEngine.js';

describe('PunctuationParser', function () {
    const parser = new PunctuationParser();

    it('should identify pure action messages (*gives a hug*) as non-dialogue', function () {
        const res = parser.parseMessage('*gives a hug*');
        assert.strictEqual(res.hasDialogue, false);
        assert.strictEqual(res.isPureAction, true);
        assert.strictEqual(res.clauses.length, 0);
    });

    it('should parse quoted dialogue correctly', function () {
        const res = parser.parseMessage('"Hey! How are you?"');
        assert.strictEqual(res.hasDialogue, true);
        assert.strictEqual(res.isPureAction, false);
        assert.strictEqual(res.clauses.length, 2);

        // First clause: "Hey!"
        assert.strictEqual(res.clauses[0].punctuation, 'exclamation');
        assert.ok(res.clauses[0].pitchModifier > 1.0);
        assert.ok(res.clauses[0].volumeModifier > 1.0);

        // Second clause: "How are you?"
        assert.strictEqual(res.clauses[1].punctuation, 'question');
        assert.strictEqual(res.clauses[1].glissando, true);
    });

    it('should parse mixed actions and dialogue correctly', function () {
        const res = parser.parseMessage('*sighs deeply* "What a long day..."');
        assert.strictEqual(res.hasDialogue, true);
        assert.strictEqual(res.isPureAction, false);
        assert.strictEqual(res.clauses.length, 1);
        assert.strictEqual(res.clauses[0].punctuation, 'ellipsis');
        assert.ok(res.clauses[0].rateModifier < 1.0); // Slowed speed
        assert.ok(res.clauses[0].pitchModifier < 1.0); // Dropped pitch
        assert.ok(res.clauses[0].pauseAfterMs > 0);
    });

    it('should detect ALL CAPS emphasis', function () {
        const res = parser.parseMessage('"WATCH OUT!"');
        assert.strictEqual(res.hasDialogue, true);
        assert.strictEqual(res.clauses.length, 1);
        assert.strictEqual(res.clauses[0].punctuation, 'exclamation');
        // ALL CAPS applies additional boost on top of exclamation
        assert.ok(res.clauses[0].volumeModifier >= 1.35);
        assert.ok(res.clauses[0].pitchModifier >= 1.25);
    });

    it('should detect tildes (~) for vibrato wavers', function () {
        const res = parser.parseMessage('"See you later~"');
        assert.strictEqual(res.hasDialogue, true);
        assert.strictEqual(res.clauses[0].punctuation, 'tilde');
        assert.strictEqual(res.clauses[0].vibrato, true);
    });

    it('should ignore unquoted text and treat it as non-dialogue', function () {
        const res = parser.parseMessage('Hello there, my friend.');
        assert.strictEqual(res.hasDialogue, false);
        assert.strictEqual(res.clauses.length, 0);
    });

    it('should parse smart quotes (“...”) correctly', function () {
        const res = parser.parseMessage('“Hello there!”');
        assert.strictEqual(res.hasDialogue, true);
        assert.strictEqual(res.clauses.length, 1);
        assert.strictEqual(res.clauses[0].punctuation, 'exclamation');
    });

    it('should tokenize text into digraphs and single letter phonemes', function () {
        const tokens = parser.tokenizePhonemes('The chat photo 123.');
        assert.ok(tokens.includes('th'));
        assert.ok(tokens.includes('ch'));
        assert.ok(tokens.includes('ph'));
        assert.ok(tokens.includes('dot'));
        assert.ok(tokens.length >= 10);
    });

    it('should expand compound phonemes (x, q, w) and filter silent trailing e', function () {
        const tokens = parser.tokenizePhonemes('make quiet fox');
        // 'make' -> 'm', 'a', 'k' (silent 'e' omitted)
        // 'quiet' -> 'k', 'w', 'i', 'e', 't'
        // 'fox' -> 'f', 'o', 'k', 's'
        assert.ok(tokens.includes('k'));
        assert.ok(tokens.includes('s'));
        assert.ok(tokens.includes('u'));
        assert.ok(!tokens.includes('x'));
        assert.ok(!tokens.includes('q'));
    });
});

describe('VoiceSynthEngine', function () {
    const parser = new PunctuationParser();
    const synth = new VoiceSynthEngine(null); // Node environment without native WebAudio AudioContext

    it('should calculate blurb metadata without throwing when AudioContext is null', function () {
        const parsed = parser.parseMessage('"Hello! How are you today?"');
        const blurb = synth.synthesizeBlurb(parsed, {
            basePitch: 1.2,
            syllableRate: 8.0
        });

        assert.ok(blurb !== null);
        assert.ok(blurb.scheduledCount > 0);
        assert.ok(blurb.durationSec > 0);
    });

    it('should return null when synthesizing pure action text', function () {
        const parsed = parser.parseMessage('*nods quietly*');
        const blurb = synth.synthesizeBlurb(parsed);
        assert.strictEqual(blurb, null);
    });

    it('should merge voice profile overrides with defaults', function () {
        const parsed = parser.parseMessage('"Testing voice profile overrides."');
        const customProfile = {
            basePitch: 1.8,
            syllableRate: 10.0,
            oscillatorType: 'sine'
        };

        const blurb = synth.synthesizeBlurb(parsed, customProfile);
        assert.ok(blurb !== null);
        assert.ok(blurb.scheduledCount >= 3);
    });

    it('should calculate metadata cleanly for low pitch back-vowel sentences', function () {
        const parsed = parser.parseMessage('"Oh hello! How are you doing today?"');
        const lowPitchProfile = {
            basePitch: 1.00,
            pitchVariance: 0.10,
            syllableRate: 7.0,
            oscillatorType: 'sawtooth'
        };

        const blurb = synth.synthesizeBlurb(parsed, lowPitchProfile);
        assert.ok(blurb !== null);
        assert.ok(blurb.scheduledCount > 10);
        assert.ok(blurb.durationSec > 0.5);
    });

    it('should enforce Animalese Golden Cap (max 20 phonemes / 2.5s duration) on long dialogue paragraphs', function () {
        const longText = '"Greetings fellow traveler! I have traveled across the vast seas and climbed the highest mountains to bring you this rare treasure from afar!"';
        const parsed = parser.parseMessage(longText);
        const blurb = synth.synthesizeBlurb(parsed, {
            basePitch: 1.5,
            syllableRate: 9.5
        });

        assert.ok(blurb !== null);
        assert.ok(blurb.scheduledCount <= 20);
        assert.ok(blurb.durationSec <= 2.6);
    });
});
