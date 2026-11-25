import { expect, test } from '@playwright/test'

import { expectUiFits, readyUiStory, uiStoryUrl } from './ui-story-ready'

async function ready(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode()))
    })
}

for (const width of [1280, 390, 320]) {
    for (const section of ['buttons', 'fields', 'frames', 'slots']) {
        test(`game primitives ${section} at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 })
            await page.goto(`/iframe.html?id=game-gameprimitivesstory--${section}&viewMode=story`)
            const stage = page.getByLabel(`Общие компоненты: ${section}`)
            await expect(stage).toBeVisible()
            await ready(page)
            const bounds = await stage.boundingBox()
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            expect(
                await stage.evaluate((element) => element.scrollWidth <= element.clientWidth)
            ).toBe(true)
            await expect(stage).toHaveScreenshot(`primitives-${section}-${width}.png`)
        })
    }
}

test('native button focus hover and pressed states', async ({ page }) => {
    await page.goto('/iframe.html?id=game-gameprimitivesstory--buttons&viewMode=story')
    const button = page.getByTestId('primary-default')
    await ready(page)
    await page.getByTestId('secondary-default').focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(button).toBeFocused()
    await expect(page.locator('.game-primitives-stage')).toHaveScreenshot(
        'primitives-button-focus.png'
    )
    await button.hover()
    await expect(button).toHaveScreenshot('primitives-button-hover.png')
    await page.mouse.down()
    await expect(button).toHaveScreenshot('primitives-button-pressed.png')
    await page.mouse.up()
})

test('native field focus and editable numeric value', async ({ page }) => {
    await page.goto('/iframe.html?id=game-gameprimitivesstory--fields&viewMode=story')
    const quantity = page.getByRole('spinbutton', { name: 'Количество' })
    await quantity.fill('7')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('combobox', { name: 'Место' })).toBeFocused()
    await ready(page)
    await expect(page.locator('.game-primitives-stage')).toHaveScreenshot(
        'primitives-field-focus.png'
    )
})

test('UiNumberInput reveals its shared arrows without changing its width', async ({ page }) => {
    await page.goto(uiStoryUrl('shared-common-uinumberinput--default'))
    const control = page.locator('.ui-number-input')
    const arrows = control.locator('.ui-number-input__steps')
    const quantity = control.getByRole('spinbutton', { name: 'Количество' })
    await expect(arrows).toHaveCSS('opacity', '0')
    const idleWidth = await control.boundingBox()
    await control.hover()
    await expect(arrows).toHaveCSS('opacity', '1')
    expect((await control.boundingBox())?.width).toBe(idleWidth?.width)
    await quantity.press('ArrowUp')
    await expect(quantity).toHaveValue('6')
    await page.mouse.move(0, 0)
    await expect(arrows).toHaveCSS('opacity', '1')
    const increase = control.getByRole('button', { name: 'Увеличить: Количество' })
    const decrease = control.getByRole('button', { name: 'Уменьшить: Количество' })
    await increase.click()
    await expect(quantity).toHaveValue('7')
    await quantity.fill('10')
    await expect(increase).toBeDisabled()
    await quantity.fill('1')
    await expect(decrease).toBeDisabled()
    await readyUiStory(page)
    await expect(control).toHaveScreenshot('number-input-focus.png')
})

test.describe('UiNumberInput on touch', () => {
    test.use({ hasTouch: true, viewport: { width: 320, height: 460 } })

    test('reveals the arrows after a tap and respects decimal steps', async ({ page }) => {
        await page.goto(uiStoryUrl('shared-common-uinumberinput--decimal-steps'))
        const control = page.locator('.ui-number-input')
        const arrows = control.locator('.ui-number-input__steps')
        const quantity = control.getByRole('spinbutton', { name: 'Количество' })
        await expect(arrows).toHaveCSS('opacity', '0')
        await quantity.tap()
        await expect(arrows).toHaveCSS('opacity', '1')
        await expectUiFits(control, 320)
        await control.getByRole('button', { name: 'Уменьшить: Количество' }).tap()
        await expect(quantity).toHaveValue('0.4')
        await quantity.fill('')
        await quantity.blur()
        await expect(quantity).toHaveValue('0.4')
        await expect(arrows).toHaveCSS('opacity', '0')
        await quantity.tap()
        await readyUiStory(page)
        await expect(control).toHaveScreenshot('number-input-decimal-touch-320.png')
    })
})

test('shared selected states include checked and current controls', async ({ page }) => {
    await page.goto('/iframe.html?id=game-gameprimitivesstory--buttons&viewMode=story')
    await expect(page.getByRole('switch', { name: 'Автозапуск' })).toHaveAttribute(
        'aria-checked',
        'true'
    )
    await expect(
        page.getByRole('button', { name: 'Текущее задание', exact: true })
    ).toHaveAttribute('aria-current', 'true')
    await ready(page)
    await expect(page.locator('.primitive-selected')).toHaveScreenshot(
        'primitives-selected-semantics.png'
    )
})

test('UiFrame exposes decorative skins independently of its native host', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-uiframe--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const frame = preview.locator('.game-frame-host > .game-frame')
    await expect(frame).toHaveAttribute('aria-hidden', 'true')
    await expect(frame).toHaveClass(/game-frame--panel/)
    await expect(frame.locator('[data-fantasy-border]')).toHaveAttribute(
        'data-fantasy-border',
        'border-015'
    )
    await page.getByRole('tab', { name: /^Controls/ }).click()
    await page.locator('#control-variant').selectOption('window')
    await expect(frame.locator('[data-fantasy-border]')).toHaveAttribute(
        'data-fantasy-border',
        'border-014'
    )
    await page.locator('#control-variant').selectOption('speech')
    await expect(frame).toHaveClass(/game-frame--speech/)
    await expect(frame.locator('[data-fantasy-border]')).toHaveCount(0)
    await page.locator('#control-skin').selectOption('parchment')
    await expect(frame).toHaveClass(/game-frame--parchment/)
})
