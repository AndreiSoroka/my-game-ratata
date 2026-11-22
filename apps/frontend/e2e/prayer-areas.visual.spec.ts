import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
    test(`shows all five prayer circles against three terrains at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/iframe.html?id=combat-prayer-areas--default&viewMode=story')
        const gallery = page.getByRole('region', { name: 'Зоны молитв' })
        const sprites = gallery.locator('img')
        await expect(sprites).toHaveCount(15)
        await expect
            .poll(() =>
                sprites.evaluateAll((images) =>
                    images.every(
                        (image) => image instanceof HTMLImageElement && image.naturalWidth > 0
                    )
                )
            )
            .toBe(true)
        const sources = await sprites.evaluateAll((images) =>
            images.map((image) => image.getAttribute('src'))
        )
        expect(new Set(sources).size).toBe(5)
        await expect(sprites.first()).toHaveCSS('opacity', '0.9')
        await expect(gallery).toHaveScreenshot(`prayer-areas-${width}.png`)
    })
}
