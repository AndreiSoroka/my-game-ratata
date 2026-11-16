import { expect, type Page, test } from '@playwright/test'

for (const width of [1280, 390]) {
    test(`inspects and transfers real barrel supplies at ${width}px`, async ({ page }, info) => {
        test.setTimeout(60_000)
        await page.setViewportSize({ width, height: 844 })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            async (name) => window.__ratataTest!.join(name, 'vanguard'),
            `b-${info.project.name}-${width}-${Date.now().toString(36)}`
        )
        const target = await page.evaluate(
            () =>
                window
                    .__ratataTest!.observe()
                    .targets.filter(
                        (target) =>
                            target.kind === 'chest' &&
                            target.details.kind === 'barrel' &&
                            target.details.itemCount === 2
                    )
                    .sort((a, b) => a.distance - b.distance)[0]
        )
        expect(target).toBeDefined()
        const reached = await page.evaluate(
            (targetKey) => window.__ratataTest!.navigate({ targetKey }, { timeoutMs: 20_000 }),
            target!.key
        )
        expect(reached.status, reached.reason).toBe('arrived')
        const before = await page.evaluate(() => window.__ratataTest!.getState().player!.inventory)
        await openBarrel(page, target!.id)
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
                target!.id
            )
        ).toEqual([target!.key])
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
            await openBarrel(page, target!.id, true)
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
                target!.id,
                original.map((item) => item.instanceId)
            )
        }
    })
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
