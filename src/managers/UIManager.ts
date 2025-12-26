import type { EventListenerEntry } from '../types/game.types';

/**
 * Callbacks para eventos de UI
 */
export interface UICallbacks {
    onMusicToggle: () => void;
    onMusicStop: () => void;
    onVolumeChange: (volume: number) => void;
    onNextMusic: () => void;
    onMenu: () => void;
    onContinue: () => void;
    onRestart: () => void;
}

/**
 * Gestor de interfaz de usuario (elementos DOM)
 */
export class UIManager {
    private eventListenerCleanup: EventListenerEntry[] = [];
    private toggleMusicButton: HTMLElement | null = null;

    constructor() { }

    /**
     * Actualiza el marcador de puntuación
     */
    updateScore(score: number): void {
        const safeScore = (typeof score === 'number' && !isNaN(score)) ? score : 0;
        const scoreElement = document.getElementById('score');
        if (scoreElement) {
            scoreElement.textContent = 'Puntos: ' + safeScore;
        }
    }

    /**
     * Actualiza el indicador de nivel
     */
    updateLevel(level: number): void {
        const safeLevel = (typeof level === 'number' && !isNaN(level)) ? level : 1;
        const levelElement = document.getElementById('level');
        if (levelElement) {
            levelElement.textContent = 'Nivel: ' + safeLevel;
        }
    }

    /**
     * Actualiza los contadores de power-ups
     */
    updatePowerUps(shields: number, continues: number): void {
        const shieldsElement = document.getElementById('shields');
        const continuesElement = document.getElementById('continues');

        if (shieldsElement) {
            shieldsElement.textContent = 'S: ' + shields;
            shieldsElement.style.opacity = shields > 0 ? '1' : '0.4';
        }
        if (continuesElement) {
            continuesElement.textContent = 'C: ' + continues;
            continuesElement.style.opacity = continues > 0 ? '1' : '0.4';
        }
    }

    /**
     * Actualiza tanto puntuación como nivel
     */
    updateScoreAndLevel(score: number, level: number): void {
        this.updateScore(score);
        this.updateLevel(level);
    }

    /**
     * Actualiza toda la UI (score, level, power-ups)
     */
    updateAll(score: number, level: number, shields: number, continues: number): void {
        this.updateScore(score);
        this.updateLevel(level);
        this.updatePowerUps(shields, continues);
    }

    /**
     * Actualiza el estado visual del botón de música
     */
    updateMusicButtonState(isPlaying: boolean): void {
        if (this.toggleMusicButton) {
            if (isPlaying) {
                this.toggleMusicButton.textContent = '❚❚';
                this.toggleMusicButton.classList.add('playing');
            } else {
                this.toggleMusicButton.textContent = '▶';
                this.toggleMusicButton.classList.remove('playing');
            }
        }
    }

    /**
     * Configura los event listeners para los controles de UI
     */
    setupEventListeners(callbacks: UICallbacks): void {
        // Cleanup old listeners
        this.cleanup();

        this.toggleMusicButton = document.getElementById('toggle-music');
        const stopMusicButton = document.getElementById('stop-music');
        const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
        const nextButton = document.getElementById('next-music');
        const menuButton = document.getElementById('menu-button');
        const continueButton = document.getElementById('continue-button');
        const restartButton = document.getElementById('restart-button');

        const addListener = (
            element: HTMLElement | null,
            event: string,
            handler: EventListener
        ): void => {
            if (element) {
                element.addEventListener(event, handler);
                this.eventListenerCleanup.push({ element, event, handler });
            }
        };

        addListener(this.toggleMusicButton, 'click', () => {
            callbacks.onMusicToggle();
        });

        addListener(stopMusicButton, 'click', () => {
            callbacks.onMusicStop();
        });

        addListener(volumeSlider, 'input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            callbacks.onVolumeChange(parseFloat(target.value));
        });

        addListener(nextButton, 'click', () => {
            callbacks.onNextMusic();
        });

        addListener(menuButton, 'click', () => {
            callbacks.onMenu();
        });

        addListener(continueButton, 'click', () => {
            callbacks.onContinue();
        });

        addListener(restartButton, 'click', () => {
            callbacks.onRestart();
        });
    }

    /**
     * Limpia todos los event listeners
     */
    cleanup(): void {
        this.eventListenerCleanup.forEach(({ element, event, handler }) => {
            if (element) {
                element.removeEventListener(event, handler);
            }
        });
        this.eventListenerCleanup = [];
    }

    /**
     * Destructor
     */
    destroy(): void {
        this.cleanup();
    }
}
