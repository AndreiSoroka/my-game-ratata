import assert from 'node:assert/strict'
import test from 'node:test'

import {
    CENTER_LOCATION_ID,
    REGION_NAME,
    WESTERN_RUINS_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '../contracts/src/world.ts'
import {
    generateDungeonMap,
    generateDungeonRegion,
} from './generate-dungeons.mjs'
import { generateCity, generateWorldMap } from './generate-map.mjs'

const layer = (map, name) => map.layers.find((entry) => entry.name === name)
const property = (object, name) =>
    object.properties.find((entry) => entry.name === name).value
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

test('seeded dungeons span the region with connected 3–30 tile rooms and sparse skeletons', () => {
    const quantities = new Set()
    const locations = new Set()
    const variants = new Set()
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
            const map = generateDungeonMap(definition, seed, REGION_NAME)
            assert.equal(property(map, 'dungeon'), true)
            const [passage] = layer(map, 'Dungeon passages').objects
            assert.equal(
                property(passage, 'destinationLocationId'),
                definition.surfaceLocationId
            )
            const arrivalX = property(passage, 'arrivalX')
            const arrivalY = property(passage, 'arrivalY')
            assert.equal(property(passage, 'triggerRadius'), 12)
            const reachable = connectedFloor(
                map,
                cellAt(map, arrivalX, arrivalY)
            )
            assert.ok(reachable.has(cellAt(map, passage.x, passage.y)))
            const collision = layer(map, 'Collision').data
            assert.equal(
                reachable.size,
                collision.filter((tile) => tile === 0).length
            )
            const rooms = layer(map, 'Dungeon rooms').objects
            const [entry] = rooms
            const floor = layer(map, 'Stone floor').data
            const walls = layer(map, 'Dungeon walls').data
            const furnishings = layer(map, 'Exit arch and wall torches').data
            const surfaces = layer(map, 'Footstep surfaces').data
            const leftThreshold = cellAt(map, passage.x - 8, passage.y)
            const rightThreshold = leftThreshold + 1
            assert.equal(passage.x % 16, 0)
            assert.equal(passage.y, entry.y - 8)
            assert.ok(passage.x > entry.x && passage.x < entry.x + entry.width)
            assert.equal(arrivalX, passage.x)
            assert.equal(arrivalY, passage.y + 16)
            assert.ok(walls[leftThreshold - 1] || walls[rightThreshold + 1])
            assert.deepEqual(
                [
                    furnishings[leftThreshold - map.width],
                    furnishings[rightThreshold - map.width],
                    furnishings[leftThreshold],
                    furnishings[rightThreshold],
                ],
                [2533, 2534, 2565, 2566]
            )
            for (const cell of [leftThreshold, rightThreshold]) {
                assert.ok(reachable.has(cell))
                assert.ok(reachable.has(cell - map.width))
                assert.ok(reachable.has(cell + map.width))
                assert.equal(floor[cell], 0)
                assert.equal(floor[cell - map.width], 0)
                assert.equal(surfaces[cell], 2177)
                assert.equal(surfaces[cell + map.width], 2177)
                assert.equal(surfaces[cell - map.width], 2177)
                assert.equal(floor[cell - 2 * map.width], 0)
                assert.equal(walls[cell - 2 * map.width], 0)
                assert.equal(collision[cell - 2 * map.width], 1)
                assert.notEqual(floor[cell + map.width], 0)
            }
            assert.ok(
                rooms.every((room) =>
                    [room.width, room.height].every(
                        (size) => size >= 3 * 16 && size <= 30 * 16
                    )
                )
            )
            if (definition.size !== 'medium') {
                const limit = (definition.size === 'small' ? 3 : 30) * 16
                assert.ok(
                    rooms.some(
                        (room) => room.width === limit && room.height === limit
                    )
                )
            }
            const lights = layer(map, 'Dungeon lights').objects
            assert.ok(lights.length >= 1)
            assert.ok(
                lights.every(
                    (light) =>
                        reachable.has(cellAt(map, light.x, light.y)) &&
                        Math.hypot(light.x - arrivalX, light.y - arrivalY) >
                            property(light, 'radius')
                )
            )
            const spawns = layer(map, 'Dungeon spawns').objects
            assert.equal(
                spawns.length,
                { small: 2, medium: 3, large: 4 }[definition.size]
            )
            assert.ok(
                spawns.every(
                    (spawn) =>
                        spawn.type === 'skeleton' &&
                        reachable.has(cellAt(map, spawn.x, spawn.y)) &&
                        Math.hypot(spawn.x - arrivalX, spawn.y - arrivalY) >
                            6 * 16
                )
            )
            if (!index)
                assert.deepEqual(
                    generateDungeonMap(definition, seed, REGION_NAME),
                    map
                )
        }
    }
    assert.deepEqual([...quantities].sort(), [2, 3, 4])
    assert.equal(locations.size, WORLD_LOCATION_DEFINITIONS.length)
    assert.deepEqual([...variants].sort(), [0, 1, 2])
})

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
