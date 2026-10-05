import type { SfxDefinition } from './sfxSynth';

// Notas usadas por los efectos (Hz). Todo vive en Do mayor / pentatónica
// para que los efectos no desentonen entre sí.
const NOTE = {
    C4: 261.63,
    E4: 329.63,
    C5: 523.25,
    E5: 659.25,
    G5: 783.99,
    GS5: 830.61,
    B5: 987.77,
    C6: 1046.5,
    E6: 1318.51,
    G6: 1567.98,
    B6: 1975.53,
    C7: 2093,
    E7: 2637.02
} as const;

// Frecuencia que convierte la fuente de ruido en ruido blanco.
const WHITE = 22050;

/**
 * Efectos del juego, al estilo de un pixel art moderno: timbres de consola
 * clásica (pulsos, triángulos) suavizados con filtros y capas, campanas FM,
 * graves con cuerpo y un poco de eco y reverberación.
 *
 * Se sintetizan al arrancar: no hay archivos de audio, así que afinar un
 * sonido es editar estos números (`npm run sfx:export` genera los WAV para oírlos).
 */
export const SFX_CATALOG = {
    // Ladrido corto de Lucy al empezar una partida.
    bark: {
        volume: 0.5,
        reverb: 0.12,
        tail: 0.15,
        tones: [
            { wave: 'sawtooth', from: 540, to: 1040, duration: 0.05, volume: 0.7, decay: 0, filter: { type: 'lowpass', from: 2400, q: 2 } },
            { wave: 'sawtooth', from: 1040, to: 680, duration: 0.08, volume: 0.7, filter: { type: 'lowpass', from: 2400, to: 1300, q: 2 } },
            { wave: 'sine', from: 270, to: 500, duration: 0.13, at: 0, volume: 0.45, decay: 1.2 },
            { wave: 'noise', from: WHITE, duration: 0.04, at: 0, volume: 0.15, decay: 2, filter: { type: 'highpass', from: 3000 } }
        ]
    },
    // Impulso al deslizarse o girar: un soplo de aire, pensado para repetirse mucho.
    slide: {
        volume: 0.22,
        tones: [
            { wave: 'noise', from: WHITE, duration: 0.11, volume: 0.9, attack: 0.02, decay: 1.2, filter: { type: 'bandpass', from: 600, to: 3200, q: 1.2 } },
            { wave: 'sine', from: 300, to: 620, duration: 0.09, at: 0, volume: 0.25, decay: 1.5 }
        ]
    },
    // Tope contra una pared, junto al temblor de cámara: golpe grave y seco.
    bump: {
        volume: 0.5,
        tones: [
            { wave: 'sine', from: 120, to: 42, duration: 0.13, volume: 1, decay: 1.6 },
            { wave: 'noise', from: WHITE, duration: 0.03, at: 0, volume: 0.35, decay: 2, filter: { type: 'lowpass', from: 1800 } }
        ]
    },
    // Moneda (presa de pollo): campana cristalina con una nota de gracia.
    coin: {
        volume: 0.42,
        delay: { time: 0.09, feedback: 0.25, mix: 0.18 },
        tail: 0.25,
        tones: [
            { wave: 'sine', from: NOTE.B5, duration: 0.045, volume: 0.8, decay: 0, fm: { ratio: 2, depth: 1.2 } },
            { wave: 'sine', from: NOTE.E6, duration: 0.28, volume: 0.8, decay: 2.2, fm: { ratio: 3.01, depth: 1.6, decay: 3 } },
            { wave: 'triangle', from: NOTE.E7, duration: 0.12, at: 0.045, volume: 0.15, decay: 2 }
        ]
    },
    // Aparece un power-up en el tablero: destello de campanas con eco.
    spawn: {
        volume: 0.36,
        delay: { time: 0.11, feedback: 0.35, mix: 0.25 },
        reverb: 0.15,
        tail: 0.4,
        tones: [
            { wave: 'sine', from: NOTE.C6, duration: 0.06, volume: 0.7, decay: 0.5, fm: { ratio: 3.5, depth: 1.2 } },
            { wave: 'sine', from: NOTE.E6, duration: 0.06, volume: 0.7, decay: 0.5, fm: { ratio: 3.5, depth: 1.2 } },
            { wave: 'sine', from: NOTE.G6, duration: 0.06, volume: 0.7, decay: 0.5, fm: { ratio: 3.5, depth: 1.2 } },
            { wave: 'sine', from: NOTE.C7, duration: 0.3, volume: 0.7, decay: 2.5, fm: { ratio: 3.5, depth: 1.2, decay: 2 } }
        ]
    },
    // Recoger un escudo: arpegio de pulsos cálidos con una campana al final.
    shield: {
        volume: 0.42,
        reverb: 0.15,
        tail: 0.3,
        tones: [
            { wave: 'square', from: NOTE.C5, duration: 0.07, volume: 0.5, decay: 0.3, detune: 12, filter: { type: 'lowpass', from: 900, to: 1600 } },
            { wave: 'square', from: NOTE.E5, duration: 0.07, volume: 0.5, decay: 0.3, detune: 12, filter: { type: 'lowpass', from: 1300, to: 2100 } },
            { wave: 'square', from: NOTE.G5, duration: 0.07, volume: 0.5, decay: 0.3, detune: 12, filter: { type: 'lowpass', from: 1700, to: 2600 } },
            { wave: 'square', from: NOTE.C6, duration: 0.24, volume: 0.5, decay: 1.5, detune: 12, filter: { type: 'lowpass', from: 2200, to: 3200 } },
            { wave: 'sine', from: NOTE.C7, duration: 0.25, at: 0.21, volume: 0.3, decay: 2, fm: { ratio: 2, depth: 1 } },
            { wave: 'triangle', from: NOTE.C4, duration: 0.45, at: 0, volume: 0.35 }
        ]
    },
    // Recoger un continue (corazón): acorde mayor más suave, con vibrato.
    continue: {
        volume: 0.42,
        delay: { time: 0.12, feedback: 0.2, mix: 0.15 },
        reverb: 0.2,
        tail: 0.4,
        tones: [
            { wave: 'triangle', from: NOTE.E5, duration: 0.08, volume: 0.8, decay: 0.3, detune: 8 },
            { wave: 'triangle', from: NOTE.GS5, duration: 0.08, volume: 0.8, decay: 0.3, detune: 8 },
            { wave: 'triangle', from: NOTE.B5, duration: 0.08, volume: 0.8, decay: 0.3, detune: 8 },
            { wave: 'triangle', from: NOTE.E6, duration: 0.3, volume: 0.8, decay: 1.5, detune: 8, vibrato: { rate: 6, depth: 12 } },
            { wave: 'sine', from: NOTE.E4, duration: 0.5, at: 0, volume: 0.4, attack: 0.03 },
            { wave: 'sine', from: NOTE.B6, duration: 0.3, at: 0.24, volume: 0.25, decay: 2, fm: { ratio: 2, depth: 0.8 } }
        ]
    },
    // El escudo absorbe un golpe: campanazo metálico y barrido descendente.
    shieldHit: {
        volume: 0.45,
        reverb: 0.15,
        tail: 0.25,
        tones: [
            { wave: 'sine', from: 1400, to: 900, duration: 0.22, volume: 0.7, decay: 1.5, fm: { ratio: 5.4, depth: 3, decay: 2 } },
            { wave: 'sawtooth', from: 700, to: 160, duration: 0.18, at: 0, volume: 0.4, filter: { type: 'lowpass', from: 3000, to: 500 } },
            { wave: 'noise', from: WHITE, duration: 0.06, at: 0, volume: 0.3, decay: 2, filter: { type: 'highpass', from: 2500 } }
        ]
    },
    // Lucy pierde: caída desafinada que se apaga, con un grave que se hunde.
    death: {
        volume: 0.5,
        reverb: 0.25,
        tail: 0.5,
        tones: [
            { wave: 'sawtooth', from: 520, to: 70, duration: 0.55, volume: 0.6, decay: 0.8, detune: 18, filter: { type: 'lowpass', from: 2400, to: 300, q: 1.5 } },
            { wave: 'sine', from: 180, to: 38, duration: 0.5, at: 0.05, volume: 0.7, decay: 1.2 },
            { wave: 'noise', from: 900, to: 120, duration: 0.4, at: 0.1, volume: 0.25, filter: { type: 'lowpass', from: 1500 } }
        ]
    },
    // Nivel completado: arpegio brillante con armonía, vibrato y eco.
    levelUp: {
        volume: 0.45,
        delay: { time: 0.12, feedback: 0.3, mix: 0.22 },
        reverb: 0.15,
        tail: 0.45,
        tones: [
            { wave: 'square', from: NOTE.G5, duration: 0.07, volume: 0.5, decay: 0.3, duty: 0.25, detune: 10, filter: { type: 'lowpass', from: 1200, to: 2000 } },
            { wave: 'square', from: NOTE.C6, duration: 0.07, volume: 0.5, decay: 0.3, duty: 0.25, detune: 10, filter: { type: 'lowpass', from: 1700, to: 2600 } },
            { wave: 'square', from: NOTE.E6, duration: 0.07, volume: 0.5, decay: 0.3, duty: 0.25, detune: 10, filter: { type: 'lowpass', from: 2200, to: 3200 } },
            { wave: 'square', from: NOTE.G6, duration: 0.07, volume: 0.5, decay: 0.3, duty: 0.25, detune: 10, filter: { type: 'lowpass', from: 2800, to: 3800 } },
            { wave: 'square', from: NOTE.C7, duration: 0.32, volume: 0.5, decay: 1.6, duty: 0.25, detune: 10, vibrato: { rate: 7, depth: 10 }, filter: { type: 'lowpass', from: 3400, to: 4200 } },
            { wave: 'triangle', from: NOTE.C5, duration: 0.28, at: 0, volume: 0.4, decay: 0.2 },
            { wave: 'triangle', from: NOTE.E5, duration: 0.35, at: 0.28, volume: 0.4 },
            { wave: 'sine', from: NOTE.C7, duration: 0.35, at: 0.28, volume: 0.3, decay: 2, fm: { ratio: 2, depth: 1 } }
        ]
    },
    // Pulsación de un botón: toque breve y suave.
    ui: {
        volume: 0.25,
        tones: [
            { wave: 'sine', from: 900, to: 1300, duration: 0.04, volume: 0.7, decay: 1.2 },
            { wave: 'noise', from: WHITE, duration: 0.008, at: 0, volume: 0.2, decay: 2, filter: { type: 'highpass', from: 4000 } }
        ]
    }
} as const satisfies Record<string, SfxDefinition>;

export type SfxId = keyof typeof SFX_CATALOG;

export const SFX_IDS = Object.keys(SFX_CATALOG) as SfxId[];
