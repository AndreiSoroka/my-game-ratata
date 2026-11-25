import type { AdventureResourceNode } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { expectEchoReconnect } from './echo-reconnect'
import { joinSocial, socialMenu } from './social-helpers'
import { captureInitialSnapshot, enterBuilding, walkTo } from './world-navigation'

const merchantId = 'npc_merchant_1'

test('buys, equips, swaps and unequips portable lights through the shop and inventory', async ({
    page,
}) => {
    test.setTimeout(150_000)
    await page.setViewportSize({ width: 1280, height: 800 })
    const initialSnapshot = captureInitialSnapshot(page)
    await joinSocial(page, 'portable-light-buyer')
    await page.addStyleTag({ content: '.test-panel { display: none !important }' })

    const supplies = await collectSupplies(page, initialSnapshot()?.adventure?.resourceNodes ?? [])
    await enterBuilding(page, 'Лавка')
    await page.waitForFunction(
        (id) => window.__ratataTest!.observe().targets.some((target) => target.id === id),
        merchantId
    )
    const merchant = await page.evaluate(
        (id) => window.__ratataTest!.observe().targets.find((target) => target.id === id)!,
        merchantId
    )
    await walkTo(page, merchant.position, 20)
    await socialMenu(page, merchantId, /^Купить:/u)

    const shop = page.getByRole('dialog', { name: /^Товары · /u })
    const marketRow = (name: string) =>
        shop.locator('.market-row').filter({ has: page.getByText(name, { exact: true }) })
    const quantity = shop.getByRole('spinbutton')
    await shop.getByRole('tab', { name: 'Продать' }).click()
    for (const { name, quantity: amount } of supplies) {
        await quantity.fill(String(amount))
        await marketRow(name)
            .getByRole('button', { name: /^Продать /u })
            .click()
    }
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot!.adventure!.gold))
        .toBeGreaterThanOrEqual(13)
    await shop.getByRole('tab', { name: 'Купить' }).click()
    await quantity.fill('1')
    await marketRow('Факел').getByRole('button', { name: 'Купить 1 · 3 ◈' }).click()
    await marketRow('Фонарь').getByRole('button', { name: 'Купить 1 · 10 ◈' }).click()
    await expect
        .poll(() =>
            page.evaluate(() =>
                window.__ratataTest!.getState().player!.inventory.map((item) => item.itemId)
            )
        )
        .toEqual(['torch', 'lantern'])
    expect(
        await page.evaluate(() => window.__ratataTest!.getState().player!.lightSource)
    ).toBeUndefined()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    await expect(shop).toHaveCount(0)

    await page.locator('canvas[data-game-canvas=true]').focus()
    await page.keyboard.press('KeyI')
    const bag = page.getByRole('dialog', { name: 'Инвентарь и снаряжение' })
    const lightSlot = bag.locator('[data-equipment-slot="light"]')
    await expect(lightSlot).toHaveAccessibleName('Свет')
    const light = () => page.evaluate(() => window.__ratataTest!.getState().player?.lightSource)
    for (const [itemId, label] of [
        ['torch', 'Факел'],
        ['lantern', 'Фонарь'],
    ] as const) {
        await bag.getByRole('button', { name: label, exact: true }).click()
        await bag.getByRole('button', { name: 'Надеть', exact: true }).click()
        await expect.poll(light).toBe(itemId)
        await expect(lightSlot.getByRole('img', { name: label })).toBeVisible()
    }
    await expect(bag.getByRole('button', { name: 'Факел', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(bag).toHaveCount(0)
    await expectEchoReconnect(page)
    await page.keyboard.press('KeyI')
    await expect(bag).toBeVisible()
    await lightSlot.click()
    await expect.poll(light).toBeUndefined()
    await expect(lightSlot).toHaveAccessibleName('Свет')
    await expect(bag.getByRole('button', { name: 'Фонарь', exact: true })).toBeVisible()
})

async function collectSupplies(page: Page, sources: readonly AdventureResourceNode[]) {
    // Each accepted unit sells for at least one gold, even while the city's stock changes.
    const supplies: { name: string; quantity: number }[] = []
    let unearned = 13
    for (const [kind, name, limit] of [
        ['scrap', 'Металлический лом', 6],
        ['herbs', 'Лечебные травы', 7],
        ['fiber', 'Волокно', 4],
    ] as const) {
        const source = sources.find((node) => node.kind === kind)
        const quantity = Math.min(unearned, limit, source?.remaining ?? 0)
        if (source === undefined || quantity === 0) continue
        await collectForSale(page, source, quantity)
        supplies.push({ name, quantity })
        unearned -= quantity
    }
    expect(unearned).toBe(0)
    return supplies
}

async function collectForSale(page: Page, node: AdventureResourceNode, quantity: number) {
    await walkTo(page, node.position, 20)
    await expect
        .poll(() =>
            page.evaluate(
                (nodeId) =>
                    window
                        .__ratataTest!.getState()
                        .snapshot!.adventure!.resourceNodes.find((entry) => entry.id === nodeId)
                        ?.remaining ?? 0,
                node.id
            )
        )
        .toBeGreaterThanOrEqual(quantity)
    const collected = await page.evaluate(
        async ({ nodeId, itemId, quantity }) => {
            const api = window.__ratataTest!
            const result = await api.act(
                { type: 'auto_action', action: { kind: 'gather', nodeId } },
                { until: { type: 'inventory', itemId, atLeast: quantity }, timeoutMs: 15_000 }
            )
            api.send({ type: 'cancel_control' })
            return result.status
        },
        { nodeId: node.id, itemId: node.kind, quantity }
    )
    expect(collected).toBe('condition_met')
}
