import { expect, type Locator, type Page, test } from '@playwright/test'

async function waitForArt(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
    })
}

async function prepareDraft(dialog: Locator): Promise<void> {
    await dialog.locator('#exchange-apple').fill('2')
    await dialog.getByLabel('Предложить золото', { exact: true }).fill('7')
    await expect(dialog.getByRole('button', { name: 'Предложить', exact: true })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Подтвердить', exact: true })).toBeDisabled()
}

async function expectWhisperBelowExchange(dialog: Locator): Promise<void> {
    const frame = dialog.locator('.social-window--exchange')
    const footer = frame.locator('.exchange-actions')
    const whisper = dialog.getByRole('region', { name: 'Приватный разговор' })
    await expect(frame.getByRole('region', { name: 'Приватный разговор' })).toHaveCount(0)
    await expect(whisper).toBeInViewport({ ratio: 1 })
    const [frameBox, footerBox, whisperBox] = await Promise.all([
        frame.boundingBox(),
        footer.boundingBox(),
        whisper.boundingBox(),
    ])
    const frameBottom = frameBox!.y + frameBox!.height
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(frameBottom)
    expect(frameBottom).toBeLessThan(whisperBox!.y)
}

for (const width of [1280, 390, 320]) {
    for (const state of [
        'draft',
        'submitted',
        'accepted',
        'completed',
        'unavailable',
        'overflow',
    ]) {
        const prepare = state === 'draft' ? prepareDraft : async () => {}

        test(`exchange ${state} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-exchangewindow--${state}&viewMode=story`)
            const dialog = page.getByRole('dialog', { name: /^Обмен:/ })
            await expect(dialog).toBeVisible()
            await prepare(dialog)
            const bounds = await dialog.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
            expect(
                await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
            ).toBe(true)
            await waitForArt(page)
            await expectWhisperBelowExchange(dialog)
            await expect(dialog).toHaveScreenshot(`exchange-${state}-${width}.png`)
        })
    }
}

test('exchange keeps whisper and actions reachable on a short 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 460 })
    await page.goto('/iframe.html?id=game-exchangewindow--draft&viewMode=story')
    const dialog = page.getByRole('dialog', { name: /^Обмен:/ })
    const whisper = dialog.getByRole('region', { name: 'Приватный разговор' })
    const history = whisper.getByRole('list', { name: 'История шёпота' })
    const input = whisper.getByRole('textbox', { name: 'Сказать шёпотом' })
    const send = whisper.getByRole('button', { name: 'Отправить', exact: true })
    const footer = dialog.locator('.exchange-actions')
    const propose = footer.getByRole('button', { name: 'Предложить', exact: true })
    const confirm = footer.getByRole('button', { name: 'Подтвердить', exact: true })
    const cancel = footer.getByRole('button', { name: 'Отменить', exact: true })

    await prepareDraft(dialog)
    await cancel.focus()
    await page.keyboard.press('Tab')
    await expect(history).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await input.fill('Личное сообщение')
    await expect(send).toBeEnabled()
    await waitForArt(page)
    await expect(history).toBeVisible()
    await expect(send).toBeInViewport({ ratio: 1 })
    await expect(propose).toBeInViewport({ ratio: 1 })
    await expect(confirm).toBeInViewport({ ratio: 1 })
    await expect(cancel).toBeInViewport({ ratio: 1 })
    await expectWhisperBelowExchange(dialog)
    const [historyBox, sendBox] = await Promise.all([history.boundingBox(), send.boundingBox()])
    expect(historyBox!.height).toBeGreaterThan(0)
    expect(historyBox!.y + historyBox!.height).toBeLessThanOrEqual(sendBox!.y)

    await input.press('Enter')
    await expect(input).toHaveValue('')
    await expect(input).toBeFocused()
    await expect(send).toBeDisabled()
    await expect(propose).toBeEnabled()
    await expect(confirm).toBeDisabled()
    await expect(dialog.locator('#exchange-apple')).toHaveValue('2')
    await expect(dialog.getByLabel('Предложить золото', { exact: true })).toHaveValue('7')
})

test('independent handshake states', async ({ page }) => {
    await page.goto('/iframe.html?id=game-exchangewindow--consent&viewMode=story')
    const gallery = page.getByLabel('Подтверждение обмена', { exact: true })
    await expect(
        gallery.getByRole('img', { name: 'Вы: не подтверждено', exact: true })
    ).toBeVisible()
    await expect(
        gallery.getByRole('img', { name: 'Капля: подтверждено', exact: true })
    ).toBeVisible()
    await waitForArt(page)
    await expect(gallery).toHaveScreenshot('exchange-consent.png')
})
