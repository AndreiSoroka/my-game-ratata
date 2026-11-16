import {
    SMALL_POND_MAX_CELLS,
    WORLD_GENERATION_SETTINGS,
} from './generate-world-settings.mjs'

/** A drinkable pond is one exact authored footprint, not an arbitrary shore tile. */
export function createPondDrinkingAreas(ctx, perimeterReachable) {
    const { width, height, terrain } = ctx
    const maxCells =
        ctx.settings?.smallPondMaxCells ??
        WORLD_GENERATION_SETTINGS.smallPondMaxCells
    if (
        !Number.isInteger(maxCells) ||
        maxCells < 1 ||
        maxCells > SMALL_POND_MAX_CELLS
    )
        throw new Error(
            `smallPondMaxCells must be between 1 and ${SMALL_POND_MAX_CELLS}`
        )
    const seen = new Set()
    const ponds = []
    const water = (cell) => terrain[cell] >= 110 && terrain[cell] < 134
    for (let start = 0; start < terrain.length; start++) {
        if (seen.has(start) || !water(start)) continue
        const cells = [start]
        seen.add(start)
        for (const cell of cells) {
            const x = cell % width,
                y = Math.floor(cell / width)
            for (const [nx, ny] of [
                [x - 1, y],
                [x + 1, y],
                [x, y - 1],
                [x, y + 1],
            ]) {
                const next = ny * width + nx
                if (
                    nx < 0 ||
                    ny < 0 ||
                    nx >= width ||
                    ny >= height ||
                    seen.has(next) ||
                    !water(next)
                )
                    continue
                seen.add(next)
                cells.push(next)
            }
        }
        if (
            cells.length > maxCells ||
            !cells.some((cell) =>
                perimeterReachable(cell % width, Math.floor(cell / width), 1, 1)
            )
        )
            continue
        const xs = cells.map((cell) => cell % width)
        const ys = cells.map((cell) => Math.floor(cell / width))
        const x = Math.min(...xs),
            y = Math.min(...ys)
        ponds.push({
            x,
            y,
            width: Math.max(...xs) - x + 1,
            height: Math.max(...ys) - y + 1,
            anchor: `${start % width}:${Math.floor(start / width)}`,
            interactionAreas: rowAreas(cells, width),
        })
    }
    return ponds
}

function rowAreas(cells, width) {
    const rows = new Map()
    for (const cell of cells) {
        const y = Math.floor(cell / width)
        if (!rows.has(y)) rows.set(y, [])
        rows.get(y).push(cell % width)
    }
    const areas = []
    for (const [y, xs] of [...rows].sort(([a], [b]) => a - b)) {
        xs.sort((a, b) => a - b)
        let first = xs[0],
            last = first
        for (const x of xs.slice(1)) {
            if (x !== last + 1) {
                areas.push({
                    x: first * 16,
                    y: y * 16,
                    width: (last - first + 1) * 16,
                    height: 16,
                })
                first = x
            }
            last = x
        }
        areas.push({
            x: first * 16,
            y: y * 16,
            width: (last - first + 1) * 16,
            height: 16,
        })
    }
    return areas
}
