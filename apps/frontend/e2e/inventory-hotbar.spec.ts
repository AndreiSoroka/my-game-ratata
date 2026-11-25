import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { captureInitialSnapshot } from './world-navigation'

const appleChestId = 'chest_forest_1'

test.describe('inventory food quick slots', () => {
    test.setTimeout(60_000)

    for (const mobile of [false, true]) {
        test(`assigns the focused or selected apple without using it (${mobile ? 'mobile' : 'desktop'})`, async ({
            page,
        }, info) => {
            const initialSnapshot = captureInitialSnapshot(page)
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
            const appleId = await takeApple(page, initialSnapshot())
            try {
                await closeAppleChest(page)
                await page.locator('canvas[data-game-canvas=true]').focus()
                await checkAssignment(page)
            } finally {
                await returnApple(page, appleId)
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

async function takeApple(page: Page, initial: WorldSnapshot | undefined): Promise<string> {
    const chest = initial?.chests.find(({ id }) => id === appleChestId)
    expect(chest, 'The starter chest was disclosed at join').toBeDefined()
    const arrival = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { tolerance: 20, timeoutMs: 25_000 }),
        chest!.position
    )
    expect(arrival.status, arrival.reason).toBe('arrived')
    await openAppleChest(page)
    const apple = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.chest!.items.find(({ itemId }) => itemId === 'food')
    )
    expect(apple, 'The starter chest contains an apple').toBeDefined()
    const taken = await page.evaluate(
        ({ chestId, itemInstanceId }) =>
            window.__ratataTest!.act(
                { type: 'take_chest_item', chestId, itemInstanceId },
                { until: { type: 'inventory', itemId: 'food', atLeast: 1 } }
            ),
        { chestId: appleChestId, itemInstanceId: apple!.instanceId }
    )
    expect(taken.status, taken.reason).toBe('condition_met')
    return apple!.instanceId
}

async function openAppleChest(page: Page) {
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'open_chest', chestId },
                { until: { type: 'chest', chestId } }
            ),
        appleChestId
    )
    expect(result.status, result.reason).toBe('condition_met')
}

async function closeAppleChest(page: Page) {
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'close_chest', chestId },
                { until: { type: 'chest', chestId: null } }
            ),
        appleChestId
    )
    expect(result.status, result.reason).toBe('condition_met')
    await expect(page.getByRole('dialog', { name: 'Рюкзак и сундук' })).toHaveCount(0)
}

async function returnApple(page: Page, itemInstanceId: string) {
    await openAppleChest(page)
    await page.evaluate(
        ({ chestId, itemInstanceId }) =>
            window.__ratataTest!.send({ type: 'put_chest_item', chestId, itemInstanceId }),
        { chestId: appleChestId, itemInstanceId }
    )
    await expect
        .poll(() =>
            page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot?.chest?.items.some(({ instanceId }) => instanceId === id),
                itemInstanceId
            )
        )
        .toBe(true)
    await closeAppleChest(page)
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
