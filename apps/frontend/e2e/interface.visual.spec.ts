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
            'hp:73;mana:42;energy:51;chatActive:true;showAbilities:true'
        )

        await expect(page.locator('[data-interface-ready="true"]').first()).toHaveScreenshot(
            'interface-full-hud.png'
        )
    })

    test('chat panel', async ({ page }) => {
        await openInterfaceStory(
            page,
            'interface-hud--chat',
            'chatActive:true;chatDraft:/say%20Bridge%20is%20clear.'
        )

        await expect(page.locator('[data-interface-ready="true"]').first()).toHaveScreenshot(
            'interface-chat.png'
        )
    })
})
