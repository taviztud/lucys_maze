import { expect, test } from '@playwright/test';
import {
    expectPlayerIdleAt,
    findBoard,
    keyFor,
    openMenu,
    pickWallTurn,
    startFromMenu,
    trackPageErrors
} from './helpers';

test('a turn queued during a slide is applied when Lucy reaches the wall', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openMenu(page);
    await startFromMenu(page);

    const { found } = await findBoard(page, pickWallTurn);

    await page.keyboard.press(keyFor(found.first));
    await page.waitForTimeout(60);
    await page.keyboard.press(keyFor(found.turn));

    await expectPlayerIdleAt(page, found.final);
    expect(errors).toEqual([]);
});
