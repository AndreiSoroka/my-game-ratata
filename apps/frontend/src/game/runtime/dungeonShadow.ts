import type { Vector2 } from '@my-game-ratata/contracts'

import type { MapVisibility } from './mapVisibility'

/** Stop a light ray at the first opaque tile, without skipping narrow diagonal corners. */
export function dungeonRayDistance(
    map: MapVisibility,
    origin: Vector2,
    direction: Vector2,
    limit: number
): number {
    let column = Math.floor(origin.x / map.tileWidth)
    let row = Math.floor(origin.y / map.tileHeight)
    if (blocksLight(map, column, row)) return 0

    const stepX = Math.sign(direction.x)
    const stepY = Math.sign(direction.y)
    const strideX = map.tileWidth / Math.abs(direction.x)
    const strideY = map.tileHeight / Math.abs(direction.y)
    let nextX = boundaryDistance(origin.x, direction.x, column, map.tileWidth)
    let nextY = boundaryDistance(origin.y, direction.y, row, map.tileHeight)

    while (Math.min(nextX, nextY) < limit) {
        const distance = Math.min(nextX, nextY)
        if (Math.abs(nextX - nextY) < 1e-6) {
            if (blocksLight(map, column + stepX, row) || blocksLight(map, column, row + stepY))
                return distance
            column += stepX
            row += stepY
            nextX += strideX
            nextY += strideY
        } else if (nextX < nextY) {
            column += stepX
            nextX += strideX
        } else {
            row += stepY
            nextY += strideY
        }
        if (blocksLight(map, column, row)) return distance
    }
    return limit
}

const lightRays = Array.from({ length: 256 }, (_, index) => {
    const angle = (index / 256) * Math.PI * 2
    return { x: Math.cos(angle), y: Math.sin(angle) }
})

export function dungeonLightPath(map: MapVisibility, point: Vector2, radius: number): Path2D {
    const path = new Path2D()
    lightRays.forEach((direction, index) => {
        const distance = dungeonRayDistance(map, point, direction, radius)
        // A few pixels of the opaque face stay visible. The room behind remains dark.
        const edge = distance === 0 ? 0 : Math.min(radius, distance + 5)
        const x = point.x + direction.x * edge
        const y = point.y + direction.y * edge
        if (index === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
    })
    path.closePath()
    return path
}

function blocksLight(map: MapVisibility, column: number, row: number): boolean {
    return (
        column < 0 ||
        row < 0 ||
        column >= map.width ||
        row >= map.height ||
        map.solid[row * map.width + column] === true
    )
}

function boundaryDistance(origin: number, direction: number, tile: number, size: number): number {
    if (direction === 0) return Infinity
    return ((direction > 0 ? tile + 1 : tile) * size - origin) / direction
}
