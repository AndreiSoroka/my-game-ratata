import type { Vector2 } from '@my-game-ratata/contracts'

interface MapRectangle extends Vector2 {
    width: number
    height: number
}

export interface AmbientTerrain {
    width: number
    height: number
    water: Uint8Array
    fortifications: MapRectangle[]
}

interface AmbientTerrainSource {
    width: number
    height: number
    layers: {
        name: string
        type: string
        data?: number[]
        objects?: (Vector2 & { type?: string; width?: number; height?: number })[]
    }[]
}

interface WaterTileset {
    firstgid: number
    tilecount?: number
}

interface TileSize {
    tileWidth: number
    tileHeight: number
}

// Tiled stores tile transforms in the high four bits, separately from tileset membership.
const gidMask = 0x0fffffff

export function readAmbientTerrain(
    map: AmbientTerrainSource,
    waterTileset?: WaterTileset
): AmbientTerrain {
    const { width, height } = map
    const cells = map.layers.find(
        (layer) => layer.type === 'tilelayer' && layer.name === 'Paths and ponds'
    )?.data
    const fortifications = map.layers.find(
        (layer) => layer.type === 'objectgroup' && layer.name === 'Fortifications'
    )?.objects
    return {
        width,
        height,
        water: readWaterCells(cells, width * height, waterTileset),
        fortifications: (fortifications ?? []).flatMap((object) => {
            const { x, y, width, height } = object
            if (object.type !== 'wall' && object.type !== 'gate') return []
            if (width === undefined || height === undefined || width <= 0 || height <= 0) return []
            if (![x, y, width, height].every(Number.isFinite)) return []
            return [{ x, y, width, height }]
        }),
    }
}

function readWaterCells(
    cells: readonly number[] | undefined,
    count: number,
    tileset: WaterTileset | undefined
): Uint8Array {
    if (!cells || !tileset?.tilecount || tileset.firstgid <= 0) return new Uint8Array()
    const { firstgid, tilecount } = tileset
    let wet = new Uint8Array()
    for (let index = 0; index < Math.min(cells.length, count); index++) {
        const gid = (cells[index] ?? 0) & gidMask
        if (gid < firstgid || gid >= firstgid + tilecount) continue
        if (wet.length === 0) wet = new Uint8Array(count)
        wet[index] = 1
    }
    return wet
}

export function distanceInTiles(from: Vector2, to: Vector2, size: TileSize): number {
    return Math.hypot((from.x - to.x) / size.tileWidth, (from.y - to.y) / size.tileHeight)
}

export function distanceToWater(
    terrain: AmbientTerrain,
    listener: Vector2,
    size: TileSize,
    radius: number
): number {
    if (terrain.water.length === 0) return Infinity
    const x = listener.x / size.tileWidth
    const y = listener.y / size.tileHeight
    let nearest = Infinity
    const maxRow = Math.min(terrain.height - 1, Math.floor(y + radius))
    const maxColumn = Math.min(terrain.width - 1, Math.floor(x + radius))
    for (let row = Math.max(0, Math.floor(y - radius)); row <= maxRow; row++) {
        for (let column = Math.max(0, Math.floor(x - radius)); column <= maxColumn; column++) {
            if (!terrain.water[row * terrain.width + column]) continue
            const dx = distanceToInterval(x, column, column + 1)
            const dy = distanceToInterval(y, row, row + 1)
            nearest = Math.min(nearest, Math.hypot(dx, dy))
        }
    }
    return nearest
}

export function isNearFortification(
    terrain: AmbientTerrain,
    listener: Vector2,
    size: TileSize,
    radius: number
): boolean {
    return terrain.fortifications.some(({ x, y, width, height }) => {
        const dx = distanceToInterval(listener.x, x, x + width) / size.tileWidth
        const dy = distanceToInterval(listener.y, y, y + height) / size.tileHeight
        return Math.hypot(dx, dy) <= radius
    })
}

function distanceToInterval(point: number, start: number, end: number): number {
    return Math.max(0, start - point, point - end)
}
