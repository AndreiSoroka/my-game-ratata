const town = 512

export function addHamlets(ctx) {
    const {
        width,
        height,
        at,
        terrain,
        plants,
        structures,
        objects,
        solid,
        reserved,
        roads,
        random,
    } = ctx
    const candidates = [
        [34, 14],
        [58, 14],
        [72, 30],
        [12, 50],
        [78, 50],
        [42, 62],
        [9, 18],
        [60, 63],
    ]
    let placed = 0
    const doors = []
    const inside = (x, y) => x >= 4 && y >= 4 && x < width - 4 && y < height - 4
    for (const [x, y] of candidates) {
        if (placed >= 3) break
        const w = 7
        const h = 6
        let blocked = false
        for (let dy = -1; dy <= h + 3; dy += 1)
            for (let dx = -1; dx <= w; dx += 1) {
                if (!inside(x + dx, y + dy)) {
                    blocked = true
                    continue
                }
                const i = at(x + dx, y + dy)
                if (reserved[i] || roads[i] || solid[i] || structures[i])
                    blocked = true
            }
        if (blocked) continue
        const red = random() < 0.5
        const roof = red ? 52 : 48
        for (let dy = 0; dy < h; dy += 1)
            for (let dx = 0; dx < w; dx += 1) {
                const side = dx === 0 ? 0 : dx === w - 1 ? 2 : 1
                const i = at(x + dx, y + dy)
                const tile =
                    dy < 3
                        ? roof + (dy === 0 ? 0 : 12) + side
                        : dy === h - 1 && dx === 3
                          ? 85
                          : dx === 2 && dy === h - 2
                            ? 84
                            : 72 + (side === 2 ? 3 : side)
                structures[i] = town + tile
                terrain[i] = 0
                plants[i] = 0
                objects[i] = 0
                solid[i] = 1
            }
        // A fenced vegetable patch is decorative ground, not a sealed room.
        for (let dy = h + 1; dy <= h + 3; dy += 1)
            for (let dx = 0; dx < w; dx += 1) {
                const i = at(x + dx, y + dy)
                terrain[i] = town + 25
                if (dx % 2 === 0) plants[i] = 25
                reserved[i] = true
            }
        for (const dx of [0, 1, 5, 6]) {
            objects[at(x + dx, y + h)] = town + 81
            solid[at(x + dx, y + h)] = 1
        }
        paveToRoad([x + 3, y + h], ctx)
        doors.push([x + 3, y + h - 1])
        placed += 1
    }
    if (placed === 0)
        throw new Error('Suburb generated without a walkable hamlet')
    return doors
}

function paveToRoad([x, y], ctx) {
    const {
        width,
        height,
        at,
        terrain,
        plants,
        objects,
        solid,
        roads,
        reserved,
    } = ctx
    const start = at(x, y)
    const parents = new Int32Array(width * height).fill(-1)
    const queue = [start]
    parents[start] = start
    let end
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor]
        if (roads[index]) {
            end = index
            break
        }
        const px = index % width
        const py = Math.floor(index / width)
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            if (
                px + dx < 4 ||
                py + dy < 4 ||
                px + dx >= width - 4 ||
                py + dy >= height - 4
            )
                continue
            const next = at(px + dx, py + dy)
            if (parents[next] !== -1 || solid[next] !== 0) continue
            parents[next] = index
            queue.push(next)
        }
    }
    if (end === undefined) throw new Error('Suburb door is unreachable')
    for (let index = end; ; index = parents[index]) {
        terrain[index] = town + 25
        plants[index] = 0
        objects[index] = 0
        reserved[index] = true
        roads[index] = true
        const px = index % width
        const py = Math.floor(index / width)
        for (let dy = -1; dy <= 1; dy += 1)
            for (let dx = -1; dx <= 1; dx += 1) {
                if (
                    px + dx >= 0 &&
                    py + dy >= 0 &&
                    px + dx < width &&
                    py + dy < height
                )
                    reserved[at(px + dx, py + dy)] = true
            }
        if (index === start) break
    }
}
