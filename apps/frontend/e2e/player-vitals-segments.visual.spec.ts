import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory } from './ui-story-ready'

for (const width of [320, 1280]) {
    test(`player HUD renders segmented HP, MP and EN at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=game-player-hud--segmented-resources&viewMode=story')
        const frame = page.locator('.game-player-status__vitals')
        for (const [name, percent, count] of [
            ['Health', 60, 2],
            ['Mana', 50, 2],
            ['Energy', 70, 4],
        ] as const) {
            const bar = frame.getByRole('progressbar', { name })
            await expect(bar).toHaveAttribute('aria-valuenow', String(percent))
            await expect(bar.locator('.game-bar__segment')).toHaveCount(count)
        }
        await expect(frame.locator('.game-bar__label')).toHaveCount(0)
        await expectUiFits(frame, width)
        await readyUiStory(page)
        await frame.screenshot({ path: info.outputPath(`player-status-segmented-${width}.png`) })
    })
}
