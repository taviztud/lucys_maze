import Phaser from 'phaser';
import type { Direction } from '../types/game.types';

/**
 * Gestor de entrada para controles de teclado y touch
 * Emite eventos cuando se detecta input direccional
 */
export class InputManager {
    private scene: Phaser.Scene;
    private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
    private restartKey: Phaser.Input.Keyboard.Key;
    private menuKey: Phaser.Input.Keyboard.Key;
    private continueKey: Phaser.Input.Keyboard.Key;
    private desiredDirection: Direction = { dx: 0, dy: 0 };
    private swipeStartX: number = 0;
    private swipeStartY: number = 0;
    private readonly minSwipeDistance: number = 30;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * Inicializa todos los controles
     */
    setup(): void {
        this.setupKeyboardControls();
        this.setupTouchControls();
    }

    /**
     * Configura los controles de teclado
     */
    private setupKeyboardControls(): void {
        this.cursors = this.scene.input.keyboard!.createCursorKeys();
        this.restartKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
        this.menuKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.M);
        this.continueKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

        this.scene.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
            switch (event.code) {
                case 'ArrowLeft':
                    this.desiredDirection = { dx: -1, dy: 0 };
                    break;
                case 'ArrowRight':
                    this.desiredDirection = { dx: 1, dy: 0 };
                    break;
                case 'ArrowUp':
                    this.desiredDirection = { dx: 0, dy: -1 };
                    break;
                case 'ArrowDown':
                    this.desiredDirection = { dx: 0, dy: 1 };
                    break;
                default:
                    return; // Don't emit event for other keys
            }

            this.scene.events.emit('input:direction', this.desiredDirection);
        });
    }

    /**
     * Configura los controles táctiles (swipe)
     */
    private setupTouchControls(): void {
        this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.swipeStartX = pointer.x;
            this.swipeStartY = pointer.y;
        });

        this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
            const dx = pointer.x - this.swipeStartX;
            const dy = pointer.y - this.swipeStartY;
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);

            if (Math.max(absDx, absDy) < this.minSwipeDistance) return;

            if (absDx > absDy) {
                this.desiredDirection = { dx: dx > 0 ? 1 : -1, dy: 0 };
            } else {
                this.desiredDirection = { dx: 0, dy: dy > 0 ? 1 : -1 };
            }

            this.scene.events.emit('input:direction', this.desiredDirection);
        });
    }

    /**
     * Verifica si la tecla R fue presionada (para restart)
     */
    isRestartJustPressed(): boolean {
        return Phaser.Input.Keyboard.JustDown(this.restartKey);
    }

    /**
     * Verifica si la tecla M fue presionada (para menú)
     */
    isMenuJustPressed(): boolean {
        return Phaser.Input.Keyboard.JustDown(this.menuKey);
    }

    /**
     * Verifica si la tecla C fue presionada (para continuar con power-up)
     */
    isContinueJustPressed(): boolean {
        return Phaser.Input.Keyboard.JustDown(this.continueKey);
    }

    /**
     * Obtiene la dirección deseada actual
     */
    getDesiredDirection(): Direction {
        return this.desiredDirection;
    }

    /**
     * Resetea la dirección deseada
     */
    resetDesiredDirection(): void {
        this.desiredDirection = { dx: 0, dy: 0 };
    }

    /**
     * Limpieza de recursos
     */
    destroy(): void {
        this.scene.input.keyboard?.off('keydown');
        this.scene.input.off('pointerdown');
        this.scene.input.off('pointerup');
    }
}
