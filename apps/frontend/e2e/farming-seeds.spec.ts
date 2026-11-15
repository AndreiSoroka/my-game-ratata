import { FARM_SUPPLY_CHESTS, quoteMarketTrade } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

const farmDirections: Record<string, 'north' | 'east' | 'west'> = {
    chromium: 'north',
    firefox: 'east',
    webkit: 'west',
}

for (const mobile of [false, true]) {
    test(`buys a real wheat seed and spends it once when sowing (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(180_000)
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => window.__ratataTest!.join(name, 'vanguard'),
            `seeds-${info.project.name}-${mobile}`
        )
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible()
        expect(await seedCount(page)).toBe(0)
        await gatherBrushwood(page)
        await buySeed(page)
        expect(await seedCount(page)).toBe(1)
        const direction = farmDirections[info.project.name]!
        const journey = await page.evaluate(
            (direction) => window.__ratataTest!.travel(direction, { timeoutMs: 30_000 }),
            direction
        )
        expect(journey.status, journey.reason).toBe('arrived')
        const bare = await page.evaluate(() =>
            window
                .__ratataTest!.getState()
                .snapshot!.adventure!.farmPlots.find((plot) => plot.phase === 'bare')
        )
        expect(bare).toBeDefined()
        expect(
            (
                await page.evaluate(
                    (position) =>
                        window.__ratataTest!.navigate(position, {
                            timeoutMs: 20_000,
                            tolerance: 32,
                        }),
                    bare!.position
                )
            ).status
        ).toBe('arrived')
        const droppedId = await dropSeed(page)
        expect(droppedId).toBeDefined()
        expect(await seedCount(page)).toBe(0)
        const rejected = await page.evaluate(async (plotId) => {
            const api = window.__ratataTest!
            const action = api.observe().targets.find((target) => target.key === `farm:${plotId}`)
                ?.actions[0]
            const before = api.getState().snapshot!.adventure!.noticeId ?? -1
            await api.act(
                { type: 'farm_action', plotId, action: 'sow' },
                { until: { type: 'notice', after: before } }
            )
            return {
                action,
                plot: api
                    .getState()
                    .snapshot!.adventure!.farmPlots.find((plot) => plot.id === plotId),
                notice: api.getState().snapshot!.adventure!.notice,
            }
        }, bare!.id)
        expect(rejected.action?.disabled).toBe(true)
        expect(rejected.action?.label).toContain('в рюкзаке: 0 · нет семян')
        expect(rejected.notice).toContain('сем')
        expect(rejected.plot?.phase).toBe('bare')
        expect(await seedCount(page)).toBe(0)
        const pickup = await page.evaluate(
            (worldItemId) =>
                window.__ratataTest!.act(
                    { type: 'pickup_item', worldItemId },
                    { until: { type: 'inventory', itemId: 'wheat_seed', atLeast: 1 } }
                ),
            droppedId!
        )
        expect(pickup.status).toBe('condition_met')
        const sow = await page.evaluate(async (plotId) => {
            const api = window.__ratataTest!
            const notice = api.getState().snapshot!.adventure!.noticeId ?? -1
            const action = api.observe().targets.find((target) => target.key === `farm:${plotId}`)
                ?.actions[0]
            await api.act(
                { type: 'farm_action', plotId, action: 'sow' },
                { until: { type: 'notice', after: notice } }
            )
            const state = api.getState()
            return {
                action,
                plot: state.snapshot!.adventure!.farmPlots.find((plot) => plot.id === plotId),
                notice: state.snapshot!.adventure!.notice,
            }
        }, bare!.id)
        expect(sow.action?.label).toContain('1 семя · 5 EN · в рюкзаке: 1')
        expect(sow.plot?.phase, sow.notice ?? 'No sowing result').toBe('growing')
        expect(await seedCount(page)).toBe(0)
        await inspectFarmChest(page)
        await page.screenshot({
            path: info.outputPath(`farming-seeds-${mobile ? 'mobile' : 'desktop'}.png`),
        })
    })
}

async function seedCount(page: Page): Promise<number> {
    return page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .player!.inventory.reduce(
                (total, item) => total + (item.itemId === 'wheat_seed' ? (item.quantity ?? 1) : 0),
                0
            )
    )
}

async function gatherBrushwood(page: Page): Promise<void> {
    for (let count = 1; count <= 2; count += 1) {
        const result = await page.evaluate(async (count) => {
            const api = window.__ratataTest!
            const state = api.getState()
            const source = state
                .snapshot!.adventure!.resourceNodes.filter(
                    (node) => node.source === 'branches' && node.phase === 'ready'
                )
                .sort(
                    (first, second) =>
                        Math.hypot(
                            first.position.x - state.player!.position.x,
                            first.position.y - state.player!.position.y
                        ) -
                        Math.hypot(
                            second.position.x - state.player!.position.x,
                            second.position.y - state.player!.position.y
                        )
                )[0]
            if (source === undefined) throw new Error('No brushwood source remains')
            const approach = await api.navigate(
                { targetKey: `resource:${source.id}` },
                { timeoutMs: 20_000 }
            )
            if (approach.status !== 'arrived') return approach.status
            return (
                await api.act(
                    { type: 'auto_action', action: { kind: 'gather', nodeId: source.id } },
                    { until: { type: 'inventory', itemId: 'brushwood', atLeast: count } }
                )
            ).status
        }, count)
        expect(result).toBe('condition_met')
    }
}

async function buySeed(page: Page): Promise<void> {
    const shop = await page.evaluate(() =>
        window
            .__ratataTest!.observe()
            .targets.find((target) => target.kind === 'building' && target.name.includes('Лавка'))
    )
    expect(shop).toBeDefined()
    expect(
        (
            await page.evaluate(
                (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 20_000 }),
                shop!.key
            )
        ).status
    ).toBe('arrived')
    const merchant = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.characters.find((actor) => actor.id === 'npc_merchant_1')
    )
    expect(merchant).toBeDefined()
    expect(
        (
            await page.evaluate(
                (position) =>
                    window.__ratataTest!.navigate(position, { timeoutMs: 10_000, tolerance: 20 }),
                merchant!.position
            )
        ).status
    ).toBe('arrived')
    const wood = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.market!.rows.find((row) => row.itemId === 'brushwood')!
    )
    const total = quoteMarketTrade(wood, 'sell', 2)
    expect(total).not.toBeNull()
    const sold = await page.evaluate(async (total) => {
        const api = window.__ratataTest!
        const before = api.getState().snapshot!.adventure!.gold
        const notice = api.getState().snapshot!.adventure!.noticeId ?? -1
        await api.act(
            {
                type: 'market_trade',
                npcId: 'npc_merchant_1',
                side: 'sell',
                itemId: 'brushwood',
                quantity: 2,
                expectedTotal: total!,
                requestId: 'farming-sell-wood',
            },
            { until: { type: 'notice', after: notice } }
        )
        return api.getState().snapshot!.adventure!.gold - before
    }, total)
    expect(sold).toBe(total)
    expect(
        await page.evaluate(async () => {
            const api = window.__ratataTest!
            const row = api
                .getState()
                .snapshot!.adventure!.market!.rows.find((row) => row.itemId === 'wheat_seed')!
            return (
                await api.act(
                    {
                        type: 'market_trade',
                        npcId: 'npc_merchant_1',
                        side: 'buy',
                        itemId: 'wheat_seed',
                        quantity: 1,
                        expectedTotal: row.buyPrice!,
                        requestId: 'farming-buy-seed',
                    },
                    { until: { type: 'inventory', itemId: 'wheat_seed', atLeast: 1 } }
                )
            ).status
        })
    ).toBe('condition_met')
}

async function inspectFarmChest(page: Page): Promise<void> {
    const locationId = await page.evaluate(() => window.__ratataTest!.getState().location!.id)
    const chest = FARM_SUPPLY_CHESTS.find((chest) => chest.locationId === locationId)!
    expect(chest).toBeDefined()
    const navigation = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 10_000, tolerance: 20 }),
        chest.position
    )
    expect(navigation.status, navigation.reason).toBe('arrived')
    const contents = await page.evaluate(async (chestId) => {
        const api = window.__ratataTest!
        await api.act({ type: 'open_chest', chestId }, { until: { type: 'chest', chestId } })
        const first = api.getState().snapshot!.chest!.items
        await api.act({ type: 'close_chest', chestId }, { until: { type: 'chest', chestId: null } })
        await api.act({ type: 'open_chest', chestId }, { until: { type: 'chest', chestId } })
        return { first, second: api.getState().snapshot!.chest!.items }
    }, chest.id)
    expect(contents.second).toEqual(contents.first)
    expect(contents.first.every((item) => item.itemId === 'wheat_seed')).toBe(true)
    const count = contents.first.reduce((total, item) => total + (item.quantity ?? 1), 0)
    expect([0, 2, 3, 4]).toContain(count)
    expect(await seedCount(page)).toBe(0)
}

async function dropSeed(page: Page): Promise<string | undefined> {
    return page.evaluate(async () => {
        const api = window.__ratataTest!
        const before = new Set(api.getState().snapshot!.items.map((item) => item.id))
        const seed = api.getState().player!.inventory.find((item) => item.itemId === 'wheat_seed')!
        await api.act({
            type: 'inventory_action',
            action: 'drop',
            itemInstanceId: seed.instanceId,
        })
        return api
            .getState()
            .snapshot!.items.find((item) => item.itemId === 'wheat_seed' && !before.has(item.id))
            ?.id
    })
}
