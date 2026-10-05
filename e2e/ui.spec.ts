import { expect, test } from '@playwright/test';
import {
    DEV_MODE_QUERY,
    DIRS,
    findBoard,
    findDevBoard,
    keyFor,
    openMenu,
    readState,
    routeToTarget,
    runSlides,
    startFromMenu,
    swipeDelta,
    tapButton,
    Touch,
    trackPageErrors,
    waitForMode,
    type Board,
    type GameText
} from './helpers';

const pickTrapRoute = (board: Board, state: GameText) =>
    routeToTarget(board, state.player, (cell) => board.isTrap(cell));

test('pause and resume with touch buttons', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page);
    await startFromMenu(page);

    const { state, found } = await findBoard(page, (board, current) => {
        const cells = board.slide(current.player, DIRS.right);
        return board.isSafeSlide(cells) && !board.endsAtExit(cells) ? cells[cells.length - 1] : null;
    });

    await tapButton(page, touch, 'pause');
    const paused = await waitForMode(page, 'paused');
    expect(paused.ui?.overlay).toBe('pause');

    // Swipes do not reach the game while the pause panel is open.
    const { viewport } = state.layout;
    await touch.swipe({ x: 60, y: viewport.height - 20 }, swipeDelta(DIRS.right));
    await page.waitForTimeout(400);
    expect((await readState(page)).player).toMatchObject({ x: state.player.x, y: state.player.y });

    await tapButton(page, touch, 'resume');
    await waitForMode(page, 'playing');
    await page.keyboard.press(keyFor(DIRS.right));
    await expect.poll(async () => (await readState(page)).player.x).toBe(found.x);
    expect(errors).toEqual([]);
});

test('game over can be restarted by touch', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page);
    await startFromMenu(page);

    const { state, board, found } = await findBoard(page, pickTrapRoute);
    await runSlides(page, board, state.player, found.approach);
    await page.keyboard.press(keyFor(found.final));

    const over = await waitForMode(page, 'game-over');
    expect(over.player).toMatchObject({ x: found.hit.x, y: found.hit.y, visualState: 'dead' });
    expect(over.ui?.overlay).toBe('game-over');
    expect(over.ui?.buttons.continue).toBeUndefined();

    await tapButton(page, touch, 'restart');
    const restarted = await waitForMode(page, 'playing');
    expect(restarted).toMatchObject({ level: 1, score: 0 });
    expect(restarted.ui?.overlay).toBe('none');
    expect(restarted.player).toMatchObject({ x: 0, y: 0, visualState: 'idle' });
    expect(errors).toEqual([]);
});

test('a continue resumes the same level by touch', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page, DEV_MODE_QUERY);

    const { state, board, found } = await findDevBoard(page, touch, { level: 3, continues: 1 }, pickTrapRoute);
    expect(state.inventory.continues).toBe(1);

    await runSlides(page, board, state.player, found.approach);
    await page.keyboard.press(keyFor(found.final));
    await waitForMode(page, 'game-over');

    await tapButton(page, touch, 'continue');
    const resumed = await waitForMode(page, 'playing');
    expect(resumed.level).toBe(3);
    expect(resumed.inventory.continues).toBe(0);
    expect(resumed.ui?.overlay).toBe('none');
    expect(errors).toEqual([]);
});

test('the layout follows rotation and stays playable', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openMenu(page);
    await startFromMenu(page);
    const portrait = page.viewportSize()!;

    const expectFits = async (): Promise<void> => {
        await expect.poll(async () => {
            const { layout, ui } = await readState(page);
            const { board, viewport } = layout;
            const pause = ui?.buttons.pause;
            return viewport.width === page.viewportSize()!.width
                && board.x >= 0 && board.y >= 0
                && board.x + board.width <= viewport.width
                && board.y + board.height <= viewport.height
                && pause !== undefined && pause.y > 0 && pause.y < board.y && pause.x < viewport.width;
        }, { timeout: 5_000 }).toBe(true);
    };

    await expectFits();
    await page.setViewportSize({ width: portrait.height, height: portrait.width });
    await expectFits();
    await page.setViewportSize(portrait);
    await expectFits();

    const { found } = await findBoard(page, (board, state) => {
        const cells = board.slide(state.player, DIRS.down);
        return board.isSafeSlide(cells) && !board.endsAtExit(cells) ? cells[cells.length - 1] : null;
    });
    await page.keyboard.press(keyFor(DIRS.down));
    await expect.poll(async () => (await readState(page)).player.y).toBe(found.y);
    expect(errors).toEqual([]);
});

test('the pause panel returns to the menu', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page);
    await startFromMenu(page);

    await tapButton(page, touch, 'pause');
    await waitForMode(page, 'paused');
    await tapButton(page, touch, 'pauseMenu');
    await waitForMode(page, 'menu');
    expect(errors).toEqual([]);
});
