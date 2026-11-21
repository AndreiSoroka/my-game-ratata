import { expect, test } from '@playwright/test'

async function ready(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
    })
}

for (const width of [1280, 390, 320]) {
    for (const section of ['parchment', 'ribbons', 'resources']) {
        test(`shared Kenney ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(
                `/iframe.html?id=shared-kenneyhudprimitivesstory--${section}&viewMode=story`
            )
            const stage = page.getByLabel(`Общие компоненты Kenney: ${section}`)
            await expect(stage).toBeVisible()
            await ready(page)
            const bounds = await stage.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            expect(
                await stage.evaluate((element) => element.scrollWidth <= element.clientWidth)
            ).toBe(true)
            await expect(stage).toHaveScreenshot(`kenney-${section}-${width}.png`)
        })
    }
}

test('shared resource bars reveal only authorized numbers and keep empty fills empty', async ({
    page,
}) => {
    await page.goto('/iframe.html?id=shared-kenneyhudprimitivesstory--resources&viewMode=story')
    const bars = page.getByRole('progressbar')
    await expect(bars).toHaveCount(5)
    await expect(page.getByRole('progressbar', { name: 'Полное здоровье' })).toHaveAttribute(
        'aria-valuenow',
        '100'
    )
    await expect(page.getByRole('progressbar', { name: 'Частичная мана' })).toHaveAttribute(
        'aria-valuenow',
        '35'
    )
    await expect(bars.locator('.game-resource-bar__text')).toHaveText(['18/30'])
    await expect(page.getByRole('progressbar', { name: 'Известные значения' })).toHaveAttribute(
        'aria-valuetext',
        '18/30'
    )
    await expect(
        page
            .getByRole('progressbar', { name: 'Пустая энергия' })
            .locator('.game-resource-bar__fill')
    ).toHaveCSS('width', '0px')
    await expect(
        page
            .getByRole('progressbar', { name: 'Нет ёмкости маны' })
            .locator('.game-resource-bar__fill')
    ).toHaveCSS('width', '0px')
})
