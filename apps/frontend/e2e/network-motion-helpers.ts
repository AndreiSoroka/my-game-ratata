import type { Vector2 } from '@my-game-ratata/contracts'
import type { Page } from '@playwright/test'

import {
    type MapVisibility,
    readMapVisibility,
    updateObstacleVisibility,
} from '../src/game/runtime/mapVisibility'

export type MotionMapSource = Parameters<typeof readMapVisibility>[0]

export async function pauseInbound(page: Page) {
    let paused = false
    const pending: (() => void)[] = []
    await page.routeWebSocket(/\/ws$/, (client) => {
        const server = client.connectToServer()
        server.onMessage((raw) => {
            if (paused) pending.push(() => client.send(raw))
            else client.send(raw)
        })
    })
    return {
        pause: () => {
            paused = true
        },
        release: () => {
            paused = false
            for (const send of pending.splice(0)) send()
        },
        pending: () => pending.length,
    }
}

/** Find an actually connected straight run in the server-authored map, then approach normally. */
export async function approachMotionCorridor(page: Page, authored: MotionMapSource) {
    const state = await page.evaluate(() => window.__ratataTest!.getState())
    const grid = readMapVisibility(authored)
    updateObstacleVisibility(
        grid,
        state.snapshot?.adventure?.resourceNodes ?? [],
        state.snapshot?.viewBounds,
        state.snapshot?.adventure?.worldObjects
    )
    const corridor = findCorridor(grid, state.player!.position)
    const result = await page.evaluate(
        (point) => window.__ratataTest!.navigate(point, { tolerance: 1, timeoutMs: 20_000 }),
        corridor.start
    )
    if (result.status !== 'arrived')
        throw new Error(`Could not approach corridor: ${result.reason}`)
    return corridor.axis
}

function findCorridor(grid: MapVisibility, from: Vector2) {
    const first = {
        x: Math.floor(from.x / grid.tileWidth),
        y: Math.floor(from.y / grid.tileHeight),
    }
    const queue = [first],
        seen = new Set([`${first.x},${first.y}`])
    const axes = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ]
    for (let index = 0; index < queue.length; index += 1) {
        const cell = queue[index]!
        for (const axis of axes) {
            const clear = Array.from({ length: 9 }, (_, step) =>
                freeCell(grid, cell.x + axis.x * step, cell.y + axis.y * step)
            ).every(Boolean)
            if (clear)
                return {
                    start: {
                        x: (cell.x + 0.5) * grid.tileWidth,
                        y: (cell.y + 0.5) * grid.tileHeight,
                    },
                    axis,
                }
            const next = { x: cell.x + axis.x, y: cell.y + axis.y }
            const key = `${next.x},${next.y}`
            if (seen.has(key) || !freeCell(grid, next.x, next.y)) continue
            seen.add(key)
            queue.push(next)
        }
    }
    throw new Error('No reachable straight corridor in the authored map')
}

function freeCell(grid: MapVisibility, x: number, y: number): boolean {
    return (
        x >= 2 &&
        y >= 2 &&
        x < grid.width - 2 &&
        y < grid.height - 2 &&
        !grid.solid[y * grid.width + x]
    )
}

export function capturePausedMotion(page: Page) {
    return page.evaluate(async () => {
        const samples: {
            at: number
            x: number
            y: number
            pageX: number
            pageY: number
            serverTime: number
        }[] = []
        const started = performance.now()
        while (performance.now() - started < 450) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const debug = window.__ratataGameDebug!
            const state = window.__ratataTest!.getState()
            const position = debug.renderedCharacters!().find(
                (actor) => actor.id === state.localPlayerId
            )!.position
            const projected = debug.worldToPage(position)!
            samples.push({
                at: performance.now() - started,
                ...position,
                pageX: projected.x,
                pageY: projected.y,
                serverTime: state.snapshot!.serverTime,
            })
        }
        return samples
    })
}

export function readMotionPose(page: Page) {
    return page.evaluate(() => {
        const state = window.__ratataTest!.getState()
        const rendered = window.__ratataGameDebug
            ?.renderedCharacters?.()
            .find((actor) => actor.id === state.localPlayerId)
        return { player: state.player, rendered: rendered?.position, tick: state.snapshot?.tick }
    })
}
