import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

import { selectedWorldTarget } from './world-target-ui'

/** Face the observed source with ordinary movement, never a test-state write. */
export async function faceGrave(page: Page, id: string): Promise<void> {
    await page.evaluate(async (id) => {
        const api = window.__ratataTest!,
            player = api.getState().player!,
            grave = api.getState().snapshot!.graves!.find((grave) => grave.id === id)!
        const delta = {
            x: grave.position.x - player.position.x,
            y: grave.position.y - player.position.y,
        }
        const axis =
            Math.abs(delta.x) > Math.abs(delta.y)
                ? { x: Math.sign(delta.x), y: 0 }
                : { x: 0, y: Math.sign(delta.y) }
        await api.moveFor(axis, 60)
        const after = api.getState().snapshot!.tick
        await api.waitFor({ type: 'tick', after })
    }, id)
}

/** Reach and select the observed grave before opening its prompt. */
export async function approachObservedGrave(page: Page, key: string): Promise<void> {
    const source = await page.evaluate(
        (key) => window.__ratataTest!.observe().targets.find((target) => target.key === key),
        key
    )
    expect(source?.kind).toBe('grave')
    const attempts: unknown[] = []
    for (const offset of [
        { x: 0, y: -32 },
        { x: 32, y: 0 },
        { x: -32, y: 0 },
        { x: 0, y: 32 },
        { x: 24, y: -24 },
        { x: -24, y: -24 },
        { x: 24, y: 24 },
        { x: -24, y: 24 },
    ]) {
        const reached = await page.evaluate(
            ({ position, offset }) =>
                window.__ratataTest!.navigate(
                    { x: position.x + offset.x, y: position.y + offset.y },
                    { tolerance: 1, timeoutMs: 5_000 }
                ),
            { position: source!.position, offset }
        )
        if (reached.status !== 'arrived') {
            attempts.push({ offset, status: reached.status })
            continue
        }
        await faceGrave(page, source!.id)
        const selected = await selectGrave(page, key)
        const prompt = page.getByRole('button', { name: /^F Могила / })
        if (selected && (await prompt.isVisible())) return
        attempts.push({ offset, prompt: await page.locator('.nearby-prompt').allTextContents() })
    }
    throw new Error(`Cannot select observed ${key} through F: ${JSON.stringify(attempts)}`)
}

async function selectGrave(page: Page, key: string): Promise<boolean> {
    await page.locator('canvas[data-game-canvas=true]').focus()
    const selected = selectedWorldTarget(page)
    const count = await page.evaluate(() => window.__ratataTest!.observe().targets.length)
    const currentKey = () =>
        selected.evaluateAll((targets) => targets[0]?.getAttribute('data-selected-target-key'))
    if ((await currentKey()) === key) return true
    for (let index = 0; index < count; index += 1) {
        await page.keyboard.press('Tab')
        if ((await currentKey()) === key) return true
    }
    return false
}

interface GraveMap {
    layers: { name: string; objects?: (Vector2 & { type: string })[] }[]
}

export async function travelParty(
    pages: Page[],
    direction: 'west' | 'south',
    timeoutMs = 30_000
): Promise<Vector2> {
    const cleric = pages[0]!
    const locationId = await cleric.evaluate(
        (direction) =>
            window.__ratataTest!.observe().exits.find((exit) => exit.direction === direction)
                ?.locationId,
        direction
    )
    expect(locationId).toBeDefined()
    const mapResponse = cleric
        .waitForResponse(
            (response) => {
                const path = new URL(response.url()).pathname
                return path.startsWith('/world/maps/') && path.endsWith(`/${locationId!}.json`)
            },
            { timeout: timeoutMs * 2 + 5_000 }
        )
        .catch(() => undefined)
    const results = await Promise.all(
        pages.map((participant) =>
            participant.evaluate(
                async ({ direction, locationId, timeoutMs }) => {
                    const api = window.__ratataTest!
                    const result = await api.travel(direction, { timeoutMs })
                    return result.status === 'blocked' && api.getState().location?.id !== locationId
                        ? api.travel(direction, { timeoutMs })
                        : result
                },
                { direction, locationId, timeoutMs }
            )
        )
    )
    for (const result of results) expect(result.status, result.reason).toBe('arrived')
    const response = await mapResponse
    expect(response, 'The browser received the destination map asset').toBeDefined()
    const map: GraveMap = await response!.json()
    const authored = map.layers
        .find(({ name }) => name === 'Grave sources')
        ?.objects?.find(({ type }) => type === 'grave_source')
    expect(authored, 'The received map has an authored grave marker').toBeDefined()
    return { x: authored!.x, y: authored!.y }
}

export async function scoutGrave(rangers: Page[], position: Vector2): Promise<void> {
    // The marker gives a route, while only nearby snapshots can reveal the active grave.
    await Promise.all(
        rangers.map(async (ranger, index) => {
            await ranger.setViewportSize({ width: 640, height: 480 })
            const flank = (index * 2 - 3) * 12
            const approach = { x: position.x + 136, y: position.y + flank }
            const result = await ranger.evaluate(
                (point) => window.__ratataTest!.navigate(point, { timeoutMs: 40_000 }),
                approach
            )
            await expect
                .poll(
                    () =>
                        ranger.evaluate((point) => {
                            const player = window.__ratataTest!.getState().player
                            if (!player?.alive) return Infinity
                            return Math.hypot(
                                player.position.x - point.x,
                                player.position.y - point.y
                            )
                        }, approach),
                    { message: result.reason }
                )
                .toBeLessThanOrEqual(16)
        })
    )
}
