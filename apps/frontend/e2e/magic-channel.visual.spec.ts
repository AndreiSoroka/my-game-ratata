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

test('shows the two-second Withering Bolt cast and prayer cancellation at 320px', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/iframe.html?id=game-actionchannelstatus--withering-bolt&viewMode=story')
    const channel = page.locator('.control-status--magic')
    await expect(channel.getByRole('status')).toHaveText('Тленный сгусток · 2 с')
    await expect(channel.getByRole('button', { name: 'Прервать молитву' })).toBeVisible()
    await expectUiFits(channel, 320)
    await readyUiStory(page)
    await channel.screenshot({ path: info.outputPath('withering-bolt-channel-320.png') })
})
