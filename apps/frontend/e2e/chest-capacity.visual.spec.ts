import { expect, test } from '@playwright/test'

for (const width of [1280, 390, 320]) {
    test(`full chest shows available transfers at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=pages-gameplay-chestcontainer--full-chest&viewMode=story')
        const dialog = page.getByRole('dialog', { name: 'Рюкзак и сундук' })
        await expect(dialog.getByRole('button', { name: 'Закрыть контейнер' })).toBeInViewport()
        await expect(dialog.getByRole('heading', { name: 'Сундук 25 / 25' })).toBeVisible()
        const bag = dialog.locator('[data-chest-pane="bag"]')
        await expect(bag.getByRole('button', { name: /Топор/ })).toBeDisabled()
        await expect(bag.getByRole('button', { name: /Лечебные травы × 2/ })).toBeEnabled()
        await expect(dialog.getByRole('button', { name: 'Забрать всё' })).toBeEnabled()
        const bounds = await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
            true
        )
        await page.evaluate(async () => {
            await document.fonts.ready
            await Promise.all(Array.from(document.images, (image) => image.decode()))
        })
        await expect(dialog).toHaveScreenshot(`full-chest-${width}.png`)
    })
}
