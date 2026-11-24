import type { Vector2 } from '@my-game-ratata/contracts'

import type { MapVisibility } from './mapVisibility'

export type MotionMap = Pick<
    MapVisibility,
    'width' | 'height' | 'tileWidth' | 'tileHeight' | 'solid'
>

/** Cosmetic clipping only: stop at known obstacles, without inventing a route or slide. */
export function clipMotion(map: MotionMap | undefined, from: Vector2, to: Vector2): Vector2 {
    if (!map || blocked(map, from)) return { ...from }
    const target = clampMotion(map, to)
    const dx = target.x - from.x
    const dy = target.y - from.y
    const steps = Math.max(
        1,
        Math.ceil(Math.hypot(dx, dy) / (Math.min(map.tileWidth, map.tileHeight) / 4))
    )
    let previous = { ...from }
    for (let index = 1; index <= steps; index += 1) {
        const next = { x: from.x + (dx * index) / steps, y: from.y + (dy * index) / steps }
        if (blocked(map, next) || cutsCorner(map, previous, next)) break
        previous = next
    }
    return previous
}

export function motionLineClear(map: MotionMap | undefined, from: Vector2, to: Vector2): boolean {
    const clipped = clipMotion(map, from, to)
    return Math.hypot(clipped.x - to.x, clipped.y - to.y) < 1e-6
}

function clampMotion(map: MotionMap, point: Vector2): Vector2 {
    return {
        x: Math.max(map.tileWidth / 2, Math.min(point.x, (map.width - 0.5) * map.tileWidth)),
        y: Math.max(map.tileHeight / 2, Math.min(point.y, (map.height - 0.5) * map.tileHeight)),
    }
}

function blocked(map: MotionMap, point: Vector2): boolean {
    const x = Math.floor(point.x / map.tileWidth)
    const y = Math.floor(point.y / map.tileHeight)
    return (
        x < 0 || y < 0 || x >= map.width || y >= map.height || Boolean(map.solid[y * map.width + x])
    )
}

function cutsCorner(map: MotionMap, from: Vector2, to: Vector2): boolean {
    const x = Math.floor(from.x / map.tileWidth)
    const y = Math.floor(from.y / map.tileHeight)
    const nextX = Math.floor(to.x / map.tileWidth)
    const nextY = Math.floor(to.y / map.tileHeight)
    return (
        x !== nextX &&
        y !== nextY &&
        (Boolean(map.solid[y * map.width + nextX]) || Boolean(map.solid[nextY * map.width + x]))
    )
}
