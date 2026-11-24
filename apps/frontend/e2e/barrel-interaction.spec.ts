import { containerBounds, interactionApproachPoints } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

for (const width of [1280, 390]) {
    test(`inspects and transfers real barrel supplies at ${width}px`, async ({ page }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        const target = await approachSupplyBarrel(
            page,
            `b-${info.project.name}-${width}-${Date.now().toString(36)}`
        )
        const before = await page.evaluate(() => window.__ratataTest!.getState().player!.inventory)
        await openBarrel(page, target.id)
        const panel = page.getByRole('dialog', { name: 'Рюкзак и бочка' })
        const original = await page.evaluate(
            () => window.__ratataTest!.getState().snapshot!.chest!.items
        )
        expect(original.map((item) => item.itemId)).toEqual(['wood', 'fiber'])
        expect(
            await page.evaluate(() => window.__ratataTest!.getState().player!.inventory)
        ).toEqual(before)
        expect(
            await page.evaluate(
                (id) =>
                    window
                        .__ratataTest!.observe()
                        .targets.filter((target) => target.id === id)
                        .map((target) => target.key),
                target.id
            )
        ).toEqual([target.key])
        try {
            await page.screenshot({ path: info.outputPath('barrel-full.png') })
            await panel.getByRole('button', { name: /Древесина/ }).click()
            await expect
                .poll(() =>
                    page.evaluate(() =>
                        window
                            .__ratataTest!.getState()
                            .snapshot?.chest?.items.map((item) => item.itemId)
                    )
                )
                .toEqual(['fiber'])
            await panel.getByRole('button', { name: 'Забрать всё' }).click()
            await expect
                .poll(() =>
                    page.evaluate(() => window.__ratataTest!.getState().snapshot?.chest?.items)
                )
                .toEqual([])
            await expect(panel).toContainText('Контейнер пуст.')
            for (const item of original)
                expect(
                    await page.evaluate(
                        (id) =>
                            window
                                .__ratataTest!.getState()
                                .player?.inventory.filter((item) => item.instanceId === id).length,
                        item.instanceId
                    )
                ).toBe(1)
            await page.screenshot({ path: info.outputPath('barrel-empty.png') })
            await closeBarrel(page, width)
            await expect(panel).toHaveCount(0)
            await openBarrel(page, target.id, true)
            await expect(panel).toContainText('Контейнер пуст.')
            for (const item of original)
                await panel.locator(`[data-dialog-action="bag:${item.instanceId}"]`).click()
            await expect
                .poll(() =>
                    page.evaluate(() => window.__ratataTest!.getState().snapshot?.chest?.items)
                )
                .toEqual(original)
            expect(
                await page.evaluate(() => window.__ratataTest!.getState().player!.inventory)
            ).toEqual(before)
        } finally {
            // Return real instances so subsequent browsers inspect the same finite shared stock.
            await restoreBarrel(
                page,
                target.id,
                original.map((item) => item.instanceId)
            )
        }
    })
}

async function approachSupplyBarrel(page: Page, nickname: string) {
    // The initial server snapshot can include barrels outside the first camera viewport.
    const [received] = await Promise.all([
        page.waitForFunction(() => {
            const { player, location, snapshot } = window.__ratataTest!.getState()
            if (!player || !location || !snapshot) return
            const position = player.position
            const distance = (point: { x: number; y: number }) =>
                Math.hypot(point.x - position.x, point.y - position.y)
            const barrel = snapshot.chests
                .filter((chest) => chest.kind === 'barrel' && chest.itemCount === 2)
                .sort((a, b) => distance(a.position) - distance(b.position))[0]
            if (barrel) return { barrel, position, tileWidth: location.map.tileWidth }
        }),
        page.evaluate((name) => window.__ratataTest!.join(name, 'vanguard'), nickname),
    ])
    const { barrel, position, tileWidth } = (await received.jsonValue())!
    const bounds = barrel.bounds ?? containerBounds(barrel.position)
    const points = interactionApproachPoints(position, [bounds], tileWidth / 2)
    const reached = await page.evaluate(
        async ({ id, points }) => {
            const api = window.__ratataTest!
            let result = await api.navigate({ targetKey: `chest:${id}` }, { timeoutMs: 20_000 })
            if (result.status !== 'target_lost') return result

            // Walk to the previously received bounds while the narrow viewport catches up.
            for (const point of points) {
                result = await api.navigate(point, { tolerance: 10, timeoutMs: 20_000 })
                if (result.status !== 'blocked') break
            }
            return result
        },
        { id: barrel.id, points }
    )
    expect(reached.status, `${barrel.id}: ${reached.reason}`).toBe('arrived')

    const target = await page.evaluate(async (id) => {
        const api = window.__ratataTest!
        const after = api.getState().snapshot!.tick
        const fresh = await api.waitFor({ type: 'tick', after })
        if (fresh.status !== 'condition_met') return
        return fresh.observation.targets.find((candidate) => candidate.key === `chest:${id}`)
    }, barrel.id)
    expect(target?.details).toMatchObject({ kind: 'barrel', itemCount: 2 })
    return target!
}

async function openBarrel(page: Page, id: string, legacy = false): Promise<void> {
    await page.evaluate(
        async ({ id, legacy }) => {
            await window.__ratataTest!.act(
                legacy
                    ? { type: 'world_interact', objectId: id }
                    : { type: 'open_chest', chestId: id },
                { until: { type: 'chest', chestId: id } }
            )
        },
        { id, legacy }
    )
    await expect(page.getByRole('dialog', { name: 'Рюкзак и бочка' })).toBeVisible()
}

async function closeBarrel(page: Page, width: number): Promise<void> {
    if (width === 390) await page.getByRole('button', { name: 'Закрыть контейнер' }).click()
    else await page.keyboard.press('Escape')
    await expect
        .poll(() => page.evaluate(() => window.__ratataTest!.getState().snapshot?.chest))
        .toBeNull()
}

async function restoreBarrel(page: Page, id: string, instances: string[]): Promise<void> {
    await openBarrel(page, id)
    await page.evaluate(
        ({ id, instances }) => {
            for (const itemInstanceId of instances) {
                if (
                    window
                        .__ratataTest!.getState()
                        .player?.inventory.some((item) => item.instanceId === itemInstanceId)
                )
                    window.__ratataTest!.send({
                        type: 'put_chest_item',
                        chestId: id,
                        itemInstanceId,
                    })
            }
        },
        { id, instances }
    )
    await expect
        .poll(() =>
            page.evaluate(() => window.__ratataTest!.getState().snapshot?.chest?.items.length)
        )
        .toBe(instances.length)
    await page
        .getByRole('dialog', { name: 'Рюкзак и бочка' })
        .getByRole('button', { name: 'Закрыть контейнер' })
        .click()
    await expect(page.getByRole('dialog', { name: 'Рюкзак и бочка' })).toHaveCount(0)
}
