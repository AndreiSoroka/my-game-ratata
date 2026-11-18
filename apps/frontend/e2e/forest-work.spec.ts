import type { PlantTreePreview } from '@my-game-ratata/contracts'
import { expect, type Page, test, type TestInfo } from '@playwright/test'

// Finite shared sources can require a second approach around an entire building.
const resourceNavigationTimeoutMs = 40_000
// Two resource approaches, the shop/merchant/return legs and the planting checks.
const forestScenarioTimeoutMs = 240_000

for (const mobile of [false, true]) {
    test(`selects planting from any slot with zero saplings and collects a pinned forest source (${mobile ? 'mobile' : 'desktop'})`, async ({
        page,
    }, info) => {
        test.setTimeout(forestScenarioTimeoutMs)
        const previews: PlantTreePreview[] = []
        page.on('websocket', (socket) =>
            socket.on('framereceived', (frame) => {
                if (typeof frame.payload !== 'string') return
                const message = JSON.parse(frame.payload) as { type?: string }
                if (message.type === 'plant_tree_preview')
                    previews.push(message as PlantTreePreview)
            })
        )
        await page.setViewportSize(
            mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }
        )
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            async (name) => window.__ratataTest!.join(name, 'vanguard'),
            `forest-${info.project.name}-${mobile}`
        )
        const canvas = page.locator('canvas[data-game-canvas=true]')
        await expect(canvas).toBeVisible()
        await collapseTestControls(page)
        await verifySaplingBindings(page)
        const source = await page.evaluate(() => {
            const state = window.__ratataTest!.getState()
            return state
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
        })
        expect(source).toBeDefined()
        const navigation = await approachForestSource(page, source!.id)
        expect(navigation.status, JSON.stringify(navigation)).toBe('arrived')
        const result = await page.evaluate(async (nodeId) => {
            const api = window.__ratataTest!
            const before = {
                position: api.getState().player!.position,
                source: api
                    .getState()
                    .snapshot!.adventure!.resourceNodes.find((node) => node.id === nodeId),
                actions: api.observe().targets.find((target) => target.key === `resource:${nodeId}`)
                    ?.actions,
            }
            const action = await api.act(
                { type: 'auto_action', action: { kind: 'gather', nodeId, operation: 'harvest' } },
                { until: { type: 'inventory', itemId: 'brushwood', atLeast: 1 }, timeoutMs: 5_000 }
            )
            const state = api.getState()
            return {
                status: action.status,
                reason: action.reason,
                elapsedMs: action.elapsedMs,
                before,
                after: {
                    position: state.player!.position,
                    control: state.player!.control,
                    inventory: state.player!.inventory,
                    source: state.snapshot!.adventure!.resourceNodes.find(
                        (node) => node.id === nodeId
                    ),
                    noticeId: state.snapshot!.adventure!.noticeId,
                    notice: state.snapshot!.adventure!.notice,
                },
            }
        }, source!.id)
        expect(result.status, JSON.stringify(result)).toBe('condition_met')
        await expect
            .poll(() =>
                page.evaluate(
                    (id) =>
                        window
                            .__ratataTest!.getState()
                            .snapshot!.adventure!.resourceNodes.find((node) => node.id === id)
                            ?.phase,
                    source!.id
                )
            )
            .toBe('removed')
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().player?.control?.mode))
            .toBe('none')
        await verifyPlantingForChromium(page, info, source!.position, previews)
        await page.screenshot({
            path: info.outputPath(`forest-${mobile ? 'mobile' : 'desktop'}.png`),
        })
    })
}

async function verifyPlantingForChromium(
    page: Page,
    info: TestInfo,
    position: { x: number; y: number },
    previews: PlantTreePreview[]
): Promise<void> {
    if (info.project.name !== 'chromium') return
    await acquireSapling(page)
    const back = await page.evaluate(
        (position) => window.__ratataTest!.navigate(position, { timeoutMs: 20_000 }),
        position
    )
    expect(back.status).toBe('arrived')
    await plantAndCancel(page, 4, previews)
}

async function collapseTestControls(page: Page): Promise<void> {
    const toggle = page
        .getByRole('complementary', { name: 'Game test controls' })
        .getByRole('button', { name: /Test controls/ })
    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
}

async function acquireSapling(page: Page): Promise<void> {
    await acquireSecondBrushwood(page)
    const shop = await page.evaluate(() =>
        window
            .__ratataTest!.observe()
            .targets.find((target) => target.kind === 'building' && target.name.includes('Лавка'))!
    )
    expect(shop).toBeDefined()
    expect(
        (
            await page.evaluate(
                (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 20_000 }),
                shop.key
            )
        ).status
    ).toBe('arrived')
    const merchant = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.characters.find((actor) => actor.id === 'npc_merchant_1')!
    )
    expect(merchant).toBeDefined()
    expect(
        (
            await page.evaluate(
                (position) =>
                    window.__ratataTest!.navigate(position, { timeoutMs: 10_000, tolerance: 20 }),
                merchant.position
            )
        ).status
    ).toBe('arrived')
    for (let index = 0; index < 2; index += 1) {
        const result = await page.evaluate(async (index) => {
            const api = window.__ratataTest!
            const before = api.getState().snapshot!.adventure!.gold
            const receipt = api.getState().snapshot!.adventure!.noticeId ?? -1
            const price = api
                .getState()
                .snapshot!.adventure!.market!.rows.find(
                    (row) => row.itemId === 'brushwood'
                )!.sellPrice!
            await api.act(
                {
                    type: 'market_trade',
                    npcId: 'npc_merchant_1',
                    side: 'sell',
                    itemId: 'brushwood',
                    quantity: 1,
                    expectedTotal: price,
                    requestId: `forest-sell-${index}`,
                },
                { until: { type: 'notice', after: receipt } }
            )
            return {
                before,
                after: api.getState().snapshot!.adventure!.gold,
                price,
                notice: api.getState().snapshot!.adventure!.notice,
            }
        }, index)
        expect(result.after - result.before, result.notice ?? 'No sale receipt').toBe(result.price)
    }
    const bought = await page.evaluate(async () => {
        const api = window.__ratataTest!
        const price = api
            .getState()
            .snapshot!.adventure!.market!.rows.find((row) => row.itemId === 'sapling')!.buyPrice!
        return (
            await api.act(
                {
                    type: 'market_trade',
                    npcId: 'npc_merchant_1',
                    side: 'buy',
                    itemId: 'sapling',
                    quantity: 1,
                    expectedTotal: price,
                    requestId: 'forest-buy-sapling',
                },
                { until: { type: 'inventory', itemId: 'sapling', atLeast: 1 } }
            )
        ).status
    })
    expect(bought).toBe('condition_met')
}
async function plantAndCancel(
    page: Page,
    slot: number,
    previews: PlantTreePreview[]
): Promise<void> {
    const canvas = page.locator('canvas[data-game-canvas=true]')
    await canvas.focus()
    const initialPreviewCount = previews.length
    await page.keyboard.press(`Digit${slot}`)
    await expect.poll(() => previews.length).toBeGreaterThan(initialPreviewCount)
    const hint = page.getByRole('region', { name: 'Посадка дерева' })
    await expect(hint).toBeVisible()
    const chosen = await findPlot(page, previews)
    await hint.getByRole('button', { name: 'Посадить · F / Enter' }).click()
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().player?.control?.action?.kind)
        )
        .toBe('plant_tree')
    await page.keyboard.press('Escape')
    await expect(hint).toHaveCount(0)
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().player?.control?.mode))
        .toBe('none')
    const cancelled = await page.evaluate(() => window.__ratataTest!.getState().player!)
    expect(cancelled.inventory.filter((item) => item.itemId === 'sapling')).toHaveLength(1)
    expect(cancelled.resources.energy.kind).toBe('percent')
    expect(cancelled.resourceChecks?.sow).toBe('ready')
    await canvas.focus()
    const repeatedPreviewCount = previews.length
    await page.keyboard.press(`Digit${slot}`)
    await expect.poll(() => previews.length).toBeGreaterThan(repeatedPreviewCount)
    await selectPlot(page, chosen, previews)
    await expect(hint).toHaveClass(/available/)
    await hint.getByRole('button', { name: 'Посадить · F / Enter' }).click()
    await expect
        .poll(
            () =>
                page.evaluate(() =>
                    window
                        .__ratataTest!.getState()
                        .player?.inventory.some((item) => item.itemId === 'sapling')
                ),
            { timeout: 15_000 }
        )
        .toBe(false)
    await expect(hint).toHaveCount(0)
    const planted = await page.evaluate(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.resourceNodes.filter((node) => node.phase === 'growing')
    )
    expect(
        planted.some(
            (node) => Math.hypot(node.position.x - chosen!.x, node.position.y - chosen!.y) < 24
        )
    ).toBe(true)
    await expect(page.locator('.hotbar-slot').nth(slot - 1)).toContainText('0')
}

async function findPlot(
    page: Page,
    previews: PlantTreePreview[]
): Promise<{ x: number; y: number }> {
    const state = await page.evaluate(() => window.__ratataTest!.getState())
    const origin = state.player!.position
    const { tileWidth: width, tileHeight: height } = state.snapshot!.location!.map
    const offsets = [-144, -112, -80, 0, 80, 112, 144]
    for (const dy of offsets)
        for (const dx of offsets) {
            if (Math.hypot(dx, dy) < 100) continue
            const candidate = {
                x: Math.floor((origin.x + dx) / width) * width + width / 2,
                y: Math.floor((origin.y + dy) / height) * height + height / 2,
            }
            await selectPlot(page, candidate, previews)
            if (previews.at(-1)!.available) return candidate
        }
    throw new Error('No valid distant planting plot found')
}
async function selectPlot(
    page: Page,
    position: { x: number; y: number },
    previews: PlantTreePreview[]
): Promise<void> {
    const current = previews.at(-1)!.position
    const dimensions = await page.evaluate(
        () => window.__ratataTest!.getState().snapshot!.location!.map
    )
    const dx = Math.round((position.x - current.x) / dimensions.tileWidth)
    const dy = Math.round((position.y - current.y) / dimensions.tileHeight)
    for (let step = 0; step < Math.abs(dx); step += 1)
        await page.keyboard.press(dx < 0 ? 'ArrowLeft' : 'ArrowRight')
    for (let step = 0; step < Math.abs(dy); step += 1)
        await page.keyboard.press(dy < 0 ? 'ArrowUp' : 'ArrowDown')
    await expect.poll(() => previews.at(-1)?.position).toEqual(position)
}

async function verifySaplingBindings(page: Page): Promise<void> {
    const canvas = page.locator('canvas[data-game-canvas=true]')
    for (const slot of [1, 4]) {
        await canvas.focus()
        await page.keyboard.press(`Shift+Digit${slot}`)
        const picker = page.getByRole('dialog', { name: `Назначить слот ${slot}` })
        await picker.getByRole('button', { name: 'Саженец · 0', exact: true }).click()
        await page.keyboard.press(`Digit${slot}`)
        const hint = page.getByRole('region', { name: 'Посадка дерева' })
        await expect(hint).toBeVisible()
        await expect(hint).toHaveCSS('position', 'absolute')
        await expect(hint.getByRole('status')).not.toHaveText('Проверяем участок…')
        await hint.getByRole('button', { name: 'Посадить · F / Enter' }).click()
        await expect(hint).toBeVisible()
        expect(
            await page.evaluate(() => window.__ratataTest!.getState().player?.control?.action?.kind)
        ).not.toBe('plant_tree')
        await page.keyboard.press('Escape')
        await expect(hint).toHaveCount(0)
        await expect(page.locator('.game-menu')).toHaveCount(0)
        await expect(page.locator('.hotbar-slot').nth(slot - 1)).toContainText('0')
    }
}

async function acquireSecondBrushwood(page: Page): Promise<void> {
    const source = await page.evaluate(() => {
        const api = window.__ratataTest!
        return api
            .getState()
            .snapshot!.adventure!.resourceNodes.filter(
                (node) => node.source === 'branches' && node.phase === 'ready'
            )
            .sort(
                (first, second) =>
                    Math.hypot(
                        first.position.x - api.getState().player!.position.x,
                        first.position.y - api.getState().player!.position.y
                    ) -
                    Math.hypot(
                        second.position.x - api.getState().player!.position.x,
                        second.position.y - api.getState().player!.position.y
                    )
            )[0]
    })
    expect(source).toBeDefined()
    const approach = await approachForestSource(page, source!.id)
    expect(approach.status, JSON.stringify(approach)).toBe('arrived')
    const gathered = await page.evaluate(async (sourceId) => {
        const api = window.__ratataTest!
        const before = {
            position: api.getState().player!.position,
            source: api
                .getState()
                .snapshot!.adventure!.resourceNodes.find((node) => node.id === sourceId),
            actions: api.observe().targets.find((target) => target.key === `resource:${sourceId}`)
                ?.actions,
        }
        const action = await api.act(
            { type: 'auto_action', action: { kind: 'gather', nodeId: sourceId } },
            { until: { type: 'inventory', itemId: 'brushwood', atLeast: 2 } }
        )
        const state = api.getState()
        return {
            status: action.status,
            reason: action.reason,
            elapsedMs: action.elapsedMs,
            before,
            after: {
                position: state.player!.position,
                control: state.player!.control,
                inventory: state.player!.inventory,
                source: state.snapshot!.adventure!.resourceNodes.find(
                    (node) => node.id === sourceId
                ),
                noticeId: state.snapshot!.adventure!.noticeId,
                notice: state.snapshot!.adventure!.notice,
            },
        }
    }, source!.id)
    expect(gathered.status, JSON.stringify(gathered)).toBe('condition_met')
}

async function approachForestSource(page: Page, sourceId: string) {
    return page.evaluate(
        async ({ sourceId, timeoutMs }) => {
            const api = window.__ratataTest!
            const start = api.getState().player!.position
            const samples: unknown[] = []
            const timer = setInterval(() => {
                const player = api.getState().player
                samples.push({
                    position: player?.position,
                    nextPoint: player?.path[0],
                    destination: player?.path.at(-1),
                    remainingPoints: player?.path.length,
                    control: player?.control,
                })
            }, 4_000)
            try {
                return {
                    ...(await api.navigate(
                        { targetKey: `resource:${sourceId}` },
                        { timeoutMs, tolerance: 12 }
                    )),
                    start,
                    samples,
                    source: api
                        .getState()
                        .snapshot?.adventure?.resourceNodes.find((node) => node.id === sourceId),
                }
            } finally {
                clearInterval(timer)
            }
        },
        { sourceId, timeoutMs: resourceNavigationTimeoutMs }
    )
}
