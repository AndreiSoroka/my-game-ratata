const town = 512
const horizontalWall = town + 100
const verticalWall = town + 123
const property = (name, value, type = 'string') => ({ name, type, value })
const directions = ['north', 'south', 'west', 'east']

function part(id, type, name, x, y, w, h, extra = []) {
    return {
        id,
        name,
        type,
        x: x * 16,
        y: y * 16,
        width: w * 16,
        height: h * 16,
        rotation: 0,
        visible: true,
        properties: extra,
    }
}
function gate(direction, nextId) {
    const horizontal = direction === 'north' || direction === 'south'
    const line =
        direction === 'north'
            ? 12
            : direction === 'south'
              ? 67
              : direction === 'west'
                ? 12
                : 84
    const centre = horizontal ? 48 : 40
    const supports = [-5, 4].map((offset, index) =>
        horizontal
            ? part(
                  nextId(),
                  'gate_support',
                  `${direction}-support-${index}`,
                  centre + offset,
                  line - (direction === 'north' ? 1 : 0),
                  2,
                  2
              )
            : part(
                  nextId(),
                  'gate_support',
                  `${direction}-support-${index}`,
                  line - (direction === 'west' ? 1 : 0),
                  centre + offset,
                  2,
                  2
              )
    )
    const leaves = [-8, 6].map((offset, index) =>
        horizontal
            ? part(
                  nextId(),
                  'gate_leaf',
                  `${direction}-leaf-${index}`,
                  centre + offset,
                  line,
                  3,
                  1,
                  [
                      property('tiles', JSON.stringify([14, 15, 16])),
                      property('direction', direction),
                  ]
              )
            : part(
                  nextId(),
                  'gate_leaf',
                  `${direction}-leaf-${index}`,
                  line,
                  centre + offset,
                  1,
                  3,
                  [
                      property('tiles', JSON.stringify([1, 5, 9])),
                      property('direction', direction),
                  ]
              )
    )
    const opening = horizontal
        ? { x: centre - 3, y: line, w: 7, h: 1 }
        : { x: line, y: centre - 3, w: 1, h: 7 }
    const node = part(
        nextId(),
        'gate',
        direction,
        horizontal ? centre - 8 : line - 1,
        horizontal ? line - 1 : centre - 8,
        horizontal ? 17 : 3,
        horizontal ? 3 : 17,
        [
            property('direction', direction),
            property('opening', JSON.stringify(opening)),
            property('openingWidth', 7, 'int'),
        ]
    )
    return { node, supports, leaves, opening }
}

function wallFootprints(walls, nextId) {
    const lines = new Map()
    for (const [x, y, tile] of walls) {
        const horizontal = tile === horizontalWall
        const line = horizontal ? y : x
        const key = `${tile}:${line}`
        const run = lines.get(key) ?? { horizontal, line, offsets: [] }
        run.offsets.push(horizontal ? x : y)
        lines.set(key, run)
    }
    const rectangles = []
    for (const { horizontal, line, offsets } of lines.values()) {
        const ordered = offsets.sort((a, b) => a - b)
        let start = ordered[0]
        for (let index = 0; index < ordered.length; index++) {
            const end = ordered[index]
            if (ordered[index + 1] === end + 1) continue
            const id = nextId()
            const length = end - start + 1
            const name = `wall-${id}`
            rectangles.push(
                horizontal
                    ? part(id, 'wall', name, start, line, length, 1)
                    : part(id, 'wall', name, line, start, 1, length)
            )
            start = ordered[index + 1]
        }
    }
    return rectangles
}

/** Reserve every collision and visible pixel footprint before any plot is chosen. */
export function planFortifications(width = 96, height = 80) {
    let id = 50000
    const nextId = () => id++
    const corners = [
        [11, 11],
        [83, 11],
        [11, 66],
        [83, 66],
    ].map(([x, y], index) =>
        part(nextId(), 'corner_tower', `corner-${index}`, x, y, 3, 3)
    )
    const gates = directions.map((direction) => gate(direction, nextId))
    const walls = []
    for (let x = 12; x <= 84; x++)
        for (const y of [12, 67])
            if (Math.abs(x - 48) > 3) walls.push([x, y, horizontalWall])
    for (let y = 12; y <= 67; y++)
        for (const x of [12, 84])
            if (Math.abs(y - 40) > 3) walls.push([x, y, verticalWall])
    const reserved = Array(width * height).fill(false)
    const reserve = (x, y, w, h) => {
        for (let py = y - 2; py < y + h + 2; py++)
            for (let px = x - 2; px < x + w + 2; px++)
                if (px >= 0 && py >= 0 && px < width && py < height)
                    reserved[py * width + px] = true
    }
    for (const [x, y] of walls) reserve(x, y, 1, 1)
    for (const item of [
        ...corners,
        ...gates.flatMap((entry) => [...entry.supports, ...entry.leaves]),
    ])
        reserve(item.x / 16, item.y / 16, item.width / 16, item.height / 16)
    // The whole opening is also a protected passage; only roads may be stamped here.
    for (const { opening } of gates)
        reserve(opening.x, opening.y, opening.w, opening.h)
    return {
        corners,
        gates,
        walls,
        wallFootprints: wallFootprints(walls, nextId),
        reserved,
    }
}

export function drawFortifications(ctx, plan) {
    const { structures, objects, solid, at } = ctx
    const paint = (x, y, tile) => {
        structures[at(x, y)] = tile
        solid[at(x, y)] = 1
    }
    for (const [x, y, tile] of plan.walls) paint(x, y, tile)
    for (const item of plan.corners) {
        const x = item.x / 16,
            y = item.y / 16
        for (let dy = 0; dy < 3; dy++)
            for (let dx = 0; dx < 3; dx++)
                paint(x + dx, y + dy, town + [96, 108, 120][dy] + dx)
    }
    for (const { supports, leaves } of plan.gates) {
        for (const item of supports) {
            const x = item.x / 16,
                y = item.y / 16
            for (let dy = 0; dy < 2; dy++)
                for (let dx = 0; dx < 2; dx++)
                    paint(x + dx, y + dy, town + (dy ? 120 : 96) + (dx ? 2 : 0))
        }
        for (const leaf of leaves) {
            const tiles = JSON.parse(
                leaf.properties.find((entry) => entry.name === 'tiles').value
            )
            const x = leaf.x / 16,
                y = leaf.y / 16,
                columns = leaf.width / 16
            for (let index = 0; index < tiles.length; index++)
                objects[
                    at(x + (index % columns), y + Math.floor(index / columns))
                ] = tiles[index]
        }
    }
    return [
        ...plan.corners,
        ...plan.gates.flatMap(({ node, supports, leaves }) => [
            node,
            ...supports,
            ...leaves,
        ]),
        ...plan.wallFootprints,
    ]
}
