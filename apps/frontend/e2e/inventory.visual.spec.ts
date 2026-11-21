import { expect, test } from '@playwright/test'

for (const width of [1280, 390, 320]) {
    for (const state of ['user-inventory', 'equipment']) {
        test(`production inventory ${state} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-inventoryoverlay--${state}&viewMode=story`)
            const dialog = page.getByRole('dialog', {
                name: 'Inventory and equipment',
                exact: true,
            })
            await expect(dialog).toBeVisible()
            const slots = dialog.locator('.inventory-slot')
            await expect(slots).toHaveCount(50)
            await slots.first().focus()
            await expect(slots.first()).toBeFocused()
            const bounds = await dialog.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            expect(
                await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
            ).toBe(true)
            await page.evaluate(async () => {
                await document.fonts.ready
                await Promise.all(Array.from(document.images, (image) => image.decode()))
            })
            await expect(dialog).toHaveScreenshot(`inventory-${state}-${width}.png`)
        })
    }
}
