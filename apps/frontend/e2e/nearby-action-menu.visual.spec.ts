import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

for (const width of [1280, 390]) {
    test(`shows nearby action colors and keyboard focus at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 })
        await page.goto(uiStoryUrl('pages-gameplay-nearbyactionmenu--scholar'))
        const panel = page.locator('.nearby-action-panel')
        const menu = panel.getByRole('menu', { name: 'Учёный Арен' })
        const learn = menu.getByRole('menuitem', { name: 'Изучить огненную стрелу' })
        const enemy = menu.getByRole('menuitem', { name: 'Объявить врагом' })
        await expect(menu).toBeVisible()
        await readyUiStory(page)
        await expectUiFits(panel, width)
        await expect(learn).toBeFocused()
        await expect(learn).toHaveCSS('outline-color', 'rgb(255, 227, 154)')
        await expect(enemy).toHaveCSS('color', 'rgb(255, 162, 142)')
        await expect(learn.locator('.ui-button__border')).toHaveCSS('border-top-width', '16px')
        await expect(
            panel.getByRole('button', { name: 'Закрыть действия' }).locator('.ui-button__border')
        ).toHaveCSS('border-top-width', '8px')
        await expect(panel).toHaveScreenshot(`nearby-action-menu-${width}.png`)
        await learn.press('End')
        await expect(enemy).toBeFocused()
        await expect(enemy).toHaveCSS('outline-color', 'rgb(255, 227, 154)')
    })
}
