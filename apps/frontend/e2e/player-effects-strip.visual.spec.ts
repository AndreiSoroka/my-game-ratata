import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

const entity = 'entities-player-effects-playereffectsstrip'
const detailEntity = 'entities-player-effects-playereffectdetails'
const widget = 'widgets-player-effects-playereffectsstripwidget'
const stripSelector = '#storybook-root > div > .player-effects-strip'

test('PlayerEffectsStrip Default shows a single selectable row', async ({ page }) => {
    await page.goto(uiStoryUrl(`${entity}--default`))
    const strip = page.locator(stripSelector)
    const details = strip.locator('[data-player-effect-detail]')
    const combo = strip.getByRole('button', { name: /^Серия ударов/ })
    await expect(strip.getByRole('button')).toHaveCount(5)
    await expect(strip.getByRole('list', { name: 'Эффекты игрока' })).toBeVisible()
    await expect(combo).toHaveAccessibleName('Серия ударов · 2/3 · 2 с')
    await expect(details).toHaveCount(0)
    await readyUiStory(page)
    await expect(strip).toHaveScreenshot('player-effects-strip-default.png')

    await combo.focus()
    await combo.press('Enter')
    await expect(combo).toHaveAttribute('aria-expanded', 'true')
    await expect(details).toHaveAccessibleName('Серия ударов')
    await expect(details.getByText('2/3', { exact: true })).toBeVisible()
    await expect(details.getByText('2 с', { exact: true })).toBeVisible()
    await expect(strip).toHaveScreenshot('player-effects-strip-detail.png')
    await combo.press('Space')
    await expect(combo).toHaveAttribute('aria-expanded', 'false')
    await expect(details).toHaveCount(0)
})

test('PlayerEffectsStrip shows the Road Prayer song and next dash discount at 320px', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(uiStoryUrl(`${entity}--road-prayer`))
    const strip = page.locator(stripSelector)
    const song = strip.getByRole('button', { name: 'Походная песня · восстановление EN ×5' })
    const dash = strip.getByRole('button', {
        name: 'Подставить плечо · следующий рывок −10 EN · 8 с',
    })
    await expect(song).toBeVisible()
    await dash.press('Enter')
    const detail = strip.getByRole('region', { name: 'Подставить плечо · следующий рывок −10 EN' })
    await expect(detail.getByText('8 с', { exact: true })).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(strip, 320)
    await expect(strip).toHaveScreenshot('player-effects-strip-road-prayer.png')
})

test('PlayerEffectsStripWidget renders all projected statuses at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(uiStoryUrl(`${widget}--all-statuses`))
    const strip = page.locator(stripSelector)
    const buttons = strip.getByRole('button')
    await expect(buttons).toHaveCount(15)
    await expect(buttons.first()).toHaveAttribute('data-player-effect', 'stun')
    await expect(buttons.last()).toHaveAttribute('data-player-effect', 'blacklisted')
    await readyUiStory(page)
    await expectUiFits(strip, 320)
    await expect(strip).toHaveScreenshot('player-effects-strip-widget-all.png')
})

test('PlayerEffectsStrip shows the exhaustion rank and time at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(uiStoryUrl(`${entity}--ash-exhaustion`))
    const strip = page.locator(stripSelector)
    const curse = strip.getByRole('button', { name: /^Истощение Праха/ })
    const description = 'Истощение Праха · Ранг 2 · пределы ресурсов −30% · 30:00'
    await expect(curse).toHaveAccessibleName(description)
    await curse.press('Enter')
    const detail = strip.getByRole('region', { name: 'Истощение Праха' })
    await expect(detail.getByText('Ранг 2 · пределы ресурсов −30%', { exact: true })).toBeVisible()
    await expect(detail.getByText('30:00', { exact: true })).toBeVisible()
    await expect(curse).toHaveAttribute('aria-controls', await detail.evaluate((node) => node.id))
    await readyUiStory(page)
    await expectUiFits(strip, 320)
    await expect(strip).toHaveScreenshot('player-effects-strip-ash-exhaustion.png')
})

test('PlayerEffectDetails Default frames the title, rank and duration at 320px', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(uiStoryUrl(`${detailEntity}--default`))
    const detail = page.getByRole('region', { name: 'Истощение Праха' })
    await expect(detail.getByRole('heading', { name: 'Истощение Праха' })).toBeVisible()
    await expect(detail.getByText('16:38', { exact: true })).toBeVisible()
    await expect(detail.getByText('Ранг 2 · пределы ресурсов −30%')).toBeVisible()
    await readyUiStory(page)
    await expectUiFits(detail, 320)
    await expect(detail).toHaveScreenshot('player-effect-details-default.png')
})

test('PlayerEffectDetails frames an untimed status without an empty timer at 320px', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto(uiStoryUrl(`${detailEntity}--untimed`))
    const detail = page.getByRole('region', { name: 'В чёрном списке Новогорода' })
    await expect(detail.getByRole('heading')).toBeVisible()
    await expect(detail.locator('.player-effect-details__timer')).toHaveCount(0)
    await readyUiStory(page)
    await expectUiFits(detail, 320)
    await expect(detail).toHaveScreenshot('player-effect-details-untimed.png')
})

test('PlayerEffectsStripWidget Default Controls update effects from server time', async ({
    page,
}) => {
    await page.goto(`/?path=/story/${widget}--default`)
    const preview = page.frameLocator('#storybook-preview-iframe')
    const strip = preview.locator(stripSelector)
    await expect(strip.getByRole('button')).toHaveCount(5)
    await expect(strip.getByRole('button', { name: 'Магический барьер · 6 с' })).toBeVisible()

    await page.getByRole('tab', { name: /^Controls/ }).click()
    const time = page.locator('#control-serverTime')
    await time.fill('16000')
    await time.press('Tab')
    await expect(strip.getByRole('button')).toHaveCount(3)
    await expect(strip.getByRole('button', { name: /^Магический барьер/ })).toHaveCount(0)
    await expect(strip.getByRole('button', { name: /^Розыск/ })).toBeVisible()

    await page.goto(uiStoryUrl(`${widget}--empty`))
    await expect(page.locator('#storybook-root > div')).toBeAttached()
    await expect(page.locator(stripSelector)).toHaveCount(0)
})
