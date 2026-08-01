/**
 * @fileoverview Standard MIDI File (SMF Format 0 & 1) Binary Parser for TastyTails.net
 * 
 * @description
 * High-level architectural role: Parses binary `.mid` ArrayBuffers into structured,
 * time-sorted event tracks for the client Web Audio playback engine (MidiEngine.js).
 * Handles Variable Length Quantity (VLQ) delta times, running status bytes,
 * channel messages (Note On/Off, Controller, Program Change, Pitch Bend),
 * meta events (Tempo MPQN, Time Signature, Markers, Track Names),
 * and enforces deterministic event priority sorting for clean, pop-free audio playback.
 * 
 * Triggered by: MidiEngine.loadMidi(url) during audio asset preloading.
 */

/**
 * Event priority map for deterministic audio processing.
 * When multiple events occur at the exact same tick, evaluating them in this order
 * ensures synths receive meta updates, instrument changes, and volume/pan controllers
 * BEFORE notes are struck, and releases old notes before striking new ones.
 */
const EVENT_PRIORITY = {
    meta: 0,
    programChange: 1,
    controller: 2,
    pitchBend: 3,
    noteOff: 4,
    noteOn: 5
};

const textDecoder = new TextDecoder('latin1');

export class MidiParser {
    /**
     * Parses an ArrayBuffer containing a standard MIDI file (.mid).
     * @param {ArrayBuffer} arrayBuffer - Binary buffer of the loaded .mid file
     * @returns {Object} Parsed MIDI object containing header, tempo map, markers, and track event streams.
     */
    static parse(arrayBuffer) {
        const data = new DataView(arrayBuffer);
        // OPTIMIZATION: Use persistent state pointer to eliminate GC allocation overhead per VLQ read
        const state = { offset: 0 };

        // 1. Read Header Chunk (MThd)
        const headerHeader = String.fromCharCode(data.getUint8(state.offset), data.getUint8(state.offset+1), data.getUint8(state.offset+2), data.getUint8(state.offset+3));
        state.offset += 4;
        if (headerHeader !== 'MThd') {
            throw new Error(`[MidiParser] Invalid MIDI file header: expected 'MThd', found '${headerHeader}'`);
        }

        const headerLength = data.getUint32(state.offset);
        state.offset += 4;
        const formatType = data.getUint16(state.offset);
        state.offset += 2;
        const trackCount = data.getUint16(state.offset);
        state.offset += 2;
        const timeDivision = data.getUint16(state.offset);
        state.offset += 2;

        // Skip any extra header bytes if length > 6
        if (headerLength > 6) {
            state.offset += (headerLength - 6);
        }

        let ticksPerQuarterNote = 480;
        if ((timeDivision & 0x8000) === 0) {
            ticksPerQuarterNote = timeDivision;
        } else {
            console.warn('[MidiParser] SMPTE time division detected, falling back to 480 PPQ default.');
        }

        const parsedTracks = [];
        const tempoMap = [{ tick: 0, mpqn: 500000, bpm: 120, timeSeconds: 0 }]; // Default 120 BPM (500,000 µs/qn)
        const markers = [];

        // 2. Read Track Chunks (MTrk)
        for (let t = 0; t < trackCount && state.offset < data.byteLength; t++) {
            const trackHeader = String.fromCharCode(data.getUint8(state.offset), data.getUint8(state.offset+1), data.getUint8(state.offset+2), data.getUint8(state.offset+3));
            state.offset += 4;

            if (trackHeader !== 'MTrk') {
                console.warn(`[MidiParser] Expected 'MTrk' at offset ${state.offset - 4}, found '${trackHeader}'. Skipping track.`);
                break;
            }

            const trackLength = data.getUint32(state.offset);
            state.offset += 4;
            const trackEndOffset = state.offset + trackLength;

            const events = [];
            let currentTick = 0;
            let runningStatus = null;

            while (state.offset < trackEndOffset && state.offset < data.byteLength) {
                // Read VLQ delta-time
                const deltaTime = MidiParser._readVLQ(data, state);
                currentTick += deltaTime;

                if (state.offset >= data.byteLength) break;

                let eventTypeByte = data.getUint8(state.offset);

                // Running status check (SMF optimization: omit status byte if identical to preceding channel event)
                if (eventTypeByte < 0x80) {
                    if (!runningStatus) {
                        throw new Error(`[MidiParser] Corrupt MIDI: Running status missing at offset ${state.offset}`);
                    }
                    eventTypeByte = runningStatus;
                } else {
                    state.offset++;
                }

                if (eventTypeByte === 0xFF) {
                    // Meta Event (Meta events do not alter running status per SMF specification)
                    const metaType = data.getUint8(state.offset);
                    state.offset++;

                    const metaLength = MidiParser._readVLQ(data, state);
                    const metaDataOffset = state.offset;
                    state.offset += metaLength;

                    if (metaType === 0x51 && metaLength === 3) {
                        // Tempo Meta Event (Microseconds Per Quarter Note)
                        const mpqn = (data.getUint8(metaDataOffset) << 16) | (data.getUint8(metaDataOffset + 1) << 8) | data.getUint8(metaDataOffset + 2);
                        const bpm = 60000000 / mpqn;
                        tempoMap.push({ tick: currentTick, mpqn, bpm });
                    } else if (metaType === 0x06 || metaType === 0x01 || metaType === 0x03) {
                        // Text / Track Name / Marker
                        // OPTIMIZATION: Use native TextDecoder instead of character concatenation loops
                        const bytes = new Uint8Array(data.buffer, data.byteOffset + metaDataOffset, metaLength);
                        const text = textDecoder.decode(bytes);

                        if (metaType === 0x06 || metaType === 0x01) {
                            markers.push({ tick: currentTick, text });
                        }
                        events.push({ tick: currentTick, type: 'meta', metaType, text });
                    } else {
                        events.push({ tick: currentTick, type: 'meta', metaType });
                    }

                    if (metaType === 0x2F) {
                        // End of Track
                        break;
                    }

                } else if (eventTypeByte === 0xF0 || eventTypeByte === 0xF7) {
                    // System Exclusive Event (resets running status)
                    runningStatus = null;
                    const sysExLen = MidiParser._readVLQ(data, state);
                    state.offset += sysExLen;
                } else {
                    // Channel Event
                    runningStatus = eventTypeByte;
                    const typeHigh = eventTypeByte & 0xF0;
                    const channel = eventTypeByte & 0x0F;

                    if (typeHigh === 0x80) {
                        // Note Off
                        const note = data.getUint8(state.offset);
                        const velocity = data.getUint8(state.offset + 1);
                        state.offset += 2;
                        events.push({ tick: currentTick, type: 'noteOff', channel, note, velocity });
                    } else if (typeHigh === 0x90) {
                        // Note On (or Note Off if velocity is 0)
                        const note = data.getUint8(state.offset);
                        const velocity = data.getUint8(state.offset + 1);
                        state.offset += 2;
                        if (velocity === 0) {
                            events.push({ tick: currentTick, type: 'noteOff', channel, note, velocity: 0 });
                        } else {
                            events.push({ tick: currentTick, type: 'noteOn', channel, note, velocity });
                        }
                    } else if (typeHigh === 0xA0) {
                        // Polyphonic Key Pressure
                        state.offset += 2;
                    } else if (typeHigh === 0xB0) {
                        // Control Change
                        const controller = data.getUint8(state.offset);
                        const value = data.getUint8(state.offset + 1);
                        state.offset += 2;
                        events.push({ tick: currentTick, type: 'controller', channel, controller, value });
                    } else if (typeHigh === 0xC0) {
                        // Program Change (Instrument Select)
                        const program = data.getUint8(state.offset);
                        state.offset += 1;
                        events.push({ tick: currentTick, type: 'programChange', channel, program });
                    } else if (typeHigh === 0xD0) {
                        // Channel Pressure
                        state.offset += 1;
                    } else if (typeHigh === 0xE0) {
                        // Pitch Bend
                        const lsb = data.getUint8(state.offset);
                        const msb = data.getUint8(state.offset + 1);
                        state.offset += 2;
                        const value = ((msb << 7) | lsb) - 8192; // Centered around 0
                        events.push({ tick: currentTick, type: 'pitchBend', channel, value });
                    } else {
                        // SAFEGUARD: Unrecognized or corrupt status byte - log warning and reset running status
                        console.warn(`[MidiParser] Unrecognized or corrupt MIDI status byte 0x${eventTypeByte.toString(16)} at offset ${state.offset - 1}`);
                        runningStatus = null;
                    }
                }
            }

            // Ensure offset advances to trackEndOffset to align with next MTrk chunk
            state.offset = trackEndOffset;

            // AUDIO QUALITY SAFEGUARD: Stable sort events within each track by tick, then by audio priority
            events.sort((a, b) => {
                if (a.tick !== b.tick) return a.tick - b.tick;
                const getPriority = (evt) => {
                    if (evt.type === 'meta' && evt.metaType === 0x2F) return 99; // End of Track last
                    return EVENT_PRIORITY[evt.type] ?? 50;
                };
                return getPriority(a) - getPriority(b);
            });

            parsedTracks.push(events);
        }

        // Sort tempo map by tick
        tempoMap.sort((a, b) => a.tick - b.tick);

        // Deduplicate initial tick 0 tempo if needed
        const uniqueTempoMap = [];
        for (const t of tempoMap) {
            if (uniqueTempoMap.length > 0 && uniqueTempoMap[uniqueTempoMap.length - 1].tick === t.tick) {
                uniqueTempoMap[uniqueTempoMap.length - 1] = t;
            } else {
                uniqueTempoMap.push(t);
            }
        }

        // 3. Convert ticks to absolute time in seconds (O(N) sequential pass)
        MidiParser._calculateAbsoluteSeconds(parsedTracks, uniqueTempoMap, ticksPerQuarterNote);

        return {
            header: {
                formatType,
                trackCount,
                ppq: ticksPerQuarterNote
            },
            tempoMap: uniqueTempoMap,
            markers,
            tracks: parsedTracks
        };
    }

    /**
     * Reads a Variable Length Quantity (VLQ) from the DataView.
     * OPTIMIZATION: Mutates state.offset to avoid allocating new objects in hot loops.
     * @param {DataView} dataView
     * @param {{ offset: number }} state
     * @returns {number} Decoded VLQ value
     * @private
     */
    static _readVLQ(dataView, state) {
        let value = 0;
        let byte;
        let bytesRead = 0;
        do {
            byte = dataView.getUint8(state.offset + bytesRead);
            value = (value << 7) | (byte & 0x7F);
            bytesRead++;
        } while ((byte & 0x80) && bytesRead < 4);

        state.offset += bytesRead;
        return value;
    }

    /**
     * Calculates absolute seconds for every MIDI event using the tempo map in O(N) time.
     * OPTIMIZATION: O(N) single-pass sequential pointer traversal across tracks using pre-calculated secondsPerTick.
     * @param {Array<Array<Object>>} tracks
     * @param {Array<Object>} tempoMap
     * @param {number} ppq
     * @private
     */
    static _calculateAbsoluteSeconds(tracks, tempoMap, ppq) {
        let currentSecond = 0;
        for (let i = 0; i < tempoMap.length; i++) {
            tempoMap[i].secondsPerTick = (tempoMap[i].mpqn / 1000000) / ppq;
            if (i === 0) {
                tempoMap[i].timeSeconds = 0;
            } else {
                const prev = tempoMap[i - 1];
                const deltaTicks = tempoMap[i].tick - prev.tick;
                currentSecond += deltaTicks * prev.secondsPerTick;
                tempoMap[i].timeSeconds = currentSecond;
            }
        }

        tracks.forEach(track => {
            let tempoIdx = 0;
            for (let i = 0; i < track.length; i++) {
                const evt = track[i];
                while (tempoIdx < tempoMap.length - 1 && evt.tick >= tempoMap[tempoIdx + 1].tick) {
                    tempoIdx++;
                }
                const activeTempo = tempoMap[tempoIdx];
                const deltaTicks = evt.tick - activeTempo.tick;
                evt.timeSeconds = activeTempo.timeSeconds + (deltaTicks * activeTempo.secondsPerTick);
            }
        });
    }
}
