import { expect, test, type Page } from '@playwright/test';
import {
    Board,
    DEV_MODE_QUERY,
    keyFor,
    openMenu,
    pressKey,
    readState,
    routeToTarget,
    runSlides,
    startDevGame,
    Touch,
    trackPageErrors,
    waitForMode,
    type Cell,
    type GameText
} from './helpers';

interface SpiderText {
    x: number;
    y: number;
    pointA: Cell;
    pointB: Cell;
    state: 'MOVING' | 'WAITING';
    webCells: Cell[];
    angle: number;
    flipX: boolean;
    isPlaying: boolean;
}

const SAFE_SPAWN_RADIUS = 2;
const spidersOf = (state: GameText): SpiderText[] => state.spiders as unknown as SpiderText[];

function routeCells(spider: SpiderText): Cell[] {
    const dx = Math.sign(spider.pointB.x - spider.pointA.x);
    const dy = Math.sign(spider.pointB.y - spider.pointA.y);
    const length = Math.abs(spider.pointB.x - spider.pointA.x) + Math.abs(spider.pointB.y - spider.pointA.y);
    return Array.from({ length: length + 1 }, (_, step) => ({
        x: spider.pointA.x + dx * step,
        y: spider.pointA.y + dy * step
    }));
}

const isCovered = (spider: SpiderText, cell: Cell): boolean =>
    spider.webCells.some((web) => web.x === cell.x && web.y === cell.y)
    || (Math.round(spider.x) === cell.x && Math.round(spider.y) === cell.y);

async function backToMenu(page: Page): Promise<void> {
    await pressKey(page, 'KeyM');
    await waitForMode(page, 'menu');
}

test('spider count follows the level profile and keeps away from the start', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page, DEV_MODE_QUERY);

    for (const [level, expected] of [[9, 0], [10, 1], [20, 2], [30, 3], [31, 3]] as const) {
        // A route can fail to fit in a crowded maze, so allow a few fresh mazes.
        let spiders: SpiderText[] = [];
        for (let attempt = 0; attempt < 8; attempt++) {
            spiders = spidersOf(await startDevGame(page, touch, { level }));
            expect(spiders.length).toBeLessThanOrEqual(expected);
            if (spiders.length === expected) break;
            await backToMenu(page);
        }
        expect(spiders.length, `spiders at level ${level}`).toBe(expected);

        for (const spider of spiders) {
            expect(spider).toMatchObject({ angle: 0, flipX: false, isPlaying: true });
            for (const cell of routeCells(spider)) {
                expect(cell.x + cell.y, `route cell ${cell.x},${cell.y}`).toBeGreaterThan(SAFE_SPAWN_RADIUS);
            }
        }
        await backToMenu(page);
    }
    expect(errors).toEqual([]);
});

test('a web stops Lucy, spends the shield and cannot be stood on', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page, DEV_MODE_QUERY);

    const pick = (board: Board, state: GameText) => {
        const [spider] = spidersOf(state);
        if (!spider) return null;
        const cells = routeCells(spider);
        return routeToTarget(board, state.player, (cell) => cells.some((c) => c.x === cell.x && c.y === cell.y), 2);
    };

    // The single worm of level 10 wanders at random and can spoil an attempt; retry on a fresh maze.
    for (let attempt = 0; attempt < 25; attempt++) {
        const state = await startDevGame(page, touch, { level: 10, shields: 1 });
        const board = new Board(state);
        const route = pick(board, state);
        const outcome = route ? await tryWebContact(page, board, state, route) : null;
        if (outcome) {
            test.info().annotations.push({ type: 'web outcome', description: outcome });
            console.log(`web outcome: ${outcome}`);
            expect(errors).toEqual([]);
            return;
        }
        if ((await readState(page)).mode !== 'menu') await backToMenu(page);
    }
    throw new Error('Could not get an undisturbed run into a web.');
});

/** Returns null when a worm interfered, so the caller can retry on another maze. */
async function tryWebContact(
    page: Page,
    board: Board,
    state: GameText,
    route: NonNullable<ReturnType<typeof routeToTarget>>
): Promise<'killed on the web' | 'web retracted first' | null> {
    try {
        await runSlides(page, board, state.player, route.approach);
    } catch {
        return null;
    }

    // Wait for the web to be fully extended: the spider resting on its far end.
    const extended = await expect.poll(async () => {
        const [spider] = spidersOf(await readState(page));
        return spider.state === 'WAITING' && spider.x === spider.pointB.x && spider.y === spider.pointB.y;
    }, { timeout: 12_000, intervals: [50] }).toBe(true).then(() => true, () => false);
    if (!extended) return null;

    await page.keyboard.press(keyFor(route.final));

    // Lucy must stop on the first web cell with the shield spent, still alive.
    const absorbed = await expect.poll(async () => {
        const current = await readState(page);
        return current.inventory.shields === 0 && !current.player.moving;
    }, { timeout: 4_000, intervals: [30] }).toBe(true).then(() => true, () => false);
    if (!absorbed) return null;

    const afterHit = await readState(page);
    if (afterHit.player.x !== route.hit.x || afterHit.player.y !== route.hit.y) return null;
    expect(afterHit.mode).toBe('playing');
    const absorbedAt = Date.now();

    // Staying put is only safe while the web is gone: once invincibility ends,
    // a covered cell must kill.
    let coveredAfterInvincibility = 0;
    while (Date.now() - absorbedAt < 3_000) {
        const current = await readState(page);
        if (current.mode === 'game-over') return 'killed on the web';
        const [spider] = spidersOf(current);
        const covered = isCovered(spider, route.hit);
        if (Date.now() - absorbedAt > 800 && covered) coveredAfterInvincibility++;
        expect(coveredAfterInvincibility, 'frames alive on a covered web cell').toBeLessThan(3);
        if (!covered && Date.now() - absorbedAt > 800) return 'web retracted first';
        await page.waitForTimeout(40);
    }
    return 'web retracted first';
}
