import type { GameReadiness } from '@my-game-ratata/contracts'
import { expect, test } from '@playwright/test'

test('keeps the join button disabled until the AI availability check passes', async ({ page }) => {
    let state: GameReadiness['state'] | 'offline' = 'checking'
    await page.route('**/ready', (route) =>
        state === 'offline'
            ? route.abort('connectionfailed')
            : route.fulfill({
                  status: 503,
                  json: { state },
                  headers: { 'access-control-allow-origin': '*' },
              })
    )
    await page.goto('/')
    const join = page.getByRole('button', { name: 'Войти', exact: true })
    await expect(page.getByText('Проверяем доступность ИИ…')).toBeVisible()
    await expect(join).toBeDisabled()

    state = 'ai_unavailable'
    await expect(page.getByText('ИИ недоступен. Повторяем проверку.')).toBeVisible()
    await expect(join).toBeDisabled()

    state = 'offline'
    await expect(page.getByText('Не удалось связаться с игровым сервером.')).toBeVisible()
    await expect(join).toBeDisabled()

    await page.unroute('**/ready')
    await expect(join).toBeEnabled()
})

for (const mobile of [false, true]) {
    test(`opens local Admin before joining and changes the server mode (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/')
        await page.getByText('Дополнительные настройки', { exact: true }).click()
        const admin = page.getByRole('button', { name: 'Admin', exact: true })
        await admin.focus()
        await page.keyboard.press('Enter')

        const panel = page.getByRole('dialog', { name: 'Настройки мира' })
        const onlineAi = panel.getByRole('radio', { name: /^ИИ ждёт игрока/ })
        const always = panel.getByRole('radio', { name: /^Мир живёт без игроков/ })
        await expect(onlineAi).toBeChecked()
        await onlineAi.focus()
        await page.keyboard.press('ArrowDown')
        await expect(always).toBeChecked()
        await panel.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await expect(panel).toBeHidden()
        await expect(admin).toBeFocused()

        await admin.click()
        await expect(always).toBeChecked()
        await page.keyboard.press('Escape')
        await expect(panel).toBeHidden()
        await expect(admin).toBeFocused()

        await admin.click()
        await onlineAi.check()
        await panel.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await expect(panel).toBeHidden()
        await expect(page.getByRole('button', { name: 'Войти', exact: true })).toBeEnabled()
    })
}
