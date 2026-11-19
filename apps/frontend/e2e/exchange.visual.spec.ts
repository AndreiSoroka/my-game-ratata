import { expect, test } from '@playwright/test'

async function waitForArt(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
    })
}

async function prepareDraft(dialog: import('@playwright/test').Locator): Promise<void> {
    await dialog.locator('#exchange-apple').fill('2')
    await dialog.getByLabel('Предложить золото', { exact: true }).fill('7')
    await expect(dialog.getByRole('button', { name: 'Предложить', exact: true })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Подтвердить', exact: true })).toBeDisabled()
}

for (const width of [1280, 390, 320]) {
    for (const state of [
        'draft',
        'submitted',
        'accepted',
        'completed',
        'unavailable',
        'overflow',
    ]) {
        const prepare = state === 'draft' ? prepareDraft : async () => {}

        test(`exchange ${state} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=shared-exchange--${state}&viewMode=story`)
            const dialog = page.getByRole('dialog', { name: /^Обмен:/ })
            await expect(dialog).toBeVisible()
            await prepare(dialog)
            const bounds = await dialog.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
            expect(
                await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
            ).toBe(true)
            const footer = dialog.locator('.exchange-actions')
            const footerBounds = await footer.boundingBox()
            expect(footerBounds!.y + footerBounds!.height).toBeLessThanOrEqual(
                bounds!.y + bounds!.height
            )
            await waitForArt(page)
            await expect(dialog).toHaveScreenshot(`exchange-${state}-${width}.png`)
        })
    }
}

test('independent handshake states', async ({ page }) => {
    await page.goto('/iframe.html?id=shared-exchange--consent&viewMode=story')
    const gallery = page.getByLabel('Подтверждение обмена', { exact: true })
    await expect(
        gallery.getByRole('img', { name: 'Вы: не подтверждено', exact: true })
    ).toBeVisible()
    await expect(
        gallery.getByRole('img', { name: 'Капля: подтверждено', exact: true })
    ).toBeVisible()
    await waitForArt(page)
    await expect(gallery).toHaveScreenshot('exchange-consent.png')
})
