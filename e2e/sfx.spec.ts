import { expect, test, type Page } from '@playwright/test';
import {
    completeLevelWithKeyboard,
    findBoard,
    keyFor,
    openMenu,
    readState,
    routeToTarget,
    runSlides,
    startFromMenu,
    tapButton,
    Touch,
    trackPageErrors,
    waitForMode
} from './helpers';

interface SfxText {
    available: boolean;
    ready: number;
    total: number;
    locked: boolean;
    muted: boolean;
    volume: number;
    last: string | null;
    requested: Record<string, number>;
}

const readSfx = async (page: Page): Promise<SfxText> => (await readState(page)).sfx as SfxText;

test('synthesized effects are decoded and follow gameplay', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openMenu(page);
    await startFromMenu(page);

    // Every effect was synthesized and decoded by the Sound Manager; the first key press unlocked audio.
    await expect.poll(async () => (await readSfx(page)).ready).toBe((await readSfx(page)).total);
    const initial = await readSfx(page);
    expect(initial).toMatchObject({ available: true, locked: false, muted: false });
    expect(initial.total).toBeGreaterThanOrEqual(10);
    expect(initial.requested.bark).toBe(1);

    const before = initial.requested;
    expect(await completeLevelWithKeyboard(page)).toBe(2);
    const afterLevel = (await readSfx(page)).requested;
    expect(afterLevel.levelUp).toBe((before.levelUp ?? 0) + 1);
    expect(afterLevel.slide).toBeGreaterThan(before.slide ?? 0);

    const { state, board, found } = await findBoard(page, (candidate, current) =>
        routeToTarget(candidate, current.player, (cell) => candidate.isTrap(cell)));
    const deathsBefore = (await readSfx(page)).requested.death ?? 0;
    await runSlides(page, board, state.player, found.approach);
    await page.keyboard.press(keyFor(found.final));
    await waitForMode(page, 'game-over');
    expect((await readSfx(page)).requested.death).toBe(deathsBefore + 1);
    expect(errors).toEqual([]);
});

test('the pause panel mutes effects and shares one volume with the music', async ({ page }) => {
    const errors = trackPageErrors(page);
    const touch = await Touch.attach(page);
    await openMenu(page);
    await startFromMenu(page);

    await tapButton(page, touch, 'pause');
    await waitForMode(page, 'paused');

    await tapButton(page, touch, 'sfx');
    await expect.poll(async () => (await readSfx(page)).muted).toBe(true);
    await tapButton(page, touch, 'sfx');
    await expect.poll(async () => (await readSfx(page)).muted).toBe(false);

    await tapButton(page, touch, 'volumeDown');
    await expect.poll(async () => (await readSfx(page)).volume).toBeCloseTo(0.4);
    const { music } = await readState(page);
    expect((music as { volume: number }).volume).toBeCloseTo(0.4);
    expect(errors).toEqual([]);
});
