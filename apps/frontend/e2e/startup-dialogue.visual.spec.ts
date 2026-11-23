import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
    test(`keeps startup settings accessible at ${width}px`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(
            '/iframe.html?id=pages-startgame-startgamesettings--local-admin&viewMode=story'
        )
        await page.getByText('Дополнительные настройки', { exact: true }).click()
        const admin = page.getByRole('button', { name: 'Admin' })
        await admin.focus()
        await page.keyboard.press('Enter')
        const panel = page.getByRole('dialog', { name: 'Настройки мира' })
        await expect(panel).toBeVisible()
        await expect(panel.getByRole('radio', { name: /^Мир на паузе без игроков/ })).toBeVisible()
        const bounds = await panel.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x + bounds!.width / 2).toBeCloseTo(width / 2, 0)
        await page.screenshot({ path: info.outputPath(`world-mode-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(panel).toBeHidden()
        await expect(admin).toBeFocused()
    })
}

test('shows a browser-ready error, code entry, mumble and merchant service stories', async ({
    page,
}, info) => {
    await page.goto(
        '/iframe.html?id=pages-startgame-startgamereadiness--ai-unavailable&viewMode=story'
    )
    await expect(page.getByRole('status')).toHaveText('ИИ недоступен. Повторяем проверку.')
    await page.screenshot({ path: info.outputPath('ai-unavailable.png') })

    await page.goto('/iframe.html?id=pages-startgame-adminaccess--code-error&viewMode=story')
    await expect(page.getByRole('textbox', { name: 'Код из терминала сервера' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Код не принят.')
    await page.screenshot({ path: info.outputPath('code-error.png') })

    await page.goto('/iframe.html?id=game-speechbubbles--mumble&viewMode=story')
    await page.getByRole('button', { name: 'Воспроизвести мычание' }).click()
    await expect(page.getByText('М-м-м-м-м…')).toBeVisible()
    await page.screenshot({ path: info.outputPath('scripted-mumble.png') })

    await page.goto('/iframe.html?id=game-adventuredialogue--service&viewMode=story')
    await expect(page.getByRole('heading', { name: 'Товары' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Еда/ })).toBeEnabled()
    await page.screenshot({ path: info.outputPath('merchant-service.png') })
})
