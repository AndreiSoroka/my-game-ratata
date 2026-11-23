import type { Vector2 } from '@my-game-ratata/contracts'
import { expect, type Page } from '@playwright/test'

export async function enterBuilding(page: Page, name: string): Promise<void> {
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
    await walkTo(page, entry, 4)
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
