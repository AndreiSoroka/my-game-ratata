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
            await page.goto(`/iframe.html?id=pages-gameplay-characterwindow--${tab}&viewMode=story`)
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
    await page.goto('/iframe.html?id=pages-gameplay-characterwindow--statistics&viewMode=story')
    const gameWindow = page.getByRole('dialog', { name: 'Персонаж', exact: true })
    const gameControls = await readCharacterControls(gameWindow)

    await page.goto('/?path=/story/entities-character-window-characterwindowview--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const window = preview.getByRole('dialog', { name: 'Персонаж', exact: true })
    await expect(window.getByRole('tabpanel')).toContainText('Раздел «Характеристики»')
    expect(await readCharacterControls(window)).toEqual(gameControls)
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.getByRole('combobox', { name: 'tab', exact: true }).selectOption({ label: 'Квесты' })
    await expect(window.getByRole('tab', { name: 'Квесты' })).toHaveAttribute(
        'aria-selected',
        'true'
    )
    await expect(window.getByRole('tabpanel')).toContainText('Раздел «Квесты»')
    await page
        .getByRole('combobox', { name: 'content', exact: true })
        .selectOption({ label: 'Пустой блок с фоном' })
    await expect(window.getByRole('tabpanel')).toBeEmpty()
})

test('character tab labels have room at narrow widths', async ({ page }) => {
    await page.goto('/iframe.html?id=pages-gameplay-characterwindow--statistics&viewMode=story')
    await readyUiStory(page)
    const tabs = page.getByRole('tablist', { name: 'Разделы персонажа' }).getByRole('tab')
    await expect(tabs).toHaveCount(4)
    const viewports = [
        { width: 320, rows: 2, inset: 12 },
        { width: 420, rows: 2, inset: 12 },
        { width: 421, rows: 2, inset: 12 },
        { width: 520, rows: 2, inset: 12 },
        { width: 521, rows: 1, inset: 12 },
        { width: 601, rows: 1, inset: 12 },
        { width: 651, rows: 1, inset: 22 },
    ]
    for (const { width, rows, inset } of viewports) {
        await page.setViewportSize({ width, height: 844 })
        const layout = await tabs.evaluateAll((buttons) =>
            buttons.map((button) => {
                const buttonBounds = button.getBoundingClientRect()
                const range = document.createRange()
                range.selectNodeContents(button.querySelector('.ui-button__content')!)
                const textBounds = range.getBoundingClientRect()
                return {
                    row: buttonBounds.top,
                    singleLine: range.getClientRects().length === 1,
                    leftInset: textBounds.left - buttonBounds.left,
                    rightInset: buttonBounds.right - textBounds.right,
                }
            })
        )
        expect(new Set(layout.map(({ row }) => row)).size).toBe(rows)
        for (const label of layout) {
            expect(label.singleLine).toBe(true)
            expect(label.leftInset).toBeGreaterThanOrEqual(inset)
            expect(label.rightInset).toBeGreaterThanOrEqual(inset)
        }
    }
})

async function readCharacterControls(window: Locator) {
    const controls = window.locator('.character-header .ui-button, .character-tabs .ui-button')
    await expect(controls).toHaveCount(5)
    return controls.evaluateAll((buttons) =>
        buttons.map((button) => ({
            label: button.getAttribute('aria-label') ?? button.textContent?.trim(),
            border: button
                .querySelector('[data-fantasy-border]')
                ?.getAttribute('data-fantasy-border'),
            appearance: button.className,
            highlighted: button.getAttribute('data-highlighted'),
        }))
    )
}
