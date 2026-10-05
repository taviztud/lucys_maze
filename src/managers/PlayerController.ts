import Phaser from 'phaser';
import { playSfx } from '../audio/sfx';
import { CollisionSystem } from '../systems/CollisionSystem';
import type { Position, Direction } from '../types/game.types';
import {
    calculatePlayerVisualScale,
    getFirstIdleFrame,
    PLAYER_IDLE_TEXTURE_KEY,
    playPlayerIdle
} from './playerAnimations';

export type PlayerVisualState = 'idle' | 'running' | 'dead';

/** Cola de giro compartida con el gestor de entrada. */
export interface DirectionQueue {
    peekQueuedDirection(): Direction;
    clearQueuedDirection(): void;
}

/** Datos y callbacks del nivel actual que necesita el movimiento. */
export interface PlayerLevelContext {
    stepDurationMs: number;
    exit: Position;
    /** Trampas fijas: el deslizamiento se planifica hasta la primera. */
    isTrap: (x: number, y: number) => boolean;
    /** Cualquier peligro presente en la celda ahora mismo (fijo o dinámico). */
    isHazard: (x: number, y: number) => boolean;
    onStep: (x: number, y: number) => void;
    onHazard: () => void;
    onExit: () => void;
}

// Absorbe el error de coma flotante al cruzar un número entero de celdas.
const STEP_EPSILON = 1e-6;

/**
 * Controlador del jugador con movimiento tipo sliding puzzle.
 * Lucy desliza hasta un obstáculo y gira en la primera celda donde la
 * dirección en cola esté libre, incluida la celda donde se detiene.
 */
export class PlayerController {
    private scene: Phaser.Scene;
    private collision: CollisionSystem;
    private cellSize: number;
    private playerPosition: Position = { x: 0, y: 0 };
    private moveDirection: Direction = { dx: 0, dy: 0 };
    private isMoving: boolean = false;
    private moveTween: Phaser.Tweens.Tween | null = null;
    // Identifica el deslizamiento vigente para descartar callbacks de uno ya detenido.
    private moveId: number = 0;

    private context: PlayerLevelContext | null = null;
    private directionQueue: DirectionQueue | null = null;

    // Sprites
    private playerSprite: Phaser.GameObjects.Sprite | null = null;
    private playerDieSprite: Phaser.GameObjects.Sprite | null = null;
    private visualState: PlayerVisualState = 'idle';

    // Particles
    private coinParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
    private trailParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

    constructor(scene: Phaser.Scene, collision: CollisionSystem, cellSize: number) {
        this.scene = scene;
        this.collision = collision;
        this.cellSize = cellSize;
    }

    setDirectionQueue(queue: DirectionQueue): void {
        this.directionQueue = queue;
    }

    setLevelContext(context: PlayerLevelContext): void {
        this.context = context;
    }

    /**
     * Crea el sprite del jugador y partículas
     */
    create(position: Position): void {
        this.playerPosition = { ...position };

        this.playerSprite = this.scene.add.sprite(
            position.x * this.cellSize + this.cellSize / 2,
            position.y * this.cellSize + this.cellSize / 2,
            PLAYER_IDLE_TEXTURE_KEY,
            getFirstIdleFrame(this.scene)
        );
        this.playerSprite.setDepth(10);
        this.setVisualState('idle', true);
        this.adjustScaleAndRotation();

        // Coin particles
        this.coinParticles = this.scene.add.particles(0, 0, 'coin', {
            speed: { min: 50, max: 150 },
            scale: { start: 0.4, end: 0 },
            lifespan: 600,
            blendMode: 'ADD',
            quantity: 10,
            emitting: false
        });

        // Trail particles. Keep both scale axes independent so mirroring the
        // horizontal axis never flips the particle vertically as well.
        const trailScale = {
            start: calculatePlayerVisualScale(this.scene, 'player_run', this.cellSize) * 0.9,
            end: 0.7
        };
        this.trailParticles = this.scene.add.particles(0, 0, 'player_run', {
            speed: 0,
            scaleX: { ...trailScale },
            scaleY: { ...trailScale },
            alpha: { start: 0.15, end: 0 },
            lifespan: 1000,
            blendMode: 'ADD',
            frequency: 140,
            emitting: false
        });
        this.trailParticles.onParticleEmit((particle) => this.applyTrailParticleOrientation(particle));
    }

    /**
     * Inicia un deslizamiento si Lucy está quieta.
     * @returns true si el movimiento comenzó
     */
    move(direction: Direction): boolean {
        if (this.isMoving || !this.playerSprite) return false;
        return this.startSlide(direction);
    }

    private startSlide(direction: Direction): boolean {
        const context = this.context;
        const { dx, dy } = direction;
        if (!context || (dx === 0 && dy === 0)) return false;

        const steps = this.calculateSlideLength(dx, dy, context);
        if (steps === 0) return false;

        const moveId = ++this.moveId;
        const origin = { ...this.playerPosition };
        let processed = 0;

        this.moveDirection = { dx, dy };
        this.isMoving = true;
        playSfx(this.scene, 'slide');
        this.setVisualState('running');
        this.adjustScaleAndRotation();
        if (this.trailParticles && this.playerSprite) {
            this.trailParticles.start();
            this.trailParticles.startFollow(this.playerSprite);
        }

        // Un contador de celdas recorridas: su valor es el del frame actual
        // (incluido el último), así que cada celda se procesa exactamente una vez.
        this.moveTween = this.scene.tweens.addCounter({
            from: 0,
            to: steps,
            duration: context.stepDurationMs * steps,
            ease: 'Linear',
            onUpdate: (tween) => {
                if (moveId !== this.moveId) return;

                const travelled = tween.getValue() ?? 0;
                this.placeSprite(origin.x + dx * travelled, origin.y + dy * travelled);

                const reached = Math.min(steps, Math.floor(travelled + STEP_EPSILON));
                while (processed < reached && moveId === this.moveId) {
                    processed++;
                    this.arriveAt(
                        origin.x + dx * processed,
                        origin.y + dy * processed,
                        processed === steps
                    );
                }
            }
        });

        return true;
    }

    /** Celdas que recorre el deslizamiento: hasta la pared, la primera trampa o la salida. */
    private calculateSlideLength(dx: number, dy: number, context: PlayerLevelContext): number {
        const { x: startX, y: startY } = this.playerPosition;
        const { distance } = this.collision.calculateMoveUntilObstacle(startX, startY, dx, dy);

        for (let step = 1; step <= distance; step++) {
            const x = startX + dx * step;
            const y = startY + dy * step;
            if (context.isTrap(x, y) || (x === context.exit.x && y === context.exit.y)) return step;
        }

        return distance;
    }

    /** Procesa la llegada a una celda: ítems, peligros, salida y giro en cola. */
    private arriveAt(x: number, y: number, isLastCell: boolean): void {
        const context = this.context;
        if (!context) return;

        this.playerPosition = { x, y };
        context.onStep(x, y);

        if (context.isHazard(x, y)) {
            this.endSlide();
            context.onHazard();
            return;
        }

        if (x === context.exit.x && y === context.exit.y) {
            this.endSlide();
            context.onExit();
            return;
        }

        if (this.tryQueuedTurn(x, y)) return;

        if (isLastCell) {
            this.endSlide();
            // Un giro que no pudo aplicarse no debe sobrevivir al deslizamiento.
            this.directionQueue?.clearQueuedDirection();
            this.scene.cameras.main.shake(100, 0.005);
            playSfx(this.scene, 'bump');
        }
    }

    /** Gira si hay una dirección en cola distinta de la actual y su celda está libre. */
    private tryQueuedTurn(x: number, y: number): boolean {
        const queue = this.directionQueue;
        if (!queue) return false;

        const queued = queue.peekQueuedDirection();
        if (queued.dx === 0 && queued.dy === 0) return false;
        if (queued.dx === this.moveDirection.dx && queued.dy === this.moveDirection.dy) return false;
        if (this.collision.isCollision(x + queued.dx, y + queued.dy)) return false;

        const turn = { ...queued };
        queue.clearQueuedDirection();
        this.stopMoveTween();
        this.placeSprite(x, y);
        return this.startSlide(turn);
    }

    /** Detiene el deslizamiento en la celda lógica actual y deja a Lucy en idle. */
    private endSlide(): void {
        this.stopMoveTween();
        this.isMoving = false;
        this.moveDirection = { dx: 0, dy: 0 };
        this.trailParticles?.stop();
        this.placeSprite(this.playerPosition.x, this.playerPosition.y);
        this.setVisualState('idle');
        this.adjustScaleAndRotation();
    }

    private stopMoveTween(): void {
        this.moveTween?.stop();
        this.moveTween = null;
    }

    private placeSprite(gridX: number, gridY: number): void {
        this.playerSprite?.setPosition(
            gridX * this.cellSize + this.cellSize / 2,
            gridY * this.cellSize + this.cellSize / 2
        );
    }

    private setVisualState(state: PlayerVisualState, force = false): void {
        if (!this.playerSprite || (!force && this.visualState === state)) return;

        this.visualState = state;
        this.playerSprite.anims.stop();

        if (state === 'idle') {
            this.playerSprite.setTexture(PLAYER_IDLE_TEXTURE_KEY, getFirstIdleFrame(this.scene));
            playPlayerIdle(this.playerSprite);
        } else if (state === 'running') {
            this.playerSprite.setTexture('player_run');
        }
    }

    /**
     * Ajusta la escala y rotación del sprite según la dirección
     */
    private adjustScaleAndRotation(): void {
        if (!this.playerSprite) return;

        const playerScale = calculatePlayerVisualScale(
            this.scene,
            this.playerSprite.texture.key,
            this.cellSize,
            this.playerSprite.frame.name
        );
        this.playerSprite.setScale(playerScale);

        const orientation = this.getMovementVisualOrientation();
        this.playerSprite.setAngle(orientation.angle);
        this.playerSprite.setFlipX(orientation.flipX);
    }

    private applyTrailParticleOrientation(particle: Phaser.GameObjects.Particles.Particle): void {
        const orientation = this.getMovementVisualOrientation();
        const horizontalSign = orientation.flipX ? -1 : 1;
        const scaleXData = particle.data.scaleX;
        const scaleYData = particle.data.scaleY;

        particle.angle = orientation.angle;
        particle.rotation = Phaser.Math.DegToRad(orientation.angle);
        particle.scaleX = Math.abs(particle.scaleX) * horizontalSign;
        particle.scaleY = Math.abs(particle.scaleY);

        if (scaleXData) {
            scaleXData.min = Math.abs(scaleXData.min) * horizontalSign;
            scaleXData.max = Math.abs(scaleXData.max) * horizontalSign;
        }

        if (scaleYData) {
            scaleYData.min = Math.abs(scaleYData.min);
            scaleYData.max = Math.abs(scaleYData.max);
        }
    }

    private getMovementVisualOrientation(): { angle: number; flipX: boolean } {
        if (this.moveDirection.dx < 0) return { angle: 0, flipX: true };
        if (this.moveDirection.dy < 0) return { angle: -90, flipX: false };
        if (this.moveDirection.dy > 0) return { angle: 90, flipX: false };
        return { angle: 0, flipX: false };
    }

    /**
     * Emite partículas de moneda recogida
     */
    emitCoinParticles(x: number, y: number): void {
        if (this.coinParticles) {
            this.coinParticles.emitParticleAt(
                x * this.cellSize + this.cellSize / 2,
                y * this.cellSize + this.cellSize / 2
            );
        }
    }

    /**
     * Efecto de parpadeo cuando el shield absorbe un golpe
     * Lucy sigue moviéndose pero parpadea brevemente
     */
    flashInvincibility(): void {
        if (!this.playerSprite) return;

        // Blink effect with tint
        this.scene.tweens.add({
            targets: this.playerSprite,
            alpha: { from: 1, to: 0.3 },
            duration: 80,
            yoyo: true,
            repeat: 4,
            onComplete: () => {
                this.playerSprite?.setAlpha(1);
            }
        });

        // Blue tint flash
        this.playerSprite.setTint(0x00bfff);
        this.scene.time.delayedCall(400, () => {
            this.playerSprite?.clearTint();
        });
    }

    /**
     * Muestra el sprite de muerte
     */
    showDeathSprite(): void {
        if (this.playerDieSprite?.active) return;

        this.destroyDeathSprite();
        this.visualState = 'dead';
        if (this.playerSprite) {
            this.scene.tweens.killTweensOf(this.playerSprite);
            this.playerSprite.destroy();
            this.playerSprite = null;
        }

        this.playerDieSprite = this.scene.add.sprite(
            this.playerPosition.x * this.cellSize + this.cellSize / 2,
            this.playerPosition.y * this.cellSize + this.cellSize / 2,
            'player_die'
        );
        const dieScale = calculatePlayerVisualScale(this.scene, 'player_die', this.cellSize);
        this.playerDieSprite.setScale(dieScale);
    }

    /**
     * Detiene el movimiento actual
     */
    stopMovement(): void {
        this.moveId++;
        this.stopMoveTween();
        this.isMoving = false;
        this.moveDirection = { dx: 0, dy: 0 };
        if (this.trailParticles) this.trailParticles.stop();
    }

    /**
     * Resetea el jugador a una posición
     */
    reset(position: Position): void {
        this.stopMovement();
        this.playerPosition = { ...position };

        this.trailParticles?.killAll();
        this.destroyDeathSprite();

        // Recreate player sprite if needed
        if (!this.playerSprite) {
            this.playerSprite = this.scene.add.sprite(
                position.x * this.cellSize + this.cellSize / 2,
                position.y * this.cellSize + this.cellSize / 2,
                PLAYER_IDLE_TEXTURE_KEY,
                getFirstIdleFrame(this.scene)
            );
            this.playerSprite.setDepth(10);
        } else {
            this.placeSprite(position.x, position.y);
            this.playerSprite.setVisible(true);
        }

        this.setVisualState('idle', true);
        this.adjustScaleAndRotation();
    }

    /**
     * Obtiene la posición actual del jugador
     */
    getPosition(): Position {
        return { ...this.playerPosition };
    }

    /**
     * Verifica si el jugador está en movimiento
     */
    getIsMoving(): boolean {
        return this.isMoving;
    }

    getVisualState(): PlayerVisualState {
        return this.visualState;
    }

    getCurrentFrameName(): string | number | null {
        return this.playerSprite?.frame.name ?? null;
    }

    getTrailState(): {
        emitting: boolean;
        alive: number;
        orientations: Array<{ angle: number; flipX: boolean; flipY: boolean }>;
    } {
        const orientations = new Map<string, { angle: number; flipX: boolean; flipY: boolean }>();

        this.trailParticles?.forEachAlive((particle) => {
            const orientation = {
                angle: Math.round(particle.angle),
                flipX: particle.scaleX < 0,
                flipY: particle.scaleY < 0
            };
            orientations.set(
                `${orientation.angle}:${orientation.flipX}:${orientation.flipY}`,
                orientation
            );
        }, this);

        return {
            emitting: this.trailParticles?.emitting ?? false,
            alive: this.trailParticles?.getAliveParticleCount() ?? 0,
            orientations: [...orientations.values()]
        };
    }

    /**
     * Destructor
     */
    destroy(): void {
        this.stopMovement();
        if (this.playerSprite) this.playerSprite.destroy();
        this.destroyDeathSprite();
        if (this.coinParticles) this.coinParticles.destroy();
        if (this.trailParticles) this.trailParticles.destroy();
    }

    private destroyDeathSprite(): void {
        this.playerDieSprite?.destroy();
        this.playerDieSprite = null;
    }
}
