import { expect, test } from '@playwright/test'

for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
]) {
    test(`loads the server city after initialization and retries a failed map without changing identity (${String(viewport.width)}px)`, async ({
        page,
    }) => {
        await page.setViewportSize(viewport)
        let failed = false
        const maps: string[] = []
        await page.route('**/world/maps/**', async (route) => {
            maps.push(route.request().url())
            if (!failed) {
                failed = true
                await route.fulfill({
                    status: 503,
                    headers: { 'Access-Control-Allow-Origin': '*' },
                    body: 'Temporary map outage',
                })
            } else await route.continue()
        })
        await page.goto('/?test=1')
        await page.waitForFunction(() => Boolean(window.__ratataTest))
        await page.evaluate(
            (name) => {
                void window.__ratataTest!.join(name, 'vanguard').catch(() => undefined)
            },
            `map-retry-${String(viewport.width)}`
        )
        const retry = page.getByRole('button', { name: 'Повторить загрузку карты' })
        await expect(retry).toBeVisible({ timeout: 15_000 })
        const before = await page.evaluate(() => window.__ratataTest!.getState().localPlayerId)
        expect(before).toBeTruthy()
        await retry.click()
        await expect(page.locator('canvas[data-game-canvas=true]')).toBeVisible({ timeout: 15_000 })
        await expect
            .poll(() => page.evaluate(() => window.__ratataTest!.getState().connected))
            .toBe(true)
        const state = await page.evaluate(() => {
            const current = window.__ratataTest!.getState()
            return {
                id: current.localPlayerId,
                epoch: current.snapshot?.serverEpoch,
                map: current.snapshot?.location?.map,
                buildings: window
                    .__ratataTest!.observe()
                    .targets.filter((target) => target.kind === 'building').length,
            }
        })
        expect(state.id).toBe(before)
        expect(state.map?.asset.url).toContain(`/world/maps/${state.epoch}/`)
        expect(state.map?.width).toBe(96)
        expect(state.map?.height).toBe(80)
        expect(state.buildings).toBe(11)
        expect(maps).toHaveLength(2)
        expect(new URL(maps[1]!).searchParams.get('revision')).toBe(state.map?.asset.revision)
        const response = await page.request.get(maps[1]!)
        expect(response.ok()).toBe(true)
        const map = (await response.json()) as {
            width: number
            height: number
            layers: { name: string }[]
        }
        expect(map.width).toBe(96)
        expect(map.height).toBe(80)
        expect(map.layers.some((layer) => layer.name === 'Buildings')).toBe(true)
    })
}
