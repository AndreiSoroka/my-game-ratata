import { expect, type Page, test } from '@playwright/test'

test.describe('inventory food quick slots', () => {
    test.setTimeout(60_000)

    for (const mobile of [false, true]) {
        test(`assigns the focused or selected apple without using it (${mobile ? 'mobile' : 'desktop'})`, async ({
            page,
        }, info) => {
            await page.setViewportSize(
                mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
            )
            await join(page, `apple-${info.project.name}-${mobile}`)
            await expect(
                page
                    .getByLabel('Быстрые действия')
                    .getByRole('button', { name: /^[1-4]:/ })
                    .nth(3)
            ).toHaveAccessibleName(/4: Пусто/)
            await acquireApple(page)
            try {
                await checkAssignment(page)
            } finally {
                // The shared starter chest is finite. Return the real apple for the next case.
                await dropApple(page)
            }
        })
    }
})

async function join(page: Page, name: string) {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(async (name) => window.__ratataTest!.join(name, 'vanguard'), name)
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
}

async function moveTo(page: Page, target: { x: number; y: number }) {
    await page.evaluate((target) => window.__ratataTest!.send({ type: 'move_to', target }), target)
    await expect
        .poll(
            () =>
                page.evaluate((target) => {
                    const player = window.__ratataTest!.getState().player
                    return Boolean(
                        player &&
                        player.path.length === 0 &&
                        Math.hypot(player.position.x - target.x, player.position.y - target.y) < 24
                    )
                }, target),
            { timeout: 20_000 }
        )
        .toBe(true)
}

async function acquireApple(page: Page) {
    const groundApple = await page.evaluate(() =>
        window.__ratataTest!.getState().snapshot?.items.find((item) => item.itemId === 'food')
    )
    if (groundApple) {
        await moveTo(page, groundApple.position)
        await page.evaluate(
            (worldItemId) => window.__ratataTest!.send({ type: 'pickup_item', worldItemId }),
            groundApple.id
        )
    } else {
        const chest = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.chests[0]!
        )
        await moveTo(page, chest.position)
        await page.evaluate(
            (chestId) => window.__ratataTest!.send({ type: 'open_chest', chestId }),
            chest.id
        )
        await expect
            .poll(() =>
                page.evaluate(() =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.chest?.items.some((item) => item.itemId === 'food')
                )
            )
            .toBe(true)
        await page.evaluate(() => {
            const chest = window.__ratataTest!.getState().snapshot!.chest!
            const apple = chest.items.find((item) => item.itemId === 'food')!
            window.__ratataTest!.send({
                type: 'take_chest_item',
                chestId: chest.chestId,
                itemInstanceId: apple.instanceId,
            })
            window.__ratataTest!.send({ type: 'close_chest', chestId: chest.chestId })
        })
    }
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .player?.inventory.some((item) => item.itemId === 'food')
            )
        )
        .toBe(true)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.locator('canvas[data-game-canvas=true]').focus()
}

async function checkAssignment(page: Page) {
    const before = await inventoryAndPosition(page)
    await page.keyboard.press('KeyI')
    const inventory = page.getByRole('dialog', { name: 'Инвентарь и снаряжение' })
    await expect(inventory).toBeVisible()
    const focusedApple = inventory.locator('.inventory-slot[data-filled=true]')
    await expect(focusedApple).toBeFocused()
    await expect(inventory.locator('.inventory-actions')).toHaveCount(0)
    await page.keyboard.press('Shift+Digit4')
    await expect(inventory.getByRole('status')).toContainText('Яблоко назначено в слот 4')
    await expect(
        page
            .getByLabel('Быстрые действия')
            .getByRole('button', { name: /^[1-4]:/ })
            .nth(3)
    ).toHaveAccessibleName(/4: Яблоко/)
    await expect(focusedApple).toBeFocused()
    await expect(inventory.locator('.inventory-actions')).toHaveCount(0)
    expect(await inventoryAndPosition(page)).toEqual(before)
    await page.keyboard.press('Enter')
    const eat = inventory.getByRole('button', { name: 'Съесть', exact: true })
    await expect(eat).toBeFocused()

    await page.keyboard.press('Shift+Digit4')
    await expect(inventory.getByRole('status')).toContainText('Яблоко назначено в слот 4')
    await expect(eat).toBeFocused()
    await page.keyboard.down('Shift')
    await page.keyboard.down('Digit4')
    await page.keyboard.down('Digit4')
    await page.keyboard.up('Digit4')
    await page.keyboard.up('Shift')
    await page.keyboard.press('Digit4')
    await page.keyboard.down('KeyD')
    const tick = await page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick)
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick))
        .toBeGreaterThan(tick + 2)
    await page.keyboard.up('KeyD')
    await expect(eat).toBeFocused()
    expect(await inventoryAndPosition(page)).toEqual(before)
    await expect(page.getByRole('dialog')).toHaveCount(1)

    const assignSecond = inventory.getByRole('button', { name: 'Назначить яблоко в слот 2' })
    await assignSecond.click()
    await expect(inventory.getByRole('status')).toContainText('Яблоко назначено в слот 2')
    await expect(inventory).toBeVisible()
    // Safari does not focus buttons on pointer clicks; keyboard activation must keep focus.
    await assignSecond.focus()
    await page.keyboard.press('Enter')
    await expect(assignSecond).toBeFocused()
    expect(await inventoryAndPosition(page)).toEqual(before)
    await page.keyboard.press('Escape')
    await expect(inventory).toHaveCount(0)
    const canvas = page.locator('canvas[data-game-canvas=true]')
    await expect(canvas).toBeFocused()
    const hotbar = page.getByLabel('Быстрые действия')
    const slots = hotbar.getByRole('button', { name: /^[1-4]:/ })
    for (const index of [1, 3]) {
        await expect(slots.nth(index)).toHaveAccessibleName(new RegExp(`${index + 1}: Яблоко`))
        await expect(slots.nth(index).locator('.hotbar-item')).toBeVisible()
        await expect(slots.nth(index).locator('small')).toHaveText('1')
    }
    expect(await inventoryAndPosition(page)).toEqual(before)

    await hotbar.getByRole('button', { name: 'Очистить слот 4', exact: true }).click()
    await expect(slots.nth(3)).toHaveAccessibleName(/4: Пусто/)
    await expect(canvas).toBeFocused()
    await expect(slots.nth(1)).toHaveAccessibleName(/2: Яблоко/)
    await expect(slots.nth(1).locator('small')).toHaveText('1')
    expect(await inventoryAndPosition(page)).toEqual(before)

    await page.keyboard.press('Shift+Digit2')
    const picker = page.getByRole('dialog', { name: 'Назначить слот 2' })
    await expect(picker).toBeVisible()
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowUp')
    await expect(picker.getByRole('button', { name: 'Очистить слот', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(picker).toHaveCount(0)
    await expect(slots.nth(1)).toHaveAccessibleName(/2: Пусто/)
    await expect(canvas).toBeFocused()
    await expect(slots.nth(3)).toHaveAccessibleName(/4: Пусто/)
    await expect(hotbar.getByRole('button', { name: /^Очистить слот/ })).toHaveCount(1)
    await expect(slots.nth(0)).toHaveAccessibleName(/1: Удар ножом/)
    expect(await inventoryAndPosition(page)).toEqual(before)
}

async function inventoryAndPosition(page: Page) {
    return page.evaluate(() => {
        const player = window.__ratataTest!.getState().player!
        return { inventory: player.inventory, position: player.position }
    })
}

async function dropApple(page: Page) {
    await page.evaluate(() => {
        const apple = window
            .__ratataTest!.getState()
            .player?.inventory.find((item) => item.itemId === 'food')
        if (apple)
            window.__ratataTest!.send({
                type: 'inventory_action',
                action: 'drop',
                itemInstanceId: apple.instanceId,
            })
    })
    await expect
        .poll(() =>
            page.evaluate(() => {
                const state = window.__ratataTest!.getState()
                return (
                    !state.player?.inventory.some((item) => item.itemId === 'food') &&
                    state.snapshot?.items.some((item) => item.itemId === 'food')
                )
            })
        )
        .toBe(true)
}
