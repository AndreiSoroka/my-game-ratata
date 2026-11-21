import { expect, test } from '@playwright/test'

for (const width of [1280, 390, 320]) {
    test(`hero background selection and focus at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=shared-joingamepanel--ready&viewMode=story')
        const form = page.locator('.join-panel')
        const radio = form.locator('input[value="ranger"]')
        await expect(form.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
        await radio.focus()
        await page.keyboard.press('Space')
        await expect(radio).toBeChecked()
        await expect(radio).toBeFocused()
        await expect(form.locator('.class-card__content--selected')).toHaveText('Следопыт')
        await expect(form.locator('.class-card__content--selected')).toHaveCSS(
            'outline-style',
            'solid'
        )
        const bounds = await form.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await page.evaluate(async () => {
            await document.fonts.ready
            await Promise.all(Array.from(document.images, (image) => image.decode()))
        })
        await expect(form).toHaveScreenshot(`join-selected-focus-${width}.png`)
    })
}
