import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

import type { MapGrid, TileCoordinate } from './navigation'
import type { NavigationDoors } from './navigationDoors'

export function isSolidTile(grid: MapGrid, tile: TileCoordinate): boolean {
    return (
        !inBounds(grid, tile) ||
        grid.solid[tile.y * grid.width + tile.x] === true
    )
}

export function visibleLineFraction(
    grid: MapGrid,
    from: Vector2,
    to: Vector2,
    transparent?: (tile: TileCoordinate) => boolean
): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8))
    for (let index = 1; index <= steps; index++) {
        const ratio = index / steps
        const tile = {
            x: Math.floor((from.x + dx * ratio) / grid.tileWidth),
            y: Math.floor((from.y + dy * ratio) / grid.tileHeight),
        }
        if (isSolidTile(grid, tile) && transparent?.(tile) !== true) {
            return (index - 1) / steps
        }
    }
    return 1
}

export function passesSpeech(
    grid: MapGrid,
    tile: TileCoordinate,
    obstacles: ReadonlySet<number>,
    doors: NavigationDoors
): boolean {
    if (!inBounds(grid, tile)) {
        return false
    }
    const index = tile.y * grid.width + tile.x
    const door = doors.at(tile)
    return (
        grid.speechTransparent?.has(index) === true &&
        !obstacles.has(index) &&
        (door === undefined || door.state === 'open')
    )
}

function inBounds(grid: MapGrid, { x, y }: TileCoordinate): boolean {
    return x >= 0 && x < grid.width && y >= 0 && y < grid.height
}

export function cellsInBounds(
    grid: MapGrid,
    bounds: WorldObjectBounds
): number[] {
    const cells: number[] = []
    const { tileWidth, tileHeight, width, height } = grid
    for (
        let y = Math.floor(bounds.y / tileHeight);
        y < Math.ceil((bounds.y + bounds.height) / tileHeight);
        y++
    ) {
        for (
            let x = Math.floor(bounds.x / tileWidth);
            x < Math.ceil((bounds.x + bounds.width) / tileWidth);
            x++
        ) {
            if (x >= 0 && y >= 0 && x < width && y < height) {
                cells.push(y * width + x)
            }
        }
    }
    return cells
}
