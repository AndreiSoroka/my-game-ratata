import { signText } from './generate-sign-text.mjs'

const barrelGids = new Set([198 + 3, 512 + 129, 512 + 130, 768 + 85])
const waterGids = new Set([512 + 104, 512 + 131, 768 + 124])

export function createWorldInteractions(ctx, location, landmarks) {
    const { width, height, at, objects, terrain, structures, solid } = ctx
    const result = []
    const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    function add(type, x, y, w, h, name, text) {
        const action =
            type === 'sign' ? 'read' : type === 'barrel' ? 'search' : 'drink'
        result.push({
            id: 2000 + result.length,
            name,
            type,
            x: x * 16,
            y: y * 16,
            width: w * 16,
            height: h * 16,
            rotation: 0,
            visible: true,
            properties: [
                {
                    name: 'interactionId',
                    type: 'string',
                    value: `${location.id}:${type}:${x}:${y}`,
                },
                { name: 'action', type: 'string', value: action },
                { name: 'text', type: 'string', value: text },
            ],
        })
    }
    // Collision is explicit for every barrel, including legacy campsite props.
    for (let i = 0; i < objects.length; i += 1)
        if (barrelGids.has(objects[i]) || waterGids.has(objects[i]))
            solid[i] = 1
    const reachable = new Set([at(48, 40)])
    const queue = [...reachable]
    for (const cell of queue) {
        const x = cell % width,
            y = Math.floor(cell / width)
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const next = at(x + dx, y + dy)
            if (!inside(x + dx, y + dy) || solid[next] || reachable.has(next))
                continue
            reachable.add(next)
            queue.push(next)
        }
    }
    function perimeterReachable(x, y, w, h) {
        for (let px = x; px < x + w; px += 1)
            for (const py of [y - 1, y + h])
                if (inside(px, py) && reachable.has(at(px, py))) return true
        for (let py = y; py < y + h; py += 1)
            for (const px of [x - 1, x + w])
                if (inside(px, py) && reachable.has(at(px, py))) return true
        return false
    }
    const signs = [
        { name: location.name, x: 45, y: 36 },
        { name: 'Восточный путь', x: 90, y: 37 },
        { name: 'Западный путь', x: 5, y: 37 },
        { name: 'Северный путь', x: 45, y: 5 },
        { name: 'Южный путь', x: 45, y: 74 },
        ...landmarks.map((sign) => ({
            name: sign.name,
            x: Math.floor(sign.x / 16),
            y: Math.floor(sign.y / 16),
        })),
    ]
    const placed = new Set()
    for (const sign of signs) {
        const choices = []
        for (let dy = -2; dy <= 2; dy += 1)
            for (let dx = -2; dx <= 2; dx += 1)
                choices.push({
                    x: sign.x + dx,
                    y: sign.y + dy,
                    distance: Math.abs(dx) + Math.abs(dy),
                })
        choices.sort((a, b) => a.distance - b.distance)
        const point = choices.find(
            ({ x, y }) =>
                inside(x, y) &&
                reachable.has(at(x, y)) &&
                (!objects[at(x, y)] ||
                    objects[at(x, y)] === 198 ||
                    objects[at(x, y)] === 512 + 83) &&
                !structures[at(x, y)] &&
                !placed.has(at(x, y))
        )
        if (!point)
            throw new Error(
                `No reachable sign position: ${location.id}/${sign.name}`
            )
        const { x, y } = point
        objects[at(x, y)] = 512 + 83
        placed.add(at(x, y))
        add('sign', x, y, 1, 1, sign.name, signText(location, sign.name))
    }
    for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
            const tile = objects[at(x, y)]
            if (barrelGids.has(tile)) {
                if (!perimeterReachable(x, y, 1, 1))
                    throw new Error(
                        `Inaccessible barrel ${location.id}/${x}/${y}`
                    )
                add(
                    'barrel',
                    x,
                    y,
                    1,
                    1,
                    'Бочка общих припасов',
                    'Общие припасы путников. Содержимое можно забрать только один раз.'
                )
            }
            if (waterGids.has(tile)) {
                if (!perimeterReachable(x, y, 1, 1))
                    throw new Error(
                        `Inaccessible water ${location.id}/${x}/${y}`
                    )
                add(
                    'water',
                    x,
                    y,
                    1,
                    1,
                    'Чистая вода',
                    'Прохладная вода помогает перевести дух.'
                )
            }
            if (tile === 768 + 110 && objects[at(x + 1, y)] === 768 + 111) {
                solid[at(x, y)] = 1
                solid[at(x + 1, y)] = 1
                if (!perimeterReachable(x, y, 2, 1))
                    throw new Error(`Inaccessible trough ${location.id}`)
                add(
                    'water',
                    x,
                    y,
                    2,
                    1,
                    'Поилка с водой',
                    'Чистая вода для путников и животных.'
                )
            }
        }
    // One reachable shore per connected pond, rather than a drink action per water tile.
    const seen = new Set()
    const isWater = (cell) => terrain[cell] >= 110 && terrain[cell] < 134
    for (let start = 0; start < terrain.length; start += 1) {
        if (seen.has(start) || !isWater(start)) continue
        const pond = [start]
        seen.add(start)
        for (const cell of pond) {
            const x = cell % width,
                y = Math.floor(cell / width)
            for (const [dx, dy] of [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ]) {
                const next = at(x + dx, y + dy)
                if (!inside(x + dx, y + dy) || seen.has(next) || !isWater(next))
                    continue
                seen.add(next)
                pond.push(next)
            }
        }
        const shore = pond.find((cell) =>
            perimeterReachable(cell % width, Math.floor(cell / width), 1, 1)
        )
        if (shore !== undefined)
            add(
                'water',
                shore % width,
                Math.floor(shore / width),
                1,
                1,
                'Вода у берега',
                'Здесь можно зачерпнуть чистой воды, не заходя в пруд.'
            )
    }
    return result
}
