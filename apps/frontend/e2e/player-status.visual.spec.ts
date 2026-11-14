import { expect, type Page, test } from '@playwright/test'

const states = [
    { story: 'normal', width: 1280 },
    { story: 'long-name', width: 1280 },
    { story: 'long-name', width: 390 },
    { story: 'long-name', width: 320 },
    { story: 'empty-resources', width: 390 },
    { story: 'low-resources', width: 320 },
    { story: 'scripted-echo', width: 320 },
]

for (const { story, width } of states) {
    test(`production player status ${story} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(`/iframe.html?id=interface-player-status--${story}&viewMode=story`)
        const panel = page.getByRole('region', { name: 'Player status' })
        await expect(panel).toBeVisible()
        await page.evaluate(async () => {
            await document.fonts.ready
        })
        await expect(panel.locator('[role="img"]')).toHaveCount(3)
        await expect(panel.locator('.ratata-ui-resource')).toHaveCount(3)
        await expect(panel).not.toContainText('Connected')
        await expect(panel.locator('.ratata-kenney-title')).toHaveCount(0)
        await assertPanelGeometry(page)
        await expect(panel).toHaveScreenshot(`player-status-${story}-${width}.png`)
    })
}

async function assertPanelGeometry(page: Page): Promise<void> {
    const sizes = await page.getByRole('region', { name: 'Player status' }).evaluate((panel) => {
        const bounds = panel.getBoundingClientRect()
        const elements = Array.from(
            panel.querySelectorAll('h2, .soul-badge, .ratata-ui-resource__track')
        )
        return {
            left: bounds.left,
            right: bounds.right,
            viewport: window.innerWidth,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            contained: elements.every((element) => {
                const rect = element.getBoundingClientRect()
                return (
                    rect.left >= bounds.left &&
                    rect.right <= bounds.right &&
                    rect.top >= bounds.top &&
                    rect.bottom <= bounds.bottom
                )
            }),
        }
    })
    expect(sizes.left).toBeGreaterThanOrEqual(0)
    expect(sizes.right).toBeLessThanOrEqual(sizes.viewport)
    expect(sizes.overflow).toBe(false)
    expect(sizes.contained).toBe(true)
}
