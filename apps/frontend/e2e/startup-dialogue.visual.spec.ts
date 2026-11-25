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

    await page.goto('/iframe.html?id=pages-gameplay-adventuredialogue--service&viewMode=story')
    await expect(page.getByRole('heading', { name: 'Товары' })).toBeVisible()
    const foodOffer = page.getByRole('button', { name: /^Еда/ })
    await expect(foodOffer).toBeEnabled()
    await expect(foodOffer.locator('img')).toHaveJSProperty('naturalWidth', 16)
    await page.screenshot({ path: info.outputPath('merchant-service.png') })
})

test('explains graphics loss and shows a recovery action on a narrow screen', async ({
    page,
}, info) => {
    await page.goto(
        '/iframe.html?id=pages-gameplay-maploaderror--restoring-graphics&viewMode=story'
    )
    const recovery = page.getByRole('status')
    await expect(recovery).toContainText('Восстанавливаем изображение')
    await expect(recovery.getByRole('button')).toHaveCount(0)
    await recovery.screenshot({ path: info.outputPath('graphics-restoring.png') })

    await page.setViewportSize({ width: 320, height: 480 })
    await page.goto('/iframe.html?id=pages-gameplay-maploaderror--graphics-retry&viewMode=story')
    const failure = page.getByRole('alert').filter({ hasText: 'WebGL' })
    await expect(failure.getByRole('button', { name: 'Восстановить графику' })).toBeVisible()
    const bounds = await failure.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320)
    await failure.screenshot({ path: info.outputPath('graphics-retry-320.png') })
})
