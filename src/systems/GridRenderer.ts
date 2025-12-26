import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { calculateSpriteScale } from '../utils/Utils';
import type { Position, Obstacle, SpriteCache, GridSprite, ObstacleSprite } from '../types/game.types';

/**
 * Datos de entidades para renderizar
 */
export interface RenderData {
    coins: Position[];
    obstacles: Obstacle[];
    traps: Position[];
    saves: Position[];      // Continue power-ups
    shields: Position[];    // Shield power-ups
    exitPosition: Position;
}

/**
 * Renderizador del grid y entidades del juego
 */
export class GridRenderer {
    private scene: Phaser.Scene;
    private cellSize: number;
    private width: number;
    private height: number;
    private gridGroup: Phaser.GameObjects.Group | null = null;
    private spriteCache: SpriteCache = { coins: [], obstacles: [], traps: [] };

    // Entity sprites
    private coinSprites: GridSprite[] = [];
    private obstacleSprites: ObstacleSprite[] = [];
    private trapSprites: Phaser.GameObjects.Sprite[] = [];
    private exitSprite: Phaser.GameObjects.Sprite | null = null;
    private saveSprite: Phaser.GameObjects.Sprite | null = null;
    private shieldSprite: Phaser.GameObjects.Sprite | null = null;
    private exitPulseTween: Phaser.Tweens.Tween | null = null;
    private savePulseTween: Phaser.Tweens.Tween | null = null;
    private shieldPulseTween: Phaser.Tweens.Tween | null = null;

    constructor(scene: Phaser.Scene, cellSize: number, width: number, height: number) {
        this.scene = scene;
        this.cellSize = cellSize;
        this.width = width;
        this.height = height;
    }

    /**
     * Crea el grid visual según el nivel
     */
    createGrid(level: number): void {
        this.scene.cameras.main.setBackgroundColor(CONFIG.UI.MAIN_BACKGROUND_COLOR);

        const neonColor = CONFIG.BACKGROUND_COLORS[(level - 1) % CONFIG.BACKGROUND_COLORS.length];

        if (this.gridGroup?.children) {
            this.gridGroup.clear(true, true);
        } else {
            this.gridGroup = this.scene.add.group();
        }

        const graphics = this.scene.add.graphics();
        graphics.lineStyle(1, neonColor, CONFIG.GRID_ALPHA);

        // Vertical lines
        for (let x = 0; x <= this.width; x++) {
            graphics.moveTo(x * this.cellSize, 0);
            graphics.lineTo(x * this.cellSize, this.height * this.cellSize);
        }

        // Horizontal lines
        for (let y = 0; y <= this.height; y++) {
            graphics.moveTo(0, y * this.cellSize);
            graphics.lineTo(this.width * this.cellSize, y * this.cellSize);
        }

        graphics.strokePath();
        this.gridGroup.add(graphics);

        // Add dots at intersections
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const dot = this.scene.add.rectangle(
                    x * this.cellSize + this.cellSize / 2,
                    y * this.cellSize + this.cellSize / 2,
                    2, 2, neonColor
                );
                dot.setAlpha(0.6);
                this.gridGroup.add(dot);
            }
        }
    }

    /**
     * Dibuja todas las entidades del laberinto
     */
    drawEntities(data: RenderData): void {
        this.drawExit(data.exitPosition);
        this.drawCoins(data.coins);
        this.drawObstacles(data.obstacles);
        this.drawTraps(data.traps);
        this.drawSave(data.saves);
        this.drawShield(data.shields);
        this.hideUnusedSprites();
    }

    /**
     * Dibuja la salida con animación pulsante
     */
    private drawExit(exitPosition: Position): void {
        if (!this.exitSprite) {
            this.exitSprite = this.scene.add.sprite(
                exitPosition.x * this.cellSize + this.cellSize / 2,
                exitPosition.y * this.cellSize + this.cellSize / 2,
                'exit'
            );
        } else {
            this.exitSprite.setPosition(
                exitPosition.x * this.cellSize + this.cellSize / 2,
                exitPosition.y * this.cellSize + this.cellSize / 2
            );
            this.exitSprite.setVisible(true);
        }

        const exitScale = calculateSpriteScale('exit', this.cellSize, this.scene);
        this.exitSprite.setScale(exitScale);
        this.startExitAnimation(exitScale);
    }

    /**
     * Inicia la animación pulsante de la salida
     */
    private startExitAnimation(baseScale: number): void {
        if (!this.exitSprite) return;

        if (this.exitPulseTween) {
            this.exitPulseTween.stop();
        }

        this.exitPulseTween = this.scene.tweens.add({
            targets: this.exitSprite,
            scaleX: { from: baseScale * 0.95, to: baseScale * 1.1 },
            scaleY: { from: baseScale * 0.95, to: baseScale * 1.1 },
            alpha: { from: 0.7, to: 1.0 },
            duration: 800,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: -1
        });
    }

    /**
     * Dibuja las monedas
     */
    private drawCoins(coins: Position[]): void {
        this.coinSprites = [];
        coins.forEach((coin, index) => {
            let coinSprite: GridSprite;

            if (this.spriteCache.coins[index]?.active) {
                coinSprite = this.spriteCache.coins[index] as GridSprite;
                coinSprite.setPosition(
                    coin.x * this.cellSize + this.cellSize / 2,
                    coin.y * this.cellSize + this.cellSize / 2
                );
                coinSprite.setVisible(true);
            } else {
                coinSprite = this.scene.add.sprite(
                    coin.x * this.cellSize + this.cellSize / 2,
                    coin.y * this.cellSize + this.cellSize / 2,
                    'coin'
                ) as GridSprite;
                const coinScale = calculateSpriteScale('coin', this.cellSize, this.scene);
                coinSprite.setScale(coinScale);
                this.spriteCache.coins[index] = coinSprite;
            }

            coinSprite.gridX = coin.x;
            coinSprite.gridY = coin.y;
            this.coinSprites.push(coinSprite);
        });
    }

    /**
     * Dibuja los obstáculos
     */
    private drawObstacles(obstacles: Obstacle[]): void {
        this.obstacleSprites = [];
        obstacles.forEach((obstacle, index) => {
            let obstacleSprite: ObstacleSprite;

            if (this.spriteCache.obstacles[index]?.active) {
                obstacleSprite = this.spriteCache.obstacles[index] as ObstacleSprite;
                obstacleSprite.setPosition(
                    obstacle.x * this.cellSize + this.cellSize / 2,
                    obstacle.y * this.cellSize + this.cellSize / 2
                );
                obstacleSprite.setTexture(`obstacle_${obstacle.type}`);
                obstacleSprite.setVisible(true);
            } else {
                obstacleSprite = this.scene.add.sprite(
                    obstacle.x * this.cellSize + this.cellSize / 2,
                    obstacle.y * this.cellSize + this.cellSize / 2,
                    `obstacle_${obstacle.type}`
                ) as ObstacleSprite;
                const obstacleScale = calculateSpriteScale(`obstacle_${obstacle.type}`, this.cellSize, this.scene);
                obstacleSprite.setScale(obstacleScale);
                this.spriteCache.obstacles[index] = obstacleSprite;
            }

            obstacleSprite.obstacleType = obstacle.type;
            obstacleSprite.gridX = obstacle.x;
            obstacleSprite.gridY = obstacle.y;
            this.obstacleSprites.push(obstacleSprite);
        });
    }

    /**
     * Dibuja las trampas con animación de giro
     */
    private drawTraps(traps: Position[]): void {
        this.trapSprites = [];
        traps.forEach((trap, index) => {
            let trapSprite: Phaser.GameObjects.Sprite;

            if (this.spriteCache.traps[index]?.active) {
                trapSprite = this.spriteCache.traps[index];
                trapSprite.setPosition(
                    trap.x * this.cellSize + this.cellSize / 2,
                    trap.y * this.cellSize + this.cellSize / 2
                );
                trapSprite.setVisible(true);
            } else {
                trapSprite = this.scene.add.sprite(
                    trap.x * this.cellSize + this.cellSize / 2,
                    trap.y * this.cellSize + this.cellSize / 2,
                    'trap'
                );
                const trapScale = calculateSpriteScale('trap', this.cellSize, this.scene);
                trapSprite.setScale(trapScale);
                this.spriteCache.traps[index] = trapSprite;
            }

            // Spinning animation with staggered start
            const staggerDelay = Phaser.Math.Between(0, 2000);
            this.scene.time.delayedCall(staggerDelay, () => {
                if (trapSprite?.active) {
                    this.scene.tweens.add({
                        targets: trapSprite,
                        angle: 360,
                        duration: 1500,
                        ease: 'Cubic.InOut',
                        repeat: -1,
                        onRepeat: () => trapSprite.setAngle(0)
                    });
                }
            });

            this.trapSprites.push(trapSprite);
        });
    }

    /**
     * Dibuja el save item con animación pulsante
     */
    private drawSave(saves: Position[]): void {
        if (saves.length > 0) {
            const save = saves[0];
            if (!this.saveSprite) {
                this.saveSprite = this.scene.add.sprite(
                    save.x * this.cellSize + this.cellSize / 2,
                    save.y * this.cellSize + this.cellSize / 2,
                    'power_continue'
                );
            } else {
                this.saveSprite.setPosition(
                    save.x * this.cellSize + this.cellSize / 2,
                    save.y * this.cellSize + this.cellSize / 2
                );
                this.saveSprite.setVisible(true);
            }

            const saveScale = calculateSpriteScale('power_continue', this.cellSize, this.scene);
            this.saveSprite.setScale(saveScale);
            this.saveSprite.setAlpha(1);

            if (this.savePulseTween) {
                this.savePulseTween.stop();
            }

            this.savePulseTween = this.scene.tweens.add({
                targets: this.saveSprite,
                scaleX: { from: saveScale * 0.95, to: saveScale * 1.08 },
                scaleY: { from: saveScale * 0.95, to: saveScale * 1.08 },
                alpha: { from: 0.9, to: 1.0 },
                ease: 'Sine.InOut',
                duration: 600,
                yoyo: true,
                repeat: -1
            });
        } else if (this.saveSprite) {
            this.saveSprite.setVisible(false);
        }
    }

    /**
     * Dibuja el shield item con animación pulsante
     */
    private drawShield(shields: Position[]): void {
        if (shields.length > 0) {
            const shield = shields[0];
            if (!this.shieldSprite) {
                this.shieldSprite = this.scene.add.sprite(
                    shield.x * this.cellSize + this.cellSize / 2,
                    shield.y * this.cellSize + this.cellSize / 2,
                    'power_shield'
                );
            } else {
                this.shieldSprite.setPosition(
                    shield.x * this.cellSize + this.cellSize / 2,
                    shield.y * this.cellSize + this.cellSize / 2
                );
                this.shieldSprite.setVisible(true);
            }

            const shieldScale = calculateSpriteScale('power_shield', this.cellSize, this.scene);
            this.shieldSprite.setScale(shieldScale);
            this.shieldSprite.setAlpha(1);

            if (this.shieldPulseTween) {
                this.shieldPulseTween.stop();
            }

            this.shieldPulseTween = this.scene.tweens.add({
                targets: this.shieldSprite,
                scaleX: { from: shieldScale * 0.95, to: shieldScale * 1.08 },
                scaleY: { from: shieldScale * 0.95, to: shieldScale * 1.08 },
                alpha: { from: 0.9, to: 1.0 },
                ease: 'Sine.InOut',
                duration: 600,
                yoyo: true,
                repeat: -1
            });
        } else if (this.shieldSprite) {
            this.shieldSprite.setVisible(false);
        }
    }

    /**
     * Oculta sprites no usados del cache
     */
    private hideUnusedSprites(): void {
        this.hideUnused(this.coinSprites, 'coins');
        this.hideUnused(this.obstacleSprites, 'obstacles');
        this.hideUnused(this.trapSprites, 'traps');
    }

    private hideUnused(usedSprites: Phaser.GameObjects.Sprite[], cacheKey: keyof SpriteCache): void {
        const cache = this.spriteCache[cacheKey];
        for (let i = usedSprites.length; i < cache.length; i++) {
            if (cache[i]) {
                cache[i].setVisible(false);
            }
        }
    }

    /**
     * Anima los árboles cercanos cuando el jugador pasa
     */
    animateNearbyTrees(playerX: number, playerY: number): void {
        this.obstacleSprites.forEach(sprite => {
            if (sprite.obstacleType !== 'tree') return;

            const distX = Math.abs((sprite.gridX ?? 0) - playerX);
            const distY = Math.abs((sprite.gridY ?? 0) - playerY);

            if (distX <= 1 && distY <= 1 && (distX + distY) > 0) {
                if (!sprite.isSwaying) {
                    sprite.isSwaying = true;
                    const swayDirection = playerX < (sprite.gridX ?? 0) ? -1 : 1;

                    this.scene.tweens.add({
                        targets: sprite,
                        angle: { from: 0, to: swayDirection * 8 },
                        duration: 150,
                        ease: 'Sine.InOut',
                        yoyo: true,
                        repeat: 1,
                        onComplete: () => {
                            sprite.setAngle(0);
                            sprite.isSwaying = false;
                        }
                    });
                }
            }
        });
    }

    /**
     * Elimina una moneda del renderer
     */
    removeCoin(x: number, y: number): void {
        for (let i = this.coinSprites.length - 1; i >= 0; i--) {
            if (this.coinSprites[i].gridX === x && this.coinSprites[i].gridY === y) {
                this.coinSprites[i].destroy();
                this.coinSprites.splice(i, 1);
                break;
            }
        }
    }

    /**
     * Elimina el save sprite
     */
    removeSave(): void {
        if (this.savePulseTween) {
            this.savePulseTween.stop();
            this.savePulseTween = null;
        }
        if (this.saveSprite) {
            this.saveSprite.destroy();
            this.saveSprite = null;
        }
    }

    /**
     * Elimina el shield sprite
     */
    removeShield(): void {
        if (this.shieldPulseTween) {
            this.shieldPulseTween.stop();
            this.shieldPulseTween = null;
        }
        if (this.shieldSprite) {
            this.shieldSprite.destroy();
            this.shieldSprite = null;
        }
    }

    /**
     * Obtiene los sprites de monedas
     */
    getCoinSprites(): GridSprite[] {
        return this.coinSprites;
    }

    /**
     * Obtiene los sprites de obstáculos
     */
    getObstacleSprites(): ObstacleSprite[] {
        return this.obstacleSprites;
    }

    /**
     * Limpia el cache de sprites
     */
    clearCache(): void {
        Object.keys(this.spriteCache).forEach(key => {
            const cacheKey = key as keyof SpriteCache;
            this.spriteCache[cacheKey].forEach(sprite => {
                if (sprite?.destroy) {
                    sprite.destroy();
                }
            });
            this.spriteCache[cacheKey] = [];
        });
    }

    /**
     * Destructor
     */
    destroy(): void {
        this.clearCache();
        if (this.exitPulseTween) this.exitPulseTween.stop();
        if (this.savePulseTween) this.savePulseTween.stop();
        if (this.shieldPulseTween) this.shieldPulseTween.stop();
        if (this.exitSprite) this.exitSprite.destroy();
        if (this.saveSprite) this.saveSprite.destroy();
        if (this.shieldSprite) this.shieldSprite.destroy();
        if (this.gridGroup) this.gridGroup.clear(true, true);
    }
}
