import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/Config';
import { GameStateManager } from '../src/managers/GameStateManager';
import { CollisionSystem } from '../src/systems/CollisionSystem';
import { MazeGenerator } from '../src/systems/MazeGenerator';
import { BOARD_PIXEL_HEIGHT, BOARD_PIXEL_WIDTH, computeLayout, toPagePoint } from '../src/ui/layout';
import { calculateStepDuration } from '../src/utils/playerSpeed';

describe('calculateStepDuration', () => {
    it('follows the three documented acceleration phases', () => {
        expect(calculateStepDuration(1)).toBe(380);
        expect(calculateStepDuration(10)).toBe(200);
        expect(calculateStepDuration(11)).toBe(195);
        expect(calculateStepDuration(34)).toBe(80);
        expect(calculateStepDuration(35)).toBe(79);
    });

    it('reaches the speed cap at level 54 and stays there', () => {
        expect(calculateStepDuration(53)).toBe(61);
        expect(calculateStepDuration(54)).toBe(60);
        expect(calculateStepDuration(500)).toBe(60);
    });

    it('never gets slower as the level rises', () => {
        for (let level = 1; level < 80; level++) {
            expect(calculateStepDuration(level + 1)).toBeLessThanOrEqual(calculateStepDuration(level));
        }
    });
});

describe('CollisionSystem', () => {
    const collision = new CollisionSystem(8, 12);
    collision.build([{ x: 3, y: 0, type: 'rock' }, { x: 0, y: 5, type: 'tree' }]);

    it('treats obstacles and the outside of the board as walls', () => {
        expect(collision.isCollision(3, 0)).toBe(true);
        expect(collision.isCollision(-1, 0)).toBe(true);
        expect(collision.isCollision(8, 0)).toBe(true);
        expect(collision.isCollision(0, 12)).toBe(true);
        expect(collision.isCollision(2, 0)).toBe(false);
    });

    it('slides until the cell before an obstacle or the edge', () => {
        expect(collision.calculateMoveUntilObstacle(0, 0, 1, 0)).toEqual({ x: 2, y: 0, distance: 2 });
        expect(collision.calculateMoveUntilObstacle(0, 0, 0, 1)).toEqual({ x: 0, y: 4, distance: 4 });
        expect(collision.calculateMoveUntilObstacle(7, 11, 1, 0)).toEqual({ x: 7, y: 11, distance: 0 });
        expect(collision.calculateMoveUntilObstacle(7, 0, 0, 1)).toEqual({ x: 7, y: 11, distance: 11 });
    });

    it('finds traps only inside the board', () => {
        const traps = [{ x: 4, y: 4 }];
        expect(collision.isTrap(4, 4, traps)).toBe(true);
        expect(collision.isTrap(4, 5, traps)).toBe(false);
        expect(collision.isTrap(-1, 4, traps)).toBe(false);
    });

    it('detects obstacles between two aligned cells', () => {
        const obstacles = [{ x: 3, y: 0, type: 'rock' as const }];
        expect(collision.isPathClear({ x: 0, y: 0 }, { x: 2, y: 0 }, obstacles)).toBe(true);
        expect(collision.isPathClear({ x: 0, y: 0 }, { x: 5, y: 0 }, obstacles)).toBe(false);
    });
});

describe('MazeGenerator', () => {
    const { BOARD_WIDTH: width, BOARD_HEIGHT: height } = CONFIG;
    const generator = new MazeGenerator(width, height);

    function isReachable(blocked: Set<string>, exit: { x: number; y: number }): boolean {
        const queue = [{ x: 0, y: 0 }];
        const seen = new Set(['0,0']);
        while (queue.length) {
            const { x, y } = queue.shift()!;
            if (x === exit.x && y === exit.y) return true;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const next = { x: x + dx, y: y + dy };
                const key = `${next.x},${next.y}`;
                if (next.x < 0 || next.x >= width || next.y < 0 || next.y >= height) continue;
                if (seen.has(key) || blocked.has(key)) continue;
                seen.add(key);
                queue.push(next);
            }
        }
        return false;
    }

    it('always produces a maze whose exit can be reached without touching a trap', () => {
        for (let run = 0; run < 300; run++) {
            const exit = generator.generateRandomExit();
            const maze = generator.generate(exit);
            const blocked = new Set([...maze.obstacles, ...maze.traps].map(({ x, y }) => `${x},${y}`));

            expect(blocked.has('0,0')).toBe(false);
            expect(blocked.has(`${exit.x},${exit.y}`)).toBe(false);
            expect(isReachable(blocked, exit)).toBe(true);
        }
    });

    it('places the exit on the right or bottom edge, never on the start', () => {
        for (let run = 0; run < 200; run++) {
            const exit = generator.generateRandomExit();
            expect(exit.x === width - 1 || exit.y === height - 1).toBe(true);
            expect(exit.x === 0 && exit.y === 0).toBe(false);
        }
    });
});

describe('computeLayout', () => {
    it('keeps the HUD and the board inside the base canvas', () => {
        const layout = computeLayout(CONFIG.GAME_WIDTH, CONFIG.GAME_HEIGHT);
        expect(layout).toMatchObject({ boardX: 0, hudY: 0, boardY: CONFIG.LAYOUT.HUD_HEIGHT });
        expect(layout.boardY + layout.boardHeight).toBe(CONFIG.GAME_HEIGHT);
    });

    it('centres the board block on taller and wider canvases', () => {
        const tall = computeLayout(480, 1000);
        expect(tall.boardX).toBe(0);
        expect(tall.hudY).toBe(100);
        expect(tall.boardY + BOARD_PIXEL_HEIGHT).toBe(900);

        const wide = computeLayout(1440, 800);
        expect(wide.boardX).toBe((1440 - BOARD_PIXEL_WIDTH) / 2);
        expect(wide.hudY).toBe(0);
    });

    it('maps game pixels to page pixels through the canvas scale', () => {
        const scale = { canvasBounds: { left: 10, top: 20 }, displayScale: { x: 2, y: 2 } };
        expect(toPagePoint(scale, 100, 300)).toEqual({ x: 60, y: 170 });
    });
});

describe('GameStateManager', () => {
    it('advances levels and scores', () => {
        const state = new GameStateManager();
        state.addScore(30);
        state.nextLevel();
        expect(state).toMatchObject({ level: 2, score: 130 });
    });

    it('spends shields one at a time', () => {
        const state = new GameStateManager();
        expect(state.useShield()).toBe(false);
        state.addShield();
        expect(state.useShield()).toBe(true);
        expect(state.useShield()).toBe(false);
    });

    it('only continues after a game over, and keeps the level', () => {
        const state = new GameStateManager();
        state.applyDevMode(7, 0, 1, 400);
        expect(state.useContinue()).toBe(false);

        state.registerGameOver();
        expect(state.isGameOver).toBe(true);
        expect(state.useContinue()).toBe(true);
        expect(state).toMatchObject({ isGameOver: false, level: 7, score: 400, continueCount: 0 });

        state.registerGameOver();
        expect(state.useContinue()).toBe(false);
    });

    it('resets to a fresh run', () => {
        const state = new GameStateManager();
        state.applyDevMode(9, 2, 3, 900);
        state.registerGameOver();
        state.reset();
        expect(state).toMatchObject({ level: 1, score: 0, shieldCount: 0, continueCount: 0, isGameOver: false });
    });
});
