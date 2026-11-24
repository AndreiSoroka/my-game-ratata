import {
    CENTER_LOCATION_ID,
    QUEST_BOARD_OBJECT_ID,
} from '../contracts/src/world.ts'
import { signContent } from './generate-sign-text.mjs'
import { createPondDrinkingAreas } from './generate-pond-interactions.mjs'

const barrelGids = new Set([198 + 3, 512 + 129, 512 + 130, 768 + 85])
const waterGids = new Set([512 + 104, 512 + 131, 768 + 124])
const signOffsetCache = new Map()
function signOffsets(radius) {
    if (signOffsetCache.has(radius)) return signOffsetCache.get(radius)
    const offsets = []
    for (let dy = -radius; dy <= radius; dy++)
        for (let dx = -radius; dx <= radius; dx++)
            offsets.push({ dx, dy, distance: Math.abs(dx) + Math.abs(dy) })
    offsets.sort((a, b) => a.distance - b.distance)
    signOffsetCache.set(radius, offsets)
    return offsets
}

export function createWorldInteractions(ctx, location, landmarks) {
    const { width, height, at, objects, structures, solid } = ctx
    const result = []
    const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height
    function add(type, x, y, w, h, name, text, geometry = {}) {
        const action =
            type === 'sign' || type === 'quest_board'
                ? 'read'
                : type === 'barrel'
                  ? 'open'
                  : 'drink'
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
                    value: geometry.id ?? `${location.id}:${type}:${x}:${y}`,
                },
                { name: 'action', type: 'string', value: action },
                { name: 'text', type: 'string', value: text },
                ...(geometry.sign && location.id === CENTER_LOCATION_ID
                    ? [
                          {
                              name: 'nameMessageKey',
                              type: 'string',
                              value: geometry.sign.nameKey,
                          },
                          {
                              name: 'textMessageKey',
                              type: 'string',
                              value: geometry.sign.textKey,
                          },
                      ]
                    : []),
                ...(type === 'barrel'
                    ? [
                          {
                              name: 'propId',
                              type: 'string',
                              value: `${location.id}:prop:${x}:${y}`,
                          },
                          {
                              name: 'contents',
                              type: 'string',
                              value: JSON.stringify([
                                  { itemId: 'wood', quantity: 1 },
                                  { itemId: 'fiber', quantity: 1 },
                              ]),
                          },
                      ]
                    : []),
                ...(geometry.interactionAreas
                    ? [
                          {
                              name: 'interactionAreas',
                              type: 'string',
                              value: JSON.stringify(geometry.interactionAreas),
                          },
                      ]
                    : []),
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
            id: sign.properties?.find((entry) => entry.name === 'interactionId')
                ?.value,
            x: Math.floor(sign.x / 16),
            y: Math.floor(sign.y / 16),
        })),
    ]
    const placed = new Set()
    for (const sign of signs) {
        let point
        for (const { dx, dy } of signOffsets(ctx.signSearchRadius ?? 2)) {
            const x = sign.x + dx,
                y = sign.y + dy
            if (
                inside(x, y) &&
                !ctx.signExclusion?.[at(x, y)] &&
                reachable.has(at(x, y)) &&
                (!objects[at(x, y)] ||
                    objects[at(x, y)] === 198 ||
                    objects[at(x, y)] === 512 + 83) &&
                !structures[at(x, y)] &&
                !placed.has(at(x, y))
            ) {
                point = { x, y }
                break
            }
        }
        if (!point)
            throw new Error(
                `No reachable sign position: ${location.id}/${sign.name}`
            )
        const { x, y } = point
        objects[at(x, y)] = 512 + 83
        placed.add(at(x, y))
        const content = signContent(location, sign.name)
        add('sign', x, y, 1, 1, sign.name, content.text, {
            id: sign.id,
            sign: content,
        })
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
                    'Общие припасы путников. Открой бочку, чтобы осмотреть или переложить вещи.'
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
                    tile === 512 + 104 ? 'Колодец' : 'Чистая вода',
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
    for (const pond of createPondDrinkingAreas(ctx, perimeterReachable)) {
        add(
            'water',
            pond.x,
            pond.y,
            pond.width,
            pond.height,
            'Вода у берега',
            'У любого доступного берега этого небольшого пруда можно зачерпнуть воды.',
            {
                id: `${location.id}:water:pond:${pond.anchor}`,
                interactionAreas: pond.interactionAreas,
            }
        )
    }
    if (location.id === CENTER_LOCATION_ID) {
        const guild = landmarks.find((landmark) =>
            landmark.properties?.some(
                ({ name, value }) => name === 'kind' && value === 'guild'
            )
        )
        if (!guild)
            throw new Error(
                'Cannot place the quest board without an authored guild'
            )
        const x = Math.floor(guild.x / 16) - 2,
            y = Math.floor(guild.y / 16),
            index = at(x, y)
        if (
            !inside(x, y) ||
            !reachable.has(index) ||
            objects[index] ||
            structures[index]
        ) {
            throw new Error(
                'The guild quest board must have a free, reachable tile'
            )
        }
        objects[index] = 512 + 83
        add('quest_board', x, y, 1, 1, 'Доска заказов', 'Доска заказов', {
            id: QUEST_BOARD_OBJECT_ID,
        })
    }
    return result
}
