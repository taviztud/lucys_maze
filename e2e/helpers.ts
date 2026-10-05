import { expect, type CDPSession, type Page } from '@playwright/test';

export interface Cell {
    x: number;
    y: number;
}

export interface Dir {
    dx: number;
    dy: number;
}

export interface PagePoint {
    x: number;
    y: number;
}

export interface GameText {
    mode: string;
    scene: string;
    level: number;
    score: number;
    player: Cell & { visualState: string; moving: boolean };
    exit: Cell;
    coins: Cell[];
    obstacles: Cell[];
    traps: Array<{ x: number; y: number }>;
    worms: Cell[];
    spiders: Array<{ x: number; y: number; webCells: Cell[] }>;
    inventory: { shields: number; continues: number };
    input: { queued: Dir; last: (Dir & { source: string }) | null; activePointers: number };
    ui: { overlay: string; buttons: Record<string, PagePoint> } | null;
    layout: {
        viewport: { width: number; height: number };
        board: { x: number; y: number; width: number; height: number };
    };
    [key: string]: unknown;
}

/** Dev Mode is always on in the dev server and opt-in on a production build. */
export const DEV_MODE_QUERY = '?dev';

export const BOARD = { width: 8, height: 12 } as const;

export const DIRS: Record<'up' | 'down' | 'left' | 'right', Dir> = {
    up: { dx: 0, dy: -1 },
    down: { dx: 0, dy: 1 },
    left: { dx: -1, dy: 0 },
    right: { dx: 1, dy: 0 }
};

const KEY_BY_DIR = new Map<string, string>([
    ['0,-1', 'ArrowUp'],
    ['0,1', 'ArrowDown'],
    ['-1,0', 'ArrowLeft'],
    ['1,0', 'ArrowRight']
]);

// Phaser reads "just pressed" keys once per frame, so a press must outlive a frame.
const KEY_HOLD = { delay: 80 };

export function keyFor(dir: Dir): string {
    const key = KEY_BY_DIR.get(`${dir.dx},${dir.dy}`);
    if (!key) throw new Error(`No key for direction ${dir.dx},${dir.dy}`);
    return key;
}

/** Fails the test on any uncaught page error or console error. */
export function trackPageErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    return errors;
}

export async function readState(page: Page): Promise<GameText> {
    const raw = await page.evaluate(() => window.render_game_to_text());
    return JSON.parse(raw) as GameText;
}

export async function waitForMode(page: Page, mode: string): Promise<GameText> {
    await expect.poll(async () => (await readState(page)).mode, { timeout: 20_000 }).toBe(mode);
    return readState(page);
}

/** Opens the game and waits for the menu to be interactive. */
export async function openMenu(page: Page, query = ''): Promise<void> {
    await page.goto(`./${query}`);
    await waitForMode(page, 'menu');
}

export async function startFromMenu(page: Page): Promise<GameText> {
    await waitForMode(page, 'menu');
    await page.keyboard.press('Enter', KEY_HOLD);
    return waitForMode(page, 'playing');
}

export async function pressKey(page: Page, key: string): Promise<void> {
    await page.keyboard.press(key, KEY_HOLD);
}

const isSame = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

export class Board {
    private readonly blocked = new Set<string>();
    private readonly traps = new Set<string>();

    constructor(private readonly state: GameText) {
        state.obstacles.forEach(({ x, y }) => this.blocked.add(`${x},${y}`));
        state.traps.forEach(({ x, y }) => this.traps.add(`${x},${y}`));
    }

    isWall(cell: Cell): boolean {
        return cell.x < 0 || cell.x >= BOARD.width || cell.y < 0 || cell.y >= BOARD.height
            || this.blocked.has(`${cell.x},${cell.y}`);
    }

    isTrap(cell: Cell): boolean {
        return this.traps.has(`${cell.x},${cell.y}`);
    }

    /** Cells crossed by an uninterrupted slide; stops at walls and at the exit. */
    slide(from: Cell, dir: Dir): Cell[] {
        const cells: Cell[] = [];
        let current = from;
        for (;;) {
            const next = { x: current.x + dir.dx, y: current.y + dir.dy };
            if (this.isWall(next)) break;
            cells.push(next);
            current = next;
            if (isSame(next, this.state.exit)) break;
        }
        return cells;
    }

    isSafeSlide(cells: Cell[]): boolean {
        return cells.length > 0 && cells.every((cell) => !this.isTrap(cell));
    }

    endsAtExit(cells: Cell[]): boolean {
        return cells.length > 0 && isSame(cells[cells.length - 1], this.state.exit);
    }

    /** Shortest sequence of full slides (no mid-slide turns) that reaches the exit. */
    solveBySlides(from: Cell): Dir[] | null {
        const queue: Array<{ cell: Cell; path: Dir[] }> = [{ cell: from, path: [] }];
        const seen = new Set<string>([`${from.x},${from.y}`]);
        while (queue.length) {
            const { cell, path } = queue.shift()!;
            for (const dir of Object.values(DIRS)) {
                const cells = this.slide(cell, dir);
                if (!this.isSafeSlide(cells)) continue;
                const end = cells[cells.length - 1];
                const nextPath = [...path, dir];
                if (isSame(end, this.state.exit)) return nextPath;
                const key = `${end.x},${end.y}`;
                if (seen.has(key)) continue;
                seen.add(key);
                queue.push({ cell: end, path: nextPath });
            }
        }
        return null;
    }
}

/** Regenerates the maze with R until `pick` finds what the test needs. */
export async function findBoard<T>(
    page: Page,
    pick: (board: Board, state: GameText) => T | null,
    attempts = 80
): Promise<{ state: GameText; board: Board; found: T }> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const state = await readState(page);
        const board = new Board(state);
        const found = pick(board, state);
        if (found) return { state, board, found };
        await pressKey(page, 'KeyR');
        await page.waitForTimeout(120);
    }
    throw new Error('No suitable maze found after regenerating.');
}

export async function expectPlayerIdleAt(page: Page, cell: Cell): Promise<void> {
    await expect.poll(async () => {
        const { player } = await readState(page);
        return `${player.x},${player.y},${player.visualState}`;
    }, { timeout: 15_000 }).toBe(`${cell.x},${cell.y},idle`);
}

/** Plays the current level to its exit with keyboard slides and returns the new level. */
export async function completeLevelWithKeyboard(page: Page): Promise<number> {
    const { state, board, found: path } = await findBoard(page, (candidate, current) =>
        current.worms.length === 0 && current.spiders.length === 0
            ? candidate.solveBySlides(current.player)
            : null);
    const startLevel = state.level;
    let position: Cell = state.player;

    for (let index = 0; index < path.length; index++) {
        const cells = board.slide(position, path[index]);
        position = cells[cells.length - 1];
        await page.keyboard.press(keyFor(path[index]));
        if (index < path.length - 1) await expectPlayerIdleAt(page, position);
    }

    await expect.poll(async () => (await readState(page)).level, { timeout: 15_000 })
        .toBeGreaterThan(startLevel);
    return (await readState(page)).level;
}

// ========== Touch ==========

interface TouchPoint extends PagePoint {
    id: number;
}

/** Raw multi-touch driver: Playwright's own touchscreen only taps. */
export class Touch {
    private readonly active = new Map<number, TouchPoint>();

    private constructor(private readonly session: CDPSession) {}

    static async attach(page: Page): Promise<Touch> {
        return new Touch(await page.context().newCDPSession(page));
    }

    async down(id: number, point: PagePoint): Promise<void> {
        this.active.set(id, { id, ...point });
        await this.send('touchStart');
    }

    async move(id: number, point: PagePoint): Promise<void> {
        this.active.set(id, { id, ...point });
        await this.send('touchMove');
    }

    async up(id: number): Promise<void> {
        this.active.delete(id);
        await this.send('touchEnd');
    }

    /** Drags a finger from `from` by `delta` in a few steps, without lifting. */
    async drag(id: number, from: PagePoint, delta: PagePoint, steps = 4): Promise<PagePoint> {
        for (let step = 1; step <= steps; step++) {
            await this.move(id, {
                x: from.x + (delta.x * step) / steps,
                y: from.y + (delta.y * step) / steps
            });
        }
        return { x: from.x + delta.x, y: from.y + delta.y };
    }

    async swipe(from: PagePoint, delta: PagePoint, id = 1): Promise<void> {
        await this.down(id, from);
        await this.drag(id, from, delta);
        await this.up(id);
    }

    async tap(point: PagePoint, id = 1): Promise<void> {
        await this.down(id, point);
        await this.up(id);
    }

    private async send(type: 'touchStart' | 'touchMove' | 'touchEnd'): Promise<void> {
        await this.session.send('Input.dispatchTouchEvent', {
            type,
            touchPoints: [...this.active.values()].map(({ id, x, y }) => ({ id, x, y }))
        });
    }
}

/** Finger travel, in CSS pixels, comfortably past the swipe threshold. */
export const SWIPE_DISTANCE = 70;

export function swipeDelta(dir: Dir, distance = SWIPE_DISTANCE): PagePoint {
    return { x: dir.dx * distance, y: dir.dy * distance };
}

export async function tapButton(page: Page, touch: Touch, name: string): Promise<void> {
    const state = await readState(page);
    const point = state.ui?.buttons[name];
    if (!point) throw new Error(`Button "${name}" is not visible. Visible: ${Object.keys(state.ui?.buttons ?? {})}`);
    await touch.tap(point);
}

// ========== Paths ==========

export interface HazardRoute {
    /** Safe slides that take Lucy to the launch cell. */
    approach: Dir[];
    launch: Cell;
    /** Slide that runs into the target. */
    final: Dir;
    /** First target cell on that slide, where Lucy stops. */
    hit: Cell;
}

/** Finds safe slides to a cell from which one more slide runs into a target cell. */
export function routeToTarget(
    board: Board,
    start: Cell,
    isTarget: (cell: Cell) => boolean,
    maxApproach = 3
): HazardRoute | null {
    const isClean = (cells: Cell[]): boolean =>
        board.isSafeSlide(cells) && !board.endsAtExit(cells) && !cells.some(isTarget);
    const queue: Array<{ cell: Cell; path: Dir[] }> = [{ cell: start, path: [] }];
    const seen = new Set<string>([`${start.x},${start.y}`]);

    while (queue.length) {
        const { cell, path } = queue.shift()!;
        for (const dir of Object.values(DIRS)) {
            const cells = board.slide(cell, dir);
            const hitIndex = cells.findIndex(isTarget);
            if (hitIndex >= 0 && !cells.slice(0, hitIndex).some((c) => board.isTrap(c))) {
                return { approach: path, launch: cell, final: dir, hit: cells[hitIndex] };
            }
            if (path.length >= maxApproach || !isClean(cells)) continue;
            const end = cells[cells.length - 1];
            const key = `${end.x},${end.y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push({ cell: end, path: [...path, dir] });
        }
    }
    return null;
}

/** Runs full slides with the keyboard, waiting for Lucy to stop after each one. */
export async function runSlides(page: Page, board: Board, from: Cell, dirs: Dir[]): Promise<Cell> {
    let position = from;
    for (const dir of dirs) {
        const cells = board.slide(position, dir);
        position = cells[cells.length - 1];
        await page.keyboard.press(keyFor(dir));
        await expectPlayerIdleAt(page, position);
    }
    return position;
}

/** A slide whose queued turn can only be taken on its last cell, at the wall. */
export interface WallTurn {
    first: Dir;
    turn: Dir;
    wall: Cell;
    final: Cell;
}

export function pickWallTurn(board: Board, state: GameText): WallTurn | null {
    for (const first of Object.values(DIRS)) {
        const cells = board.slide(state.player, first);
        if (!board.isSafeSlide(cells) || board.endsAtExit(cells)) continue;
        const wall = cells[cells.length - 1];

        for (const turn of Object.values(DIRS)) {
            if (turn.dx === first.dx || turn.dy === first.dy) continue;
            const opensEarly = cells.slice(0, -1)
                .some((cell) => !board.isWall({ x: cell.x + turn.dx, y: cell.y + turn.dy }));
            if (opensEarly) continue;
            const turnCells = board.slide(wall, turn);
            if (!board.isSafeSlide(turnCells) || board.endsAtExit(turnCells)) continue;
            return { first, turn, wall, final: turnCells[turnCells.length - 1] };
        }
    }
    return null;
}

// ========== Menu and Dev Mode ==========

export interface MenuText {
    mode: string;
    devMode: { level: number; shields: number; continues: number; score: number; panelOpen: boolean } | null;
    buttons: Record<string, PagePoint>;
}

export async function readMenu(page: Page): Promise<MenuText> {
    const raw = await page.evaluate(() => window.render_game_to_text());
    return JSON.parse(raw) as MenuText;
}

export interface DevValues {
    level?: number;
    shields?: number;
    continues?: number;
}

/** Starts a game from the menu through the Dev Mode panel, using touch only. */
export async function startDevGame(page: Page, touch: Touch, values: DevValues): Promise<GameText> {
    await waitForMode(page, 'menu');
    let menu = await readMenu(page);
    if (!menu.devMode) throw new Error('Dev Mode is not available on this page.');
    if (!menu.devMode.panelOpen) {
        await touch.tap(menu.buttons.dev);
        await expect.poll(async () => (await readMenu(page)).devMode?.panelOpen).toBe(true);
        menu = await readMenu(page);
    }

    for (const key of ['level', 'shields', 'continues'] as const) {
        const target = values[key] ?? (key === 'level' ? 1 : 0);
        let current = menu.devMode![key];
        while (current !== target) {
            await touch.tap(menu.buttons[current < target ? `${key}Plus` : `${key}Minus`]);
            current += current < target ? 1 : -1;
        }
        await expect.poll(async () => (await readMenu(page)).devMode?.[key]).toBe(target);
    }

    await touch.tap(menu.buttons.devApply);
    return waitForMode(page, 'playing');
}

/** Restarts through the menu (R would reset Dev Mode values) until `pick` succeeds. */
export async function findDevBoard<T>(
    page: Page,
    touch: Touch,
    values: DevValues,
    pick: (board: Board, state: GameText) => T | null,
    attempts = 40
): Promise<{ state: GameText; board: Board; found: T }> {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const state = await startDevGame(page, touch, values);
        const board = new Board(state);
        const found = pick(board, state);
        if (found) return { state, board, found };
        await pressKey(page, 'KeyM');
        await waitForMode(page, 'menu');
    }
    throw new Error('No suitable Dev Mode maze found.');
}

declare global {
    interface Window {
        render_game_to_text: () => string;
    }
}
