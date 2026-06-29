import { expect, type Page, test } from '@playwright/test'

async function openInterfaceStory(page: Page, storyId: string, args = ''): Promise<void> {
    await page.goto(`/iframe.html?id=${storyId}&viewMode=story&args=${args}`)
    await page.locator('[data-interface-ready="true"]').first().waitFor({ state: 'visible' })
}

test.describe('Storybook interface visuals', () => {
    test('full HUD viewport', async ({ page }) => {
        await openInterfaceStory(
            page,
            'interface-hud--full-hud',
            'hp:73;mana:42;energy:51;showAbilities:true;speechText:Need%20mana%20before%20the%20bridge.'
        )

        await expect(page.locator('[data-interface-ready="true"]').first()).toHaveScreenshot(
            'interface-full-hud.png'
        )
    })

    test('logs panel', async ({ page }) => {
        await openInterfaceStory(page, 'interface-hud--logs')

        await expect(page.locator('[data-interface-ready="true"]').first()).toHaveScreenshot(
            'interface-logs.png'
        )
    })

    test('speech bubble', async ({ page }) => {
        await openInterfaceStory(
            page,
            'interface-hud--speech-bubble',
            'speechText:Need%20mana%20before%20the%20bridge.'
        )

        await expect(page.locator('[data-interface-ready="true"]').first()).toHaveScreenshot(
            'interface-speech-bubble.png'
        )
    })
})
