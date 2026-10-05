import { expect, test } from '@playwright/test';
import {
    completeLevelWithKeyboard,
    openMenu,
    pressKey,
    startFromMenu,
    trackPageErrors,
    waitForMode
} from './helpers';

test('returning to the menu does not duplicate level progression', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openMenu(page);
    await startFromMenu(page);
    expect(await completeLevelWithKeyboard(page)).toBe(2);

    await pressKey(page, 'KeyM');
    await waitForMode(page, 'menu');

    const restarted = await startFromMenu(page);
    expect(restarted.level).toBe(1);
    expect(await completeLevelWithKeyboard(page)).toBe(2);
    expect(errors).toEqual([]);
});
