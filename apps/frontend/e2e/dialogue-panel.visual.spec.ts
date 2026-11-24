import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

for (const width of [320, 1280]) {
    test(`Dialogue panel and neighbor names fit at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 640 })
        await page.goto(uiStoryUrl('entities-dialogues-dialoguepanel--with-neighbors'))
        const panel = page.locator('.dialogue-panel')
        await expect(panel.getByRole('heading', { name: 'Торговец Савва' })).toBeVisible()
        await expect(panel.getByRole('button', { name: 'Посмотреть товары' })).toBeVisible()
        await expect(
            panel.getByRole('button', { name: /^Переключиться влево: Марина/ })
        ).toBeVisible()
        await expect(
            panel.getByRole('button', { name: /^Переключиться вправо: Северин из речного дозора/ })
        ).toBeVisible()
        await readyUiStory(page)
        await expectUiFits(panel, width)
        await expect(panel).toHaveScreenshot(`dialogue-neighbors-${width}.png`)
    })
}

test('Only available directions appear and a long name keeps its accessible name', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 500 })
    await page.goto(uiStoryUrl('entities-dialogues-dialoguetargetswitcher--right-only'))
    const switcher = page.locator('.dialogue-target-switcher')
    await expect(switcher.getByRole('button')).toHaveCount(1)
    const right = switcher.getByRole('button', {
        name: 'Переключиться вправо: Северин из речного дозора',
    })
    await expect(right).toBeVisible()
    const bounds = (await switcher.boundingBox())!
    expect((await right.boundingBox())!.x).toBeGreaterThan(bounds.x + bounds.width / 2)
    await readyUiStory(page)
    await expectUiFits(switcher, 320)
    await expect(switcher).toHaveScreenshot('dialogue-right-neighbor-320.png')

    await page.goto(uiStoryUrl('entities-dialogues-dialoguetargetswitcher--no-neighbors'))
    await expect(switcher).toHaveCount(0)
})

test('Sign text is inline and long choices scroll below a fixed heading', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 400 })
    await page.goto(uiStoryUrl('entities-dialogues-dialoguepanel--sign'))
    const panel = page.locator('.dialogue-panel')
    await expect(panel.getByRole('heading')).toHaveCount(1)
    await expect(panel.getByRole('heading')).toHaveText('Часовня памяти')
    await expect(panel.getByText(/Выбор покровителя/)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Закрыть табличку' })).toBeVisible()

    await page.goto(uiStoryUrl('entities-dialogues-dialoguepanel--long-choices'))
    const title = panel.getByRole('heading', { name: 'Торговец Савва' })
    await expect(title).toBeVisible()
    const headingY = (await title.boundingBox())!.y
    const last = panel.locator('[data-dialogue-action="leave"]')
    await expect(last).not.toBeInViewport()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    expect((await title.boundingBox())!.y).toBe(headingY)
})
