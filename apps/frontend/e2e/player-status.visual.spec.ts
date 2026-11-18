import { expect, type Page, test } from '@playwright/test'

const states = [
    { story: 'normal', width: 1280 },
    { story: 'long-name', width: 1280 },
    { story: 'long-name', width: 390 },
    { story: 'long-name', width: 320 },
    { story: 'empty-resources', width: 390 },
    { story: 'low-resources', width: 320 },
    { story: 'scripted-echo', width: 320 },
    { story: 'authorized-numbers', width: 1280 },
    { story: 'authorized-numbers', width: 320 },
].map((state) => ({
    ...state,
    numbers: state.story === 'authorized-numbers' ? ['18/30', '40/40', '102/150'] : [],
}))

for (const { story, width, numbers } of states) {
    test(`production player status ${story} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(`/iframe.html?id=interface-player-status--${story}&viewMode=story`)
        const panel = page.getByRole('region', { name: 'Player status' })
        await expect(panel).toBeVisible()
        await page.evaluate(async () => {
            await document.fonts.ready
        })
        await expect(panel.locator('[role="img"]')).toHaveCount(2)
        await expect(panel.locator('.ratata-ui-resource')).toHaveCount(3)
        await expect(panel).not.toContainText('Connected')
        await expect(panel.locator('.ratata-ui-status__header > .game-frame')).toHaveCount(1)
        await expect(panel.locator('.ratata-ui-status__header [role="img"]')).toHaveCount(2)
        await expect(panel.locator('.ratata-ui-resource__text')).toHaveText(numbers)
        await assertPanelGeometry(page)
        await expect(panel).toHaveScreenshot(`player-status-${story}-${width}.png`)
    })
}

async function assertPanelGeometry(page: Page): Promise<void> {
    const sizes = await page.getByRole('region', { name: 'Player status' }).evaluate((panel) => {
        const bounds = panel.getBoundingClientRect()
        const elements = Array.from(
            panel.querySelectorAll('h2, h2 > span, .soul-badge, .ratata-ui-resource__track')
        )
        const title = panel.querySelector('h2')!.getBoundingClientRect()
        const ribbon = panel.querySelector('.ratata-ui-status__header')!.getBoundingClientRect()
        const icons = panel.querySelector('.soul-badge')!.getBoundingClientRect()
        const tracks = Array.from(panel.querySelectorAll<HTMLElement>('.ratata-ui-resource__track'))
        return {
            left: bounds.left,
            right: bounds.right,
            viewport: window.innerWidth,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            ribbonContainsIcons:
                icons.left >= ribbon.left &&
                icons.right <= ribbon.right &&
                icons.top >= ribbon.top &&
                icons.bottom <= ribbon.bottom,
            centeredNickname:
                Math.abs((title.left + title.right) / 2 - (ribbon.left + ribbon.right) / 2) < 1,
            distinctNameAndIcons: title.right <= icons.left,
            compact: bounds.height <= (window.innerWidth <= 740 ? 130 : 180),
            accurateFills: tracks.every((track) => {
                const fill = track.querySelector<HTMLElement>('.ratata-ui-resource__value')!
                const percent = Number.parseFloat(fill.style.width)
                return (
                    Math.abs(
                        fill.getBoundingClientRect().width - (track.clientWidth * percent) / 100
                    ) < 0.5
                )
            }),
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
    expect(sizes.ribbonContainsIcons).toBe(true)
    expect(sizes.centeredNickname).toBe(true)
    expect(sizes.distinctNameAndIcons).toBe(true)
    expect(sizes.compact).toBe(true)
    expect(sizes.accurateFills).toBe(true)
    expect(sizes.contained).toBe(true)
}
