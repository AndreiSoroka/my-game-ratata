import { expect, type Locator, type Page, test } from '@playwright/test'

for (const mobile of [false, true]) {
    test(`HUD focus and game-menu ownership (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'arcanist'),
            `menu-${info.workerIndex}-${mobile}`
        )
        await page.addStyleTag({ content: '.test-panel { display: none !important }' })
        await expect(page.getByRole('region', { name: 'World location' })).toHaveCount(0)
        await expect(page.locator('.game-player-status')).toHaveCSS('top', '14px')
        const menuButton = await hotbarMenuButton(page)
        await expect(page.getByLabel('Приключение', { exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: /^Квесты ·/ })).toHaveCount(0)
        await expectBottomDock(page, mobile)
        await menuButton.focus()
        const { menu, inventoryEntry } = await checkInventoryMenu(page)
        const attack = page.getByRole('button', { name: /^1: Удар ножом/ })
        await attack.focus()
        await page.keyboard.press('KeyQ')
        await expect(page.getByLabel('Выбранная цель')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByLabel('Выбранная цель')).toHaveCount(0)
        await expect(menu).toHaveCount(0)
        await page.keyboard.press('Shift+Digit3')
        await page
            .getByRole('dialog', { name: 'Назначить слот 3' })
            .getByRole('button', { name: /Искра/ })
            .click()
        await expect(page.getByRole('button', { name: /^3: Искра/ })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(menu).toBeVisible()
        const resume = menu.getByRole('button', { name: 'Вернуться в игру', exact: true })
        const character = menu.getByRole('button', { name: 'Персонаж · P', exact: true })
        const markers = menu.getByRole('button', { name: 'Метки', exact: true })
        await expect(resume).toBeFocused()
        await page.keyboard.press('KeyS')
        await expect(character).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(inventoryEntry).toBeFocused()
        await page.keyboard.press('ArrowDown')
        await expect(markers).toBeFocused()
        await page.keyboard.press('KeyW')
        await expect(inventoryEntry).toBeFocused()
        await page.keyboard.press('KeyW')
        await expect(character).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(resume).toBeFocused()
        await page.keyboard.press('ArrowUp')
        await expect(menu.getByRole('button', { name: 'Выйти из игры', exact: true })).toBeFocused()
        await page.keyboard.press('KeyS')
        await expect(resume).toBeFocused()
        const before = await page.evaluate(() => window.__ratataTest!.getState())
        await page.keyboard.press('KeyW')
        await page.keyboard.press('Digit2')
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot?.tick))
            .toBeGreaterThan(before.snapshot!.tick + 2)
        const during = await page.evaluate(() => window.__ratataTest!.getState())
        expect(during.connected).toBe(true)
        expect(during.player?.position).toEqual(before.player?.position)
        expect(during.player?.resources).toEqual(before.player?.resources)
        await menu.getByRole('button', { name: 'Вернуться в игру' }).click()
        await expect(menu).toHaveCount(0)
        await page.keyboard.down('KeyD')
        try {
            await expect
                .poll(() => page.evaluate(() => window.__ratataTest!.getState().player!.position.x))
                .toBeGreaterThan(before.player!.position.x)
        } finally {
            await page.keyboard.up('KeyD')
        }
        await menuButton.click()
        const stoppingTick = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.tick
        )
        // Key release and the menu release input; later snapshots prove movement has settled.
        await expect
            .poll(() =>
                page.evaluate((tick) => {
                    const state = window.__ratataTest!.getState()
                    return {
                        advanced: (state.snapshot?.tick ?? 0) > tick + 2,
                        velocity: state.player?.velocity,
                        path: state.player?.path,
                    }
                }, stoppingTick)
            )
            .toEqual({ advanced: true, velocity: { x: 0, y: 0 }, path: [] })
        const saved = await page.evaluate(() => window.__ratataTest!.getState().player!)
        await menu.getByRole('button', { name: 'Выйти из игры' }).click()
        await expect(page.getByLabel('Имя героя')).toBeVisible()
        expect(await page.evaluate(() => window.__ratataTest!.getState().connected)).toBe(false)
        await page.getByLabel('Имя героя').fill(saved.nickname)
        await page.getByRole('radio', { name: 'Следопыт', exact: true }).check()
        await page.getByRole('button', { name: 'Войти', exact: true }).click()
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().connected))
            .toBe(true)
        await expect(menu).toHaveCount(0)
        const restored = await page.evaluate(() => window.__ratataTest!.getState().player!)
        expect(restored.id).toBe(saved.id)
        expect(restored.inventory).toEqual(saved.inventory)
        expect(restored.equipment).toEqual(saved.equipment)
        expect(restored.position).toEqual(saved.position)
        expect(restored.heroClass).toBe('arcanist')
        await expect(page.getByRole('button', { name: /^2: Искра/ })).toBeVisible()
        await expect(page.getByRole('button', { name: /^3: Искра/ })).toBeVisible()
    })
}

async function expectBottomDock(page: Page, mobile: boolean): Promise<void> {
    const chat = page.locator('.game-chat')
    const hotbar = page.locator('.hotbar-content')
    await expect(page.locator('.hotbar')).toHaveCSS('bottom', '12px')
    await expect(chat).toBeVisible()
    await expect
        .poll(async () => {
            const [chatBox, hotbarBox] = await Promise.all([
                chat.boundingBox(),
                hotbar.boundingBox(),
            ])
            if (!chatBox || !hotbarBox) return false
            const upperEdge = mobile ? hotbarBox.y - 8 : hotbarBox.y + hotbarBox.height
            return Math.abs(chatBox.y + chatBox.height - upperEdge) <= 1
        })
        .toBe(true)
}

async function checkInventoryMenu(page: Page) {
    await page.keyboard.press('Escape')
    const menu = page.getByRole('dialog', { name: 'Игровое меню' })
    const inventoryEntry = menu.getByRole('button', { name: 'Инвентарь · I', exact: true })
    const inventory = page.getByRole('dialog', { name: 'Inventory and equipment' })
    await expect(inventoryEntry).toBeVisible()
    await page.keyboard.press('KeyI')
    await expect(menu).toHaveCount(0)
    await expect(inventory).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(inventory).toHaveCount(0)
    await expect(menu).toHaveCount(0)
    return { menu, inventoryEntry }
}

async function hotbarMenuButton(page: Page): Promise<Locator> {
    await expect(page.getByRole('button', { name: 'Inventory', exact: true })).toHaveCount(0)
    const hotbar = page.getByRole('group', { name: 'Быстрые действия' })
    const frame = hotbar.locator('.hud-frame')
    await expect(frame).toHaveCount(1)
    const menuButton = frame.getByRole('button', { name: 'Игровое меню', exact: true })
    const fourthSlot = frame.getByRole('button', { name: /^4:/ })
    await expect(menuButton).toBeVisible()
    const [slotBounds, menuBounds] = await Promise.all([
        fourthSlot.boundingBox(),
        menuButton.boundingBox(),
    ])
    expect(menuBounds!.x).toBeGreaterThanOrEqual(slotBounds!.x + slotBounds!.width)
    expect(menuBounds!.y).toBeLessThan(slotBounds!.y + slotBounds!.height)
    expect(menuBounds!.y + menuBounds!.height).toBeGreaterThan(slotBounds!.y)
    return menuButton
}
