import { recordProp } from './generate-depth.mjs'
import { pavingGid } from './generate-ground.mjs'

const tileSize = 16
const originalGid = 2048
const propGid = 3072
const towerGid = 3074
const connectedWallsGid = 3101
const originalTileset = {
    firstgid: originalGid,
    source: 'tilesets/0x72Dungeon/dungeon.json',
}
const propTileset = {
    firstgid: propGid,
    source: 'tilesets/Novogorod/dungeon-props.json',
}
const connectedWallsTileset = {
    firstgid: connectedWallsGid,
    source: 'tilesets/0x72Dungeon/low-walls.json',
}
export const towerTileset = {
    firstgid: towerGid,
    source: 'tilesets/Novogorod/dungeon-towers.json',
}

const profiles = {
    small: {
        columns: 3,
        rows: 2,
        cellWidth: 12,
        cellHeight: 13,
        minimum: 3,
        maximum: 9,
        roomCount: 4,
    },
    medium: {
        columns: 3,
        rows: 3,
        cellWidth: 21,
        cellHeight: 19,
        minimum: 5,
        maximum: 15,
        roomCount: 6,
    },
    large: {
        columns: 3,
        rows: 3,
        cellWidth: 37,
        cellHeight: 35,
        minimum: 8,
        maximum: 30,
        roomCount: 8,
    },
}
const dungeonTypes = [
    ['small', 'Старый склеп'],
    ['large', 'Глубокие катакомбы'],
    ['medium-1', 'Подземелье дозорных'],
    ['medium-2', 'Залы под руинами'],
]

function seededRoll(seed) {
    let state = 2166136261
    for (const character of String(seed)) {
        state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0
    }
    return (limit) => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0
        return Math.floor((state / 4294967296) * limit)
    }
}

export function generateDungeonRegion(seed, surfaceLocations) {
    const roll = seededRoll(`dungeons:${seed}`)
    const locations = [...surfaceLocations]
    const count = 2 + roll(3)
    const firstTowerVariant = roll(3)
    return dungeonTypes.slice(0, count).map(([id, name], index) => {
        const [surface] = locations.splice(roll(locations.length), 1)
        return {
            id: `dungeon-${id}`,
            name,
            size: id.startsWith('medium') ? 'medium' : id,
            surfaceLocationId: surface.id,
            dangerLevel: surface.dangerLevel,
            towerVariant: (firstTowerVariant + index) % 3,
        }
    })
}

const prop = (name, type, value) => ({ name, type, value })
const tileCenter = (tile) => (tile + 0.5) * tileSize
const originalTile = (x, y) => originalGid + y * 32 + x
const connectedWall = (x, y) => connectedWallsGid + y * 12 + x
const cardinal = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
]

function point(id, name, type, x, y, properties = []) {
    return {
        id,
        name,
        type,
        x,
        y,
        width: 0,
        height: 0,
        rotation: 0,
        visible: true,
        point: true,
        properties,
    }
}

function objectLayer(id, name, objects) {
    return {
        id,
        name,
        objects,
        type: 'objectgroup',
        draworder: 'topdown',
        opacity: 1,
        visible: false,
    }
}

function passage(id, definition, isEntrance, x, y, arrivalY) {
    return point(
        id,
        isEntrance ? 'Вход в подземелье' : 'Выход на поверхность',
        'dungeon_passage',
        tileCenter(x),
        tileCenter(y),
        [
            prop(
                'id',
                'string',
                `${definition.id}:${isEntrance ? 'entrance' : 'exit'}`
            ),
            prop(
                'destinationLocationId',
                'string',
                isEntrance ? definition.id : definition.surfaceLocationId
            ),
            prop('arrivalX', 'int', tileCenter(x)),
            prop('arrivalY', 'int', tileCenter(arrivalY)),
            ...(isEntrance ? [] : [prop('triggerRadius', 'int', 12)]),
        ]
    )
}

function walkDistances({ at, height, solid, width }, start, extraWalls) {
    const distance = new Int16Array(width * height).fill(-1)
    const queue = [...start]
    for (const cell of queue) distance[cell] = 0
    for (const cell of queue) {
        const x = cell % width
        const y = Math.floor(cell / width)
        for (const [dx, dy] of cardinal) {
            const nx = x + dx
            const ny = y + dy
            const next = at(nx, ny)
            if (
                nx < 0 ||
                nx >= width ||
                ny < 0 ||
                ny >= height ||
                solid[next] ||
                extraWalls?.has(next) ||
                distance[next] !== -1
            )
                continue
            distance[next] = distance[cell] + 1
            queue.push(next)
        }
    }
    return distance
}

export function addDungeonTower(
    ctx,
    definition,
    buildings,
    landmarks,
    anchors
) {
    const {
        at,
        width,
        height,
        plants,
        structures,
        objects,
        solid,
        reserved,
        roads,
        terrain,
    } = ctx
    const border = [at(Math.floor(width / 2), 3)]
    const reachable = walkDistances(ctx, border)
    const distance = walkDistances(
        ctx,
        roads.flatMap((road, cell) =>
            road && reachable[cell] >= 0 ? [cell] : []
        )
    )
    const roll = seededRoll(
        `${definition.id}:${definition.surfaceLocationId}:tower`
    )
    const protectedCells = new Set()
    for (const object of [...buildings, ...landmarks, ...anchors]) {
        const minX = Math.floor(object.x / tileSize)
        const minY = Math.floor(object.y / tileSize)
        const maxX = minX + Math.ceil(object.width / tileSize)
        const maxY = minY + Math.ceil(object.height / tileSize)
        for (let y = minY - 1; y <= maxY + 1; y++)
            for (let x = minX - 1; x <= maxX + 1; x++)
                protectedCells.add(at(x, y))
    }
    const candidates = []
    for (let y = 7; y < height - 6; y++) {
        for (let x = 5; x < width - 5; x++) {
            const approach = at(x, y + 1)
            if (
                distance[approach] < 0 ||
                protectedCells.has(approach) ||
                objects[approach] ||
                structures[approach]
            )
                continue
            const footprint = []
            for (let dy = -2; dy <= 0; dy++) {
                for (let dx = -1; dx <= 1; dx++)
                    footprint.push(at(x + dx, y + dy))
            }
            if (
                footprint.some(
                    (cell) =>
                        roads[cell] ||
                        protectedCells.has(cell) ||
                        structures[cell] ||
                        (solid[cell] && !objects[cell])
                )
            )
                continue
            // Keep settlement reservations. Only the open border strip can act
            // as a fallback when the preferred sites have no room for a tower.
            const overlapsReservation = footprint.some((cell) => reserved[cell])
            if (overlapsReservation && y > 9) continue
            const clearing = footprint.filter((cell) => objects[cell]).length
            candidates.push({
                x,
                y,
                approach,
                footprint,
                score:
                    (overlapsReservation ? 10_000 : 0) +
                    clearing * 30 +
                    distance[approach] * 5 +
                    roll(40),
            })
        }
    }
    const best = candidates
        .sort((a, b) => a.score - b.score)
        .find(
            ({ footprint, approach }) =>
                walkDistances(ctx, border, new Set(footprint))[approach] >= 0
        )
    if (!best)
        throw new Error(
            `No reachable dungeon tower site in ${definition.surfaceLocationId}`
        )
    const { x, y } = best
    const tiles = []
    for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
            const cell = at(x + dx - 1, y + dy - 2)
            const tile = towerGid + dy * 9 + definition.towerVariant * 3 + dx
            tiles.push(tile)
            objects[cell] = tile
            plants[cell] = 0
            reserved[cell] = true
            solid[cell] = dx === 1 && dy === 2 ? 0 : 1
        }
    }
    for (const dy of [0, 1]) {
        const cell = at(x, y + dy)
        terrain[cell] = pavingGid
        plants[cell] = 0
        reserved[cell] = true
    }
    recordProp(ctx, x - 1, y - 2, 3, 3, tiles, 'dungeon tower')
    return objectLayer(22, 'Dungeon passages', [
        passage(70000, definition, true, x, y, y + 1),
    ])
}

function createRooms(profile, roll, size) {
    const {
        columns,
        rows,
        cellWidth,
        cellHeight,
        minimum,
        maximum,
        roomCount,
    } = profile
    const slots = Array.from({ length: columns * rows }, (_, index) => index)
    const entrySlot = slots.splice(columns * (rows - 1) + roll(columns), 1)[0]
    const selected = [entrySlot]
    const totalRooms = roomCount + roll(2)
    while (selected.length < totalRooms)
        selected.push(slots.splice(roll(slots.length), 1)[0])
    if (size === 'large') {
        const topSlot = selected.findIndex((slot) => slot < columns)
        if (topSlot > 1)
            [selected[1], selected[topSlot]] = [selected[topSlot], selected[1]]
    }
    return selected.map((slot, index) => {
        const widthRoll = minimum + roll(maximum - minimum + 1)
        const heightRoll = minimum + roll(maximum - minimum + 1)
        const width =
            index === 1 && size === 'large'
                ? 30
                : index === 1 && size === 'small'
                  ? 3
                  : index === 0
                    ? Math.max(5, widthRoll)
                    : widthRoll
        const height =
            index === 1 && size === 'large'
                ? 30
                : index === 1 && size === 'small'
                  ? 3
                  : index === 0
                    ? Math.max(5, heightRoll)
                    : heightRoll
        const x = 5 + (slot % columns) * cellWidth + roll(cellWidth - width - 3)
        const y =
            5 +
            Math.floor(slot / columns) * cellHeight +
            roll(cellHeight - height - 3)
        return {
            x,
            y,
            width,
            height,
            centerX: x + Math.floor(width / 2),
            centerY: y + Math.floor(height / 2),
        }
    })
}

function connectRooms(rooms, carve, roll) {
    const reached = [rooms[0]]
    const remaining = rooms.slice(1)
    while (remaining.length) {
        let best
        for (const origin of reached) {
            for (const [index, destination] of remaining.entries()) {
                const distance =
                    Math.abs(destination.centerX - origin.centerX) +
                    Math.abs(destination.centerY - origin.centerY)
                if (!best || distance < best.distance)
                    best = { origin, destination, index, distance }
            }
        }
        const { origin, destination, index } = best
        let x = origin.centerX
        let y = origin.centerY
        const goalX = destination.centerX
        const goalY = destination.centerY
        const horizontal = roll(2) === 0
        while (x !== goalX || y !== goalY) {
            if (y === goalY || (horizontal && x !== goalX))
                x += Math.sign(goalX - x)
            else y += Math.sign(goalY - y)
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) carve(x + dx, y + dy)
        }
        reached.push(...remaining.splice(index, 1))
    }
}

function wallTile(open, x, y) {
    const left = open(x - 1, y)
    const right = open(x + 1, y)
    if (open(x, y + 1)) return originalTile(left ? 1 : right ? 3 : 2, 1)
    if (open(x, y - 1)) return connectedWall(left ? 4 : right ? 7 : 5, 1)
    if (left) return originalTile(4, 9)
    if (right) return originalTile(2, 9)
    return open(x, y + 2) ? originalTile(2, 0) : 0
}

function southDoorway(room, open, height) {
    const columns = Array.from(
        { length: room.width - 1 },
        (_, index) => room.x + index
    ).sort(
        (a, b) =>
            Math.abs(a + 0.5 - room.centerX) - Math.abs(b + 0.5 - room.centerX)
    )
    for (let y = room.y + room.height; y < height - 1; y++) {
        const x = columns.find(
            (x) =>
                !open(x, y) &&
                !open(x + 1, y) &&
                !open(x, y + 1) &&
                !open(x + 1, y + 1) &&
                (open(x, y - 1) || open(x + 1, y - 1))
        )
        if (x !== undefined) return { x, y }
    }
    throw new Error('Dungeon entrance room has no southern wall for its exit')
}

export function generateDungeonMap(definition, seed, regionName) {
    const { id, size } = definition
    const roll = seededRoll(`${id}:${seed}`)
    const profile = profiles[size]
    const rooms = createRooms(profile, roll, size)
    const width = profile.columns * profile.cellWidth + 6
    const height = profile.rows * profile.cellHeight + 6
    const at = (x, y) => y * width + x
    const solid = Array(width * height).fill(1)
    const floor = Array(solid.length).fill(0)
    const walls = Array(solid.length).fill(0)
    const furnishings = Array(solid.length).fill(0)
    const carve = (x, y) => {
        solid[at(x, y)] = 0
    }
    const open = (x, y) => solid[at(x, y)] === 0
    for (const room of rooms)
        for (let y = room.y; y < room.y + room.height; y++)
            for (let x = room.x; x < room.x + room.width; x++) carve(x, y)
    connectRooms(rooms, carve, roll)
    const entry = rooms[0]
    const { x: exitLeft, y: exitY } = southDoorway(entry, open, height)
    const exitX = exitLeft + 0.5
    const archCells = [
        at(exitLeft, exitY - 1),
        at(exitLeft + 1, exitY - 1),
        at(exitLeft, exitY),
        at(exitLeft + 1, exitY),
    ]
    const openedByArch = new Set(archCells.filter((cell) => solid[cell] !== 0))
    for (const cell of openedByArch) solid[cell] = 0
    const floorVariants = [
        [1, 4],
        [2, 4],
        [3, 4],
        [1, 5],
        [2, 5],
        [3, 5],
        [1, 6],
        [2, 6],
    ]
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const cell = at(x, y)
            if (open(x, y)) {
                if (!openedByArch.has(cell))
                    floor[cell] = originalTile(
                        ...floorVariants[
                            roll(100) < 77 ? 0 : roll(floorVariants.length)
                        ]
                    )
            } else walls[cell] = wallTile(open, x, y)
        }
    }
    const archTiles = [
        originalTile(5, 15),
        originalTile(6, 15),
        originalTile(5, 16),
        originalTile(6, 16),
    ]
    // The atlas opening is transparent. Keep stone from showing through it.
    for (const [index, cell] of archCells.entries()) {
        furnishings[cell] = archTiles[index]
        floor[cell] = 0
    }
    walls[at(exitLeft, exitY + 1)] = 0
    walls[at(exitLeft + 1, exitY + 1)] = 0
    const entrySouthY = entry.y + entry.height - 1
    const distanceFromEntrySouth = (room) =>
        Math.abs(room.centerX - entry.centerX) +
        Math.abs(room.centerY - entrySouthY)
    const distantRooms = rooms
        .slice(1)
        .sort((a, b) => distanceFromEntrySouth(b) - distanceFromEntrySouth(a))
    const lights = []
    for (const [index, room] of distantRooms.entries()) {
        const candidates = Array.from(
            { length: room.width - 2 },
            (_, column) => room.x + column + 1
        ).filter((x) => !open(x, room.y - 1))
        if (!candidates.length) continue
        const x = candidates[roll(candidates.length)]
        const y = room.y
        const lit =
            index % 2 === 0 && Math.abs(x - exitX) + Math.abs(y - exitY) > 7
        furnishings[at(x, y - 1)] = propGid + (lit ? 1 : 0)
        if (lit)
            lights.push(
                point(
                    20 + index,
                    'Настенный факел',
                    'torch',
                    tileCenter(x),
                    y * tileSize + 3,
                    [prop('radius', 'int', 94), prop('lit', 'bool', true)]
                )
            )
    }
    const nearEntryTorch = [entry.centerX - 1, entry.centerX + 1].find(
        (x) => !open(x, entry.y - 1)
    )
    if (nearEntryTorch !== undefined)
        furnishings[at(nearEntryTorch, entry.y - 1)] = propGid
    const spawnCount = size === 'large' ? 4 : size === 'medium' ? 3 : 2
    const spawnRooms = [distantRooms[0]]
    const distance = (a, b) =>
        Math.abs(a.centerX - b.centerX) + Math.abs(a.centerY - b.centerY)
    while (spawnRooms.length < spawnCount) {
        const options = distantRooms.filter(
            (room) => !spawnRooms.includes(room)
        )
        const separation = (room) =>
            Math.min(
                ...[entry, ...spawnRooms].map((other) => distance(room, other))
            )
        spawnRooms.push(
            options.sort((a, b) => separation(b) - separation(a))[0]
        )
    }
    const spawns = spawnRooms.map((room, index) =>
        point(
            35 + index,
            'Скелет',
            'skeleton',
            tileCenter(room.centerX),
            tileCenter(room.centerY)
        )
    )
    const tileLayer = (
        layerId,
        name,
        data,
        visible = true,
        properties = []
    ) => ({
        id: layerId,
        name,
        type: 'tilelayer',
        opacity: 1,
        x: 0,
        y: 0,
        width,
        height,
        visible,
        data,
        properties,
    })
    return {
        compressionlevel: -1,
        height,
        infinite: false,
        layers: [
            tileLayer(1, 'Stone floor', floor),
            tileLayer(2, 'Dungeon walls', walls),
            tileLayer(3, 'Exit arch and wall torches', furnishings),
            tileLayer(4, 'Collision', solid, false, [
                prop('solid', 'bool', true),
            ]),
            tileLayer(
                5,
                'Footstep surfaces',
                solid.map((blocked) => (blocked ? 0 : originalTile(1, 4))),
                false,
                [prop(`surface.${originalTile(1, 4)}`, 'string', 'stone')]
            ),
            objectLayer(6, 'Dungeon passages', [
                passage(10, definition, false, exitX, exitY, exitY - 1),
            ]),
            objectLayer(7, 'Dungeon lights', lights),
            objectLayer(
                8,
                'Dungeon rooms',
                rooms.map((room, index) => ({
                    ...point(
                        50 + index,
                        `Room ${index + 1}`,
                        'room',
                        room.x * tileSize,
                        room.y * tileSize
                    ),
                    point: false,
                    width: room.width * tileSize,
                    height: room.height * tileSize,
                }))
            ),
            objectLayer(9, 'Dungeon spawns', spawns),
        ],
        nextlayerid: 10,
        nextobjectid: 100,
        orientation: 'orthogonal',
        properties: [
            prop('locationName', 'string', definition.name),
            prop('locationId', 'string', id),
            prop('regionName', 'string', regionName),
            prop('dungeon', 'bool', true),
            prop('dungeonSize', 'string', size),
            prop('dangerLevel', 'int', definition.dangerLevel),
            prop('generationSeed', 'string', String(seed)),
            prop('generationVersion', 'int', 1),
        ],
        renderorder: 'right-down',
        tiledversion: '1.11.2',
        tileheight: tileSize,
        tilesets: [
            { firstgid: 198, source: 'tilesets/MysticWoods/objects.json' },
            originalTileset,
            propTileset,
            connectedWallsTileset,
        ],
        tilewidth: tileSize,
        type: 'map',
        version: '1.10',
        width,
    }
}
