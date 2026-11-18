import { expect, test } from '@playwright/test'

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
            await page.goto(`/iframe.html?id=interface-primitives--${section}&viewMode=story`)
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
    await page.goto('/iframe.html?id=interface-primitives--buttons&viewMode=story')
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
    await page.goto('/iframe.html?id=interface-primitives--fields&viewMode=story')
    const quantity = page.getByRole('spinbutton', { name: 'Количество' })
    await quantity.fill('7')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('combobox', { name: 'Место' })).toBeFocused()
    await ready(page)
    await expect(page.locator('.game-primitives-stage')).toHaveScreenshot(
        'primitives-field-focus.png'
    )
})

test('shared selected states include checked and current controls', async ({ page }) => {
    await page.goto('/iframe.html?id=interface-primitives--buttons&viewMode=story')
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
