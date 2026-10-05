import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { SFX_CATALOG, SFX_IDS, type SfxId } from './sfxCatalog';
import { encodeWav, renderSfx } from './sfxSynth';

const keyOf = (id: SfxId): string => `sfx:${id}`;

// Contadores para las pruebas automatizadas: registran lo que el juego pidió
// reproducir, se oiga o no en ese dispositivo.
const requested: Partial<Record<SfxId, number>> = {};
let lastRequested: SfxId | null = null;

export interface SfxDebugState {
    available: boolean;
    ready: number;
    total: number;
    locked: boolean;
    muted: boolean;
    volume: number;
    last: SfxId | null;
    requested: Partial<Record<SfxId, number>>;
}

/**
 * Sintetiza los efectos y los registra en el caché de audio de Phaser con
 * `decodeAudio`, de modo que se reproducen con el Sound Manager como cualquier
 * otro audio (desbloqueo en móviles, mute y volumen globales, pausa al perder foco).
 */
export function registerSfx(scene: Phaser.Scene): void {
    const sound = scene.sound;
    // Solo el gestor Web Audio decodifica datos en memoria; sin él no hay efectos.
    if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return;

    sound.volume = CONFIG.AUDIO.DEFAULT_VOLUME;
    const pending = SFX_IDS
        .filter((id) => !scene.cache.audio.exists(keyOf(id)))
        .map((id) => ({ key: keyOf(id), data: encodeWav(renderSfx(SFX_CATALOG[id])) }));
    if (pending.length > 0) sound.decodeAudio(pending);
}

export function playSfx(scene: Phaser.Scene, id: SfxId): void {
    requested[id] = (requested[id] ?? 0) + 1;
    lastRequested = id;

    const sound = scene.sound;
    // Con el audio aún bloqueado por el navegador los sonidos se acumularían
    // y sonarían todos juntos al primer toque.
    if (sound.locked || !scene.cache.audio.exists(keyOf(id))) return;
    sound.play(keyOf(id), { volume: SFX_CATALOG[id].volume });
}

export function getSfxDebugState(scene: Phaser.Scene): SfxDebugState {
    const sound = scene.sound;
    return {
        available: sound instanceof Phaser.Sound.WebAudioSoundManager,
        ready: SFX_IDS.filter((id) => scene.cache.audio.exists(keyOf(id))).length,
        total: SFX_IDS.length,
        locked: sound.locked,
        muted: sound.mute,
        volume: sound.volume,
        last: lastRequested,
        requested: { ...requested }
    };
}
