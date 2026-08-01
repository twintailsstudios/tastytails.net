import assert from 'assert';
import { WebAudioSynth } from '../src/client/js/game/audio/WebAudioSynth.js';

describe('WebAudioSynth Unit Tests', function () {
    it('should initialize CC7 and Stem gain tracking arrays cleanly', function () {
        const synth = new WebAudioSynth();
        assert.strictEqual(synth.channelCc7Volumes.length, 16);
        assert.strictEqual(synth.channelStemGains.length, 16);
        assert.strictEqual(synth.channelCc7Volumes[0], 1.0);
        assert.strictEqual(synth.channelStemGains[0], 1.0);
    });

    it('should calculate effective gain as CC7 volume multiplied by stem target gain', function () {
        const synth = new WebAudioSynth();
        
        // Mock simple Web Audio AudioContext structure
        const mockGainNode = {
            gain: {
                value: 1.0,
                setValueAtTime: (val) => { mockGainNode.gain.value = val; },
                linearRampToValueAtTime: (val) => { mockGainNode.gain.value = val; },
                cancelScheduledValues: () => {},
                cancelAndHoldAtTime: () => {}
            }
        };

        synth.ctx = {
            currentTime: 0,
            createGain: () => mockGainNode
        };

        synth.channelGains = [mockGainNode];

        // Set CC 7 volume for channel 0 to 50% (0.5)
        synth.setChannelCc7Volume(0, 0.5);
        assert.strictEqual(synth.channelCc7Volumes[0], 0.5);
        assert.strictEqual(synth.channelStemGains[0], 1.0);
        assert.strictEqual(mockGainNode.gain.value, 0.5);

        // Perform multi-channel stem crossfade setting stem target to 80% (0.8)
        synth.setMultiChannelVolumes({ 0: 0.8 }, 1000);
        assert.strictEqual(synth.channelStemGains[0], 0.8);
        assert.strictEqual(synth.channelCc7Volumes[0], 0.5);
        // Effective volume = 0.5 * 0.8 = 0.4
        assert.strictEqual(mockGainNode.gain.value, 0.4);
    });

    it('should preserve stem gains when MIDI CC 7 events occur during playback', function () {
        const synth = new WebAudioSynth();
        
        const mockGainNode = {
            gain: {
                value: 0.0,
                setValueAtTime: (val) => { mockGainNode.gain.value = val; },
                linearRampToValueAtTime: (val) => { mockGainNode.gain.value = val; },
                cancelScheduledValues: () => {},
                cancelAndHoldAtTime: () => {}
            }
        };

        synth.ctx = { currentTime: 0 };
        synth.channelGains = [mockGainNode];

        // Channel 0 is muted by ZoneBus (stem gain = 0.0)
        synth.setMultiChannelVolumes({ 0: 0.0 }, 1000);
        assert.strictEqual(mockGainNode.gain.value, 0.0);

        // MIDI CC 7 event occurs on channel 0 (volume = 127 / 1.0)
        synth.setChannelCc7Volume(0, 1.0);

        // Effective gain MUST remain 0.0 because stem gain is 0.0!
        assert.strictEqual(mockGainNode.gain.value, 0.0);
        assert.strictEqual(synth.channelStemGains[0], 0.0);
        assert.strictEqual(synth.channelCc7Volumes[0], 1.0);
    });
});
