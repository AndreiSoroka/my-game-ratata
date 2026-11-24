/** Mystic Woods ground atlases use a 3×3 border plus four concave-corner tiles. */
export const interiorTerrainTile = 8
export const terrainQuarterSize = 8

export interface TerrainQuarter {
    sourceX: number
    sourceY: number
    x: number
    y: number
    width: number
    height: number
}

export function terrainAtlasStart(gid: number): number | undefined {
    if (gid >= 38 && gid < 62) return 38
    if (gid >= 110 && gid < 134) return 110
    return undefined
}

/** NW, NE, SW, SE quadrants; diagonals matter at junctions and concave shores. */
export function terrainQuadrants(
    data: readonly number[],
    width: number,
    height: number,
    index: number
): number[] | undefined {
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

export function terrainQuarters(
    data: readonly number[],
    width: number,
    height: number,
    index: number,
    tileWidth: number,
    tileHeight: number
): (TerrainQuarter & { tile: number })[] | undefined {
    const quadrants = terrainQuadrants(data, width, height, index)
    if (!quadrants) return undefined
    const x = (index % width) * tileWidth
    const y = Math.floor(index / width) * tileHeight
    return quadrants.map((tile, quadrant) => {
        const column = quadrant % 2
        const row = Math.floor(quadrant / 2)
        return {
            tile,
            sourceX: (tile % 6) * 16 + column * terrainQuarterSize,
            sourceY: Math.floor(tile / 6) * 16 + row * terrainQuarterSize,
            x: x + (column * tileWidth) / 2,
            y: y + (row * tileHeight) / 2,
            width: tileWidth / 2,
            height: tileHeight / 2,
        }
    })
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
    const quarters = terrainQuarters(data, width, height, index, tileWidth, tileHeight)
    if (!quarters) return false
    for (const quarter of quarters) {
        context.drawImage(
            image,
            quarter.sourceX,
            quarter.sourceY,
            terrainQuarterSize,
            terrainQuarterSize,
            quarter.x,
            quarter.y,
            quarter.width,
            quarter.height
        )
    }
    return true
}
