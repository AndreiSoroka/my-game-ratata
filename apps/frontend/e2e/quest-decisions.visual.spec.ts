import { expect, type Page, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const offer = {
    story: 'entities-quests-questofferpanel',
    heading: 'Предложение поручения',
    confirm: 'Взять',
    cancel: 'Отказаться',
    screenshot: 'quest-offer',
}
const turnIn = {
    story: 'entities-quests-questturninpanel',
    heading: 'Сдать поручение',
    confirm: 'Сдать',
    cancel: 'Вернуться к разговору',
    screenshot: 'quest-turn-in',
}
const scrollHint = 'Прокрутите вниз'

async function openPanel(
    page: Page,
    quest: typeof offer,
    width: number,
    story = 'default',
    height = 844
) {
    await page.setViewportSize({ width, height })
    await page.goto(uiStoryUrl(`${quest.story}--${story}`))
    const panel = page.getByRole('region', { name: quest.heading, exact: true })
    await expect(panel).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(panel, width)
    return panel
}

for (const quest of [offer, turnIn]) {
    for (const width of [1280, 390, 320]) {
        test(`${quest.screenshot} at ${width}px`, async ({ page }) => {
            const panel = await openPanel(page, quest, width)
            const confirm = panel.getByRole('button', { name: quest.confirm, exact: true })
            const cancel = panel.getByRole('button', { name: quest.cancel, exact: true })
            await expect(confirm).toBeEnabled()
            await expect(cancel).toBeEnabled()
            await expect(panel).toHaveAttribute('data-fantasy-border', 'border-014')
            await expect(confirm.locator('[data-fantasy-panel="panel-001"]')).toBeVisible()
            await expect(panel.getByText(scrollHint)).toBeHidden()
            await expect(panel).toHaveScreenshot(`${quest.screenshot}-${width}.png`)
        })
    }
}

test('shows the required apples and lets the player choose how to split gold', async ({ page }) => {
    const panel = await openPanel(page, offer, 320)
    const apples = panel.getByRole('listitem').filter({ hasText: 'Яблоко × 3' })
    await expect(apples.locator('img')).toHaveJSProperty('naturalWidth', 16)
    await expect(panel.getByText('Общая награда: 30 золотых')).toBeVisible()
    const rewardChoice = panel.getByRole('group', { name: 'Распределение награды' })
    await expect(rewardChoice.locator('[data-fantasy-border="border-006"]')).toBeVisible()
    await expect(rewardChoice.locator('[data-fantasy-border="border-001"]')).toHaveCount(2)
    const party = rewardChoice.getByRole('radio', { name: 'Поровну группе' })
    const submitter = rewardChoice.getByRole('radio', { name: 'Вся награда сдающему' })
    await expect(party).toBeChecked()
    await submitter.press('KeyF')
    await expect(submitter).toBeChecked()
    await expect(party).not.toBeChecked()
})

test('keeps the quest refusal transparent on hover and keyboard focus', async ({ page }) => {
    const panel = await openPanel(page, offer, 390)
    const cancel = panel.getByRole('button', { name: offer.cancel, exact: true })
    const transparentFill = /^(none|linear-gradient\(rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\)\))$/
    await cancel.hover()
    await expect(cancel).toHaveCSS('background-image', transparentFill)
    await page.mouse.move(0, 0)
    await panel.getByRole('button', { name: offer.confirm, exact: true }).press('Tab')
    await expect(cancel).toBeFocused()
    await expect(cancel).toHaveCSS('background-image', transparentFill)
})

test('allows refusing an offer when an existing quest prevents acceptance', async ({ page }) => {
    const panel = await openPanel(page, offer, 390, 'occupied')
    await expect(panel.getByRole('button', { name: offer.confirm, exact: true })).toBeDisabled()
    await expect(panel.getByRole('button', { name: offer.cancel, exact: true })).toBeEnabled()
    await expect(panel).toHaveScreenshot('quest-offer-occupied-390.png')
})

test('disables both actions while a turn-in is pending', async ({ page }) => {
    const panel = await openPanel(page, turnIn, 390, 'pending')
    await expect(panel.getByRole('button', { name: 'Проверяем…', exact: true })).toBeDisabled()
    await expect(panel.getByRole('button', { name: turnIn.cancel, exact: true })).toBeDisabled()
    await expect(panel).toHaveScreenshot('quest-turn-in-pending-390.png')
})

test('explains which delivery item is missing and keeps the back action enabled', async ({
    page,
}) => {
    const windowStory = { ...turnIn, story: 'pages-gameplay-questturninwindow' }
    const panel = await openPanel(page, windowStory, 390, 'missing-items')
    const missing = panel.getByRole('listitem').filter({ hasText: 'не хватает 2' })
    await expect(missing).toHaveText('Слизневое сердце · доступно 1 из 3 · не хватает 2')
    await expect(missing).toHaveCSS('color', 'rgb(158, 62, 44)')
    await expect(panel.getByRole('button', { name: turnIn.confirm, exact: true })).toBeDisabled()
    await expect(panel.getByRole('button', { name: turnIn.cancel, exact: true })).toBeEnabled()
    await expect(panel).toHaveScreenshot('quest-turn-in-missing-items-390.png')
})

test('lets the player choose the reward split when handing in a delivery before acceptance', async ({
    page,
}) => {
    const panel = await openPanel(page, turnIn, 390, 'before-acceptance')
    await expect(panel.getByText('Слизневое сердце × 3', { exact: true })).toBeVisible()
    const choice = panel.getByRole('group', { name: 'Распределение награды' })
    const party = choice.getByRole('radio', { name: 'Поровну группе' })
    const submitter = choice.getByRole('radio', { name: 'Вся награда сдающему' })
    await expect(party).toBeChecked()
    await expect(panel.getByRole('button', { name: turnIn.confirm, exact: true })).toBeInViewport()
    await expect(panel).toHaveScreenshot('quest-turn-in-before-acceptance-390.png')
    await submitter.press('KeyF')
    await expect(submitter).toBeChecked()
})

test('keeps turn-in actions reachable below long details on a short screen', async ({ page }) => {
    const panel = await openPanel(page, turnIn, 320, 'long-details', 460)
    const body = panel.getByRole('region', { name: 'Условия поручения', exact: true })
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    const hint = panel.getByText(scrollHint)
    await expect(hint).toBeVisible()
    await expect(body).toHaveAccessibleDescription(scrollHint)
    await expect(panel).toHaveScreenshot('quest-turn-in-long-details-320.png')
    await page.keyboard.press('Tab')
    await expect(body).toBeFocused()
    await page.keyboard.press('End')
    await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await expect(hint).toBeHidden()
    await expect(body.getByText('Кость × 1', { exact: true })).toBeInViewport()
    for (const button of await panel.getByRole('button').all()) {
        await expect(button).toBeInViewport()
    }
    await body.press('Home')
    await expect(hint).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 844 })
    await expect(hint).toBeHidden()
})

test('reveals the reward choice below the fold in a short quest offer', async ({ page }) => {
    const panel = await openPanel(page, offer, 320, 'default', 460)
    const body = panel.getByRole('region', { name: 'Условия поручения', exact: true })
    const hint = panel.getByText(scrollHint)
    await expect(hint).toBeVisible()
    await expect(panel.getByRole('button', { name: offer.confirm, exact: true })).toBeInViewport()
    await expect(panel).toHaveScreenshot('quest-offer-short-viewport-320.png')

    await body.press('End')
    await expect(hint).toBeHidden()
    const submitter = body.getByRole('radio', { name: 'Вся награда сдающему' })
    await submitter.press('KeyF')
    await expect(submitter).toBeChecked()
})
