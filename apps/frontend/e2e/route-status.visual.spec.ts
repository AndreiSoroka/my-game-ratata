import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
    test(`shows authoritative route failure countdown at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=shared-prayer-channel--blocked-route&viewMode=story')
        const status = page.getByRole('status')
        await expect(status).toContainText('Точка 4: путь перекрыт')
        await expect(status).toContainText('отмена через 8 с')
        await expect(status.locator(':scope > .game-frame')).toHaveCount(1)
        const fill = await status.locator(':scope > .game-frame').evaluate((frame) => {
            const style = getComputedStyle(frame, '::after')
            return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none'
        })
        expect(fill).toBe(true)
        await page.evaluate(() => document.fonts.ready)
        const cancel = status.getByRole('button', { name: 'Остановить маршрут' })
        await expect(cancel).toBeVisible()
        await expect(cancel).toBeEnabled()
        const box = await status.boundingBox()
        const buttonBox = await cancel.boundingBox()
        expect(box).not.toBeNull()
        expect(buttonBox).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height).toBeLessThanOrEqual(844)
        expect(buttonBox!.x).toBeGreaterThanOrEqual(box!.x)
        expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(box!.x + box!.width)
        await cancel.focus()
        await expect(cancel).toBeFocused()
        await expect(status).toHaveScreenshot(`blocked-route-${width}.png`)
        await page.screenshot({ path: info.outputPath(`blocked-route-${width}.png`) })
        await page.screenshot({
            path: `/tmp/ratata-route-status-${width === 390 ? 'mobile' : 'desktop'}.png`,
        })
        await page.goto('/iframe.html?id=shared-prayer-channel--route-in-progress&viewMode=story')
        // The empty running state is meaningful only after the actual story host
        // has mounted, rather than during Storybook's initial loading screen.
        await expect(page.locator('#storybook-root > div')).toBeVisible()
        await expect(page.getByText(/путь перекрыт/)).toHaveCount(0)
    })
}

test('hides the blocked-route overlay while the player is stunned', async ({ page }) => {
    await page.goto('/iframe.html?id=shared-prayer-channel--stunned-while-blocked&viewMode=story')
    await expect(page.locator('#storybook-root > div')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
})
