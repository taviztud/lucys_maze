import { expect, test } from '@playwright/test';
import {
    DIRS,
    expectPlayerIdleAt,
    findBoard,
    openMenu,
    pickWallTurn,
    readState,
    startFromMenu,
    swipeDelta,
    Touch,
    trackPageErrors
} from './helpers';

test.beforeEach(async ({ page }) => {
    await openMenu(page);
    await startFromMenu(page);
});

test('a swipe that starts outside the board moves Lucy', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);

    const { state, found } = await findBoard(page, (board, current) => {
        for (const dir of [DIRS.right, DIRS.down]) {
            const cells = board.slide(current.player, dir);
            if (board.isSafeSlide(cells) && !board.endsAtExit(cells)) {
                return { dir, end: cells[cells.length - 1] };
            }
        }
        return null;
    });

    const { board, viewport } = state.layout;
    // Margins around the board: below it for a horizontal swipe, above it for a vertical one.
    const from = found.dir.dx !== 0
        ? { x: 100, y: Math.round((board.y + board.height + viewport.height) / 2) }
        : { x: 150, y: 24 };
    const insideBoard = from.y >= board.y && from.y <= board.y + board.height;
    expect(insideBoard).toBe(false);

    await touch.swipe(from, swipeDelta(found.dir));

    await expectPlayerIdleAt(page, found.end);
    expect((await readState(page)).input.last?.source).toBe('touch');
    expect(errors).toEqual([]);
});

test('a turn is recognised without lifting the finger', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    const { state, found } = await findBoard(page, pickWallTurn);

    const { viewport } = state.layout;
    const start = { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2) };

    await touch.down(1, start);
    const corner = await touch.drag(1, start, swipeDelta(found.first));
    await expect.poll(async () => (await readState(page)).input.last?.source).toBe('touch');
    await touch.drag(1, corner, swipeDelta(found.turn));

    // The finger is still down: the turn did not wait for pointerup.
    expect((await readState(page)).input.activePointers).toBe(1);
    await expectPlayerIdleAt(page, found.final);

    await touch.up(1);
    expect(errors).toEqual([]);
});

test('a second finger can turn while the first one is still down', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    const { state, found } = await findBoard(page, pickWallTurn);

    const { viewport } = state.layout;
    const left = { x: Math.round(viewport.width * 0.3), y: Math.round(viewport.height / 2) };
    const right = { x: Math.round(viewport.width * 0.7), y: Math.round(viewport.height / 2) };

    await touch.down(1, left);
    await touch.drag(1, left, swipeDelta(found.first));
    await touch.down(2, right);
    expect((await readState(page)).input.activePointers).toBe(2);
    await touch.drag(2, right, swipeDelta(found.turn));

    await expectPlayerIdleAt(page, found.final);

    await touch.up(2);
    await touch.up(1);
    expect(errors).toEqual([]);
});
