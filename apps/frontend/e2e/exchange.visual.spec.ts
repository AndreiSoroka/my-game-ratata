import { expect, type Locator, type Page, test } from '@playwright/test'

async function waitForArt(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
    })
}

async function prepareDraft(dialog: Locator): Promise<void> {
    const apple = dialog.locator('#exchange-apple')
    await apple.fill('2')
    await dialog.getByLabel('Предложить золото', { exact: true }).fill('7')
    await apple.scrollIntoViewIfNeeded()
    await expect(
        dialog
            .locator('.exchange-draft-pane__actions')
            .getByRole('button', { name: 'Предложить', exact: true })
    ).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Подтвердить', exact: true })).toBeDisabled()
    await expectDraftFits(dialog.locator('.exchange-draft-pane'))
}

async function expectDraftFits(pane: Locator): Promise<void> {
    await expect(pane.locator('.exchange-draft-row').first()).toBeVisible()
    const sections = pane.locator('.exchange-draft-pane__actions, .exchange-draft-row')
    await expect
        .poll(() =>
            sections.evaluateAll((elements) =>
                elements.every((element) => element.scrollWidth <= element.clientWidth)
            )
        )
        .toBe(true)
}

async function expectExchangeLayout(dialog: Locator): Promise<void> {
    const frame = dialog.locator('.exchange-window-frame')
    const header = frame.locator('header').first()
    const participants = frame.locator('.exchange-participants')
    const body = frame.locator('.dark-window-frame__body')
    const footer = frame.locator('.exchange-actions')
    const whisper = dialog.getByRole('region', { name: 'Приватный разговор' })
    await expect(header.getByRole('heading', { name: /^Обмен · Капля/ })).toBeVisible()
    await expect(header.getByRole('button', { name: /^Закрыть/ })).toBeInViewport({ ratio: 1 })
    await expect(frame.getByRole('region', { name: 'Приватный разговор' })).toHaveCount(0)
    await expect(whisper).toBeInViewport({ ratio: 1 })
    const [frameBox, headerBox, participantsBox, bodyBox, footerBox, whisperBox] =
        await Promise.all([
            frame.boundingBox(),
            header.boundingBox(),
            participants.boundingBox(),
            body.boundingBox(),
            footer.boundingBox(),
            whisper.boundingBox(),
        ])
    const frameBottom = frameBox!.y + frameBox!.height
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(participantsBox!.y)
    expect(participantsBox!.y).toBeLessThan(footerBox!.y)
    expect(bodyBox!.y + bodyBox!.height).toBeLessThanOrEqual(footerBox!.y)
    expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(frameBottom)
    expect(frameBottom).toBeLessThan(whisperBox!.y)
}

test('ExchangeWindowFrame Default renders its heading, summary, content and actions', async ({
    page,
}) => {
    await page.goto(
        '/iframe.html?id=entities-exchanges-exchangewindowframe--default&viewMode=story'
    )
    const frame = page.locator('.exchange-window-frame')
    await expect(frame.getByRole('heading', { name: 'Обмен · Мира', exact: true })).toBeVisible()
    await expect(
        frame.getByRole('button', { name: 'Закрыть: Обмен · Мира', exact: true })
    ).toBeVisible()
    await expect(frame.getByText('Вы подтвердили условия. Мира ещё не подтвердила.')).toBeVisible()
    await expect(
        frame.getByText('Вы предлагаете 3 яблока. Мира предлагает 7 золотых.')
    ).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Закрыть', exact: true })).toBeInViewport()
    await waitForArt(page)
    await expect(frame).toHaveScreenshot('exchange-window-frame-default.png')
})

for (const { width, screenshot } of [
    { width: 1280, screenshot: 'exchange-window-default.png' },
    { width: 320, screenshot: 'exchange-window-default-320.png' },
]) {
    test(`ExchangeWindow Default submits and edits the draft at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/iframe.html?id=entities-exchanges-exchangewindow--default&viewMode=story')
        const frame = page.locator('.exchange-window-frame')
        const pane = frame.locator('.exchange-draft-pane')
        const apple = pane.locator('.exchange-draft-row').filter({
            has: page.getByText('Яблоко', { exact: true }),
        })
        const quantity = apple.locator('#exchange-apple')
        await expect(apple.locator('.ui-item-slot img')).toBeVisible()
        await expect(
            frame
                .getByRole('region', { name: 'Капля', exact: true })
                .locator('.exchange-offer__item .ui-item-slot img')
                .first()
        ).toBeVisible()
        await expectDraftFits(pane)
        await waitForArt(page)
        await expect(frame).toHaveScreenshot(screenshot)

        const initialQuantity = Number(await quantity.inputValue())
        await apple.getByRole('button', { name: 'Больше: Яблоко', exact: true }).click()
        await expect(quantity).toHaveValue(String(initialQuantity + 1))
        await apple.getByRole('button', { name: 'Убрать: Яблоко', exact: true }).click()
        await expect(quantity).toHaveValue('0')
        await quantity.fill('2')
        const publish = pane.getByRole('button', { name: 'Предложить', exact: true })
        await publish.click()

        const published = frame.getByRole('region', { name: 'Ваше предложение', exact: true })
        const submittedApple = published.locator('.exchange-offer__item').first()
        const submittedGold = published.locator('.exchange-offer__gold')
        const edit = published.getByRole('button', { name: 'Изменить предложение', exact: true })
        const confirm = frame
            .locator('.exchange-actions')
            .getByRole('button', { name: 'Подтвердить', exact: true })
        await expect(pane).toHaveCount(0)
        await expect(submittedApple).toContainText('Яблоко')
        await expect(submittedApple).toContainText('× 2')
        await expect(submittedGold).toContainText('◈ 7')
        await expect(confirm).toBeEnabled()
        await expect(edit).toBeFocused()
        await edit.click()
        await expect(quantity).toHaveValue('2')
        await expect(pane.getByLabel('Предложить золото', { exact: true })).toHaveValue('7')

        await expect(publish).toBeEnabled()
        await publish.click()
        await expect(edit).toBeFocused()
        await expect(submittedApple).toContainText('× 2')
        await expect(submittedGold).toContainText('◈ 7')
    })
}

test('ExchangeDraftPane Default opens with the items, gold and draft actions', async ({ page }) => {
    await page.goto('/iframe.html?id=entities-exchanges-exchangedraftpane--default&viewMode=story')
    const pane = page.getByRole('region', { name: 'Ваше предложение', exact: true })
    await expect(pane.getByRole('heading', { name: 'Ваше предложение', exact: true })).toBeVisible()
    await expect(pane.getByRole('img', { name: 'Яблоко × 5', exact: true })).toBeVisible()
    await expect(pane.getByLabel('Предложить золото', { exact: true })).toHaveValue('7')
    await expect(pane.getByRole('button', { name: 'Предложить', exact: true })).toBeEnabled()
})

async function expectPublishedOffer(dialog: Locator, accepted: boolean): Promise<void> {
    const own = dialog.getByRole('region', { name: 'Ваше предложение', exact: true })
    await expect(own.getByRole('spinbutton')).toHaveCount(0)
    await expect(
        own.getByRole('button', { name: 'Изменить предложение', exact: true })
    ).toBeVisible()
    const confirm = dialog.locator('.exchange-actions').getByRole('button', {
        name: accepted ? 'Подтверждено' : 'Подтвердить',
        exact: true,
    })
    await expect(confirm).toHaveJSProperty('disabled', accepted)
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
        const verify =
            state === 'submitted' || state === 'accepted'
                ? (dialog: Locator) => expectPublishedOffer(dialog, state === 'accepted')
                : async () => {}

        test(`exchange ${state} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-exchangewindow--${state}&viewMode=story`)
            const dialog = page.getByRole('dialog', { name: /^Обмен:/ })
            await expect(dialog).toBeVisible()
            await prepare(dialog)
            await verify(dialog)
            const bounds = await dialog.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844)
            expect(
                await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)
            ).toBe(true)
            await waitForArt(page)
            await expectExchangeLayout(dialog)
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
    const propose = dialog
        .locator('.exchange-draft-pane__actions')
        .getByRole('button', { name: 'Предложить', exact: true })
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
    await expect(confirm).toBeInViewport({ ratio: 1 })
    await expect(cancel).toBeInViewport({ ratio: 1 })
    await expectExchangeLayout(dialog)
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
    await propose.click()
    await expect(propose).toBeDisabled()
    await expect(confirm).toBeDisabled()
})

test('exchange keeps the header and actions visible while offers scroll', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 460 })
    await page.goto('/iframe.html?id=game-exchangewindow--overflow&viewMode=story')
    const dialog = page.getByRole('dialog', { name: /^Обмен:/ })
    const frame = dialog.locator('.exchange-window-frame')
    const title = frame.getByRole('heading', { name: /^Обмен · Капля/ })
    const body = frame.locator('.dark-window-frame__body')
    const footer = frame.locator('.exchange-actions')
    await expectExchangeLayout(dialog)
    const [titleBefore, footerBefore] = await Promise.all([
        title.boundingBox(),
        footer.boundingBox(),
    ])

    const scrollTop = await body.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop
    })
    expect(scrollTop).toBeGreaterThan(0)
    await expect(title).toBeInViewport({ ratio: 1 })
    await expect(footer).toBeInViewport({ ratio: 1 })
    expect(await title.boundingBox()).toEqual(titleBefore)
    expect(await footer.boundingBox()).toEqual(footerBefore)
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
