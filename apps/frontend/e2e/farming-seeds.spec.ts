import { FARM_PLOTS, FARM_SUPPLY_CHESTS, quoteMarketTrade } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { waitForBrushwood } from './world-navigation'

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
        await waitForBrushwood(page, mobile)
        await gatherBrushwood(page)
        await buySeed(page)
        expect(await seedCount(page)).toBe(1)
        const bare = await approachBarePlot(page, info.project.name)
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
        }, bare.id)
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
        expect(await lifeUnlocked(page)).toBe(false)
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
        }, bare.id)
        expect(sow.action?.label).toContain('1 семя · 5 EN · в рюкзаке: 1')
        expect(sow.plot?.phase, sow.notice ?? 'No sowing result').toBe('growing')
        expect(await seedCount(page)).toBe(0)
        await expect.poll(() => lifeUnlocked(page)).toBe(true)
        await inspectFarmChest(page)
        await page.screenshot({
            path: info.outputPath(`farming-seeds-${mobile ? 'mobile' : 'desktop'}.png`),
        })
    })
}

async function approachBarePlot(page: Page, projectName: string) {
    const journey = await page.evaluate(
        (direction) => window.__ratataTest!.travel(direction, { timeoutMs: 30_000 }),
        farmDirections[projectName]!
    )
    expect(journey.status, journey.reason).toBe('arrived')
    const approachPlot = FARM_PLOTS.find((plot) => plot.locationId === journey.locationId)
    expect(approachPlot).toBeDefined()
    const farm = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 25_000, tolerance: 32 }),
        approachPlot!.position
    )
    expect(farm.status, farm.reason).toBe('arrived')
    await page.waitForFunction(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.farmPlots.some((plot) => plot.phase === 'bare')
    )
    const bare = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.farmPlots.find((plot) => plot.phase === 'bare')
    )
    expect(bare).toBeDefined()
    const approach = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 20_000, tolerance: 32 }),
        bare!.position
    )
    expect(approach.status, approach.reason).toBe('arrived')
    return bare!
}

async function lifeUnlocked(page: Page): Promise<boolean | undefined> {
    return page.evaluate(
        () =>
            window
                .__ratataTest!.getState()
                .player?.progression?.constellations?.paths.find((path) => path.id === 'life')
                ?.unlocked
    )
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
            const skipped: string[] = []
            const readNode = (id: string) => {
                const node = api
                    .getState()
                    .snapshot!.adventure!.resourceNodes.find((entry) => entry.id === id)
                return node === undefined
                    ? null
                    : {
                          id: node.id,
                          phase: node.phase,
                          remaining: node.remaining,
                          position: node.position,
                      }
            }
            const facts = () => {
                const state = api.getState()
                return {
                    tick: state.snapshot?.tick,
                    position: state.player?.position,
                    control: state.player?.control,
                    inventorySlots: state.player?.inventory.length,
                    brushwood: state.player?.inventory
                        .filter((item) => item.itemId === 'brushwood')
                        .reduce((sum, item) => sum + (item.quantity ?? 1), 0),
                    noticeId: state.snapshot?.adventure?.noticeId,
                    notice: state.snapshot?.adventure?.notice,
                }
            }
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const state = api.getState()
                const source = state
                    .snapshot!.adventure!.resourceNodes.filter(
                        (node) =>
                            node.source === 'branches' &&
                            node.phase === 'ready' &&
                            node.remaining > 0 &&
                            !skipped.includes(node.id)
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
                if (source === undefined)
                    return {
                        status: 'unavailable',
                        reason: 'No fresh brushwood source remains',
                        skipped,
                        after: facts(),
                    }
                const selected = readNode(source.id)
                const approach = await api.navigate(
                    { targetKey: `resource:${source.id}` },
                    { timeoutMs: 20_000, tolerance: 12 }
                )
                const current = readNode(source.id)
                // Sources are shared and finite. Reselect only when the observed
                // source was consumed before submitting our gathering command.
                if (current === null || current.phase !== 'ready' || current.remaining < 1) {
                    skipped.push(source.id)
                    continue
                }
                if (approach.status !== 'arrived')
                    return {
                        status: approach.status,
                        reason: approach.reason,
                        selected,
                        current,
                        skipped,
                        after: facts(),
                    }
                const before = facts()
                const action = await api.act(
                    { type: 'auto_action', action: { kind: 'gather', nodeId: source.id } },
                    { until: { type: 'inventory', itemId: 'brushwood', atLeast: count } }
                )
                return {
                    status: action.status,
                    reason: action.reason,
                    elapsedMs: action.elapsedMs,
                    selected,
                    atCommand: current,
                    finalSource: readNode(source.id),
                    skipped,
                    before,
                    after: facts(),
                }
            }
            return {
                status: 'unavailable',
                reason: 'Three source choices changed before gathering',
                skipped,
                after: facts(),
            }
        }, count)
        expect(result.status, JSON.stringify(result)).toBe('condition_met')
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
    const before = await page.evaluate(async () => {
        const api = window.__ratataTest!
        const before = api.getState().snapshot!.items.map((item) => item.id)
        const seed = api.getState().player!.inventory.find((item) => item.itemId === 'wheat_seed')!
        await api.act({
            type: 'inventory_action',
            action: 'drop',
            itemInstanceId: seed.instanceId,
        })
        return before
    })
    let droppedId: string | undefined
    await expect
        .poll(
            async () => {
                const observed = await page.evaluate((before) => {
                    const state = window.__ratataTest!.getState()
                    const previous = new Set(before)
                    return {
                        seeds: state.player!.inventory.reduce(
                            (sum, item) =>
                                sum + (item.itemId === 'wheat_seed' ? (item.quantity ?? 1) : 0),
                            0
                        ),
                        droppedId: state.snapshot!.items.find(
                            (item) => item.itemId === 'wheat_seed' && !previous.has(item.id)
                        )?.id,
                    }
                }, before)
                droppedId = observed.droppedId
                return observed
            },
            { timeout: 5_000 }
        )
        .toEqual({ seeds: 0, droppedId: expect.any(String) })
    return droppedId
}
