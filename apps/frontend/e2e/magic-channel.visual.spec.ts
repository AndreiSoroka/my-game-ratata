import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory } from './ui-story-ready'

for (const width of [320, 1280]) {
    test(`shows the magic channel and its cancel action at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(
            '/iframe.html?id=game-actionchannelstatus--maintaining-chains&viewMode=story'
        )
        const channel = page.locator('.control-status--magic')
        await expect(channel.getByRole('status')).toHaveText('Оковы · 3 с')
        await expect(channel.getByRole('button', { name: 'Прервать заклинание' })).toBeVisible()
        await expectUiFits(channel, width)
        await readyUiStory(page)
        await channel.screenshot({ path: info.outputPath(`chains-channel-${width}.png`) })
    })
}
