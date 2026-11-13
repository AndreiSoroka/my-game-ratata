/** Clear isolated water fragments left where reserved routes or settlements cut a pond. */
export function removePondFragments(ctx) {
    const { width, height, terrain, solid, structures, objects } = ctx
    const remaining = new Set(
        terrain.flatMap((gid, index) =>
            gid >= 110 && gid < 134 ? [index] : []
        )
    )
    for (const start of remaining) {
        if (!remaining.delete(start)) continue
        const cells = [start]
        for (const index of cells) {
            const x = index % width,
                y = Math.floor(index / width)
            for (const [dx, dy] of [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
            ]) {
                const nx = x + dx,
                    ny = y + dy,
                    next = ny * width + nx
                if (
                    nx >= 0 &&
                    ny >= 0 &&
                    nx < width &&
                    ny < height &&
                    remaining.delete(next)
                )
                    cells.push(next)
            }
        }
        const xs = cells.map((index) => index % width),
            ys = cells.map((index) => Math.floor(index / width))
        if (
            cells.length >= 9 &&
            Math.max(...xs) - Math.min(...xs) >= 2 &&
            Math.max(...ys) - Math.min(...ys) >= 2
        )
            continue
        for (const index of cells) {
            terrain[index] = 0
            if (!structures[index] && !objects[index]) solid[index] = 0
        }
    }
}
