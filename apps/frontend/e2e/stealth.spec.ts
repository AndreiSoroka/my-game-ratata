import { CENTER_LOCATION_ID, type Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page, test } from '@playwright/test'

import { containsPosition } from '../src/game/runtime/mapBuildings'
import { readMapVisibility } from '../src/game/runtime/mapVisibility'
import { clickVisibleCharacter, selectedWorldTarget } from './world-target-ui'

type CityMap = Parameters<typeof readMapVisibility>[0] & {
    layers: { name: string; objects?: { x: number; y: number; width: number; height: number }[] }[]
}

for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
]) {
    test(`shows crouching and anonymous footsteps per observer at ${String(viewport.width)}px`, async ({
        browser,
    }, info) => {
        test.setTimeout(75_000)
        const observerContext = await browser.newContext({ viewport })
        const moverContext = await browser.newContext({ viewport })
        const observer = await observerContext.newPage()
        const mover = await moverContext.newPage()
        const suffix = `${String(viewport.width)}-${String(info.repeatEachIndex)}`
        const moverName = `Тень ${suffix}`
        try {
            const city = observer.waitForResponse((response) => {
                const path = new URL(response.url()).pathname
                return (
                    path.startsWith('/world/maps/') && path.endsWith(`/${CENTER_LOCATION_ID}.json`)
                )
            })
            await join(observer, `Дозор ${suffix}`)
            const spawn = await observer.evaluate(
                () => window.__ratataTest!.getState().player!.position
            )
            const origin = testLane((await (await city).json()) as CityMap, spawn)
            const moverId = await join(mover, moverName)
            const near = shift(origin, 43)
            const farther = shift(near, 24)

            await walk(mover, near)
            await face(observer, origin, 'right')
            await toggleSneak(mover)
            await expect.poll(() => opacity(mover, moverId)).toBe(0.55)
            await expect.poll(() => opacity(observer, moverId)).toBe(0.55)
            await toggleSneak(mover)
            await expect.poll(() => opacity(observer, moverId)).toBe(1)

            await face(observer, origin, 'left')
            await clickVisibleCharacter(observer, moverId, 1)
            await expect(selectedWorldTarget(observer)).toHaveAttribute(
                'data-selected-target-key',
                `character:${moverId}`
            )
            await observer.keyboard.press('KeyF')
            const menu = observer.getByRole('menu', { name: moverName })
            await expect(menu).toBeVisible()
            await toggleSneak(mover)
            await expect.poll(() => opacity(mover, moverId)).toBe(0.55)
            await expect.poll(() => opacity(observer, moverId)).toBeUndefined()
            expect(await observesCharacter(observer, moverId)).toBe(false)
            await expect(selectedWorldTarget(observer)).toHaveCount(0)
            await expect(menu).toHaveCount(0)

            await expect.poll(() => footstep(observer)).toBeUndefined()
            await Promise.all([
                walk(mover, farther),
                expect
                    .poll(async () => {
                        const heard = await footstep(observer)
                        return heard && Object.keys(heard).sort()
                    })
                    .toEqual(['expiresAt', 'id', 'position']),
            ])
            expect(await observesCharacter(observer, moverId)).toBe(false)
            await expect.poll(() => footstep(observer)).toBeUndefined()

            await walk(observer, shift(origin, 10))
            await expect.poll(() => opacity(observer, moverId)).toBe(0.55)
            await walk(mover, shift(origin, 94))
            await expect.poll(() => opacity(observer, moverId)).toBeUndefined()
            await toggleSneak(mover)
            await expect.poll(() => opacity(observer, moverId)).toBe(1)
        } finally {
            await observerContext.close()
            await moverContext.close()
        }
    })
}

const canvas = 'canvas[data-game-canvas=true]'

async function join(page: Page, name: string): Promise<string> {
    await page.goto('/?test=1')
    await page.waitForFunction(() => Boolean(window.__ratataTest))
    await page.evaluate((nickname) => window.__ratataTest!.join(nickname, 'vanguard'), name)
    await expect(page.locator(canvas)).toBeVisible()
    return page.evaluate(() => window.__ratataTest!.getState().localPlayerId!)
}

async function walk(page: Page, position: Vector2): Promise<void> {
    await page.bringToFront()
    const result = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { tolerance: 1, timeoutMs: 18_000 }),
        position
    )
    expect(result.status, result.reason).toBe('arrived')
}

async function face(page: Page, origin: Vector2, direction: 'left' | 'right'): Promise<void> {
    await walk(page, shift(origin, direction === 'left' ? 12 : -12))
    await walk(page, origin)
    expect(await page.evaluate(() => window.__ratataTest!.getState().player!.facing)).toBe(
        direction
    )
}

async function toggleSneak(page: Page): Promise<void> {
    await page.bringToFront()
    await page.locator(canvas).focus()
    await page.keyboard.press('KeyC')
}

function opacity(page: Page, id: string) {
    return page.evaluate((actorId) => window.__ratataGameDebug?.characterOpacity?.(actorId), id)
}

function observesCharacter(page: Page, id: string) {
    return page.evaluate((actorId) => {
        const api = window.__ratataTest!
        return (
            api.getState().snapshot!.characters.some((actor) => actor.id === actorId) ||
            api.observe().targets.some((target) => target.id === actorId)
        )
    }, id)
}

function footstep(page: Page) {
    return page.evaluate(() => {
        const rendered = window.__ratataGameDebug?.heardFootstepIds?.() ?? []
        return window
            .__ratataTest!.getState()
            .snapshot!.heardFootsteps?.find((step) => rendered.includes(step.id))
    })
}

function shift(point: Vector2, dx: number): Vector2 {
    return { x: point.x + dx, y: point.y }
}

function testLane(map: CityMap, spawn: Vector2): Vector2 {
    const grid = readMapVisibility(map)
    const buildings = map.layers.find((layer) => layer.name === 'Buildings')?.objects ?? []
    const candidates = grid.solid.flatMap((blocked, index) => {
        if (blocked) return []
        const x = ((index % grid.width) + 0.5) * grid.tileWidth
        const y = (Math.floor(index / grid.width) + 0.5) * grid.tileHeight
        return [{ x, y }]
    })
    candidates.sort((a, b) => distance(a, spawn) - distance(b, spawn))
    for (const point of candidates) {
        if ([-6, 0, 6].every((dy) => clearRow(point, dy))) return point
    }
    throw new Error('No clear outdoor test lane in the generated city')

    function clearRow(point: Vector2, dy: number): boolean {
        const y = point.y + dy
        for (let x = point.x - 20; x <= point.x + 104; x += 4) {
            const column = Math.floor(x / grid.tileWidth)
            const row = Math.floor(y / grid.tileHeight)
            if (
                column < 0 ||
                column >= grid.width ||
                grid.solid[row * grid.width + column] !== false ||
                buildings.some((building) => containsPosition(building, { x, y }))
            )
                return false
        }
        return true
    }
}

function distance(a: Vector2, b: Vector2): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}
