import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { calculateSpriteScale } from '../utils/Utils';
import { CollisionSystem } from '../systems/CollisionSystem';
import type { Position, Direction } from '../types/game.types';

/**
 * Controlador del jugador con movimiento tipo sliding puzzle
 * Soporta cambio de dirección durante el movimiento (turn opportunity)
 */
export class PlayerController {
    private scene: Phaser.Scene;
    private collision: CollisionSystem;
    private cellSize: number;
    private playerPosition: Position = { x: 0, y: 0 };
    private moveDirection: Direction = { dx: 0, dy: 0 };
    private isMoving: boolean = false;
    private playerMoveTween: Phaser.Tweens.Tween | null = null;

    // Sprites
    private playerSprite: Phaser.GameObjects.Sprite | null = null;
    private playerDieSprite: Phaser.GameObjects.Sprite | null = null;

    // Particles
    private coinParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
    private trailParticles: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

    // Callbacks for turn opportunity
    private getDesiredDirection: (() => Direction) | null = null;
    private onTurnMove: ((dx: number, dy: number) => void) | null = null;

    // Callback for processing items during movement
    private currentStepCallback: ((x: number, y: number) => void) | null = null;

    constructor(scene: Phaser.Scene, collision: CollisionSystem, cellSize: number) {
        this.scene = scene;
        this.collision = collision;
        this.cellSize = cellSize;
    }

    /**
     * Configura los callbacks para el cambio de dirección durante movimiento
     */
    setTurnCallbacks(
        getDesiredDirection: () => Direction,
        onTurnMove: (dx: number, dy: number) => void
    ): void {
        this.getDesiredDirection = getDesiredDirection;
        this.onTurnMove = onTurnMove;
    }

    /**
     * Crea el sprite del jugador y partículas
     */
    create(position: Position): void {
        this.playerPosition = { ...position };

        this.playerSprite = this.scene.add.sprite(
            position.x * this.cellSize + this.cellSize / 2,
            position.y * this.cellSize + this.cellSize / 2,
            'player_stand'
        );
        this.playerSprite.setDepth(10);
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

        // Trail particles
        this.trailParticles = this.scene.add.particles(0, 0, 'player_run', {
            speed: 0,
            scale: { start: calculateSpriteScale('player_run', this.cellSize, this.scene) * 0.9, end: 0.7 },
            alpha: { start: 0.15, end: 0 },
            lifespan: 1000,
            blendMode: 'ADD',
            frequency: 140,
            emitting: false
        });
    }

    /**
     * Mueve al jugador en una dirección hasta encontrar un obstáculo
     */
    move(
        dx: number,
        dy: number,
        level: number,
        traps: Position[],
        exitPosition: Position,
        checkEnemyCollision: (x: number, y: number) => boolean,
        onStepCallback: (x: number, y: number) => void
    ): void {
        if (this.isMoving || (dx === 0 && dy === 0)) return;

        this.moveDirection = { dx, dy };
        const moveResult = this.collision.calculateMoveUntilObstacle(
            this.playerPosition.x,
            this.playerPosition.y,
            dx, dy
        );

        if (moveResult.distance === 0) {
            this.resetMovementState();
            return;
        }

        this.startMovement();
        this.currentStepCallback = onStepCallback;
        const baseStepDuration = this.calculateStepDuration(level);
        const finalDestination = this.calculateFinalDestination(
            dx, dy, moveResult, traps, exitPosition, checkEnemyCollision
        );

        this.executeMovementTween(dx, dy, baseStepDuration, finalDestination, traps, exitPosition, checkEnemyCollision, onStepCallback);
    }

    /**
     * Calcula la duración de cada paso basado en el nivel
     */
    private calculateStepDuration(level: number): number {
        return Math.max(
            CONFIG.PERFORMANCE.PLAYER_MIN_STEP_DURATION_MS,
            CONFIG.PERFORMANCE.PLAYER_BASE_DURATION_MS - level * CONFIG.PERFORMANCE.PLAYER_STEP_DEC_PER_LEVEL
        );
    }

    /**
     * Calcula el destino final considerando trampas, enemigos y salida
     */
    private calculateFinalDestination(
        dx: number,
        dy: number,
        moveResult: { x: number; y: number; distance: number },
        traps: Position[],
        exitPosition: Position,
        checkEnemyCollision: (x: number, y: number) => boolean
    ): { x: number; y: number; step: number } {
        const startX = this.playerPosition.x;
        const startY = this.playerPosition.y;

        for (let i = 1; i <= moveResult.distance; i++) {
            const checkX = startX + (dx * i);
            const checkY = startY + (dy * i);

            if (this.collision.isTrap(checkX, checkY, traps)) {
                return { x: checkX, y: checkY, step: i };
            }
            if (checkEnemyCollision(checkX, checkY)) {
                return { x: checkX, y: checkY, step: i };
            }
            if (checkX === exitPosition.x && checkY === exitPosition.y) {
                return { x: checkX, y: checkY, step: i };
            }
        }

        return { x: moveResult.x, y: moveResult.y, step: moveResult.distance };
    }

    /**
     * Ejecuta el tween de movimiento
     */
    private executeMovementTween(
        dx: number,
        dy: number,
        baseStepDuration: number,
        finalDestination: { x: number; y: number; step: number },
        traps: Position[],
        exitPosition: Position,
        checkEnemyCollision: (x: number, y: number) => boolean,
        onStepCallback: (x: number, y: number) => void
    ): void {
        const startX = this.playerPosition.x;
        const startY = this.playerPosition.y;
        let lastStepProcessed = -1;

        this.playerMoveTween = this.scene.tweens.add({
            targets: this.playerSprite,
            x: finalDestination.x * this.cellSize + this.cellSize / 2,
            y: finalDestination.y * this.cellSize + this.cellSize / 2,
            duration: baseStepDuration * finalDestination.step,
            ease: 'Linear',
            onUpdate: (tween) => {
                const progress = tween.progress;
                const currentStep = Math.floor(progress * finalDestination.step);
                const stepStart = Math.max(0, lastStepProcessed + 1);

                for (let step = stepStart; step <= currentStep; step++) {
                    const newX = startX + (dx * step);
                    const newY = startY + (dy * step);

                    if (newX !== this.playerPosition.x || newY !== this.playerPosition.y) {
                        this.playerPosition.x = newX;
                        this.playerPosition.y = newY;
                        onStepCallback(newX, newY);

                        // Check death conditions
                        if (this.collision.isTrap(newX, newY, traps) ||
                            checkEnemyCollision(newX, newY)) {
                            // Emit event - GameScene.handleDeath() will use shield or set gameOver
                            this.scene.events.emit('player:died');
                            // After event, check if game is over (shield wasn't available)
                            // If shield absorbed, continue movement with flash effect
                            // Access gameState via scene's registry or event result
                            const gameState = (this.scene as any).gameState;
                            if (gameState?.isGameOver) {
                                return; // Real death - stop movement
                            }
                            // Shield absorbed - continue movement (flash already triggered in handleDeath)
                        }

                        // Check exit
                        if (newX === exitPosition.x && newY === exitPosition.y) {
                            this.scene.events.emit('player:reachedExit');
                            return;
                        }

                        // Check for turn opportunity (original logic)
                        if (this.checkTurnOpportunity(tween)) {
                            return;
                        }
                    }
                }
                lastStepProcessed = currentStep;
            },
            onComplete: () => {
                this.onMovementComplete(finalDestination, traps, exitPosition);
            }
        });
    }

    /**
     * Verifica si el jugador puede girar en la posición actual
     * Esta es la lógica original que permite cambiar de dirección durante el movimiento
     */
    private checkTurnOpportunity(tween: Phaser.Tweens.Tween): boolean {
        if (!this.getDesiredDirection || !this.onTurnMove) return false;

        const desiredDirection = this.getDesiredDirection();

        // Check if there's a desired direction different from current move direction
        if ((desiredDirection.dx !== 0 || desiredDirection.dy !== 0) &&
            (desiredDirection.dx !== this.moveDirection.dx ||
                desiredDirection.dy !== this.moveDirection.dy)) {

            const turnNextX = this.playerPosition.x + desiredDirection.dx;
            const turnNextY = this.playerPosition.y + desiredDirection.dy;

            // If turn direction is not blocked, execute turn
            if (!this.collision.isCollision(turnNextX, turnNextY)) {
                // Snap sprite to current grid position
                this.playerSprite?.setPosition(
                    this.playerPosition.x * this.cellSize + this.cellSize / 2,
                    this.playerPosition.y * this.cellSize + this.cellSize / 2
                );

                // Stop current movement
                tween.stop();
                this.isMoving = false;

                // Trigger new movement in desired direction
                this.onTurnMove(desiredDirection.dx, desiredDirection.dy);
                return true;
            }
        }
        return false;
    }

    /**
     * Finaliza el movimiento
     */
    private onMovementComplete(
        finalDestination: { x: number; y: number; step: number },
        traps: Position[],
        exitPosition: Position
    ): void {
        if (this.trailParticles) this.trailParticles.stop();

        this.playerPosition.x = finalDestination.x;
        this.playerPosition.y = finalDestination.y;

        if (finalDestination.step > 0) {
            this.scene.cameras.main.shake(100, 0.005);
        }

        // Process items at final position (coins, power-ups)
        if (this.currentStepCallback) {
            this.currentStepCallback(this.playerPosition.x, this.playerPosition.y);
        }

        // Check trap at final position
        if (this.collision.isTrap(this.playerPosition.x, this.playerPosition.y, traps)) {
            this.scene.events.emit('player:died');
            // Check if game is over (shield wasn't available)
            const gameState = (this.scene as any).gameState;
            if (gameState?.isGameOver) {
                return; // Real death
            }
            // Shield absorbed - continue to reset movement state
        }

        if (this.playerPosition.x === exitPosition.x &&
            this.playerPosition.y === exitPosition.y) {
            this.scene.events.emit('player:reachedExit');
            return;
        }

        this.isMoving = false;
        this.playerMoveTween = null;
        this.moveDirection = { dx: 0, dy: 0 };
        this.playerSprite?.setTexture('player_stand');
        this.adjustScaleAndRotation();
    }

    /**
     * Inicia el estado de movimiento
     */
    private startMovement(): void {
        this.isMoving = true;
        this.playerSprite?.setTexture('player_run');
        this.adjustScaleAndRotation();

        if (this.trailParticles && this.playerSprite) {
            this.trailParticles.start();
            this.trailParticles.startFollow(this.playerSprite);
        }
    }

    /**
     * Resetea el estado de movimiento
     */
    private resetMovementState(): void {
        this.moveDirection = { dx: 0, dy: 0 };
        this.playerSprite?.setTexture('player_stand');
        this.adjustScaleAndRotation();
    }

    /**
     * Ajusta la escala y rotación del sprite según la dirección
     */
    private adjustScaleAndRotation(): void {
        if (!this.playerSprite) return;

        const playerScale = calculateSpriteScale(this.playerSprite.texture.key, this.cellSize, this.scene);
        this.playerSprite.setScale(playerScale);

        if (this.moveDirection.dx === 1) {
            this.playerSprite.setAngle(0);
            this.playerSprite.setFlipX(false);
        } else if (this.moveDirection.dx === -1) {
            this.playerSprite.setAngle(0);
            this.playerSprite.setFlipX(true);
        } else if (this.moveDirection.dy === -1) {
            this.playerSprite.setAngle(-90);
            this.playerSprite.setFlipX(false);
        } else if (this.moveDirection.dy === 1) {
            this.playerSprite.setAngle(90);
            this.playerSprite.setFlipX(false);
        } else {
            // Default orientation (facing right)
            this.playerSprite.setAngle(0);
            this.playerSprite.setFlipX(false);
        }
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
        if (this.playerSprite) {
            this.playerSprite.destroy();
            this.playerSprite = null;
        }

        this.playerDieSprite = this.scene.add.sprite(
            this.playerPosition.x * this.cellSize + this.cellSize / 2,
            this.playerPosition.y * this.cellSize + this.cellSize / 2,
            'player_die'
        );
        const dieScale = calculateSpriteScale('player_die', this.cellSize, this.scene);
        this.playerDieSprite.setScale(dieScale);
    }

    /**
     * Detiene el movimiento actual
     */
    stopMovement(): void {
        if (this.playerMoveTween) {
            this.playerMoveTween.stop();
            this.playerMoveTween = null;
        }
        this.isMoving = false;
        this.moveDirection = { dx: 0, dy: 0 };
        if (this.trailParticles) this.trailParticles.stop();
    }

    /**
     * Resetea el jugador a una posición
     */
    reset(position: Position): void {
        this.playerPosition = { ...position };
        this.isMoving = false;
        this.moveDirection = { dx: 0, dy: 0 };

        if (this.playerMoveTween) {
            this.playerMoveTween.stop();
            this.playerMoveTween = null;
        }

        if (this.playerDieSprite) {
            this.playerDieSprite.destroy();
            this.playerDieSprite = null;
        }

        // Recreate player sprite if needed
        if (!this.playerSprite) {
            this.playerSprite = this.scene.add.sprite(
                position.x * this.cellSize + this.cellSize / 2,
                position.y * this.cellSize + this.cellSize / 2,
                'player_stand'
            );
            this.playerSprite.setDepth(10);
        } else {
            this.playerSprite.setPosition(
                position.x * this.cellSize + this.cellSize / 2,
                position.y * this.cellSize + this.cellSize / 2
            );
            this.playerSprite.setVisible(true);
            this.playerSprite.setTexture('player_stand');
        }

        this.adjustScaleAndRotation();
    }

    /**
     * Obtiene la posición actual del jugador
     */
    getPosition(): Position {
        return { ...this.playerPosition };
    }

    /**
     * Obtiene la dirección actual de movimiento
     */
    getMoveDirection(): Direction {
        return { ...this.moveDirection };
    }

    /**
     * Verifica si el jugador está en movimiento
     */
    getIsMoving(): boolean {
        return this.isMoving;
    }

    /**
     * Obtiene el sprite del jugador
     */
    getSprite(): Phaser.GameObjects.Sprite | null {
        return this.playerSprite;
    }

    /**
     * Destructor
     */
    destroy(): void {
        this.stopMovement();
        if (this.playerSprite) this.playerSprite.destroy();
        if (this.playerDieSprite) this.playerDieSprite.destroy();
        if (this.coinParticles) this.coinParticles.destroy();
        if (this.trailParticles) this.trailParticles.destroy();
    }
}
