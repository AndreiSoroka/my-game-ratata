import type { ServerMessage, Vector2, WorldSnapshot } from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

export async function waitForBrushwood(page: Page, mobile: boolean): Promise<void> {
    if (mobile) {
        expect(await page.evaluate(() => window.__ratataGameDebug?.setCameraZoom?.(1))).toBe(true)
    }
    await page.waitForFunction(() =>
        window
            .__ratataTest!.getState()
            .snapshot!.adventure!.resourceNodes.some(
                (node) => node.source === 'branches' && node.phase === 'ready'
            )
    )
}

/** Keep locations and objects disclosed at join before viewport filtering. */
export function captureInitialSnapshot(page: Page): () => WorldSnapshot | undefined {
    let initial: WorldSnapshot | undefined
    page.on('websocket', (socket) => {
        if (new URL(socket.url()).pathname !== '/ws') return
        socket.on('framereceived', ({ payload }) => {
            const message = JSON.parse(String(payload)) as ServerMessage
            if (message.type === 'world_init' && initial === undefined) initial = message.snapshot
        })
    })
    return () => initial
}

export async function enterBuilding(page: Page, name: string): Promise<void> {
    const entry = await approachBuilding(page, name)
    await walkTo(page, entry, 4)
}

export async function approachBuilding(page: Page, name: string): Promise<Vector2> {
    await page.waitForFunction(
        (name) =>
            window
                .__ratataTest!.observe()
                .targets.some((target) => target.kind === 'building' && target.name.includes(name)),
        name
    )
    const { entry, tileWidth } = await page.evaluate((name) => {
        const { location, targets } = window.__ratataTest!.observe()
        const entrance = targets.find(
            (target) => target.kind === 'building' && target.name.includes(name)
        )!
        return { entry: entrance.position, tileWidth: location!.map.tileWidth }
    }, name)
    // The city generator places these entrances on the building's south side.
    await walkTo(page, { x: entry.x, y: entry.y + 3 * tileWidth }, 8)
    return entry
}

export async function walkTo(
    page: Page,
    target: Vector2,
    tolerance: number,
    timeout = 40_000
): Promise<void> {
    await page.evaluate(
        (point) => window.__ratataTest!.send({ type: 'move_to', target: point }),
        target
    )
    await expect
        .poll(
            () =>
                page.evaluate((point) => {
                    const player = window.__ratataTest!.getState().player
                    return player
                        ? Math.hypot(player.position.x - point.x, player.position.y - point.y)
                        : Infinity
                }, target),
            { timeout, message: 'The player reached the route destination' }
        )
        .toBeLessThanOrEqual(tolerance)
}
