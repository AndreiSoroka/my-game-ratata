import { recordProp } from './generate-depth.mjs'
import {
    createSecretLayerObjects,
    secretReserveRows,
} from './generate-dungeons-secrets.mjs'
import { pavingGid } from './generate-ground.mjs'

const tileSize = 16
const originalGid = 2048
const propGid = 3072
const towerGid = 3074
const connectedWallsGid = 3101
const stairGid = 3149
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
const stairTileset = {
    firstgid: stairGid,
    source: 'tilesets/Novogorod/dungeon-stairs.json',
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
        maximumRooms: 5,
    },
    medium: {
        columns: 3,
        rows: 3,
        cellWidth: 21,
        cellHeight: 19,
        minimum: 5,
        maximum: 15,
        maximumRooms: 7,
    },
    large: {
        columns: 3,
        rows: 3,
        cellWidth: 37,
        cellHeight: 35,
        minimum: 8,
        maximum: 30,
        maximumRooms: 9,
    },
}
const dungeonTypes = [
    ['small', 'Старый склеп'],
    ['large', 'Глубокие катакомбы'],
    ['medium-1', 'Подземелье дозорных'],
    ['medium-2', 'Залы под руинами'],
]
const floorCountThresholds = [30, 55, 80, 92, 100]

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
        const dungeonId = `dungeon-${id}`
        const depthRoll = seededRoll(`${seed}:${dungeonId}:depth`)(100)
        return {
            id: dungeonId,
            name,
            size: id.startsWith('medium') ? 'medium' : id,
            surfaceLocationId: surface.id,
            dangerLevel: surface.dangerLevel,
            towerVariant: (firstTowerVariant + index) % 3,
            floorCount:
                1 +
                floorCountThresholds.findIndex(
                    (threshold) => depthRoll < threshold
                ),
        }
    })
}

function dungeonFloorId(dungeonId, floor) {
    return floor === 1 ? dungeonId : `${dungeonId}-floor-${floor}`
}

export function generateDungeonFloors(dungeon) {
    return Array.from({ length: dungeon.floorCount }, (_, index) => ({
        ...dungeon,
        id: dungeonFloorId(dungeon.id, index + 1),
        dungeonId: dungeon.id,
        floor: index + 1,
    }))
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

function passage(id, link, x, y, arrivalY) {
    return point(
        id,
        link.name,
        'dungeon_passage',
        tileCenter(x),
        tileCenter(y),
        [
            prop('id', 'string', link.id),
            prop('destinationLocationId', 'string', link.destinationLocationId),
            prop('destinationPassageId', 'string', link.destinationPassageId),
            prop('direction', 'string', link.direction),
            prop('arrivalX', 'int', tileCenter(x)),
            prop('arrivalY', 'int', tileCenter(arrivalY)),
            ...(link.radius === undefined
                ? []
                : [prop('triggerRadius', 'int', link.radius)]),
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
        passage(
            70000,
            {
                id: `${definition.id}:entrance`,
                name: 'Вход в подземелье',
                destinationLocationId: definition.id,
                destinationPassageId: `${definition.id}:exit`,
                direction: 'down',
            },
            x,
            y,
            y + 1
        ),
    ])
}

function createRooms(profile, roll, size, totalRooms, needsSecondLanding) {
    const { columns, rows, cellWidth, cellHeight, minimum, maximum } = profile
    const slots = Array.from({ length: columns * rows }, (_, index) => index)
    const entrySlot = slots.splice(columns * (rows - 1) + roll(columns), 1)[0]
    const selected = [entrySlot]
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
        const landing = index === 0 || (index === 2 && needsSecondLanding)
        const width =
            index === 1 && size === 'large'
                ? 30
                : index === 1 && size === 'small'
                  ? 3
                  : landing
                    ? Math.max(5, widthRoll)
                    : widthRoll
        const height =
            index === 1 && size === 'large'
                ? 30
                : index === 1 && size === 'small'
                  ? 3
                  : landing
                    ? Math.max(5, heightRoll)
                    : heightRoll
        const x = 5 + (slot % columns) * cellWidth + roll(cellWidth - width - 3)
        const y =
            secretReserveRows +
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

function roomDoorway(room, grid, outward) {
    const { at, solid } = grid
    const y = outward < 0 ? room.y - 1 : room.y + room.height
    const open = (x, row) => solid[at(x, row)] === 0
    const openCells = (x, row) =>
        Number(open(x, row)) + Number(open(x + 1, row))
    const candidates = Array.from({ length: room.width - 1 }, (_, index) => {
        const x = room.x + index
        return {
            x,
            openFlanks: Number(open(x - 1, y)) + Number(open(x + 2, y)),
            wallOverlap: openCells(x, y + 2 * outward),
            archOverlap: openCells(x, y + outward) + openCells(x, y),
            distance: Math.abs(x + 0.5 - room.centerX),
        }
    })
    candidates.sort(
        (a, b) =>
            a.openFlanks - b.openFlanks ||
            a.wallOverlap - b.wallOverlap ||
            a.archOverlap - b.archOverlap ||
            a.distance - b.distance
    )
    for (const { x, openFlanks } of candidates) {
        const arch = [
            at(x, y + outward),
            at(x + 1, y + outward),
            at(x, y),
            at(x + 1, y),
        ]
        const backing = [at(x, y + 2 * outward), at(x + 1, y + 2 * outward)]
        const flanks =
            openFlanks === 2 ? [at(x - 1, y), at(x + 2, y)] : [undefined]
        for (const flank of flanks) {
            const wall = flank === undefined ? backing : [...backing, flank]
            if (
                wall.every((cell) => solid[cell]) ||
                doorwayKeepsRoutes(grid, room, arch, wall)
            ) {
                return { x, y, arrivalY: y - outward, arch, backing, wall }
            }
        }
    }
    throw new Error('Dungeon entrance room has no connected doorway')
}

function doorwayKeepsRoutes(grid, room, arch, wall) {
    const solid = grid.solid.slice()
    for (const cell of arch) solid[cell] = 0
    for (const cell of wall) solid[cell] = 1
    const distances = walkDistances({ ...grid, solid }, [
        grid.at(room.centerX, room.centerY),
    ])
    return solid.every((blocked, cell) => blocked || distances[cell] >= 0)
}

function roomDistance(a, b) {
    return Math.abs(a.centerX - b.centerX) + Math.abs(a.centerY - b.centerY)
}

function floorLinks(definition) {
    const { id, dungeonId = id, floor = 1, floorCount } = definition
    const up = {
        id: `${id}:${floor === 1 ? 'exit' : 'up'}`,
        destinationLocationId:
            floor === 1
                ? definition.surfaceLocationId
                : dungeonFloorId(dungeonId, floor - 1),
        destinationPassageId:
            floor === 1
                ? `${dungeonId}:entrance`
                : `${dungeonFloorId(dungeonId, floor - 1)}:down`,
        direction: 'up',
        name: floor === 1 ? 'Выход на поверхность' : 'Лестница наверх',
        radius: 12,
        surfaceExit: floor === 1,
    }
    if (floor >= floorCount) return [up]
    const lowerFloorId = dungeonFloorId(dungeonId, floor + 1)
    return [
        up,
        {
            id: `${id}:down`,
            destinationLocationId: lowerFloorId,
            destinationPassageId: `${lowerFloorId}:up`,
            direction: 'down',
            name: 'Лестница вниз',
            radius: 12,
        },
    ]
}

function carvePassages(links, rooms, grid) {
    const entry = rooms[0]
    const landings = [entry]
    if (links.length > 1) {
        const distant = rooms
            .slice(1)
            .filter(({ width, height }) => width >= 5 && height >= 5)
            .sort((a, b) => roomDistance(b, entry) - roomDistance(a, entry))[0]
        landings.push(distant ?? rooms[1] ?? entry)
    }
    return links.map((link, index) => {
        const room = landings[index]
        const doorway = roomDoorway(
            room,
            grid,
            link.direction === 'up' ? -1 : 1
        )
        for (const cell of doorway.arch) grid.solid[cell] = 0
        for (const cell of doorway.wall) grid.solid[cell] = 1
        return { ...doorway, room, link }
    })
}

function passageTiles(link) {
    if (link.surfaceExit) {
        return [
            originalTile(5, 15),
            originalTile(6, 15),
            originalTile(5, 16),
            originalTile(6, 16),
        ]
    }
    return link.direction === 'up'
        ? [stairGid, stairGid + 1, stairGid + 4, stairGid + 5]
        : [stairGid + 6, stairGid + 7, stairGid + 2, stairGid + 3]
}

function wallGids({ width, height, at, solid }) {
    const walls = Array(solid.length).fill(0)
    const open = (x, y) => solid[at(x, y)] === 0
    for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++)
            if (!open(x, y)) walls[at(x, y)] = wallTile(open, x, y)
    return walls
}

export function generateDungeonMap(definition, seed, regionName) {
    const {
        id,
        size,
        dungeonId = id,
        floor: floorNumber = 1,
        floorCount,
    } = definition
    const stream = `${seed}:${dungeonId}:${floorNumber}`
    const roll = seededRoll(`${stream}:layout`)
    const profile = profiles[size]
    const links = floorLinks(definition)
    const roomCount = 1 + seededRoll(`${stream}:rooms`)(profile.maximumRooms)
    const rooms = createRooms(profile, roll, size, roomCount, links.length > 1)
    const width = profile.columns * profile.cellWidth + 6
    const height = profile.rows * profile.cellHeight + 6 + secretReserveRows
    const at = (x, y) => y * width + x
    const solid = Array(width * height).fill(1)
    const floor = Array(solid.length).fill(0)
    const furnishings = Array(solid.length).fill(0)
    const carve = (x, y) => {
        solid[at(x, y)] = 0
    }
    const open = (x, y) => solid[at(x, y)] === 0
    for (const room of rooms)
        for (let y = room.y; y < room.y + room.height; y++)
            for (let x = room.x; x < room.x + room.width; x++) carve(x, y)
    connectRooms(rooms, carve, roll)
    const grid = { width, height, at, solid }
    const entry = rooms[0]
    const entrances = carvePassages(links, rooms, grid)
    const walls = wallGids(grid)
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
            if (open(x, y))
                floor[cell] = originalTile(
                    ...floorVariants[
                        roll(100) < 77 ? 0 : roll(floorVariants.length)
                    ]
                )
        }
    }
    const entrySouthY = entry.y + entry.height - 1
    const distanceFromEntrySouth = (room) =>
        Math.abs(room.centerX - entry.centerX) +
        Math.abs(room.centerY - entrySouthY)
    const distantRooms = rooms
        .slice(1)
        .sort((a, b) => distanceFromEntrySouth(b) - distanceFromEntrySouth(a))
    const wallTorchRadius = 94
    const lights = []
    for (const [index, room] of distantRooms.entries()) {
        const candidates = Array.from(
            { length: room.width - 2 },
            (_, column) => room.x + column + 1
        ).filter((x) => !open(x, room.y - 1))
        if (!candidates.length) continue
        const x = candidates[roll(candidates.length)]
        const y = room.y
        const lightX = tileCenter(x)
        const lightY = y * tileSize + 3
        const lit =
            index % 2 === 0 &&
            entrances.every(
                (entrance) =>
                    Math.hypot(
                        lightX - tileCenter(entrance.x + 0.5),
                        lightY - tileCenter(entrance.arrivalY)
                    ) > wallTorchRadius
            )
        furnishings[at(x, y - 1)] = propGid + (lit ? 1 : 0)
        if (lit)
            lights.push(
                point(20 + index, 'Настенный факел', 'torch', lightX, lightY, [
                    prop('radius', 'int', wallTorchRadius),
                    prop('lit', 'bool', true),
                ])
            )
    }
    const nearEntryTorch = [entry.centerX - 1, entry.centerX + 1].find(
        (x) => !open(x, entry.y - 1)
    )
    if (nearEntryTorch !== undefined)
        furnishings[at(nearEntryTorch, entry.y - 1)] = propGid
    for (const { arch, backing, link } of entrances) {
        const tiles = passageTiles(link)
        for (const [index, cell] of arch.entries()) {
            floor[cell] = 0
            furnishings[cell] = tiles[index]
        }
        // Draw the stair or arch before its opaque backing, not as a hole in a floor.
        for (const cell of backing) walls[cell] = 0
    }
    const guardRooms = distantRooms.filter(
        (room) => !entrances.some((entrance) => entrance.room === room)
    )
    const spawnCount = Math.min(
        guardRooms.length,
        size === 'large' ? 4 : size === 'medium' ? 3 : 2
    )
    const spawnRooms = guardRooms.slice(0, 1)
    while (spawnRooms.length < spawnCount) {
        const options = guardRooms.filter((room) => !spawnRooms.includes(room))
        const separation = (room) =>
            Math.min(
                ...[
                    ...entrances.map((entrance) => entrance.room),
                    ...spawnRooms,
                ].map((other) => roomDistance(room, other))
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
    const stoneSurface = originalTile(1, 4)
    const surfaces = solid.map((blocked) => (blocked ? 0 : stoneSurface))
    const passages = entrances.map(({ link, x, y, arrivalY }, index) =>
        passage(10 + index, link, x + 0.5, y, arrivalY)
    )
    const secrets = createSecretLayerObjects({
        id,
        grid,
        floor,
        walls,
        surfaces,
        stoneSurface,
        floorVariantCount: floorVariants.length,
        roll: seededRoll(`${stream}:secret`),
        floorGid: (choice) => originalTile(...floorVariants[choice]),
        wallGids,
        point,
        prop,
    })
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
            tileLayer(5, 'Footstep surfaces', surfaces, false, [
                prop(`surface.${stoneSurface}`, 'string', 'stone'),
            ]),
            objectLayer(6, 'Dungeon passages', passages),
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
            ...(secrets.length === 0
                ? []
                : [objectLayer(10, 'Dungeon secrets', secrets)]),
        ],
        nextlayerid: 11,
        nextobjectid: 103,
        orientation: 'orthogonal',
        properties: [
            prop('locationName', 'string', definition.name),
            prop('locationId', 'string', id),
            prop('regionName', 'string', regionName),
            prop('dungeon', 'bool', true),
            prop('dungeonSize', 'string', size),
            prop('dungeonId', 'string', dungeonId),
            prop('dungeonFloor', 'int', floorNumber),
            prop('dungeonFloorCount', 'int', floorCount),
            prop('dangerLevel', 'int', definition.dangerLevel),
            prop('generationSeed', 'string', String(seed)),
            prop('generationVersion', 'int', 2),
        ],
        renderorder: 'right-down',
        tiledversion: '1.11.2',
        tileheight: tileSize,
        tilesets: [
            { firstgid: 198, source: 'tilesets/MysticWoods/objects.json' },
            originalTileset,
            propTileset,
            connectedWallsTileset,
            ...(entrances.some(({ link }) => !link.surfaceExit)
                ? [stairTileset]
                : []),
        ],
        tilewidth: tileSize,
        type: 'map',
        version: '1.10',
        width,
    }
}
