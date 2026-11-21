import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const noticeStory = 'entities-exchanges-exchangeinvitationnotice'
const widgetStory = 'widgets-exchanges-exchangeinvitationwidget'
const incomingName = 'Приглашение к торговле'
const outgoingName = 'Предложение отправлено'
const tradeButton = 'Начать торговлю'
const cancelButton = 'Отменить предложение'

for (const width of [1280, 320]) {
    test(`ExchangeInvitationNotice incoming at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(uiStoryUrl(`${noticeStory}--default`))
        const notice = page.getByRole('region', { name: incomingName, exact: true })
        await expect(notice).toContainText('Мира')
        await expect(notice.getByRole('button', { name: tradeButton })).toBeEnabled()
        await expect(notice.getByRole('button', { name: 'Отклонить' })).toBeEnabled()
        await expect(notice.getByRole('button', { name: cancelButton })).toHaveCount(0)
        await readyUiStory(page)
        await expectUiFits(notice, width)
        await expect(notice).toHaveScreenshot(`exchange-invitation-incoming-${width}.png`)
    })

    test(`ExchangeInvitationNotice outgoing at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto(uiStoryUrl(`${noticeStory}--outgoing`))
        const notice = page.getByRole('region', { name: outgoingName, exact: true })
        await expect(notice).toContainText('Мира')
        await expect(notice.getByRole('button', { name: cancelButton })).toBeEnabled()
        await expect(notice.getByRole('button', { name: tradeButton })).toHaveCount(0)
        await readyUiStory(page)
        await expectUiFits(notice, width)
        await expect(notice).toHaveScreenshot(`exchange-invitation-outgoing-${width}.png`)
    })
}

test('ExchangeInvitationNotice keeps Decline transparent when highlighted', async ({ page }) => {
    await page.goto(uiStoryUrl(`${noticeStory}--default`))
    const notice = page.getByRole('region', { name: incomingName, exact: true })
    const decline = notice.getByRole('button', { name: 'Отклонить' })
    const border = decline.locator('.ui-button__border')
    const transparentFill = 'linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0))'
    await expect(border).toHaveCSS('opacity', '0.6')
    await decline.hover()
    await expect(decline).toHaveCSS('background-image', transparentFill)
    await expect(border).toHaveCSS('opacity', '1')

    await page.mouse.move(0, 0)
    await notice.getByRole('button', { name: tradeButton }).press('Tab')
    await expect(decline).toBeFocused()
    await expect(decline).toHaveCSS('outline-style', 'solid')
    await expect(decline).toHaveCSS('background-image', transparentFill)
})

test('ExchangeInvitationNotice fits a long partner name at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto(uiStoryUrl(`${noticeStory}--long-name`))
    const notice = page.getByRole('region', { name: incomingName, exact: true })
    await expect(notice).toContainText('СеверныйСтранникИзДальнихЗемель')
    await readyUiStory(page)
    await expectUiFits(notice, 320)
    await expect(notice).toHaveScreenshot('exchange-invitation-long-name-320.png')
})

test('ExchangeInvitationNotice Default Controls update the player and direction', async ({
    page,
}) => {
    await page.goto(`/?path=/story/${noticeStory}--default`)
    const preview = page.frameLocator('#storybook-preview-iframe')
    await expect(preview.getByRole('region', { name: incomingName })).toContainText('Мира')
    await page.getByRole('tab', { name: /^Controls/ }).click()
    const name = page.locator('#control-partnerName')
    await name.fill('Лада')
    await name.press('Tab')
    await expect(preview.getByRole('region', { name: incomingName })).toContainText('Лада')
    await page.getByRole('radio', { name: 'outgoing', exact: true }).press('Space')
    const outgoing = preview.getByRole('region', { name: outgoingName })
    await expect(outgoing.getByRole('button', { name: cancelButton })).toBeVisible()
    await expect(outgoing).toContainText('Лада')
})

test('ExchangeInvitationWidget derives the notice from the invited snapshot', async ({ page }) => {
    await page.goto(uiStoryUrl(`${widgetStory}--default`))
    const incoming = page.getByRole('region', { name: incomingName, exact: true })
    await expect(incoming.getByRole('button', { name: tradeButton })).toBeEnabled()
    await page.goto(uiStoryUrl(`${widgetStory}--outgoing`))
    const outgoing = page.getByRole('region', { name: outgoingName, exact: true })
    await expect(outgoing.getByRole('button', { name: cancelButton })).toBeEnabled()
})

for (const story of ['active', 'no-invitation']) {
    test(`ExchangeInvitationWidget ${story} omits the notice`, async ({ page }) => {
        await page.goto(uiStoryUrl(`${widgetStory}--${story}`))
        await expect(page.locator('#storybook-root > div')).toBeAttached()
        await expect(page.locator('.exchange-invitation')).toHaveCount(0)
    })
}
