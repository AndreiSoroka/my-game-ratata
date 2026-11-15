import { expect, test } from '@playwright/test'

for (const [background, ability] of [
    ['vanguard', 'Пусто'],
    ['ranger', 'Выстрел'],
    ['arcanist', 'Искра'],
    ['cleric', 'Молитва'],
]) {
    test(`production ${background} hotbar preset`, async ({ page }) => {
        await page.goto(`/iframe.html?id=interface-hotbar--${background}&viewMode=story`)
        const bar = page.getByLabel('Быстрые действия')
        await expect(bar.getByRole('button', { name: /^1: Базовая атака/ })).toBeVisible()
        await expect(bar.getByRole('button', { name: new RegExp(`^2: ${ability}`) })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await expect(bar).toHaveScreenshot(`hotbar-${background}.png`)
    })
}
for (const width of [1280, 390]) {
    test(`production game menu at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/iframe.html?id=interface-game-menu--open&viewMode=story')
        const menu = page.getByRole('dialog', { name: 'Игровое меню' })
        await expect(menu.getByRole('button', { name: 'Вернуться в игру' })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Персонаж · P', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Метки', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Сценарии', exact: true })).toBeFocused()
        await page.keyboard.press('Tab')
        await expect(menu.getByRole('button', { name: 'Выйти из игры' })).toBeFocused()
        const bounds = await menu.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
        await page.evaluate(() => document.fonts.ready)
        await expect(menu).toHaveScreenshot(`game-menu-${width}.png`)
    })
}
