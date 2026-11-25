/** Mystic Woods ground atlases use a 3×3 border plus four concave-corner tiles. */
export const interiorTerrainTile = 8

const terrainTileSize = 16
const terrainQuarterSize = terrainTileSize / 2
const waterAtlasStart = 110

type TerrainQuadrants = [number, number, number, number]

// The four connections represented by each complete Mystic Woods water tile.
const waterTileShapes: Partial<Record<number, TerrainQuadrants>> = {
    1: [1, 2, 7, 8],
    2: [2, 2, 8, 8],
    3: [2, 3, 8, 9],
    4: [8, 8, 8, 4],
    5: [8, 8, 5, 8],
    7: [7, 8, 7, 8],
    9: [8, 9, 8, 9],
    10: [8, 10, 8, 8],
    11: [11, 8, 8, 8],
    13: [7, 8, 13, 14],
    14: [8, 8, 14, 14],
    15: [8, 9, 14, 15],
}

export interface TerrainRegion {
    sourceX: number
    sourceY: number
    sourceWidth: number
    sourceHeight: number
    x: number
    y: number
    width: number
    height: number
}

type TerrainTileRegion = TerrainRegion & { tile: number }

export function terrainAtlasStart(gid: number): number | undefined {
    if (gid >= 38 && gid < 62) return 38
    if (gid >= waterAtlasStart && gid < waterAtlasStart + 24) return waterAtlasStart
    return undefined
}

/** NW, NE, SW, SE quadrants; diagonals matter at junctions and concave shores. */
export function terrainQuadrants(
    data: readonly number[],
    width: number,
    height: number,
    index: number
): TerrainQuadrants | undefined {
    const atlas = terrainAtlasStart(data[index] ?? 0)
    if (atlas === undefined) return undefined
    const x = index % width,
        y = Math.floor(index / width)
    const has = (dx: number, dy: number): boolean =>
        x + dx >= 0 &&
        y + dy >= 0 &&
        x + dx < width &&
        y + dy < height &&
        terrainAtlasStart(data[(y + dy) * width + x + dx] ?? 0) === atlas
    const corner = (
        dx: number,
        dy: number,
        outer: number,
        horizontal: number,
        vertical: number,
        inner: number
    ): number => {
        const side = has(dx, 0),
            end = has(0, dy)
        if (!side && !end) return outer
        if (!end) return horizontal
        if (!side) return vertical
        return has(dx, dy) ? interiorTerrainTile : inner
    }
    return [
        corner(-1, -1, 1, 2, 7, 11),
        corner(1, -1, 3, 2, 9, 10),
        corner(-1, 1, 13, 14, 7, 5),
        corner(1, 1, 15, 14, 9, 4),
    ]
}

function waterSourceTiles(quadrants: TerrainQuadrants): TerrainQuadrants {
    // The bank and its shadow can cross both quadrant boundaries in the atlas.
    const wholeTile = quadrants.find((tile) =>
        waterTileShapes[tile]?.every((quarter, index) => quarter === quadrants[index])
    )
    if (wholeTile !== undefined) return [wholeTile, wholeTile, wholeTile, wholeTile]

    // On compound shores, extend the north bank where it will not replace a south edge.
    const [northwest, northeast, southwest, southeast] = quadrants
    return [
        northwest,
        northeast,
        southwest === interiorTerrainTile || southwest === 7 ? northwest : southwest,
        southeast === interiorTerrainTile || southeast === 9 ? northeast : southeast,
    ]
}

function tileRegion(
    tile: number,
    x: number,
    y: number,
    width: number,
    height: number,
    sourceY = y,
    sourceHeight = height
): TerrainTileRegion {
    return {
        tile,
        sourceX: (tile % 6) * terrainTileSize + x,
        sourceY: Math.floor(tile / 6) * terrainTileSize + sourceY,
        sourceWidth: width,
        sourceHeight,
        x,
        y,
        width,
        height,
    }
}

function opposingWaterBanks(north: number, south: number): boolean {
    return [1, 2, 3, 10, 11].includes(north) && [4, 5, 13, 14, 15].includes(south)
}

function narrowWaterRegions(north: number, south: number, x: number): TerrainTileRegion[] {
    const slices = south === 4 || south === 5 ? 4 : 1
    const width = terrainQuarterSize / slices
    const regions: TerrainTileRegion[] = []
    for (let slice = 0; slice < slices; slice++) {
        const left = x + slice * width
        // Feather the concave turn toward the adjoining full-depth north bank.
        const split = 12 + (south === 4 ? slices - 1 - slice : slice)
        regions.push(
            tileRegion(north, left, 0, width, split, 0, terrainTileSize),
            tileRegion(south, left, split, width, terrainTileSize - split, 11, 5)
        )
    }
    return regions
}

function terrainTileRegions(quadrants: TerrainQuadrants, water: boolean): TerrainTileRegion[] {
    const tiles = water ? waterSourceTiles(quadrants) : quadrants
    const quarters = tiles.map((tile, index) =>
        tileRegion(
            tile,
            (index % 2) * terrainQuarterSize,
            Math.floor(index / 2) * terrainQuarterSize,
            terrainQuarterSize,
            terrainQuarterSize
        )
    )
    if (!water) return quarters
    const [northwest, northeast, southwest, southeast] = quadrants
    const narrowWest = opposingWaterBanks(northwest, southwest)
    const narrowEast = opposingWaterBanks(northeast, southeast)
    if (!narrowWest && !narrowEast) return quarters
    return [
        ...(narrowWest
            ? narrowWaterRegions(northwest, southwest, 0)
            : [quarters[0]!, quarters[2]!]),
        ...(narrowEast
            ? narrowWaterRegions(northeast, southeast, terrainQuarterSize)
            : [quarters[1]!, quarters[3]!]),
    ]
}

export function terrainRegions(
    data: readonly number[],
    width: number,
    height: number,
    index: number,
    tileWidth: number,
    tileHeight: number
): TerrainTileRegion[] | undefined {
    const quadrants = terrainQuadrants(data, width, height, index)
    if (!quadrants) return undefined
    const water = terrainAtlasStart(data[index] ?? 0) === waterAtlasStart
    const x = (index % width) * tileWidth
    const y = Math.floor(index / width) * tileHeight
    const scaleX = tileWidth / terrainTileSize
    const scaleY = tileHeight / terrainTileSize
    return terrainTileRegions(quadrants, water).map((region) => ({
        ...region,
        x: x + region.x * scaleX,
        y: y + region.y * scaleY,
        width: region.width * scaleX,
        height: region.height * scaleY,
    }))
}

export function drawConnectedTerrain(
    context: CanvasRenderingContext2D,
    image: HTMLImageElement,
    data: readonly number[],
    width: number,
    height: number,
    index: number,
    tileWidth = 16,
    tileHeight = 16
): boolean {
    const regions = terrainRegions(data, width, height, index, tileWidth, tileHeight)
    if (!regions) return false
    for (const { sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height } of regions) {
        context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
    }
    return true
}
