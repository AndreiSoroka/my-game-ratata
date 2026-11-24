import { expect, type Locator, type Page, test } from '@playwright/test'

import { expectThemedBorder, heroThemeCases } from './hero-theme-visual'

test.use({ reducedMotion: 'reduce' })

const arcanist = heroThemeCases[2]

for (const width of [390, 1280]) {
    test(`applies the chosen hero theme to the form and world at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/?test=1')
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })

        const name = page.getByRole('textbox', { name: 'Имя героя' })
        await expect(name).toBeVisible({ timeout: 15_000 })
        const appearance = await inspectJoinThemes(page)
        const nickname = `Тема героя ${width}`
        await selectNameOnEveryClick(name)
        await expect(name).toBeFocused()
        await expect(page.locator('.join-row .ui-input')).toHaveCSS('outline-style', 'none')
        await page.keyboard.insertText(nickname)
        await expect(name).toHaveValue(nickname)
        await name.press('Enter')
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest?.getState().player?.heroClass))
            .toBe(arcanist.heroClass)

        await inspectWorldFrames(page, appearance)
    })
}

async function inspectJoinThemes(page: Page): Promise<{ accent: string; surface: string }> {
    const form = page.locator('.join-panel')
    const frame = form.locator(':scope > .game-frame .game-frame__theme-border')
    const inputFrame = form.locator('.chat-composer-frame__border')
    const bonusFrame = form
        .getByLabel('Постоянные бонусы прошлого')
        .locator('.game-frame__theme-border')
    const accents = new Set<string>()
    const surfaces = new Set<string>()
    for (const { label, border, borderWidth } of heroThemeCases) {
        const card = form.locator('.class-card').filter({
            has: page.getByRole('radio', { name: label, exact: true }),
        })
        const cardFrame = card.locator('.class-card__frame')
        const cardAccent = await expectThemedBorder(cardFrame, border, borderWidth)
        await expect(card.locator('.class-card__content')).toHaveCSS('color', cardAccent)
        await form.getByRole('radio', { name: label, exact: true }).check()
        const accent = await expectThemedBorder(frame, border, borderWidth)
        expect(accent).toBe(cardAccent)
        expect(await panelSurface(frame)).toBe(await panelSurface(cardFrame))
        accents.add(accent)
        surfaces.add(await panelSurface(frame))
        await expectThemedBorder(inputFrame, border, borderWidth)
        await expectThemedBorder(bonusFrame, border, borderWidth)
    }
    expect(accents.size).toBe(heroThemeCases.length)
    expect(surfaces.size).toBe(heroThemeCases.length)
    expect(surfaces.has('')).toBe(false)
    await expect(form).not.toContainText('Начальные запасы до звёзд')
    await expect(form.getByLabel('Постоянные бонусы прошлого')).toBeVisible()

    await form.getByRole('radio', { name: arcanist.label, exact: true }).check()
    return {
        accent: await expectThemedBorder(frame, arcanist.border, arcanist.borderWidth),
        surface: await panelSurface(frame),
    }
}

async function selectNameOnEveryClick(name: Locator): Promise<void> {
    const length = (await name.inputValue()).length
    expect(length).toBeGreaterThan(0)
    const selection = () =>
        name.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])
    await name.click()
    await expect.poll(selection).toEqual([0, length])
    await name.press('ArrowRight')
    await expect.poll(selection).toEqual([length, length])
    await name.click({ position: { x: 4, y: 4 } })
    await expect.poll(selection).toEqual([0, length])
}

async function inspectWorldFrames(
    page: Page,
    { accent, surface }: { accent: string; surface: string }
): Promise<void> {
    const world = page.locator('canvas[data-game-canvas]')
    await expect(world).toBeVisible()
    await page
        .locator('.game-chat')
        .getByRole('button', { name: 'Развернуть историю чата' })
        .click()
    const frames = [
        '.game-player-status__vitals .hud-frame__border',
        '.quick-action-bar .hud-frame__border',
        '.game-chat .hud-frame__border',
        '.game-chat .chat-history__surface',
    ]
    for (const selector of frames) {
        const frame = page.locator(selector)
        expect(await expectThemedBorder(frame, arcanist.border, arcanist.borderWidth)).toBe(accent)
        expect(await panelSurface(frame)).toBe(surface)
    }
    expect(await panelSurface(page.locator('.quick-action-bar .hotbar-slot').first())).toBe(surface)

    await world.focus()
    await page.keyboard.press('Enter')
    const composer = page.locator('.game-chat .chat-composer-frame__border')
    expect(await expectThemedBorder(composer, arcanist.border, arcanist.borderWidth)).toBe(accent)
    expect(await panelSurface(composer)).toBe(surface)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')

    const menu = page.getByRole('dialog', { name: 'Игровое меню' })
    const menuFrame = menu.locator('.menu-panel__outer')
    await expect(menuFrame).toHaveAttribute('data-fantasy-border', 'border-015')
    await expect(menuFrame).toHaveCSS('background-color', 'rgb(243, 228, 199)')
    await expect(menu.locator('.menu-panel__inner')).toHaveAttribute(
        'data-fantasy-border',
        'border-014'
    )
    await menu.getByRole('button', { name: 'Инвентарь · I', exact: true }).click()

    const inventory = page.getByRole('dialog', { name: 'Инвентарь и снаряжение' })
    await expect(inventory).toBeVisible()
    const inventoryFrame = inventory.locator(
        '.inventory-overlay__equipment > .game-frame > .game-frame__theme-border'
    )
    expect(await expectThemedBorder(inventoryFrame, arcanist.border, arcanist.borderWidth)).toBe(
        accent
    )
    expect(await panelSurface(inventoryFrame)).toBe(surface)
}

function panelSurface(element: Locator): Promise<string> {
    return element.evaluate((node) => {
        const style = document.createElement('span').style
        style.color = getComputedStyle(node).getPropertyValue('--ui-themed-panel-surface')
        return style.color
    })
}
