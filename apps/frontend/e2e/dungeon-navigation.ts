import assert from 'node:assert/strict'

import type { ChestContainerSnapshot, Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

export interface Passage extends Vector2 {
    properties: { name: string; value: unknown }[]
    type: string
}
export interface DungeonMap {
    width: number
    tileheight: number
    layers: { name: string; objects?: Passage[]; data?: number[] }[]
}

export async function expectViewportFor(page: Page, locationId: string): Promise<void> {
    await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const { connected, mapReady, snapshot } = window.__ratataTest!.getState()
                    return {
                        connected,
                        mapReady,
                        location: snapshot?.location?.id,
                        viewport: snapshot?.viewBounds !== undefined,
                    }
                }),
            { timeout: 15_000, message: `Receive a camera-filtered snapshot for ${locationId}` }
        )
        .toEqual({ connected: true, mapReady: true, location: locationId, viewport: true })
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid viewport hint' })).toHaveCount(
        0
    )
}

export async function currentMap(page: Page): Promise<DungeonMap> {
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
    return (await response.json()) as DungeonMap
}

export function mapObjects(map: DungeonMap, layer: string): Passage[] {
    return map.layers.find(({ name }) => name === layer)?.objects ?? []
}

export function property(object: Passage, key: string): unknown {
    return object.properties.find(({ name }) => name === key)?.value
}

export async function currentPassage(page: Page, destination: string): Promise<Passage> {
    const point = mapObjects(await currentMap(page), 'Dungeon passages').find(
        (passage) => property(passage, 'destinationLocationId') === destination
    )
    expect(point, `Passage to ${destination}`).toBeDefined()
    return point!
}

export async function cross(page: Page, { x, y }: Vector2): Promise<void> {
    const result = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { timeoutMs: 30_000, tolerance: 1 }),
        { x, y }
    )
    expect(result, result.reason).toMatchObject({ status: 'location_changed' })
}

export function currentDungeonContainer(page: Page) {
    return page.evaluate(() => window.__ratataTest!.getState().snapshot?.chest)
}

export async function openDungeonContainer(
    page: Page,
    chestId: string
): Promise<ChestContainerSnapshot> {
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'open_chest', chestId },
                { until: { type: 'chest', chestId } }
            ),
        chestId
    )
    expect(result.status, result.reason).toBe('condition_met')
    const chest = await currentDungeonContainer(page)
    assert(chest?.chestId === chestId, 'The requested container is open')
    return chest
}

export async function closeDungeonContainer(page: Page, chestId: string): Promise<void> {
    const result = await page.evaluate(
        (chestId) =>
            window.__ratataTest!.act(
                { type: 'close_chest', chestId },
                { until: { type: 'chest', chestId: null } }
            ),
        chestId
    )
    expect(result.status, result.reason).toBe('condition_met')
}
