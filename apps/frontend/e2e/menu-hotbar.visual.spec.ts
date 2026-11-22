import { expect, test } from '@playwright/test'

import { expectThemedBorder, heroThemeCases } from './hero-theme-visual'
import { expectUiFits, readyUiStory } from './ui-story-ready'

for (const { heroClass, border, ability } of heroThemeCases) {
    for (const width of [1280, 390, 320]) {
        const suffix = width === 1280 ? '' : `-${width}`

        test(`production ${heroClass} hotbar preset at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-actionhotbar--${heroClass}&viewMode=story`)
            const bar = page.getByLabel('Быстрые действия')
            await expect(bar.getByRole('button', { name: /^1: Удар ножом/ })).toBeVisible()
            await expect(
                bar.getByRole('button', { name: new RegExp(`^2: ${ability}`) })
            ).toBeVisible()
            await expect(bar.getByRole('button', { name: 'Игровое меню' })).toBeVisible()
            await expectThemedBorder(bar.locator('.hud-frame__border'), border, 16)
            await expectUiFits(bar, width)
            await readyUiStory(page)
            await expect(bar).toHaveScreenshot(`hotbar-${heroClass}${suffix}.png`)
        })
    }
}
for (const width of [1280, 390, 320]) {
    for (const { state, second, pressed, contextCount } of [
        { state: 'blade-techniques', second: 'Широкий размах', pressed: 'false', contextCount: 1 },
        { state: 'blade-guard', second: 'Глухая оборона', pressed: 'true', contextCount: 2 },
    ]) {
        test(`production ${state} hotbar at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.goto(`/iframe.html?id=game-actionhotbar--${state}&viewMode=story`)
            const bar = page.getByLabel('Быстрые действия')
            await expect(bar).toBeVisible()
            await expect(page.getByRole('status', { name: 'Серия ударов' })).toHaveText(
                'Серия ударов: 2 / 3'
            )
            const secondSlot = bar.getByRole('button', { name: new RegExp(`^2: ${second}`) })
            await expect(secondSlot).toBeVisible()
            await expect(secondSlot).toHaveAttribute('aria-pressed', pressed)
            await expect(bar.getByLabel('Автоповтор')).toHaveCount(0)
            const frame = bar.locator('.hud-frame')
            await expect(frame).toHaveCount(1)
            const fourthSlot = frame.getByRole('button', { name: /^4:/ })
            const menuButton = frame.getByRole('button', { name: 'Игровое меню' })
            await expect(menuButton).toBeVisible()
            const [fourthBounds, menuBounds] = await Promise.all([
                fourthSlot.boundingBox(),
                menuButton.boundingBox(),
            ])
            expect(menuBounds!.x).toBeGreaterThanOrEqual(fourthBounds!.x + fourthBounds!.width)
            expect(menuBounds!.y).toBeLessThan(fourthBounds!.y + fourthBounds!.height)
            expect(menuBounds!.y + menuBounds!.height).toBeGreaterThan(fourthBounds!.y)
            const context = page.locator('.hotbar-context__line')
            await expect(context).toHaveCount(contextCount)
            const lines = await context.all()
            const boxes = await Promise.all(lines.map((line) => line.boundingBox()))
            expect(
                boxes.every(
                    (box, index) =>
                        index === 0 || boxes[index - 1]!.y + boxes[index - 1]!.height < box!.y
                )
            ).toBe(true)
            const bounds = await bar.boundingBox()
            expect(bounds!.x).toBeGreaterThanOrEqual(0)
            expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
            await readyUiStory(page)
            await expect(page).toHaveScreenshot(`hotbar-${state}-${width}.png`)
        })
    }
}

test('production hotbar assignment opens and dismisses at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 })
    await page.goto('/iframe.html?id=game-actionhotbar--assignment&viewMode=story')
    const picker = page.getByRole('dialog', { name: 'Назначить слот 3' })
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button', { name: /Выстрел/ })).toBeFocused()
    await readyUiStory(page)
    await expect(picker).toHaveScreenshot('hotbar-assignment-320.png')
    await page.keyboard.press('Escape')
    await expect(picker).toHaveCount(0)
})

for (const width of [1280, 390, 320]) {
    test(`production game menu at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=game-gamemenu--open&viewMode=story&mute=1')
        const menu = page.getByRole('dialog', { name: 'Игровое меню' })
        await expect(menu.getByRole('button', { name: 'Вернуться в игру' })).toBeFocused()
        await expect(menu.getByRole('button', { name: 'Вернуться в игру' })).toHaveAttribute(
            'data-focus-ring',
            'false'
        )
        await expect(menu.getByText('В этом режиме звук отключён.')).toHaveCount(0)
        await expect(menu.locator('.menu-panel__divider')).toHaveAttribute(
            'data-fantasy-divider',
            'divider-000'
        )
        await expect(menu.locator('.menu-panel__divider')).toHaveAttribute(
            'data-fantasy-divider-ends',
            'both'
        )
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Персонаж · P', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Инвентарь · I', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Метки', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Сценарии', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Выйти из игры' })).toBeFocused()
        await expect(menu.getByRole('button', { name: 'Выйти из игры' })).toHaveCSS(
            'outline-style',
            'none'
        )
        const bounds = await menu.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        expect(bounds!.width).toBe(Math.min(380, width - 32))
        await readyUiStory(page, false)
        await expect(menu).toHaveScreenshot(`game-menu-${width}.png`)
    })
}
