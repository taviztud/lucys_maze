import { describe, expect, it } from 'vitest';
import { SFX_CATALOG, SFX_IDS } from '../src/audio/sfxCatalog';
import { encodeWav, getSfxDuration, renderSfx, SFX_SAMPLE_RATE, type SfxDefinition } from '../src/audio/sfxSynth';

const peak = (samples: Float32Array): number => samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

/** Energy of the signal between two times, to tell sound from silence. */
function energy(samples: Float32Array, fromSeconds: number, toSeconds: number): number {
    let sum = 0;
    for (let index = Math.floor(fromSeconds * SFX_SAMPLE_RATE); index < Math.floor(toSeconds * SFX_SAMPLE_RATE); index++) {
        sum += samples[index] * samples[index];
    }
    return sum;
}

/** Curvature of the waveform relative to its level: grows with high-frequency content. */
function brightness(samples: Float32Array): number {
    let curvature = 0;
    let level = 0;
    for (let index = 1; index < samples.length - 1; index++) {
        curvature += Math.abs(samples[index + 1] - 2 * samples[index] + samples[index - 1]);
        level += Math.abs(samples[index]);
    }
    return curvature / level;
}

describe('renderSfx', () => {
    it('plays tones in sequence unless they declare a start time, and adds the tail', () => {
        const definition: SfxDefinition = {
            volume: 1,
            tail: 0.2,
            tones: [
                { wave: 'square', from: 440, duration: 0.1 },
                { wave: 'square', from: 880, duration: 0.2 },
                { wave: 'noise', from: 2000, duration: 0.05, at: 0 }
            ]
        };
        expect(getSfxDuration(definition)).toBeCloseTo(0.5);
        expect(renderSfx(definition)).toHaveLength(Math.ceil(0.5 * SFX_SAMPLE_RATE));
    });

    it('is deterministic, including noise', () => {
        const definition: SfxDefinition = { volume: 1, tones: [{ wave: 'noise', from: 3000, duration: 0.05 }] };
        expect(Array.from(renderSfx(definition))).toEqual(Array.from(renderSfx(definition)));
    });

    it('starts and ends silent to avoid clicks, and is normalised', () => {
        const samples = renderSfx({ volume: 1, tones: [{ wave: 'square', from: 440, duration: 0.1, decay: 0 }] });
        expect(Math.abs(samples[0])).toBeLessThan(0.05);
        expect(Math.abs(samples[samples.length - 1])).toBeLessThan(0.01);
        expect(peak(samples)).toBeCloseTo(0.9, 2);
    });

    it('stays within range when voices overlap', () => {
        const samples = renderSfx({
            volume: 1,
            tones: [
                { wave: 'sawtooth', from: 440, duration: 0.1, decay: 0, detune: 20 },
                { wave: 'square', from: 440, duration: 0.1, at: 0, decay: 0 }
            ]
        });
        expect(peak(samples)).toBeLessThanOrEqual(0.9001);
    });

    it('a low-pass filter removes brightness from a sawtooth', () => {
        const raw = renderSfx({ volume: 1, tones: [{ wave: 'sawtooth', from: 220, duration: 0.2, decay: 0 }] });
        const filtered = renderSfx({
            volume: 1,
            tones: [{ wave: 'sawtooth', from: 220, duration: 0.2, decay: 0, filter: { type: 'lowpass', from: 400 } }]
        });
        expect(brightness(filtered)).toBeLessThan(brightness(raw) * 0.6);
    });

    it('frequency modulation adds overtones to a sine', () => {
        const pure = renderSfx({ volume: 1, tones: [{ wave: 'sine', from: 440, duration: 0.2, decay: 0 }] });
        const bell = renderSfx({
            volume: 1,
            tones: [{ wave: 'sine', from: 440, duration: 0.2, decay: 0, fm: { ratio: 3, depth: 2, decay: 0 } }]
        });
        expect(brightness(bell)).toBeGreaterThan(brightness(pure) * 1.5);
    });

    it('echo and reverb keep sounding after the tones end', () => {
        const tone = { wave: 'sine', from: 880, duration: 0.05 } as const;
        const dry = renderSfx({ volume: 1, tail: 0.3, tones: [tone] });
        const echoed = renderSfx({ volume: 1, tail: 0.3, delay: { time: 0.1, feedback: 0.4, mix: 0.5 }, tones: [tone] });
        const reverberated = renderSfx({ volume: 1, tail: 0.3, reverb: 0.5, tones: [tone] });

        expect(energy(dry, 0.1, 0.3)).toBe(0);
        expect(energy(echoed, 0.1, 0.3)).toBeGreaterThan(1);
        expect(energy(reverberated, 0.1, 0.3)).toBeGreaterThan(0.01);
    });
});

describe('SFX_CATALOG', () => {
    it.each(SFX_IDS)('%s is short, audible and within range', (id) => {
        const definition = SFX_CATALOG[id];
        const samples = renderSfx(definition);

        expect(getSfxDuration(definition)).toBeGreaterThan(0.03);
        expect(getSfxDuration(definition)).toBeLessThan(1.2);
        expect(peak(samples)).toBeCloseTo(0.9, 2);
        expect(samples.every((value) => Number.isFinite(value))).toBe(true);
        expect(definition.volume).toBeGreaterThan(0);
        expect(definition.volume).toBeLessThanOrEqual(1);
    });

    it('keeps the sounds that repeat constantly short and quiet', () => {
        for (const id of ['slide', 'bump', 'ui'] as const) {
            expect(getSfxDuration(SFX_CATALOG[id]), id).toBeLessThan(0.15);
            expect(SFX_CATALOG[id].volume, id).toBeLessThanOrEqual(0.5);
        }
    });
});

describe('encodeWav', () => {
    it('writes a 16-bit mono PCM header that matches the samples', () => {
        const samples = new Float32Array([0, 1, -1, 0.5]);
        const view = new DataView(encodeWav(samples, 22050));
        const text = (offset: number): string =>
            String.fromCharCode(...[0, 1, 2, 3].map((index) => view.getUint8(offset + index)));

        expect(text(0)).toBe('RIFF');
        expect(text(8)).toBe('WAVE');
        expect(text(36)).toBe('data');
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(22050);
        expect(view.getUint16(34, true)).toBe(16);
        expect(view.getUint32(40, true)).toBe(samples.length * 2);
        expect(view.byteLength).toBe(44 + samples.length * 2);
        expect(view.getInt16(46, true)).toBe(32767);
        expect(view.getInt16(48, true)).toBe(-32767);
    });
});
