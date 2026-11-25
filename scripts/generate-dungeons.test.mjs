import assert from 'node:assert/strict'
import test from 'node:test'

import {
    CENTER_LOCATION_ID,
    REGION_NAME,
    WESTERN_RUINS_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '../contracts/src/world.ts'
import {
    generateDungeonFloors,
    generateDungeonMap,
    generateDungeonRegion,
} from './generate-dungeons.mjs'
import { generateCity, generateWorldMap } from './generate-map.mjs'

const layer = (map, name) => map.layers.find((entry) => entry.name === name)
const property = (object, name) =>
    object.properties.find((entry) => entry.name === name)?.value
const cellAt = (map, x, y) =>
    Math.floor(x / 16) + Math.floor(y / 16) * map.width

function connectedFloor(map, start) {
    const collision = layer(map, 'Collision').data
    assert.equal(collision[start], 0)
    const reachable = new Set([start])
    const queue = [start]
    for (const cell of queue) {
        const x = cell % map.width
        const y = Math.floor(cell / map.width)
        for (const [dx, dy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
        ]) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height)
                continue
            const next = nx + ny * map.width
            if (collision[next] || reachable.has(next)) continue
            queue.push(next)
            reachable.add(next)
        }
    }
    return reachable
}

const maximumRooms = { small: 5, medium: 7, large: 9 }
const maximumSpawns = { small: 2, medium: 3, large: 4 }

test('the unchanged surface placement leads to one to five floors with independent connected room layouts', () => {
    const quantities = new Set()
    const locations = new Set()
    const variants = new Set()
    const depths = new Set()
    const counts = { small: new Set(), medium: new Set(), large: new Set() }
    const seeds = [
        ...Array.from({ length: 40 }, (_, index) => `dungeon-sweep-${index}`),
        'exit-north-18',
        'exit-north-139',
        'exit-north-315',
    ]
    for (const [index, seed] of seeds.entries()) {
        const definitions = generateDungeonRegion(
            seed,
            WORLD_LOCATION_DEFINITIONS
        )
        assert.deepEqual(
            generateDungeonRegion(seed, WORLD_LOCATION_DEFINITIONS),
            definitions
        )
        assert.equal(
            new Set(
                definitions.map((definition) => definition.surfaceLocationId)
            ).size,
            definitions.length
        )
        assert.equal(definitions[0].size, 'small')
        assert.equal(definitions[1].size, 'large')
        quantities.add(definitions.length)
        for (const definition of definitions) {
            locations.add(definition.surfaceLocationId)
            variants.add(definition.towerVariant)
            depths.add(definition.floorCount)
            const floors = generateDungeonFloors(definition)
            assert.equal(floors.length, definition.floorCount)
            const maps = floors.map((floor) => {
                const map = generateDungeonMap(floor, seed, REGION_NAME)
                counts[floor.size].add(checkOrdinaryFloor(map, floor))
                if (!index)
                    assert.deepEqual(
                        generateDungeonMap(floor, seed, REGION_NAME),
                        map
                    )
                return map
            })
            checkLinks(definition, maps)
        }
    }
    assert.deepEqual([...quantities].sort(), [2, 3, 4])
    assert.equal(locations.size, WORLD_LOCATION_DEFINITIONS.length)
    assert.deepEqual([...variants].sort(), [0, 1, 2])
    assert.deepEqual([...depths].sort(), [1, 2, 3, 4, 5])
    for (const [size, range] of Object.entries(counts)) {
        assert.deepEqual(
            [...range].sort(),
            Array.from({ length: maximumRooms[size] }, (_, i) => i + 1)
        )
    }
})

function checkOrdinaryFloor(map, floor) {
    assert.equal(property(map, 'dungeon'), true)
    assert.equal(property(map, 'dungeonFloor'), floor.floor)
    assert.equal(property(map, 'dungeonFloorCount'), floor.floorCount)
    const passages = layer(map, 'Dungeon passages').objects
    const [first] = passages
    const reachable = connectedFloor(
        map,
        cellAt(map, property(first, 'arrivalX'), property(first, 'arrivalY'))
    )
    assert.equal(
        reachable.size,
        layer(map, 'Collision').data.filter((tile) => tile === 0).length
    )
    const rooms = layer(map, 'Dungeon rooms').objects
    assert.ok(rooms.length >= 1 && rooms.length <= maximumRooms[floor.size])
    assert.ok(
        rooms.every(({ width, height }) =>
            [width, height].every((size) => size >= 3 * 16 && size <= 30 * 16)
        )
    )
    if (rooms.length > 1 && floor.size !== 'medium') {
        const extreme = (floor.size === 'small' ? 3 : 30) * 16
        assert.ok(
            rooms.some(
                ({ width, height }) => width === extreme && height === extreme
            )
        )
    }
    const landings = new Set()
    for (const passage of passages) {
        checkStair(map, passage, reachable, floor.floor === 1)
        const x = property(passage, 'arrivalX')
        const y = property(passage, 'arrivalY')
        const room = rooms.find(
            (room) =>
                x >= room.x &&
                x < room.x + room.width &&
                y >= room.y &&
                y < room.y + room.height
        )
        assert.ok(room)
        landings.add(room)
    }
    const lights = layer(map, 'Dungeon lights').objects
    const safeFromStairs = (point, distance) =>
        passages.every(
            (passage) =>
                Math.hypot(
                    point.x - property(passage, 'arrivalX'),
                    point.y - property(passage, 'arrivalY')
                ) > distance
        )
    assert.ok(
        lights.every(
            (light) =>
                reachable.has(cellAt(map, light.x, light.y)) &&
                safeFromStairs(light, property(light, 'radius'))
        )
    )
    const spawns = layer(map, 'Dungeon spawns').objects
    assert.equal(
        spawns.length,
        Math.min(maximumSpawns[floor.size], rooms.length - landings.size)
    )
    assert.ok(
        spawns.every(
            (spawn) =>
                spawn.type === 'skeleton' &&
                reachable.has(cellAt(map, spawn.x, spawn.y)) &&
                safeFromStairs(spawn, 6 * 16)
        )
    )
    if (passages.length === 2 && rooms.length === 1) {
        assert.ok(passages[0].y < rooms[0].y)
        assert.ok(passages[1].y > rooms[0].y + rooms[0].height)
    }
    return rooms.length
}

function checkStair(map, passage, reachable, firstFloor) {
    const up = property(passage, 'direction') === 'up'
    const outward = up ? -map.width : map.width
    const arrivalX = property(passage, 'arrivalX')
    const arrivalY = property(passage, 'arrivalY')
    const left = cellAt(map, passage.x - 8, passage.y)
    const right = left + 1
    assert.equal(passage.x % 16, 0)
    assert.equal(arrivalX, passage.x)
    assert.equal(arrivalY - passage.y, up ? 16 : -16)
    assert.equal(property(passage, 'triggerRadius'), 12)
    const floor = layer(map, 'Stone floor').data
    const walls = layer(map, 'Dungeon walls').data
    const furnishings = layer(map, 'Exit arch and wall torches').data
    const surfaces = layer(map, 'Footstep surfaces').data
    const collision = layer(map, 'Collision').data
    assert.ok(walls[left - 1] || walls[right + 1])
    assert.deepEqual(
        [
            furnishings[left + outward],
            furnishings[right + outward],
            furnishings[left],
            furnishings[right],
        ],
        up
            ? firstFloor
                ? [2533, 2534, 2565, 2566]
                : [3149, 3150, 3153, 3154]
            : [3155, 3156, 3151, 3152]
    )
    for (const cell of [left, right]) {
        for (const row of [cell, cell - outward, cell + outward]) {
            assert.ok(reachable.has(row))
            assert.equal(surfaces[row], 2177)
        }
        assert.equal(floor[cell], 0)
        assert.equal(floor[cell + outward], 0)
        assert.equal(floor[cell + 2 * outward], 0)
        assert.equal(walls[cell + 2 * outward], 0)
        assert.equal(collision[cell + 2 * outward], 1)
        assert.notEqual(floor[cell - outward], 0)
    }
}

function checkLinks(definition, maps) {
    for (const [index, map] of maps.entries()) {
        const passages = layer(map, 'Dungeon passages').objects
        assert.equal(passages.length, index < maps.length - 1 ? 2 : 1)
        for (const link of passages) {
            const up = property(link, 'direction') === 'up'
            const destination = maps[index + (up ? -1 : 1)]
            if (destination === undefined) {
                assert.equal(index, 0)
                assert.equal(
                    property(link, 'destinationLocationId'),
                    definition.surfaceLocationId
                )
                assert.equal(
                    property(link, 'destinationPassageId'),
                    `${definition.id}:entrance`
                )
                continue
            }
            assert.equal(
                property(link, 'destinationLocationId'),
                property(destination, 'locationId')
            )
            const reverse = layer(destination, 'Dungeon passages').objects.find(
                (passage) =>
                    property(passage, 'id') ===
                    property(link, 'destinationPassageId')
            )
            assert.ok(reverse)
            assert.equal(
                property(reverse, 'destinationPassageId'),
                property(link, 'id')
            )
            assert.equal(
                property(reverse, 'destinationLocationId'),
                property(map, 'locationId')
            )
            assert.equal(property(reverse, 'direction'), up ? 'down' : 'up')
        }
    }
}

test('secret walls share the closed wall art and open one connected cluster with a single guarded reward', () => {
    const counts = new Set()
    let floorCount = 0
    let clusterCount = 0
    let nestedCount = 0
    for (const seed of [
        'dungeon-832',
        ...Array.from({ length: 48 }, (_, i) => `secret-sweep-${i}`),
    ]) {
        const floors = generateDungeonRegion(
            seed,
            WORLD_LOCATION_DEFINITIONS
        ).flatMap(generateDungeonFloors)
        for (const floor of floors) {
            floorCount++
            const map = generateDungeonMap(floor, seed, REGION_NAME)
            const secrets = layer(map, 'Dungeon secrets')?.objects ?? []
            if (!secrets.length) continue
            clusterCount++
            if (secrets.length === 2) nestedCount++
            counts.add(checkSecrets(map, secrets))
            if (seed === 'dungeon-832' && floor.id === 'dungeon-small') {
                assert.equal(floor.surfaceLocationId, CENTER_LOCATION_ID)
                assert.equal(floor.floorCount, 3)
                assert.equal(secrets.length, 2)
                assert.equal(layer(map, 'Dungeon rooms').objects.length, 1)
            }
        }
    }
    assert.deepEqual([...counts].sort(), [1, 2, 3])
    assert.ok(
        clusterCount / floorCount > 0.2 && clusterCount / floorCount < 0.4
    )
    assert.ok(nestedCount > 0 && nestedCount < clusterCount)
})

function checkSecrets(map, secrets) {
    assert.ok(secrets.length === 1 || secrets.length === 2)
    const [passage] = layer(map, 'Dungeon passages').objects
    const startX = property(passage, 'arrivalX')
    const startY = property(passage, 'arrivalY')
    const start = cellAt(map, startX, startY)
    const solid = layer(map, 'Collision').data
    const floor = layer(map, 'Stone floor').data
    const walls = layer(map, 'Dungeon walls').data
    const surfaces = layer(map, 'Footstep surfaces').data
    const ordinary = connectedFloor(map, start)
    const chest = JSON.parse(property(secrets.at(-1), 'chest'))
    const guards = JSON.parse(property(secrets.at(-1), 'guards'))
    const rewardCells = [chest, ...guards].map(({ x, y }) => cellAt(map, x, y))
    assert.equal(guards.length, 2)
    assert.equal(new Set(rewardCells).size, 3)
    assert.deepEqual(chest.items.map(({ itemId }) => itemId).slice(0, 2), [
        'food',
        'torch',
    ])
    assert.ok(rewardCells.every((cell) => !ordinary.has(cell)))
    let rooms = 0
    for (const [index, secret] of secrets.entries()) {
        const door = cellAt(map, secret.x, secret.y)
        assert.equal(solid[door], 1)
        assert.equal(floor[door], 0)
        assert.ok([2081, 2082, 2083].includes(walls[door]))
        const before = connectedFloor(map, start)
        assert.ok(before.has(door + map.width))
        assert.ok(rewardCells.every((cell) => !before.has(cell)))
        if (index === 0) assert.equal(property(secret, 'requires'), undefined)
        else
            assert.equal(
                JSON.parse(property(secret, 'requires')),
                property(secrets[0], 'id')
            )
        if (index < secrets.length - 1) {
            assert.equal(property(secret, 'chest'), undefined)
            assert.equal(property(secret, 'guards'), undefined)
        }
        const patch = JSON.parse(property(secret, 'tiles'))
        assert.equal(
            new Set(patch.map(({ index }) => index)).size,
            patch.length
        )
        for (const cell of patch) {
            solid[cell.index] = cell.solid ? 1 : 0
            floor[cell.index] = cell.floorGid
            walls[cell.index] = cell.wallGid
            surfaces[cell.index] = cell.surfaceGid
        }
        const after = connectedFloor(map, start)
        assert.ok(after.size > before.size)
        assert.equal(after.size, solid.filter((tile) => tile === 0).length)
        assert.equal(solid[door], 0)
        assert.ok(floor[door] && surfaces[door] === 2177)
        for (const cell of after) {
            if (before.has(cell) || cell === door) continue
            for (const neighbor of [
                cell - 1,
                cell + 1,
                cell - map.width,
                cell + map.width,
            ]) {
                assert.ok(
                    !before.has(neighbor),
                    'only the revealed doorway connects the two areas'
                )
            }
        }
        rooms += property(secret, 'roomCount')
    }
    const complete = connectedFloor(map, start)
    assert.ok(rewardCells.every((cell) => complete.has(cell)))
    return rooms
}

test('tower thresholds and arrival cells reach the ordinary surface roads', () => {
    for (const [index, definition] of WORLD_LOCATION_DEFINITIONS.entries()) {
        const dungeon = {
            ...generateDungeonRegion(
                'tower-sweep',
                WORLD_LOCATION_DEFINITIONS
            )[0],
            surfaceLocationId: definition.id,
            towerVariant: index % 3,
        }
        const maps =
            definition.id === CENTER_LOCATION_ID
                ? ['grid', 'organic', 'ring'].map((style) =>
                      generateCity('dungeon-9', style, dungeon)
                  )
                : [generateWorldMap(definition, { dungeonEntrance: dungeon })]
        for (const map of maps) {
            const [passage] = layer(map, 'Dungeon passages').objects
            assert.equal(property(passage, 'destinationLocationId'), dungeon.id)
            assert.equal(property(passage, 'direction'), 'down')
            assert.equal(
                property(passage, 'destinationPassageId'),
                `${dungeon.id}:exit`
            )
            assert.ok(
                !passage.properties.some(({ name }) => name === 'triggerRadius')
            )
            const reachable = connectedFloor(map, cellAt(map, 48 * 16, 3 * 16))
            assert.ok(
                reachable.has(cellAt(map, passage.x, passage.y)),
                definition.id
            )
            assert.ok(
                reachable.has(
                    cellAt(
                        map,
                        property(passage, 'arrivalX'),
                        property(passage, 'arrivalY')
                    )
                ),
                definition.id
            )
            const tower = layer(map, 'Depth props').objects.find(
                (object) => object.name === 'dungeon tower'
            )
            assert.ok(tower)
            const towerTileset = map.tilesets.find((entry) =>
                entry.source.endsWith('/dungeon-towers.json')
            )
            assert.equal(
                JSON.parse(property(tower, 'tiles'))[0],
                towerTileset.firstgid + dungeon.towerVariant * 3
            )
        }
    }
    const westernRuins = WORLD_LOCATION_DEFINITIONS.find(
        (definition) => definition.id === WESTERN_RUINS_LOCATION_ID
    )
    const first = generateWorldMap(westernRuins)
    assert.equal(layer(first, 'Dungeon passages'), undefined)
    assert.deepEqual(
        generateWorldMap(westernRuins, { dungeonEntrance: undefined }),
        first
    )
})
