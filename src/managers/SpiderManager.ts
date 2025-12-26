import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { calculateSpriteScale } from '../utils/Utils';
import { CollisionSystem } from '../systems/CollisionSystem';
import type { Position, Obstacle, Spider, SpiderState } from '../types/game.types';

/**
 * Gestor de arañas con patrullaje entre dos puntos
 */
export class SpiderManager {
    private scene: Phaser.Scene;
    private collision: CollisionSystem;
    private spiders: Spider[] = [];
    private cellSize: number;
    private width: number;
    private height: number;
    private obstacles: Obstacle[] = [];

    constructor(scene: Phaser.Scene, collision: CollisionSystem, cellSize: number, width: number, height: number) {
        this.scene = scene;
        this.collision = collision;
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
    }

    /**
     * Genera arañas según el nivel
     */
    generate(level: number, obstacles: Obstacle[], exitPosition: Position): void {
        this.reset();
        this.obstacles = obstacles;

        if (!this.width || !this.height) return;

        let spiderCount = 0;
        // Spiders only appear from configured level
        if (level < CONFIG.SPIDER.FIRST_SPAWN_LEVEL) {
            spiderCount = 0;
        } else if (level < CONFIG.SPIDER.SECOND_SPAWN_LEVEL) {
            spiderCount = 1;
        } else if (level < CONFIG.SPIDER.THIRD_SPAWN_LEVEL) {
            spiderCount = 2;
        } else {
            spiderCount = 3;
        }

        if (spiderCount === 0) return;

        for (let i = 0; i < spiderCount; i++) {
            let attempts = 0;
            let spiderAdded = false;

            while (!spiderAdded && attempts < 50) {
                attempts++;

                const pointA = {
                    x: Phaser.Math.Between(0, this.width - 1),
                    y: Phaser.Math.Between(0, this.height - 1)
                };

                if (!this.isValidPoint(pointA, exitPosition)) continue;

                const axis = Phaser.Math.Between(0, 1);
                const pointB = { x: pointA.x, y: pointA.y };

                if (axis === 0) {
                    pointB.x = Phaser.Math.Between(0, this.width - 1);
                } else {
                    pointB.y = Phaser.Math.Between(0, this.height - 1);
                }

                const dist = Math.abs((pointB.x - pointA.x) + (pointB.y - pointA.y));
                if (dist < CONFIG.SPIDER.MIN_PATROL_DISTANCE) continue;
                if (!this.isValidPoint(pointB, exitPosition)) continue;
                // Use centralized isPathClear from CollisionSystem
                if (!this.collision.isPathClear(pointA, pointB, this.obstacles)) continue;

                const spider: Spider = {
                    state: 'WAITING' as SpiderState,
                    pointA: { ...pointA },
                    pointB: { ...pointB },
                    currentTarget: { ...pointB },
                    x: pointA.x,
                    y: pointA.y,
                    waitStartTime: this.scene.time.now,
                    sprite: null
                };

                spider.sprite = this.scene.add.sprite(
                    spider.x * this.cellSize + this.cellSize / 2,
                    spider.y * this.cellSize + this.cellSize / 2,
                    'spider'
                );

                const spiderScale = calculateSpriteScale('spider', this.cellSize, this.scene);
                spider.sprite.setScale(spiderScale);

                this.spiders.push(spider);
                spiderAdded = true;
            }
        }
    }

    /**
     * Actualiza el estado y movimiento de las arañas
     */
    update(time: number, playerPosition: Position): boolean {
        let playerHit = false;

        this.spiders.forEach(spider => {
            if (!spider.sprite) return;

            // Collision check
            if (Math.round(spider.x) === playerPosition.x &&
                Math.round(spider.y) === playerPosition.y) {
                playerHit = true;
            }

            // State machine
            if (spider.state === 'WAITING') {
                if (time - spider.waitStartTime > CONFIG.SPIDER.WAIT_DURATION_MS) {
                    spider.state = 'MOVING';
                }
            } else if (spider.state === 'MOVING') {
                const dx = spider.currentTarget.x - spider.x;
                const dy = spider.currentTarget.y - spider.y;
                const speed = CONFIG.SPIDER.MOVE_SPEED;

                if (Math.abs(dx) < speed && Math.abs(dy) < speed) {
                    // Arrived at target
                    spider.x = spider.currentTarget.x;
                    spider.y = spider.currentTarget.y;
                    spider.sprite.setPosition(
                        spider.x * this.cellSize + this.cellSize / 2,
                        spider.y * this.cellSize + this.cellSize / 2
                    );

                    spider.state = 'WAITING';
                    spider.waitStartTime = time;

                    // Toggle target
                    if (spider.currentTarget.x === spider.pointA.x &&
                        spider.currentTarget.y === spider.pointA.y) {
                        spider.currentTarget = { ...spider.pointB };
                    } else {
                        spider.currentTarget = { ...spider.pointA };
                    }
                } else {
                    // Move towards target
                    spider.x += Math.sign(dx) * speed;
                    spider.y += Math.sign(dy) * speed;

                    spider.sprite.setPosition(
                        spider.x * this.cellSize + this.cellSize / 2,
                        spider.y * this.cellSize + this.cellSize / 2
                    );
                }
            }
        });

        return playerHit;
    }

    /**
     * Verifica si un punto es válido para la araña
     */
    private isValidPoint(p: Position, exitPosition: Position): boolean {
        if (p.x < 0 || p.x >= this.width || p.y < 0 || p.y >= this.height) {
            return false;
        }
        if (p.x === 0 && p.y === 0) return false; // Player start
        if (p.x === exitPosition.x && p.y === exitPosition.y) return false;
        if (this.obstacles.some(o => o.x === p.x && o.y === p.y)) return false;

        return true;
    }



    /**
     * Verifica colisión del jugador con arañas
     */
    checkCollision(playerX: number, playerY: number): boolean {
        return this.spiders.some(
            s => Math.round(s.x) === playerX && Math.round(s.y) === playerY
        );
    }

    /**
     * Obtiene las arañas actuales
     */
    getSpiders(): Spider[] {
        return this.spiders;
    }

    /**
     * Resetea todas las arañas
     */
    reset(): void {
        this.spiders.forEach(spider => {
            if (spider.sprite) {
                spider.sprite.destroy();
            }
        });
        this.spiders = [];
    }

    /**
     * Destructor
     */
    destroy(): void {
        this.reset();
    }
}
