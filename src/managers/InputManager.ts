import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { GameEvents } from '../events';
import { SwipeRecognizer } from '../input/SwipeRecognizer';
import type { Direction } from '../types/game.types';

export type InputSource = 'keyboard' | 'touch';

export interface InputDebugState {
    queued: Direction;
    last: (Direction & { source: InputSource }) | null;
    activePointers: number;
    swipeThreshold: number;
}

const KEY_DIRECTIONS: Record<string, Direction> = {
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
    KeyA: { dx: -1, dy: 0 },
    KeyD: { dx: 1, dy: 0 },
    KeyW: { dx: 0, dy: -1 },
    KeyS: { dx: 0, dy: 1 }
};

const CAPTURED_KEYS = 'UP,DOWN,LEFT,RIGHT,SPACE';

/**
 * Gestor de entrada direccional para teclado y touch.
 * Emite `input:direction` y mantiene la única cola de giro del juego.
 */
export class InputManager {
    private queuedDirection: Direction = { dx: 0, dy: 0 };
    private lastInput: InputDebugState['last'] = null;
    private readonly swipes = new SwipeRecognizer({
        threshold: CONFIG.INPUT.SWIPE_THRESHOLD_CSS_PX,
        axisDominance: CONFIG.INPUT.SWIPE_AXIS_DOMINANCE
    });

    constructor(private scene: Phaser.Scene) {}

    /**
     * Inicializa todos los controles
     */
    setup(): void {
        this.setupKeyboardControls();
        this.setupTouchControls();
    }

    private setupKeyboardControls(): void {
        const keyboard = this.scene.input.keyboard;
        if (!keyboard) return;

        // Evita que las flechas o la barra espaciadora desplacen la página.
        keyboard.addCapture(CAPTURED_KEYS);
        keyboard.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.handleKeyDown, this);
    }

    /**
     * El gesto se reconoce mientras el dedo sigue apoyado: no espera a
     * `pointerup`, y cada puntero se sigue por separado.
     */
    private setupTouchControls(): void {
        const input = this.scene.input;
        input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
        input.on(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
        input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
        input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);
    }

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.repeat) return;
        const direction = KEY_DIRECTIONS[event.code];
        if (direction) this.submit(direction, 'keyboard');
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        this.swipes.setThreshold(this.getSwipeThreshold());
        this.swipes.down(pointer.id, pointer.x, pointer.y);
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
        const direction = this.swipes.move(pointer.id, pointer.x, pointer.y);
        if (direction) this.submit(direction, 'touch');
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        this.swipes.up(pointer.id);
    }

    /** Umbral en píxeles de juego equivalente al tamaño físico configurado. */
    private getSwipeThreshold(): number {
        const scale = this.scene.scale.displayScale.x || 1;
        return CONFIG.INPUT.SWIPE_THRESHOLD_CSS_PX * scale;
    }

    private submit(direction: Direction, source: InputSource): void {
        this.queuedDirection = { ...direction };
        this.lastInput = { ...direction, source };
        this.scene.events.emit(GameEvents.INPUT_DIRECTION, this.queuedDirection);
    }

    /**
     * Dirección pendiente de aplicar (dx y dy en cero si no hay ninguna)
     */
    peekQueuedDirection(): Direction {
        return this.queuedDirection;
    }

    clearQueuedDirection(): void {
        this.queuedDirection = { dx: 0, dy: 0 };
    }

    getDebugState(): InputDebugState {
        return {
            queued: { ...this.queuedDirection },
            last: this.lastInput ? { ...this.lastInput } : null,
            activePointers: this.swipes.getActivePointerCount(),
            swipeThreshold: Number(this.getSwipeThreshold().toFixed(2))
        };
    }

    /**
     * Limpieza de recursos
     */
    destroy(): void {
        const input = this.scene.input;
        input.keyboard?.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.handleKeyDown, this);
        input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
        input.off(Phaser.Input.Events.POINTER_MOVE, this.handlePointerMove, this);
        input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerUp, this);
        input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.handlePointerUp, this);
        this.swipes.reset();
        this.clearQueuedDirection();
    }
}
