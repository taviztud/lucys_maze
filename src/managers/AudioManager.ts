import Phaser from 'phaser';
import { CONFIG } from '../Config';

/**
 * Gestor de audio para música de fondo con playlist
 */
export class AudioManager {
    private scene: Phaser.Scene;
    private availableMusicKeys: string[] = [];
    private backgroundMusic: Phaser.Sound.BaseSound | null = null;
    private musicPlaylistOrder: string[] = [];
    private currentPlaylistIndex: number = 0;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * Detecta y carga archivos de música en preload
     */
    detectAndLoadMusic(): void {
        this.availableMusicKeys = [];
        const maxTracks = CONFIG.AUDIO.MAX_BG_TRACKS;

        // Setup error handling
        this.scene.load.on('loaderror', (file: Phaser.Loader.File) => {
            if (file.key.startsWith('backgroundMusic')) {
                const keyIndex = this.availableMusicKeys.indexOf(file.key);
                if (keyIndex > -1) {
                    this.availableMusicKeys.splice(keyIndex, 1);
                }
            }
        });

        this.scene.load.on('filecomplete', (key: string) => {
            if (key.startsWith('backgroundMusic')) {
                if (!this.availableMusicKeys.includes(key)) {
                    this.availableMusicKeys.push(key);
                }
            }
        });

        // Queue music files for loading
        for (let i = 1; i <= maxTracks; i++) {
            const paddedNumber = i.toString().padStart(3, '0');
            const filename = `bg_${paddedNumber}.mp3`;
            const key = `backgroundMusic${i - 1}`;

            try {
                this.scene.load.audio(key, `sound/bg/${filename}`);
            } catch (error) {
                console.warn('Could not queue music file:', filename, error);
            }
        }
    }

    /**
     * Inicializa y comienza la reproducción de música
     */
    initMusic(): void {
        const tryStartMusic = () => {
            if (this.availableMusicKeys.length > 0) {
                this.shufflePlaylist();
                this.playNext();
            } else {
                this.scene.time.delayedCall(500, () => {
                    if (this.availableMusicKeys.length > 0) {
                        this.shufflePlaylist();
                        this.playNext();
                    }
                });
            }
        };

        if (this.scene.sound.locked) {
            this.scene.input.once('pointerdown', () => this.scene.sound.unlock());
            if (this.scene.input.keyboard) {
                this.scene.input.keyboard.once('keydown', () => this.scene.sound.unlock());
            }
            this.scene.sound.once('unlocked', tryStartMusic);
        } else {
            this.scene.time.delayedCall(200, tryStartMusic);
        }
    }

    /**
     * Mezcla el orden de reproducción
     */
    shufflePlaylist(): void {
        if (this.availableMusicKeys.length === 0) {
            this.musicPlaylistOrder = [];
            this.currentPlaylistIndex = 0;
            return;
        }

        this.musicPlaylistOrder = [...this.availableMusicKeys];
        for (let i = this.musicPlaylistOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.musicPlaylistOrder[i], this.musicPlaylistOrder[j]] =
                [this.musicPlaylistOrder[j], this.musicPlaylistOrder[i]];
        }
        this.currentPlaylistIndex = 0;
    }

    /**
     * Reproduce la siguiente canción en la playlist
     */
    playNext(): void {
        if (this.availableMusicKeys.length === 0) return;

        this.stop();

        if (this.currentPlaylistIndex >= this.musicPlaylistOrder.length) {
            this.shufflePlaylist();
        }

        const musicKey = this.musicPlaylistOrder[this.currentPlaylistIndex];
        this.currentPlaylistIndex++;

        this.playSpecific(musicKey);
    }

    /**
     * Reproduce la canción anterior
     */
    playPrevious(): void {
        if (this.availableMusicKeys.length === 0) return;
        this.currentPlaylistIndex = Math.max(0, this.currentPlaylistIndex - 2);
        this.playNext();
    }

    /**
     * Reproduce una canción específica
     */
    private playSpecific(musicKey: string): void {
        try {
            if (!this.scene.cache.audio.exists(musicKey)) return;

            this.backgroundMusic = this.scene.sound.add(musicKey, {
                loop: false,
                volume: CONFIG.AUDIO.DEFAULT_VOLUME
            });

            this.backgroundMusic.play();
            this.backgroundMusic.once('complete', () => {
                this.playNext();
            });

            this.updateToggleButton(true);
        } catch (error) {
            console.error('Error in playSpecific:', error);
        }
    }

    /**
     * Pausa/Reanuda la música
     */
    togglePlayPause(): void {
        const soundManager = this.scene.sound as Phaser.Sound.WebAudioSoundManager;
        if (soundManager?.context?.state === 'suspended') {
            soundManager.context.resume().catch(() => { });
        }

        if (this.backgroundMusic?.isPlaying) {
            this.backgroundMusic.pause();
            this.updateToggleButton(false);
        } else if (this.backgroundMusic) {
            this.backgroundMusic.resume();
            this.updateToggleButton(true);
        } else {
            this.playNext();
        }
    }

    /**
     * Detiene la música actual
     */
    stop(): void {
        if (this.backgroundMusic) {
            this.backgroundMusic.stop();
            this.backgroundMusic.destroy();
            this.backgroundMusic = null;
        }
    }

    /**
     * Establece el volumen
     */
    setVolume(volume: number): void {
        if (this.backgroundMusic && 'setVolume' in this.backgroundMusic) {
            (this.backgroundMusic as Phaser.Sound.WebAudioSound).setVolume(volume);
        }
    }

    /**
     * Verifica si hay música reproduciéndose
     */
    isPlaying(): boolean {
        return this.backgroundMusic?.isPlaying ?? false;
    }

    /**
     * Actualiza el texto del botón de toggle
     */
    private updateToggleButton(isPlaying: boolean): void {
        const toggleButton = document.getElementById('toggle-music');
        if (toggleButton) {
            toggleButton.textContent = isPlaying ? 'Música Off' : 'Música On';
        }
    }

    /**
     * Limpieza de recursos
     */
    destroy(): void {
        this.stop();
        this.scene.load.off('loaderror');
        this.scene.load.off('filecomplete');
    }
}
