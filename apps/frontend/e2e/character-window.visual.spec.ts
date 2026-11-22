import { expect, type Locator, test } from '@playwright/test'

import { expectCharacterWindowAppearance, heroThemeCases } from './hero-theme-visual'
import { readyUiStory } from './ui-story-ready'

for (const width of [320, 390, 1280]) {
    for (const tab of ['statistics', 'development', 'crafting']) {
        const checkAppearance =
            tab === 'statistics'
                ? (menu: Locator) => expectCharacterWindowAppearance(menu, heroThemeCases[3])
                : undefined

        test(`character ${tab} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-characterwindow--${tab}&viewMode=story`)
            const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            await expect(menu).toBeVisible()
            await checkAppearance?.(menu)
            const bounds = await menu.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            await readyUiStory(page)
            await expect(menu).toHaveScreenshot(`character-${tab}-${width}.png`)
        })
    }
}

test('the character window entity previews its tab and content controls', async ({ page }) => {
    await page.goto('/?path=/story/entities-character-window-characterwindowview--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const window = preview.getByRole('dialog', { name: 'Персонаж', exact: true })
    await expect(window.getByRole('tabpanel')).toContainText('Раздел «Характеристики»')
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.getByRole('combobox', { name: 'tab', exact: true }).selectOption({ label: 'Квесты' })
    await expect(window.getByRole('tab', { name: 'Квесты' })).toHaveAttribute(
        'aria-selected',
        'true'
    )
    await expect(window.getByRole('tabpanel')).toContainText('Раздел «Квесты»')
    await page
        .getByRole('combobox', { name: 'content', exact: true })
        .selectOption({ label: 'Пустой div' })
    await expect(window.getByRole('tabpanel')).toBeEmpty()
})
