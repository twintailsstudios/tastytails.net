import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create binary SMF Format 1 file with 3 tracks:
// Track 0: Tempo & Conductor Track (120 BPM)
// Track 1: Overworld Theme (Ch 0: Piano C4-E4-G4-C5 melody)
// Track 2: Pub Variation (Ch 4: Honky-tonk Piano C3-G3-C3-G3 bass & chords)

const header = [
    0x4D, 0x54, 0x68, 0x64, // 'MThd'
    0x00, 0x00, 0x00, 0x06, // Length 6
    0x00, 0x01,             // Format 1
    0x00, 0x03,             // 3 Tracks
    0x01, 0xE0              // 480 PPQ
];

// Track 0: Tempo track
const track0 = [
    0x4D, 0x54, 0x72, 0x6B,
    0x00, 0x00, 0x00, 0x0B,
    0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20, // 120 BPM
    0x00, 0xFF, 0x2F, 0x00
];

// Track 1: Overworld Melody (Ch 0)
// Notes: C4 (60), E4 (64), G4 (67), C5 (72)
const track1Data = [
    0x00, 0xC0, 0x00,                         // Program Change Ch 0 -> Piano (0)
    0x00, 0x90, 0x3C, 0x64,                   // C4 Note On
    0x83, 0x60, 0x80, 0x3C, 0x00,             // C4 Note Off (480 ticks)
    0x00, 0x90, 0x40, 0x64,                   // E4 Note On
    0x83, 0x60, 0x80, 0x40, 0x00,             // E4 Note Off (480 ticks)
    0x00, 0x90, 0x43, 0x64,                   // G4 Note On
    0x83, 0x60, 0x80, 0x43, 0x00,             // G4 Note Off (480 ticks)
    0x00, 0x90, 0x48, 0x64,                   // C5 Note On
    0x83, 0x60, 0x80, 0x48, 0x00,             // C5 Note Off (480 ticks)
    0x00, 0xFF, 0x2F, 0x00                    // End of Track
];

const track1Length = track1Data.length;
const track1Header = [
    0x4D, 0x54, 0x72, 0x6B,
    (track1Length >> 24) & 0xFF,
    (track1Length >> 16) & 0xFF,
    (track1Length >> 8) & 0xFF,
    track1Length & 0xFF
];
const track1 = [...track1Header, ...track1Data];

// Track 2: Pub Variation (Ch 4)
// Notes: C3 (48), G3 (55), C3 (48), G3 (55) in sync
const track2Data = [
    0x00, 0xC4, 0x15,                         // Program Change Ch 4 -> Accordion (21)
    0x00, 0x94, 0x30, 0x64,                   // C3 Note On
    0x83, 0x60, 0x84, 0x30, 0x00,             // C3 Note Off
    0x00, 0x94, 0x37, 0x64,                   // G3 Note On
    0x83, 0x60, 0x84, 0x37, 0x00,             // G3 Note Off
    0x00, 0x94, 0x30, 0x64,                   // C3 Note On
    0x83, 0x60, 0x84, 0x30, 0x00,             // C3 Note Off
    0x00, 0x94, 0x37, 0x64,                   // G3 Note On
    0x83, 0x60, 0x84, 0x37, 0x00,             // G3 Note Off
    0x00, 0xFF, 0x2F, 0x00                    // End of Track
];

const track2Length = track2Data.length;
const track2Header = [
    0x4D, 0x54, 0x72, 0x6B,
    (track2Length >> 24) & 0xFF,
    (track2Length >> 16) & 0xFF,
    (track2Length >> 8) & 0xFF,
    track2Length & 0xFF
];
const track2 = [...track2Header, ...track2Data];

const midiBuffer = Buffer.from([...header, ...track0, ...track1, ...track2]);
const outPath = path.join(__dirname, '../src/client/assets/music/test_theme.mid');

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, midiBuffer);
console.log(`Generated test MIDI asset at: ${outPath} (${midiBuffer.length} bytes)`);
