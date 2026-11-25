import type { Vector2 } from '@my-game-ratata/contracts'

import type { MapGrid, TileCoordinate } from './navigation'
import { isSolidTile } from './navigationVisibility'

/** Traverse each cell the segment enters in distance order, including thin corner crossings. */
export function firstSolidImpact(
    grid: MapGrid,
    from: Vector2,
    to: Vector2
): { tile: TileCoordinate; fraction: number } | undefined {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const stepX = Math.sign(dx)
    const stepY = Math.sign(dy)
    let x = Math.floor(from.x / grid.tileWidth)
    let y = Math.floor(from.y / grid.tileHeight)
    const endX = Math.floor(to.x / grid.tileWidth)
    const endY = Math.floor(to.y / grid.tileHeight)
    let fraction = 0
    for (;;) {
        const tile = { x, y }
        if (isSolidTile(grid, tile)) {
            return { tile, fraction }
        }
        if (x === endX && y === endY) {
            return undefined
        }
        const crossX = crossing(from.x, x, endX, grid.tileWidth, dx)
        const crossY = crossing(from.y, y, endY, grid.tileHeight, dy)
        if (crossX <= crossY) {
            x += stepX
        }
        if (crossY <= crossX) {
            y += stepY
        }
        fraction = Math.min(crossX, crossY)
    }
}

function crossing(
    origin: number,
    cell: number,
    end: number,
    tileSize: number,
    delta: number
): number {
    return cell === end
        ? Infinity
        : ((cell + Number(delta > 0)) * tileSize - origin) / delta
}
