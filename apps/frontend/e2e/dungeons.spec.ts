import assert from 'node:assert/strict'

import {
    CENTER_LOCATION_ID,
    type Vector2,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { generateDungeonRegion } from '../../../scripts/generate-dungeons.mjs'

interface Passage extends Vector2 {
    properties: { name: string; value: unknown }[]
}

test('walks through a tower and back with the same character', async ({ page }) => {
    test.setTimeout(150_000)
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate(() => window.__ratataTest!.join('Dungeon explorer', 'vanguard'))
    await expect.poll(() => playerLocation(page)).toBe(CENTER_LOCATION_ID)
    const playerId = await page.evaluate(() => window.__ratataTest!.getState().player!.id)

    const seed = process.env['GAME_WORLD_SEED'] ?? 'fortifications-browser-2026'
    const parents = new Set(
        generateDungeonRegion(seed, WORLD_LOCATION_DEFINITIONS).map((d) => d.surfaceLocationId)
    )
    const nearest = WORLD_LOCATION_DEFINITIONS.filter((entry) => parents.has(entry.id)).sort(
        (a, b) => a.dangerLevel - b.dangerLevel
    )[0]!
    const city = WORLD_LOCATION_DEFINITIONS.find((entry) => entry.id === CENTER_LOCATION_ID)!
    for (const [steps, negative, positive] of [
        [nearest.column - city.column, 'west', 'east'],
        [nearest.row - city.row, 'north', 'south'],
    ] as const) {
        for (let step = 0; step < Math.abs(steps); step++) {
            const result = await page.evaluate(
                (direction) => window.__ratataTest!.travel(direction, { timeoutMs: 30_000 }),
                steps < 0 ? negative : positive
            )
            expect(result, result.reason).toMatchObject({ status: 'arrived' })
        }
    }

    const tower = await currentPassage(page)
    const dungeonId = tower.properties.find(({ name }) => name === 'destinationLocationId')?.value
    assert(typeof dungeonId === 'string', 'Tower has no dungeon destination')
    await cross(page, tower)
    await expectViewportFor(page, dungeonId)
    expect(await page.evaluate(() => window.__ratataTest!.observe().exits)).toEqual([])
    const stairs = await currentPassage(page)
    await cross(page, stairs)
    await expectViewportFor(page, nearest.id)
    expect(await page.evaluate(() => window.__ratataTest!.getState().player!.id)).toBe(playerId)
})

function playerLocation(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().location?.id)
}

async function expectViewportFor(page: Page, locationId: string): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate((id) => {
                    const { connected, mapReady, snapshot } = window.__ratataTest!.getState()
                    return (
                        connected &&
                        mapReady &&
                        snapshot?.location?.id === id &&
                        snapshot.viewBounds !== undefined
                    )
                }, locationId),
            { timeout: 15_000, message: `Receive a camera-filtered snapshot for ${locationId}` }
        )
        .toBe(true)
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid viewport hint' })).toHaveCount(
        0
    )
}

async function currentPassage(page: Page): Promise<Passage> {
    await page.waitForFunction(() => {
        const state = window.__ratataTest!.getState()
        return state.mapReady && state.location?.map.asset.url
    })
    const assetPath = await page.evaluate(
        () => window.__ratataTest!.getState().location!.map.asset.url
    )
    const base = process.env['E2E_BACKEND_PORT'] ?? '3500'
    const response = await page.request.get(`http://127.0.0.1:${base}${assetPath}`)
    expect(response.ok()).toBe(true)
    const map = (await response.json()) as { layers: { name: string; objects?: Passage[] }[] }
    const point = map.layers.find(({ name }) => name === 'Dungeon passages')?.objects?.[0]
    expect(point).toBeDefined()
    return point!
}

async function cross(page: Page, { x, y }: Vector2): Promise<void> {
    const result = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { timeoutMs: 30_000, tolerance: 1 }),
        { x, y }
    )
    expect(result, result.reason).toMatchObject({ status: 'location_changed' })
}
