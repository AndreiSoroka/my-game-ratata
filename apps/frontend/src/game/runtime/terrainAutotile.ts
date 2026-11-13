/** Mystic Woods ground atlases use a 3×3 border plus four concave-corner tiles. */
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
        return has(dx, dy) ? 8 : inner
    }
    return [
        corner(-1, -1, 1, 2, 7, 11),
        corner(1, -1, 3, 2, 9, 10),
        corner(-1, 1, 13, 14, 7, 5),
        corner(1, 1, 15, 14, 9, 4),
    ]
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
    const quadrants = terrainQuadrants(data, width, height, index)
    if (!quadrants) return false
    const x = (index % width) * tileWidth,
        y = Math.floor(index / width) * tileHeight
    quadrants.forEach((tile, quadrant) => {
        const dx = (quadrant % 2) * 8,
            dy = Math.floor(quadrant / 2) * 8
        context.drawImage(
            image,
            (tile % 6) * 16 + dx,
            Math.floor(tile / 6) * 16 + dy,
            8,
            8,
            x + (dx / 16) * tileWidth,
            y + (dy / 16) * tileHeight,
            tileWidth / 2,
            tileHeight / 2
        )
    })
    return true
}
