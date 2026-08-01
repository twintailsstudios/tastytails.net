import assert from 'assert';
import { MidiParser } from '../src/client/js/game/audio/MidiParser.js';

describe('MidiParser', function () {
    it('should parse a valid binary Standard MIDI File (SMF Format 1) buffer', function () {
        const header = [
            0x4D, 0x54, 0x68, 0x64, // 'MThd'
            0x00, 0x00, 0x00, 0x06, // length 6
            0x00, 0x01,             // format 1
            0x00, 0x02,             // 2 tracks
            0x01, 0xE0              // 480 PPQ (0x01E0)
        ];

        // Track 1 (Tempo Track): MTrk, length 11, delta 0, Meta Tempo 0x51 0x03 0x07A120 (500000 µs = 120 BPM), delta 0, Meta EndOfTrack 0x2F 0x00
        const track1 = [
            0x4D, 0x54, 0x72, 0x6B, // 'MTrk'
            0x00, 0x00, 0x00, 0x0B, // length 11
            0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20, // Tempo = 500,000 µs/qn (120 BPM)
            0x00, 0xFF, 0x2F, 0x00                    // End of Track
        ];

        // Track 2 (Note Track): MTrk, length 16, delta 0 NoteOn (Ch 0, Note 60, Vel 100), delta 480 (1 quarter note) NoteOff (Ch 0, Note 60, Vel 0), EndOfTrack
        const track2 = [
            0x4D, 0x54, 0x72, 0x6B, // 'MTrk'
            0x00, 0x00, 0x00, 0x10, // length 16
            0x00, 0x90, 0x3C, 0x64, // delta 0, NoteOn Ch 0, Note 60, Vel 100
            0x83, 0x60, 0x80, 0x3C, 0x00, // VLQ delta 480 (0x83 0x60), NoteOff Ch 0, Note 60, Vel 0
            0x00, 0xFF, 0x2F, 0x00  // End of Track
        ];

        const midiBytes = new Uint8Array([...header, ...track1, ...track2]);
        const result = MidiParser.parse(midiBytes.buffer);

        assert.strictEqual(result.header.formatType, 1);
        assert.strictEqual(result.header.trackCount, 2);
        assert.strictEqual(result.header.ppq, 480);
        assert.strictEqual(result.tracks.length, 2);
        assert.strictEqual(result.tempoMap[0].bpm, 120);

        // Check note events in track 2
        const track2Events = result.tracks[1];
        assert.strictEqual(track2Events[0].type, 'noteOn');
        assert.strictEqual(track2Events[0].note, 60);
        assert.strictEqual(track2Events[0].timeSeconds, 0);

        assert.strictEqual(track2Events[1].type, 'noteOff');
        assert.strictEqual(track2Events[1].note, 60);
        assert.strictEqual(track2Events[1].timeSeconds, 0.5); // 1 quarter note at 120 BPM = 0.5 seconds
    });

    it('should sort simultaneous tick events by audio priority (programChange & controller before noteOn)', function () {
        const header = [
            0x4D, 0x54, 0x68, 0x64, // 'MThd'
            0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, // format 0
            0x00, 0x01, // 1 track
            0x01, 0xE0  // 480 PPQ
        ];

        // Track with delta 0 NoteOn, delta 0 Controller (Volume), delta 0 ProgramChange placed out of order in binary
        const track = [
            0x4D, 0x54, 0x72, 0x6B, // 'MTrk'
            0x00, 0x00, 0x00, 0x15, // length 21
            0x00, 0x90, 0x3C, 0x64, // delta 0 NoteOn
            0x00, 0xB0, 0x07, 0x64, // delta 0 ControlChange (Volume)
            0x00, 0xC0, 0x05,       // delta 0 ProgramChange
            0x00, 0xFF, 0x2F, 0x00  // End of Track
        ];

        const midiBytes = new Uint8Array([...header, ...track]);
        const result = MidiParser.parse(midiBytes.buffer);
        const events = result.tracks[0];

        // Verify sorted priority: programChange -> controller -> noteOn -> meta (End of Track last)
        const eventTypes = events.map(e => e.type);
        assert.deepStrictEqual(eventTypes, ['programChange', 'controller', 'noteOn', 'meta']);
    });

    it('should calculate O(N) absolute seconds accurately across multi-tempo changes', function () {
        const header = [
            0x4D, 0x54, 0x68, 0x64, // 'MThd'
            0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, // format 0
            0x00, 0x01, // 1 track
            0x01, 0xE0  // 480 PPQ
        ];

        // Tempo 120 BPM (500k µs) at tick 0, then Tempo 240 BPM (250k µs) at tick 480 (0.5s), NoteOn at tick 960 (0.75s)
        const track = [
            0x4D, 0x54, 0x72, 0x6B,
            0x00, 0x00, 0x00, 0x1A,
            0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20, // delta 0, Tempo 120 BPM
            0x83, 0x60, 0xFF, 0x51, 0x03, 0x03, 0xD0, 0x90, // delta 480, Tempo 240 BPM (250,000 µs)
            0x83, 0x60, 0x90, 0x3C, 0x64,                   // delta 480, NoteOn
            0x00, 0xFF, 0x2F, 0x00
        ];

        const midiBytes = new Uint8Array([...header, ...track]);
        const result = MidiParser.parse(midiBytes.buffer);
        const noteOnEvent = result.tracks[0].find(e => e.type === 'noteOn');

        // Tick 0 -> 480 = 0.5s (at 120 BPM)
        // Tick 480 -> 960 = 0.25s (at 240 BPM)
        // Total time = 0.75s
        assert.strictEqual(noteOnEvent.tick, 960);
        assert.strictEqual(noteOnEvent.timeSeconds, 0.75);
    });

    it('should advance offset safely on unhandled/corrupt status bytes without looping endlessly', function () {
        const header = [
            0x4D, 0x54, 0x68, 0x64, // 'MThd'
            0x00, 0x00, 0x00, 0x06,
            0x00, 0x00, // format 0
            0x00, 0x01, // 1 track
            0x01, 0xE0  // 480 PPQ
        ];

        // Track with unknown status byte 0xF5 (unhandled System Common status byte)
        const track = [
            0x4D, 0x54, 0x72, 0x6B,
            0x00, 0x00, 0x00, 0x06, // length 6: delta 0, status 0xF5, delta 0, Meta EndOfTrack (0xFF 0x2F 0x00)
            0x00, 0xF5,             // delta 0, unknown status byte 0xF5
            0x00, 0xFF, 0x2F, 0x00  // delta 0, End of Track
        ];

        const midiBytes = new Uint8Array([...header, ...track]);
        const result = MidiParser.parse(midiBytes.buffer);

        assert.strictEqual(result.tracks.length, 1);
    });
});
