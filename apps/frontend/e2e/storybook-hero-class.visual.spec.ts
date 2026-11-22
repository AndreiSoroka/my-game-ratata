import { expect, type Page, test } from '@playwright/test'

import {
    expectCharacterWindowAppearance,
    expectThemedBorder,
    heroThemeCases,
} from './hero-theme-visual'

test('the hero class toolbar themes the game surfaces across stories', async ({ page }) => {
    await page.goto('/?path=/story/shared-common-hudframe--default')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const hud = preview.locator('.hud-frame')
    const hudBorder = hud.locator('.hud-frame__border')
    const defaultAccent = await expectThemedBorder(hudBorder, 'border-017', 16)
    const defaultBackground = await hud.evaluate(
        (element) => getComputedStyle(element).backgroundImage
    )
    const accents = new Set<string>()
    const backgrounds = new Set<string>()

    for (const { label, border } of heroThemeCases) {
        await chooseClass(page, label)
        accents.add(await expectThemedBorder(hudBorder, border, 16))
        backgrounds.add(await hud.evaluate((element) => getComputedStyle(element).backgroundImage))
    }
    expect(accents.size).toBe(heroThemeCases.length)
    expect(backgrounds.size).toBe(heroThemeCases.length)

    await openComponent(page, 'ChatComposerFrame')
    const chatBorder = preview.locator('.chat-composer-frame__border')
    await expectThemedBorder(chatBorder, 'border-010', 12)
    await chooseClass(page, 'Следопыт')
    await expectThemedBorder(chatBorder, 'border-006', 12)

    await openComponent(page, 'ActionHotbar')
    await page.getByRole('link', { name: 'Arcanist', exact: true }).click()
    const hotbar = preview.getByLabel('Быстрые действия')
    const hotbarBorder = hotbar.locator('.hud-frame__border')
    expect(await expectThemedBorder(hotbarBorder, 'border-017', 16)).toBe(defaultAccent)
    await expect(hotbar.locator('.hud-frame')).toHaveCSS('background-image', defaultBackground)
    await expect(hotbar.getByRole('button', { name: /^2: Искра/ })).toBeVisible()
    await chooseClass(page, 'По умолчанию')
    await expectThemedBorder(hotbarBorder, 'border-018', 16)

    await chooseClass(page, 'Клирик')
    await openComponent(page, 'GameMenu')
    const menu = preview.getByRole('dialog', { name: 'Игровое меню' })
    const menuFrame = menu.locator('.menu-panel__outer')
    await expect(menuFrame).toBeVisible()
    await expect(menuFrame).toHaveAttribute('data-fantasy-border', 'border-015')
    await expect(menuFrame).toHaveCSS('background-color', 'rgb(243, 228, 199)')
})

test('the hero class toolbar previews the selected class on the join form', async ({ page }) => {
    await page.goto('/?path=/story/game-joingamepanel--ready')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const form = preview.locator('.join-panel')
    const frame = form.locator(':scope > .game-frame .game-frame__theme-border')
    await expectThemedBorder(frame, 'border-012', 16)

    await chooseClass(page, 'Клирик')
    await expect(form.getByRole('radio', { name: 'Клирик', exact: true })).toBeChecked()
    await expectThemedBorder(frame, 'border-010', 16)

    await chooseClass(page, 'По умолчанию')
    await expect(form.getByRole('radio', { name: 'Авангард', exact: true })).toBeChecked()
    await expectThemedBorder(frame, 'border-012', 16)
})

test('the character window applies the fixture class and follows the hero class toolbar', async ({
    page,
}) => {
    await page.goto('/?path=/story/game-characterwindow--statistics')
    const preview = page.frameLocator('#storybook-preview-iframe')
    const window = preview.getByRole('dialog', { name: 'Персонаж', exact: true })
    await expect(window).toBeVisible()
    const cleric = heroThemeCases[3]
    await expectCharacterWindowAppearance(window, cleric)

    for (const hero of [heroThemeCases[1], heroThemeCases[2], cleric, heroThemeCases[0]]) {
        await chooseClass(page, hero.label)
        await expectCharacterWindowAppearance(window, hero)
    }

    await chooseClass(page, 'По умолчанию')
    await expectCharacterWindowAppearance(window, cleric)
})

async function chooseClass(page: Page, label: string): Promise<void> {
    await page.getByRole('button', { name: /^Класс героя/ }).click()
    const choices = page.getByRole('listbox', { name: /^Класс героя/ })
    await choices.getByRole('option', { name: label, exact: true }).click()
}

async function openComponent(page: Page, name: string): Promise<void> {
    const search = page.getByRole('searchbox', { name: 'Search for components' })
    await search.fill(name)
    await page.getByRole('option', { name: new RegExp(name) }).click()
}
