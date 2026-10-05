import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { CollisionSystem } from '../systems/CollisionSystem';
import type { Position, Obstacle, Spider } from '../types/game.types';
import { createAnimatedEnemySprite } from './enemyAnimations';
import { getLevelVisualProfile } from '../visuals/levelVisuals';

export interface SpiderVisualState {
    x: number;
    y: number;
    pointA: Position;
    pointB: Position;
    target: Position;
    state: Spider['state'];
    frame: string | number | null;
    animation: string | null;
    isPlaying: boolean;
    webLength: number;
    webCells: Position[];
    contactActive: boolean;
    angle: number;
    flipX: boolean;
}

/** Manages animated axis-aligned Spider patrols and their dangerous web strands. */
export class SpiderManager {
    private spiders: Spider[] = [];
    private obstacles: Obstacle[] = [];

    constructor(
        private scene: Phaser.Scene,
        private collision: CollisionSystem,
        private cellSize: number,
        private width: number,
        private height: number
    ) {}

    generate(level: number, obstacles: Obstacle[], exitPosition: Position, playerStart: Position): void {
        this.reset();
        this.obstacles = obstacles;
        if (!this.width || !this.height) return;

        const profile = getLevelVisualProfile(level).spider;
        for (let index = 0; index < profile.count; index++) {
            const route = this.findRoute(exitPosition, playerStart, profile.maxPatrolDistance);
            if (!route) continue;

            const spider: Spider = {
                state: 'WAITING',
                pointA: route.pointA,
                pointB: route.pointB,
                currentTarget: { ...route.pointB },
                x: route.pointA.x,
                y: route.pointA.y,
                waitElapsedMs: 0,
                sprite: null,
                webGraphics: this.scene.add.graphics().setDepth(5),
                contactActive: false
            };

            spider.sprite = createAnimatedEnemySprite(
                this.scene,
                this.toPixel(spider.x),
                this.toPixel(spider.y),
                'spider',
                this.cellSize,
                { startFrame: index % 8 }
            );
            spider.sprite.setAngle(0).setFlip(false, false);
            this.drawWeb(spider);
            this.spiders.push(spider);
        }
    }

    /** Las esperas se acumulan con delta para que una pausa no las consuma. */
    update(deltaMs: number, playerPosition: Position): void {
        const safeDeltaMs = Math.min(Math.max(deltaMs, 0), 100);

        for (const spider of this.spiders) {
            if (!spider.sprite) continue;
            if (spider.state === 'WAITING') {
                spider.waitElapsedMs += safeDeltaMs;
                if (spider.waitElapsedMs >= CONFIG.SPIDER.WAIT_DURATION_MS) {
                    spider.state = 'MOVING';
                }
            } else {
                this.moveSpider(spider, CONFIG.SPIDER.CELLS_PER_SECOND * safeDeltaMs / 1000);
            }

            this.drawWeb(spider);
            spider.contactActive = this.isSpiderAt(spider, playerPosition.x, playerPosition.y)
                || this.getWebCells(spider).some(({ x, y }) => x === playerPosition.x && y === playerPosition.y);
        }
    }

    checkCollision(playerX: number, playerY: number): boolean {
        return this.spiders.some((spider) => this.isSpiderAt(spider, playerX, playerY)
            || this.getWebCells(spider).some(({ x, y }) => x === playerX && y === playerY));
    }

    getVisualStates(): SpiderVisualState[] {
        return this.spiders.map((spider) => ({
            x: Number(spider.x.toFixed(3)),
            y: Number(spider.y.toFixed(3)),
            pointA: spider.pointA,
            pointB: spider.pointB,
            target: spider.currentTarget,
            state: spider.state,
            frame: spider.sprite?.frame.name ?? null,
            animation: spider.sprite?.anims.currentAnim?.key ?? null,
            isPlaying: spider.sprite?.anims.isPlaying ?? false,
            webLength: Number(this.getWebLength(spider).toFixed(3)),
            webCells: this.getWebCells(spider),
            contactActive: spider.contactActive,
            angle: spider.sprite?.angle ?? 0,
            flipX: spider.sprite?.flipX ?? false
        }));
    }

    reset(): void {
        for (const spider of this.spiders) {
            spider.sprite?.destroy();
            spider.webGraphics?.destroy();
        }
        this.spiders = [];
    }

    destroy(): void {
        this.reset();
    }

    private findRoute(
        exitPosition: Position,
        playerStart: Position,
        maxDistance: number
    ): { pointA: Position; pointB: Position } | null {
        for (let attempt = 0; attempt < 80; attempt++) {
            const pointA = {
                x: Phaser.Math.Between(0, this.width - 1),
                y: Phaser.Math.Between(0, this.height - 1)
            };
            if (!this.isValidPoint(pointA, exitPosition)) continue;

            const horizontal = Phaser.Math.Between(0, 1) === 0;
            const direction = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
            const distance = Phaser.Math.Between(CONFIG.SPIDER.MIN_PATROL_DISTANCE, maxDistance);
            const pointB = {
                x: pointA.x + (horizontal ? direction * distance : 0),
                y: pointA.y + (horizontal ? 0 : direction * distance)
            };
            if (!this.isValidPoint(pointB, exitPosition)) continue;
            if (!this.collision.isPathClear(pointA, pointB, this.obstacles)) continue;
            if (this.passesNearStart(pointA, pointB, playerStart)) continue;
            return { pointA, pointB };
        }
        return null;
    }

    /** La ruta completa (y por tanto su telaraña) respeta la zona segura del inicio. */
    private passesNearStart(pointA: Position, pointB: Position, playerStart: Position): boolean {
        const dx = Math.sign(pointB.x - pointA.x);
        const dy = Math.sign(pointB.y - pointA.y);
        const steps = Math.abs(pointB.x - pointA.x) + Math.abs(pointB.y - pointA.y);
        for (let step = 0; step <= steps; step++) {
            const distance = Math.abs(pointA.x + dx * step - playerStart.x)
                + Math.abs(pointA.y + dy * step - playerStart.y);
            if (distance <= CONFIG.ENEMIES.SAFE_SPAWN_RADIUS) return true;
        }
        return false;
    }

    private moveSpider(spider: Spider, distance: number): void {
        const dx = spider.currentTarget.x - spider.x;
        const dy = spider.currentTarget.y - spider.y;
        const remaining = Math.abs(dx) + Math.abs(dy);
        if (remaining <= distance) {
            spider.x = spider.currentTarget.x;
            spider.y = spider.currentTarget.y;
            spider.state = 'WAITING';
            spider.waitElapsedMs = 0;
            const reachedA = spider.currentTarget.x === spider.pointA.x && spider.currentTarget.y === spider.pointA.y;
            spider.currentTarget = { ...(reachedA ? spider.pointB : spider.pointA) };
        } else {
            spider.x += Math.sign(dx) * distance;
            spider.y += Math.sign(dy) * distance;
        }
        spider.sprite?.setPosition(this.toPixel(spider.x), this.toPixel(spider.y));
    }

    private drawWeb(spider: Spider): void {
        const graphics = spider.webGraphics;
        if (!graphics) return;
        graphics.clear();
        if (this.getWebLength(spider) <= 0.001) return;
        graphics.lineStyle(CONFIG.SPIDER.WEB_WIDTH, CONFIG.SPIDER.WEB_COLOR, 0.95);
        graphics.beginPath();
        graphics.moveTo(this.toPixel(spider.pointA.x), this.toPixel(spider.pointA.y));
        graphics.lineTo(this.toPixel(spider.x), this.toPixel(spider.y));
        graphics.strokePath();
    }

    private getWebLength(spider: Spider): number {
        return Math.abs(spider.x - spider.pointA.x) + Math.abs(spider.y - spider.pointA.y);
    }

    private getWebCells(spider: Spider): Position[] {
        const length = this.getWebLength(spider);
        const count = Math.floor(length + 1e-6);
        const dx = Math.sign(spider.pointB.x - spider.pointA.x);
        const dy = Math.sign(spider.pointB.y - spider.pointA.y);
        const spiderCell = { x: Math.round(spider.x), y: Math.round(spider.y) };
        const cells: Position[] = [];
        for (let step = 0; step <= count; step++) {
            const cell = { x: spider.pointA.x + dx * step, y: spider.pointA.y + dy * step };
            if (cell.x !== spiderCell.x || cell.y !== spiderCell.y) cells.push(cell);
        }
        return cells;
    }

    private isSpiderAt(spider: Spider, x: number, y: number): boolean {
        return Math.round(spider.x) === x && Math.round(spider.y) === y;
    }

    private isValidPoint(point: Position, exitPosition: Position): boolean {
        if (point.x < 0 || point.x >= this.width || point.y < 0 || point.y >= this.height) return false;
        if (point.x === exitPosition.x && point.y === exitPosition.y) return false;
        return !this.obstacles.some(({ x, y }) => x === point.x && y === point.y);
    }

    private toPixel(value: number): number {
        return value * this.cellSize + this.cellSize / 2;
    }
}
