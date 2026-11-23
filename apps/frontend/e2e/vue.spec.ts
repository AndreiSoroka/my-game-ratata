import { expect, type Page, test } from '@playwright/test'

test('suggests a hero name and still requires one after the suggestion is cleared', async ({
    page,
}) => {
    await page.goto('/')

    await expect(page.locator('h1')).toHaveText('Ratata')
    await expect(page.getByLabel('Имя героя')).toBeVisible()
    await expect(page.getByLabel('Имя героя')).not.toHaveValue('')
    await expect(page.getByRole('button', { name: 'Войти' })).toBeEnabled()
    await page.getByLabel('Имя героя').fill('')
    await expect(page.getByRole('button', { name: 'Войти' })).toBeDisabled()
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
    await second.getByLabel('Имя героя').fill(nickname)
    await second.getByRole('button', { name: 'Войти' }).click()
    await expect(
        second.getByText('Это имя уже занято. Сгенерируйте другое или введите своё')
    ).toBeVisible()
    await expect(second.getByLabel('Имя героя')).toBeVisible()

    await second.getByRole('button', { name: 'Войти' }).click()
    await expect(
        second.getByText('Это имя уже занято. Сгенерируйте другое или введите своё')
    ).toBeVisible()
    await expect(second.getByLabel('Имя героя')).toBeVisible()
    await expect(second.locator('canvas[data-game-canvas=true]')).toHaveCount(0)

    await second.getByLabel('Имя героя').fill(`${nickname}-2`)
    await expect(
        second.getByText('Это имя уже занято. Сгенерируйте другое или введите своё')
    ).toHaveCount(0)
    await second.getByRole('button', { name: 'Войти' }).click()
    await expect(second.locator('canvas[data-game-canvas=true]')).toBeVisible()
    await expect(second.getByRole('region', { name: 'Ресурсы игрока' })).toBeVisible()
    expect(consoleErrors.join('\n')).not.toContain(
        'Feature flags can only be enabled before Engine constructor time'
    )

    await firstContext.close()
    await secondContext.close()
})

async function joinAs(page: Page, nickname: string): Promise<void> {
    await page.goto('/')
    await page.getByLabel('Имя героя').fill(nickname)
    await page.getByRole('button', { name: 'Войти' }).click()
    await expect(page.getByRole('region', { name: 'Ресурсы игрока' })).toBeVisible()
}
