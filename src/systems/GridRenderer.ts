import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { calculateSpriteScale } from '../utils/Utils';
import { configureAnimatedEnemySprite, createAnimatedEnemySprite } from '../managers/enemyAnimations';
import type { Position, Obstacle, SpriteCache, GridSprite, ObstacleSprite } from '../types/game.types';
import { STATIC_ASSETS, getAnimation } from '../visuals/assetRegistry';
import { deterministicUnit, getLevelVisualProfile, type BoardTheme } from '../visuals/levelVisuals';

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
    private backgroundObject: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite | null = null;
    private backgroundOverlay: Phaser.GameObjects.Rectangle | null = null;
    private currentLevel: number = 1;
    private currentTheme: BoardTheme = getLevelVisualProfile(1).theme;
    private spriteCache: SpriteCache = { coins: [], obstacles: [], traps: [] };

    // Entity sprites
    private coinSprites: GridSprite[] = [];
    private obstacleSprites: ObstacleSprite[] = [];
    private trapSprites: GridSprite[] = [];
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
        this.currentLevel = level;
        this.currentTheme = getLevelVisualProfile(level).theme;
        this.scene.cameras.main.setBackgroundColor(CONFIG.UI.MAIN_BACKGROUND_COLOR);
        this.drawBackground(this.currentTheme);
        const neonColor = this.currentTheme.gridColor;

        if (this.gridGroup?.children) {
            this.gridGroup.clear(true, true);
        } else {
            this.gridGroup = this.scene.add.group();
        }

        const graphics = this.scene.add.graphics();
        graphics.setDepth(0);
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
                dot.setDepth(0);
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

    /** Draws one deterministic Lelar or Spin visual for every logical trap. */
    private drawTraps(traps: Position[]): void {
        this.trapSprites = [];
        const variants = this.createTrapVariants(traps);
        traps.forEach((trap, index) => {
            let trapSprite: GridSprite;
            const variant = variants[index];
            const scaleMultiplier = this.getLelarScale(trap, index);

            if (this.spriteCache.traps[index]?.active) {
                trapSprite = this.spriteCache.traps[index] as GridSprite;
                trapSprite.setPosition(
                    trap.x * this.cellSize + this.cellSize / 2,
                    trap.y * this.cellSize + this.cellSize / 2
                );
                trapSprite.setVisible(true);
            } else {
                trapSprite = this.scene.add.sprite(
                    trap.x * this.cellSize + this.cellSize / 2,
                    trap.y * this.cellSize + this.cellSize / 2,
                    variant === 'spin' ? STATIC_ASSETS.spin.textureKey : 'lelar_idle'
                ) as GridSprite;
                this.spriteCache.traps[index] = trapSprite;
            }

            this.configureTrapSprite(trapSprite, variant, trap, index, scaleMultiplier);
            trapSprite.gridX = trap.x;
            trapSprite.gridY = trap.y;
            trapSprite.trapVariant = variant;
            trapSprite.visualScaleMultiplier = variant === 'lelar' ? scaleMultiplier : 1;
            this.trapSprites.push(trapSprite);
        });
    }

    getTrapVisualStates(): Array<{
        x: number | null;
        y: number | null;
        variant: 'lelar' | 'spin';
        scaleMultiplier: number;
        frame: string | number | null;
        animation: string | null;
        isPlaying: boolean;
        angle: number;
    }> {
        return this.trapSprites.map((sprite) => ({
            x: sprite.gridX ?? null,
            y: sprite.gridY ?? null,
            variant: sprite.trapVariant ?? 'lelar',
            scaleMultiplier: sprite.visualScaleMultiplier ?? 1,
            frame: sprite.frame.name ?? null,
            animation: sprite.anims.currentAnim?.key ?? null,
            isPlaying: sprite.anims.isPlaying,
            angle: Number(sprite.angle.toFixed(2))
        }));
    }

    getThemeState(): {
        id: string;
        name: string;
        gridColor: string;
        background: string;
        mode: 'cover' | 'tile';
        patternCellSpan: number;
        overlayAlpha: number;
    } {
        return {
            id: this.currentTheme.id,
            name: this.currentTheme.name,
            gridColor: `#${this.currentTheme.gridColor.toString(16).padStart(6, '0')}`,
            background: this.currentTheme.background.textureKey,
            mode: this.currentTheme.background.mode,
            patternCellSpan: this.currentTheme.background.patternCellSpan,
            overlayAlpha: this.currentTheme.background.overlayAlpha
        };
    }

    private createTrapVariants(traps: Position[]): Array<'lelar' | 'spin'> {
        const ratio = getLevelVisualProfile(this.currentLevel).spinRatio;
        if (ratio <= 0 || traps.length === 0) return traps.map(() => 'lelar');
        let spinCount = Math.max(1, Math.round(traps.length * ratio));
        if (traps.length >= 2) spinCount = Math.min(spinCount, traps.length - 1);
        const ranked = traps.map((trap, index) => ({
            index,
            rank: deterministicUnit(this.currentLevel, trap.x, trap.y, index, 0x51f15e)
        })).sort((left, right) => left.rank - right.rank);
        const spins = new Set(ranked.slice(0, spinCount).map(({ index }) => index));
        return traps.map((_trap, index) => spins.has(index) ? 'spin' : 'lelar');
    }

    private getLelarScale(trap: Position, index: number): number {
        const choices = [0.55, 0.55, 0.75, 0.75, 1];
        const unit = deterministicUnit(this.currentLevel, trap.x, trap.y, index, 0x1e1a4);
        return choices[Math.min(choices.length - 1, Math.floor(unit * choices.length))];
    }

    private configureTrapSprite(
        sprite: GridSprite,
        variant: 'lelar' | 'spin',
        trap: Position,
        index: number,
        scaleMultiplier: number
    ): void {
        if (variant === 'lelar') {
            sprite.spinTween?.stop();
            sprite.spinTween = null;
            sprite.setAngle(0);
            const frameCount = getAnimation('lelar_idle').frames.length;
            const startFrame = Math.floor(
                deterministicUnit(this.currentLevel, trap.x, trap.y, index, 0x1d1e) * frameCount
            );
            configureAnimatedEnemySprite(this.scene, sprite, 'lelar', this.cellSize, {
                startFrame,
                scaleMultiplier
            });
            return;
        }

        if (sprite.texture.key !== STATIC_ASSETS.spin.textureKey) {
            sprite.anims.stop();
            sprite.setTexture(STATIC_ASSETS.spin.textureKey);
        }
        sprite.setScale(calculateSpriteScale(
            STATIC_ASSETS.spin.textureKey,
            this.cellSize * STATIC_ASSETS.spin.targetCellRatio,
            this.scene
        )).setDepth(STATIC_ASSETS.spin.depth);
        if (!sprite.spinTween) {
            sprite.spinTween = this.scene.tweens.add({
                targets: sprite,
                angle: 360,
                duration: STATIC_ASSETS.spin.rotationDurationMs,
                repeat: -1,
                ease: 'Linear'
            });
        }
    }

    private drawBackground(theme: BoardTheme): void {
        this.backgroundObject?.destroy();
        this.backgroundOverlay?.destroy();
        this.backgroundObject = null;
        this.backgroundOverlay = null;
        const background = theme.background;
        if (!this.scene.textures.exists(background.textureKey)) return;
        const width = this.width * this.cellSize;
        const height = this.height * this.cellSize;
        if (background.mode === 'tile') {
            const source = this.scene.textures.get(background.textureKey).source[0];
            const tile = this.scene.add.tileSprite(0, 0, width, height, background.textureKey).setOrigin(0);
            tile.setTileScale(
                (this.cellSize * background.patternCellSpan) / source.width,
                (this.cellSize * background.patternCellSpan) / source.height
            );
            this.backgroundObject = tile;
        } else {
            this.backgroundObject = this.scene.add.image(0, 0, background.textureKey)
                .setOrigin(0)
                .setDisplaySize(width, height);
        }
        this.backgroundObject.setAlpha(background.alpha).setDepth(-10);
        this.backgroundOverlay = this.scene.add.rectangle(0, 0, width, height, theme.gridColor)
            .setOrigin(0)
            .setAlpha(background.overlayAlpha)
            .setDepth(-9);
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
                const gridSprite = sprite as GridSprite;
                gridSprite.spinTween?.stop();
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
        if (this.backgroundObject) this.backgroundObject.destroy();
        if (this.backgroundOverlay) this.backgroundOverlay.destroy();
    }
}
