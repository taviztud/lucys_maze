import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { calculateSpriteScale, generateFreePosition } from '../utils/Utils';
import { CollisionSystem } from '../systems/CollisionSystem';
import type { Position, Direction, Enemy } from '../types/game.types';

/**
 * Gestor de enemigos regulares con movimiento aleatorio
 * Soporta colisión entre enemigos
 */
export class EnemyManager {
    private scene: Phaser.Scene;
    private collision: CollisionSystem;
    private enemies: Enemy[] = [];
    private cellSize: number;

    constructor(scene: Phaser.Scene, collision: CollisionSystem, cellSize: number) {
        this.scene = scene;
        this.collision = collision;
        this.cellSize = cellSize;
    }

    /**
     * Inicializa los enemigos según el nivel
     * - Primer enemigo aparece en nivel 5
     * - Segundo enemigo aparece cada 7 niveles (5, 12, 19, 26...)
     */
    init(level: number, excludePositions: Position[]): void {
        this.reset();

        // Los enemigos solo aparecen desde el nivel configurado
        if (level < CONFIG.ENEMIES.FIRST_SPAWN_LEVEL) return;

        // Calcular cantidad de enemigos: 1 base + 1 adicional cada SECOND_ENEMY_INTERVAL niveles
        let enemyCount = 1;
        const secondEnemyLevel = CONFIG.ENEMIES.FIRST_SPAWN_LEVEL + CONFIG.ENEMIES.SECOND_ENEMY_INTERVAL;
        if (level >= secondEnemyLevel) {
            enemyCount = 1 + Math.floor((level - CONFIG.ENEMIES.FIRST_SPAWN_LEVEL) / CONFIG.ENEMIES.SECOND_ENEMY_INTERVAL);
        }
        // Cap máximo de enemigos
        enemyCount = Math.min(enemyCount, CONFIG.ENEMIES.MAX_COUNT);

        const { width, height } = this.collision.getBoardDimensions();

        for (let i = 0; i < enemyCount; i++) {
            const allExcluded = [...excludePositions, ...this.enemies.map(e => ({ x: e.x, y: e.y }))];
            const position = generateFreePosition(allExcluded, width, height);

            if (!position) continue;

            const enemy: Enemy = {
                x: position.x,
                y: position.y,
                direction: this.getRandomDirection(),
                moving: false,
                sprite: null
            };

            enemy.sprite = this.scene.add.sprite(
                enemy.x * this.cellSize + this.cellSize / 2,
                enemy.y * this.cellSize + this.cellSize / 2,
                'enemy'
            );

            const enemyScale = calculateSpriteScale('enemy', this.cellSize, this.scene);
            enemy.sprite.setScale(enemyScale);
            enemy.sprite.setFlipX(enemy.direction.dx === -1);

            this.enemies.push(enemy);
        }
    }

    /**
     * Actualiza el movimiento de todos los enemigos
     * Incluye colisión entre enemigos
     */
    update(): void {
        this.enemies.forEach((enemy, index) => {
            if (!enemy?.sprite) return;

            if (!enemy.moving) {
                enemy.moving = true;
                const nextX = enemy.x + enemy.direction.dx;
                const nextY = enemy.y + enemy.direction.dy;

                // Check wall collision
                const wallCollision = this.collision.isCollision(nextX, nextY);

                // Check collision with other enemies
                const enemyCollision = this.checkEnemyAtPosition(nextX, nextY, index);

                if (wallCollision || enemyCollision) {
                    enemy.direction = this.getRandomDirection();
                    enemy.moving = false;
                    enemy.sprite.setFlipX(enemy.direction.dx === -1);
                } else {
                    this.scene.tweens.add({
                        targets: enemy.sprite,
                        x: nextX * this.cellSize + this.cellSize / 2,
                        y: nextY * this.cellSize + this.cellSize / 2,
                        duration: CONFIG.ENEMIES.MOVE_TWEEN_DURATION_MS,
                        onComplete: () => {
                            enemy.x = nextX;
                            enemy.y = nextY;
                            enemy.moving = false;

                            // Emit collision check event
                            this.scene.events.emit('enemy:moved', { x: enemy.x, y: enemy.y });
                        }
                    });
                }
            }
        });
    }

    /**
     * Verifica si hay otro enemigo en una posición (excluyendo el actual)
     */
    private checkEnemyAtPosition(x: number, y: number, excludeIndex: number): boolean {
        return this.enemies.some((e, i) => {
            if (i === excludeIndex) return false;
            return Math.round(e.x) === x && Math.round(e.y) === y;
        });
    }

    /**
     * Verifica si el jugador colisiona con algún enemigo
     */
    checkCollision(playerX: number, playerY: number): boolean {
        return this.enemies.some(
            e => Math.round(e.x) === playerX && Math.round(e.y) === playerY
        );
    }

    /**
     * Obtiene una dirección aleatoria
     */
    private getRandomDirection(): Direction {
        const directions: Direction[] = [
            { dx: 0, dy: -1 },
            { dx: 1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: -1, dy: 0 }
        ];
        return directions[Phaser.Math.Between(0, directions.length - 1)];
    }

    /**
     * Obtiene los enemigos actuales
     */
    getEnemies(): Enemy[] {
        return this.enemies;
    }

    /**
     * Actualiza los sprites de enemigos (para flip direction)
     */
    updateSprites(): void {
        this.enemies.forEach(enemy => {
            if (enemy.sprite) {
                if (enemy.direction.dx === -1) {
                    enemy.sprite.setFlipX(true);
                } else if (enemy.direction.dx === 1) {
                    enemy.sprite.setFlipX(false);
                }
            }
        });
    }

    /**
     * Resetea todos los enemigos
     */
    reset(): void {
        this.enemies.forEach(enemy => {
            if (enemy?.sprite) {
                enemy.sprite.destroy();
            }
        });
        this.enemies = [];
    }

    /**
     * Destructor
     */
    destroy(): void {
        this.reset();
    }
}
