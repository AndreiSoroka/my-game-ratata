import type { ServerMessage, WorldSnapshot } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

test.describe('inventory equipment keyboard focus', () => {
    test.setTimeout(60_000)

    for (const mobile of [false, true]) {
        test(`returns to the original slot after equipping (${mobile ? 'mobile' : 'desktop'})`, async ({
            page,
        }, info) => {
            const initialSnapshot = captureInitialSnapshot(page)
            await page.setViewportSize(
                mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
            )
            await page.goto('/?test=1')
            await page.waitForFunction(() => Boolean(window.__ratataTest))
            await page.evaluate(
                async (name) => window.__ratataTest!.join(name, 'vanguard'),
                `equip-${info.project.name}-${mobile}`
            )
            await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
            await acquireBoots(page, initialSnapshot())
            try {
                await checkKeyboardEquip(page)
            } finally {
                // Keep the same real item available for the next viewport/browser case.
                await returnBoots(page)
            }
        })
    }
})

async function checkKeyboardEquip(page: Page) {
    const before = await page.evaluate(() => window.__ratataTest!.getState().player!)
    const boots = before.inventory.find((item) => item.itemId === 'boots')!
    const index = before.inventory.indexOf(boots)
    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('KeyI')
    const inventory = page.getByRole('dialog', { name: 'Инвентарь и снаряжение' })
    const slots = inventory.locator('.inventory-slot')
    await expect(slots.nth(index)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(inventory.getByRole('button', { name: 'Надеть', exact: true })).toBeFocused()
    await page.keyboard.down('Enter')
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().player?.equipment.boots?.instanceId)
        )
        .toBe(boots.instanceId)
    await expect(inventory.locator('.inventory-actions')).toHaveCount(0)
    await expect(slots.nth(index)).toBeFocused()
    await expect(slots.nth(index)).toHaveAccessibleName(`Пустая ячейка ${index + 1}`)

    // A held confirmation must not open/activate whatever now occupies the old slot.
    await page.keyboard.down('Enter')
    await page.keyboard.up('Enter')
    await expect(slots.nth(index)).toBeFocused()
    await expect(inventory.locator('.inventory-actions')).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await expect(slots.nth(index + 1)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(slots.nth(index)).toBeFocused()
    const stationaryPosition = await page.evaluate(
        () => window.__ratataTest!.getState().player?.position
    )
    await page.keyboard.down('KeyD')
    const tick = await page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick)
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot!.tick))
        .toBeGreaterThan(tick + 2)
    await page.keyboard.up('KeyD')
    expect(await page.evaluate(() => window.__ratataTest!.getState().player?.position)).toEqual(
        stationaryPosition
    )
    await expect(slots.nth(index)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(inventory).toHaveCount(0)
    await expect(page.locator('canvas[data-game-canvas=true]')).toBeFocused()
}

/** Keep objects disclosed at join before the camera narrows the server's view. */
function captureInitialSnapshot(page: Page): () => WorldSnapshot | undefined {
    let initial: WorldSnapshot | undefined
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(String(payload)) as ServerMessage
            if (message.type === 'world_init') initial = message.snapshot
        })
    })
    return () => initial
}

async function acquireBoots(page: Page, initial: WorldSnapshot | undefined) {
    const ground =
        (await page.evaluate(() =>
            window.__ratataTest!.getState().snapshot?.items.find((item) => item.itemId === 'boots')
        )) ?? initial?.items.find((item) => item.itemId === 'boots')
    if (ground) {
        await moveTo(page, ground.position)
        await page.evaluate(
            (worldItemId) => window.__ratataTest!.send({ type: 'pickup_item', worldItemId }),
            ground.id
        )
    } else {
        const fiber =
            (await page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .snapshot!.adventure!.resourceNodes.find((node) => node.kind === 'fiber')
            )) ?? initial?.adventure?.resourceNodes.find((node) => node.kind === 'fiber')
        expect(fiber).toBeDefined()
        await moveTo(page, fiber!.position)
        await expect
            .poll(async () => {
                return page.evaluate((nodeId) => {
                    const count = window
                        .__ratataTest!.getState()
                        .player!.inventory.filter((item) => item.itemId === 'fiber').length
                    if (count < 3) window.__ratataTest!.send({ type: 'gather', nodeId })
                    return count
                }, fiber!.id)
            })
            .toBe(3)
        await page.locator('canvas[data-game-canvas=true]').focus()
        await page.keyboard.press('KeyP')
        const character = page.getByRole('dialog', { name: 'Персонаж', exact: true })
        await character.getByRole('tab', { name: 'Ремесло', exact: true }).click()
        await character
            .getByRole('article')
            .filter({ hasText: 'Сплести сапоги' })
            .getByRole('button', { name: 'Создать', exact: true })
            .click()
        await page.keyboard.press('Escape')
        await expect(character).toHaveCount(0)
    }
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .player?.inventory.some((item) => item.itemId === 'boots')
            )
        )
        .toBe(true)
}

async function moveTo(page: Page, target: { x: number; y: number }) {
    const issuedTick = await page.evaluate((target) => {
        const tick = window.__ratataTest!.getState().snapshot!.tick
        window.__ratataTest!.send({ type: 'move_to', target })
        return tick
    }, target)
    await expect
        .poll(
            () =>
                page.evaluate(
                    ({ target, issuedTick }) => {
                        const state = window.__ratataTest!.getState()
                        const player = state.player
                        return Boolean(
                            player &&
                            state.snapshot!.tick >= issuedTick + 2 &&
                            player.path.length === 0 &&
                            Math.hypot(player.position.x - target.x, player.position.y - target.y) <
                                24
                        )
                    },
                    { target, issuedTick }
                ),
            { timeout: 20_000 }
        )
        .toBe(true)
}

async function returnBoots(page: Page) {
    await page.evaluate(() =>
        window.__ratataTest!.send({ type: 'equipment_action', action: 'unequip', slot: 'boots' })
    )
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .player?.inventory.some((item) => item.itemId === 'boots')
            )
        )
        .toBe(true)
    await page.evaluate(() => {
        const boots = window
            .__ratataTest!.getState()
            .player!.inventory.find((item) => item.itemId === 'boots')!
        window.__ratataTest!.send({
            type: 'inventory_action',
            action: 'drop',
            itemInstanceId: boots.instanceId,
        })
    })
    await expect
        .poll(() =>
            page.evaluate(() =>
                window
                    .__ratataTest!.getState()
                    .snapshot?.items.some((item) => item.itemId === 'boots')
            )
        )
        .toBe(true)
}
