import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { generateFreePosition } from '../utils/Utils';
import { CollisionSystem } from '../systems/CollisionSystem';
import type { Position, Direction, Enemy } from '../types/game.types';
import { createAnimatedEnemySprite } from './enemyAnimations';
import { getAnimation } from '../visuals/assetRegistry';

const WORM_SCALE_MULTIPLIERS = [0.4, 0.55, 0.7, 0.8] as const;

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
                target: null,
                sprite: null
            };

            const frameCount = getAnimation('worm_walk').frames.length;
            const startFrame = (level + i * 3) % frameCount;
            const scaleMultiplier = WORM_SCALE_MULTIPLIERS[i % WORM_SCALE_MULTIPLIERS.length];

            enemy.sprite = createAnimatedEnemySprite(
                this.scene,
                enemy.x * this.cellSize + this.cellSize / 2,
                enemy.y * this.cellSize + this.cellSize / 2,
                'worm',
                this.cellSize,
                { startFrame, scaleMultiplier }
            );

            enemy.sprite.setData({ startFrame, scaleMultiplier });

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
            const sprite = enemy.sprite;
            if (!sprite || enemy.moving) return;

            const nextX = enemy.x + enemy.direction.dx;
            const nextY = enemy.y + enemy.direction.dy;

            if (this.collision.isCollision(nextX, nextY) || this.isCellTaken(nextX, nextY, index)) {
                enemy.direction = this.getRandomDirection();
                sprite.setFlipX(enemy.direction.dx === -1);
                return;
            }

            enemy.moving = true;
            enemy.target = { x: nextX, y: nextY };
            this.scene.tweens.add({
                targets: sprite,
                x: nextX * this.cellSize + this.cellSize / 2,
                y: nextY * this.cellSize + this.cellSize / 2,
                duration: CONFIG.ENEMIES.MOVE_TWEEN_DURATION_MS,
                // La posición lógica acompaña al sprite para que el contacto
                // coincida con lo que se ve durante todo el movimiento.
                onUpdate: () => {
                    enemy.x = (sprite.x - this.cellSize / 2) / this.cellSize;
                    enemy.y = (sprite.y - this.cellSize / 2) / this.cellSize;
                },
                onComplete: () => {
                    enemy.x = nextX;
                    enemy.y = nextY;
                    enemy.target = null;
                    enemy.moving = false;
                }
            });
        });
    }

    /**
     * Verifica si otro enemigo ocupa o tiene reservada una celda
     */
    private isCellTaken(x: number, y: number, excludeIndex: number): boolean {
        return this.enemies.some((e, i) => {
            if (i === excludeIndex) return false;
            if (e.target && e.target.x === x && e.target.y === y) return true;
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
     * Resetea todos los enemigos
     */
    reset(): void {
        this.enemies.forEach(enemy => {
            if (enemy.sprite) {
                // Un tween vivo seguiría moviendo la posición lógica del enemigo eliminado.
                this.scene.tweens.killTweensOf(enemy.sprite);
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
