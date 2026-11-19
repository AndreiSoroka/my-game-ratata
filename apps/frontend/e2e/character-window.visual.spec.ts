import { expect, test } from '@playwright/test'

for (const width of [320, 390, 1280]) {
    for (const tab of ['statistics', 'development']) {
        test(`character ${tab} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=shared-character--${tab}&viewMode=story`)
            const menu = page.getByRole('dialog', { name: 'Персонаж', exact: true })
            await expect(menu).toBeVisible()
            const bounds = await menu.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            await page.evaluate(() => document.fonts.ready)
            await expect(menu).toHaveScreenshot(`character-${tab}-${width}.png`)
        })
    }
}
