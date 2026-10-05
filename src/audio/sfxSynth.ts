export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';
export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

/** One voice of an effect. Times are in seconds, frequencies in Hz. */
export interface Tone {
    wave: Waveform;
    /** Frequency at the start. For noise: how often a new random level is drawn (>= 20000 is white noise). */
    from: number;
    /** Frequency at the end, reached with an exponential glide. Defaults to `from`. */
    to?: number;
    duration: number;
    /** Start time. Defaults to the end of the previous tone, so tones play in sequence. */
    at?: number;
    /** Peak amplitude, 0..1. */
    volume?: number;
    /** Square wave duty cycle, 0..1. */
    duty?: number;
    /** Fade-in time. */
    attack?: number;
    /** Fade-out curve: 0 keeps the level flat, 1 fades linearly, higher values fade faster. */
    decay?: number;
    /** Adds a second voice this many cents apart, for a wider, chorused sound. */
    detune?: number;
    /** Pitch wobble: rate in Hz, depth in cents. */
    vibrato?: { rate: number; depth: number };
    /** Sine carriers only: frequency modulation for bell and metallic timbres. */
    fm?: { ratio: number; depth: number; decay?: number };
    /** Filter with an optional cutoff sweep. */
    filter?: { type: FilterType; from: number; to?: number; q?: number };
}

export interface SfxDefinition {
    tones: Tone[];
    /** Playback volume relative to the other effects. */
    volume: number;
    /** Echo: delay time in seconds, feedback and wet mix in 0..1. */
    delay?: { time: number; feedback: number; mix: number };
    /** Reverb wet mix, 0..1. */
    reverb?: number;
    /** Extra seconds after the last tone for echo and reverb to ring out. */
    tail?: number;
}

export const SFX_SAMPLE_RATE = 44100;

const TWO_PI = Math.PI * 2;
const DEFAULT_ATTACK_SECONDS = 0.003;
// Short ramps that avoid the click of cutting a wave mid-cycle.
const RELEASE_SECONDS = 0.006;
const FADE_OUT_SECONDS = 0.012;
// Every effect is normalised to this peak; the catalog volume sets its loudness.
const TARGET_PEAK = 0.9;

/** Deterministic generator so the same definition always renders the same samples. */
function createNoise(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return (state / 0xffffffff) * 2 - 1;
    };
}

/** Smooths the step of square and sawtooth waves so high notes do not alias. */
function polyBlep(phase: number, increment: number): number {
    if (phase < increment) {
        const t = phase / increment;
        return t + t - t * t - 1;
    }
    if (phase > 1 - increment) {
        const t = (phase - 1) / increment;
        return t * t + t + t + 1;
    }
    return 0;
}

function oscillator(wave: Exclude<Waveform, 'noise'>, phase: number, increment: number, duty: number): number {
    switch (wave) {
        case 'sine':
            return Math.sin(TWO_PI * phase);
        case 'triangle':
            return 1 - 4 * Math.abs(phase - 0.5);
        case 'sawtooth':
            return 2 * phase - 1 - polyBlep(phase, increment);
        case 'square': {
            const fallPhase = (phase - duty + 1) % 1;
            // Centred so narrow duty cycles do not add a DC offset.
            return (phase < duty ? 1 : -1) - (2 * duty - 1) + polyBlep(phase, increment) - polyBlep(fallPhase, increment);
        }
    }
}

/** State-variable filter (trapezoidal), stable across the whole audible range. */
class Filter {
    private ic1 = 0;
    private ic2 = 0;

    constructor(private readonly type: FilterType, private readonly q: number, private readonly sampleRate: number) {}

    process(input: number, cutoff: number): number {
        const g = Math.tan(Math.PI * Math.min(cutoff, this.sampleRate * 0.45) / this.sampleRate);
        const k = 1 / this.q;
        const a1 = 1 / (1 + g * (g + k));
        const a2 = g * a1;
        const a3 = g * a2;
        const v3 = input - this.ic2;
        const v1 = a1 * this.ic1 + a2 * v3;
        const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
        this.ic1 = 2 * v1 - this.ic1;
        this.ic2 = 2 * v2 - this.ic2;

        if (this.type === 'lowpass') return v2;
        if (this.type === 'bandpass') return v1;
        return input - k * v1 - v2;
    }
}

function getTonesEnd(definition: SfxDefinition): number {
    let cursor = 0;
    let end = 0;
    for (const tone of definition.tones) {
        const start = tone.at ?? cursor;
        cursor = start + tone.duration;
        end = Math.max(end, cursor);
    }
    return end;
}

export function getSfxDuration(definition: SfxDefinition): number {
    return getTonesEnd(definition) + (definition.tail ?? 0);
}

function renderTone(samples: Float32Array, tone: Tone, start: number, seed: number, sampleRate: number): void {
    const length = Math.floor(tone.duration * sampleRate);
    const offset = Math.floor(start * sampleRate);
    const volume = tone.volume ?? 1;
    const duty = tone.duty ?? 0.5;
    const decay = tone.decay ?? 1;
    const attack = tone.attack ?? DEFAULT_ATTACK_SECONDS;
    const glide = (tone.to ?? tone.from) / tone.from;
    const detuneRatio = tone.detune ? Math.pow(2, tone.detune / 1200) : 0;
    const voiceGain = detuneRatio ? 0.5 : 1;
    const filter = tone.filter ? new Filter(tone.filter.type, tone.filter.q ?? 0.707, sampleRate) : null;
    const filterGlide = tone.filter ? (tone.filter.to ?? tone.filter.from) / tone.filter.from : 1;
    const noise = createNoise(seed);
    const isWhiteNoise = tone.wave === 'noise' && tone.from >= 20000;

    let phase = 0;
    let detunedPhase = 0;
    let modulatorPhase = 0;
    let noiseLevel = noise();

    for (let index = 0; index < length && offset + index < samples.length; index++) {
        const progress = index / length;
        const time = index / sampleRate;
        let frequency = tone.from * Math.pow(glide, progress);
        if (tone.vibrato) {
            frequency *= Math.pow(2, (tone.vibrato.depth / 1200) * Math.sin(TWO_PI * tone.vibrato.rate * time));
        }
        const increment = frequency / sampleRate;

        let value: number;
        if (tone.wave === 'noise') {
            phase += increment;
            if (isWhiteNoise || phase >= 1) {
                phase -= Math.floor(phase);
                noiseLevel = noise();
            }
            value = noiseLevel;
        } else if (tone.wave === 'sine' && tone.fm) {
            const modulation = tone.fm.depth * Math.pow(1 - progress, tone.fm.decay ?? 1);
            value = Math.sin(TWO_PI * phase + modulation * Math.sin(TWO_PI * modulatorPhase));
            modulatorPhase = (modulatorPhase + increment * tone.fm.ratio) % 1;
            phase = (phase + increment) % 1;
        } else {
            value = oscillator(tone.wave, phase, increment, duty) * voiceGain;
            phase = (phase + increment) % 1;
            if (detuneRatio) {
                const detunedIncrement = increment * detuneRatio;
                value += oscillator(tone.wave, detunedPhase, detunedIncrement, duty) * voiceGain;
                detunedPhase = (detunedPhase + detunedIncrement) % 1;
            }
        }

        if (filter && tone.filter) {
            value = filter.process(value, tone.filter.from * Math.pow(filterGlide, progress));
        }

        const envelope = Math.min(1, time / attack)
            * Math.min(1, (tone.duration - time) / RELEASE_SECONDS)
            * Math.pow(1 - progress, decay);
        samples[offset + index] += value * volume * envelope;
    }
}

/** Feedback echo. */
function applyDelay(samples: Float32Array, delay: NonNullable<SfxDefinition['delay']>, sampleRate: number): void {
    const delaySamples = Math.max(1, Math.round(delay.time * sampleRate));
    const line = new Float32Array(samples.length);
    for (let index = 0; index < samples.length; index++) {
        const echoed = index >= delaySamples ? line[index - delaySamples] : 0;
        line[index] = samples[index] + echoed * delay.feedback;
        samples[index] += echoed * delay.mix;
    }
}

// Comb and all-pass lengths (in samples at 44.1 kHz) of a small Schroeder reverb.
const COMB_LENGTHS = [1557, 1617, 1491, 1422];
const ALLPASS_LENGTHS = [225, 556];
const COMB_FEEDBACK = 0.8;
const COMB_DAMPING = 0.35;

/** Short, dark room reverb: enough to glue the layers without washing them out. */
function applyReverb(samples: Float32Array, mix: number, sampleRate: number): void {
    const rateScale = sampleRate / 44100;
    const wet = new Float32Array(samples.length);

    for (const combLength of COMB_LENGTHS) {
        const buffer = new Float32Array(Math.max(1, Math.round(combLength * rateScale)));
        let position = 0;
        let damped = 0;
        for (let index = 0; index < samples.length; index++) {
            const output = buffer[position];
            damped = output * (1 - COMB_DAMPING) + damped * COMB_DAMPING;
            buffer[position] = samples[index] + damped * COMB_FEEDBACK;
            position = (position + 1) % buffer.length;
            wet[index] += output * 0.25;
        }
    }

    for (const allpassLength of ALLPASS_LENGTHS) {
        const buffer = new Float32Array(Math.max(1, Math.round(allpassLength * rateScale)));
        let position = 0;
        for (let index = 0; index < wet.length; index++) {
            const buffered = buffer[position];
            const input = wet[index];
            buffer[position] = input + buffered * 0.5;
            position = (position + 1) % buffer.length;
            wet[index] = buffered - input * 0.5;
        }
    }

    for (let index = 0; index < samples.length; index++) samples[index] += wet[index] * mix;
}

/** Renders an effect to mono samples in the range -1..1. */
export function renderSfx(definition: SfxDefinition, sampleRate = SFX_SAMPLE_RATE): Float32Array {
    const samples = new Float32Array(Math.ceil(getSfxDuration(definition) * sampleRate));
    let cursor = 0;

    definition.tones.forEach((tone, toneIndex) => {
        const start = tone.at ?? cursor;
        cursor = start + tone.duration;
        renderTone(samples, tone, start, 0x9e3779b9 + toneIndex * 7919, sampleRate);
    });

    if (definition.delay) applyDelay(samples, definition.delay, sampleRate);
    if (definition.reverb) applyReverb(samples, definition.reverb, sampleRate);

    let peak = 0;
    for (let index = 0; index < samples.length; index++) peak = Math.max(peak, Math.abs(samples[index]));
    const gain = peak > 0 ? TARGET_PEAK / peak : 0;
    const fadeSamples = Math.min(samples.length, Math.floor(FADE_OUT_SECONDS * sampleRate));
    for (let index = 0; index < samples.length; index++) {
        const remaining = samples.length - 1 - index;
        samples[index] *= gain * Math.min(1, remaining / fadeSamples);
    }
    return samples;
}

/** Wraps mono samples in a 16-bit PCM WAV file, ready for `sound.decodeAudio`. */
export function encodeWav(samples: Float32Array, sampleRate = SFX_SAMPLE_RATE): ArrayBuffer {
    const bytesPerSample = 2;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeText = (offset: number, text: string): void => {
        for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
    };

    writeText(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);                          // PCM header size
    view.setUint16(20, 1, true);                           // PCM
    view.setUint16(22, 1, true);                           // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
    view.setUint16(32, bytesPerSample, true);              // block align
    view.setUint16(34, 16, true);                          // bits per sample
    writeText(36, 'data');
    view.setUint32(40, dataSize, true);

    for (let index = 0; index < samples.length; index++) {
        const clamped = Math.max(-1, Math.min(1, samples[index]));
        view.setInt16(44 + index * bytesPerSample, Math.round(clamped * 0x7fff), true);
    }
    return buffer;
}
