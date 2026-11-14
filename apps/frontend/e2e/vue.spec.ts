import { expect, type Page, test } from '@playwright/test'

test('requires a nickname before entering the game', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Ratata')
    await expect(page.getByLabel('Nickname')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enter' })).toBeDisabled()
})

test('rejects duplicate active nickname without black screen on retry', async ({
    browser,
    browserName,
}, testInfo) => {
    const firstContext = await browser.newContext()
    const secondContext = await browser.newContext()
    const first = await firstContext.newPage()
    const second = await secondContext.newPage()
    const consoleErrors: string[] = []
    const nickname = `andrei-${browserName}-${String(testInfo.workerIndex)}`

    second.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push(message.text())
        }
    })

    await joinAs(first, nickname)
    await expect(first.locator('canvas[data-game-canvas=true]')).toBeVisible()

    await second.goto('/')
    await second.getByLabel('Nickname').fill(nickname)
    await second.getByRole('button', { name: 'Enter' }).click()
    await expect(second.getByText('Nickname is already in use')).toBeVisible()
    await expect(second.getByLabel('Nickname')).toBeVisible()

    await second.getByRole('button', { name: 'Enter' }).click()
    await expect(second.getByText('Nickname is already in use')).toBeVisible()
    await expect(second.getByLabel('Nickname')).toBeVisible()
    await expect(second.locator('canvas[data-game-canvas=true]')).toHaveCount(0)

    await second.getByLabel('Nickname').fill(`${nickname}-2`)
    await second.getByRole('button', { name: 'Enter' }).click()
    await expect(second.locator('canvas[data-game-canvas=true]')).toBeVisible()
    await expect(second.getByRole('region', { name: 'Player status' })).toBeVisible()
    expect(consoleErrors.join('\n')).not.toContain(
        'Feature flags can only be enabled before Engine constructor time'
    )

    await firstContext.close()
    await secondContext.close()
})

async function joinAs(page: Page, nickname: string): Promise<void> {
    await page.goto('/')
    await page.getByLabel('Nickname').fill(nickname)
    await page.getByRole('button', { name: 'Enter' }).click()
    await expect(page.getByRole('region', { name: 'Player status' })).toBeVisible()
}
