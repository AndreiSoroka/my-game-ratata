import { CHEST_CAPACITY, FARM_SUPPLY_CHESTS, type Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

test('regular chest shows the slot limit and updates its count after transfers', async ({
    page,
}) => {
    test.setTimeout(60_000)
    await join(page, 'chest-slots')
    expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(1))).toBe(true)
    const observed = await page.waitForFunction(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.chests.find(
                ({ kind, itemCount }) => (kind === undefined || kind === 'chest') && itemCount > 0
            )
    )
    const chest = (await observed.jsonValue())!
    expect(chest).not.toHaveProperty('capacity')
    const { opened, panel, heading } = await openChest(page, chest)
    const item = opened.items[0]!
    await panel.locator(`[data-dialog-action="chest:${item.instanceId}"]`).click()
    await expect(heading).toHaveText(`Сундук ${opened.items.length - 1} / ${CHEST_CAPACITY}`)

    await panel.locator(`[data-dialog-action="bag:${item.instanceId}"]`).click()
    await expect(heading).toHaveText(`Сундук ${opened.items.length} / ${CHEST_CAPACITY}`)
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
})

test('farm supply chest shows the same slot limit on mobile', async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await join(page, 'farm-chest-slots')
    const journey = await page.evaluate(() =>
        window.__ratataTest!.travel('north', { timeoutMs: 30_000 })
    )
    expect(journey.status, journey.reason).toBe('arrived')
    const chest = FARM_SUPPLY_CHESTS.find(({ locationId }) => locationId === journey.locationId)
    expect(chest).toBeDefined()
    const { opened } = await openChest(page, chest!)
    expect(opened.items.every(({ itemId }) => itemId === 'wheat_seed')).toBe(true)
})

async function join(page: Page, name: string): Promise<void> {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate((name) => window.__ratataTest!.join(name, 'vanguard'), name)
    await page.waitForFunction(() => {
        const state = window.__ratataTest!.getState()
        return state.mapReady && state.player && state.snapshot
    })
}

async function openChest(page: Page, chest: { id: string; position: Vector2 }) {
    const navigation = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 20_000, tolerance: 20 }),
        chest.position
    )
    expect(navigation.status, navigation.reason).toBe('arrived')
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'open_chest', chestId },
                { until: { type: 'chest', chestId } }
            ),
        chest.id
    )
    expect(result.status, result.reason).toBe('condition_met')
    const opened = await page.evaluate(() => window.__ratataTest!.getState().snapshot!.chest!)
    const panel = page.getByRole('dialog', { name: 'Рюкзак и сундук' })
    const heading = panel.getByRole('heading', { name: /^Сундук / })
    expect(opened.capacity).toBe(CHEST_CAPACITY)
    await expect(heading).toHaveText(`Сундук ${opened.items.length} / ${CHEST_CAPACITY}`)
    return { opened, panel, heading }
}
