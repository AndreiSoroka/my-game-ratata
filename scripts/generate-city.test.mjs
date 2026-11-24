import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

import {
    CENTER_LOCATION_ID,
    WORLD_LOCATION_DEFINITIONS,
} from '../contracts/src/world.ts'
import { planFortifications } from './city-fortifications.mjs'
import { CITY_BUILDINGS } from './city-layout.mjs'
import { generateCity, generateWorldMap } from './generate-map.mjs'
import { soilGid, pavingGid } from './generate-ground.mjs'

const layer = (map, name) => map.layers.find((entry) => entry.name === name)
const value = (object, key) =>
    object.properties.find((entry) => entry.name === key)?.value
const tileRect = (object) => ({
    x: object.x / 16,
    y: object.y / 16,
    w: object.width / 16,
    h: object.height / 16,
})
const intersect = (a, b, pad = 0) =>
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
const cells = ({ x, y, w, h }) =>
    Array.from({ length: w * h }, (_, index) => [
        x + (index % w),
        y + Math.floor(index / w),
    ])
function reached(map, start) {
    const solid = layer(map, 'Collision').data,
        result = new Set([start[1] * 96 + start[0]])
    for (const cell of result) {
        const x = cell % 96,
            y = Math.floor(cell / 96)
        for (const [nx, ny] of [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
        ])
            if (
                nx >= 0 &&
                ny >= 0 &&
                nx < 96 &&
                ny < 80 &&
                !solid[ny * 96 + nx]
            )
                result.add(ny * 96 + nx)
    }
    return result
}
function verify(map, style, label) {
    assert.equal(map.width, 96, label)
    assert.equal(map.height, 80, label)
    assert.equal(value(map, 'cityStyle'), style, label)
    assert.ok(value(map, 'cityLayoutAttempts') <= 32, label)
    const buildings = layer(map, 'Buildings').objects
    assert.equal(buildings.length, 11, label)
    for (const [index, definition] of CITY_BUILDINGS.entries()) {
        const building = buildings.find((entry) => entry.id === 100 + index)
        assert.ok(building, label)
        assert.equal(building.width, definition.w * 16, label)
        assert.equal(building.height, definition.h * 16, label)
        assert.equal(
            value(building, 'semanticId'),
            `novogorod.${definition.key}`,
            label
        )
        for (const other of buildings.filter(
            (entry) => entry.id !== building.id
        ))
            assert.equal(
                intersect(tileRect(building), tileRect(other), 2),
                false,
                `${label}: two-tile house clearance`
            )
    }
    const fort = layer(map, 'Fortifications').objects
    const corners = fort.filter((entry) => entry.type === 'corner_tower')
    const supports = fort.filter((entry) => entry.type === 'gate_support')
    const leaves = fort.filter((entry) => entry.type === 'gate_leaf')
    const gates = fort.filter((entry) => entry.type === 'gate')
    assert.equal(corners.length, 4, label)
    assert.equal(supports.length, 8, label)
    assert.equal(leaves.length, 8, label)
    assert.equal(gates.length, 4, label)
    assert.deepEqual(
        new Set(gates.map((entry) => value(entry, 'direction'))),
        new Set(['north', 'south', 'west', 'east']),
        label
    )
    const structures = layer(map, 'Ruins').data,
        solid = layer(map, 'Collision').data
    const visual = Array(96 * 80).fill(0)
    for (const prop of layer(map, 'Depth props').objects) {
        const tiles = JSON.parse(value(prop, 'tiles')),
            columns = value(prop, 'columns')
        for (const [index, gid] of tiles.entries())
            visual[
                (prop.y / 16 + Math.floor(index / columns)) * 96 +
                    prop.x / 16 +
                    (index % columns)
            ] = gid
    }
    for (const corner of corners) {
        assert.equal(corner.width, 48, label)
        assert.equal(corner.height, 48, label)
        const { x, y } = tileRect(corner)
        for (let dy = 0; dy < 3; dy++)
            for (let dx = 0; dx < 3; dx++)
                assert.equal(
                    structures[(y + dy) * 96 + x + dx],
                    512 + [96, 108, 120][dy] + dx,
                    `${label}: complete square corner`
                )
    }
    for (const support of supports) {
        assert.equal(support.width, 32, label)
        assert.equal(support.height, 32, label)
        const { x, y } = tileRect(support)
        for (let dy = 0; dy < 2; dy++)
            for (let dx = 0; dx < 2; dx++)
                assert.equal(
                    structures[(y + dy) * 96 + x + dx],
                    512 + (dy ? 120 : 96) + (dx ? 2 : 0),
                    `${label}: complete compact support`
                )
    }
    for (const leaf of leaves) {
        assert.equal(leaf.width * leaf.height, 3 * 16 * 16, label)
        for (const [index, [x, y]] of cells(tileRect(leaf)).entries()) {
            const expected = JSON.parse(value(leaf, 'tiles'))[index]
            assert.ok(expected > 0 && expected <= 16, label)
            assert.equal(
                visual[y * 96 + x],
                expected,
                `${label}: visible opened gate leaf`
            )
            assert.equal(
                solid[y * 96 + x],
                1,
                `${label}: folded leaf stays along solid wall`
            )
        }
    }
    const actualParts = [...corners, ...supports, ...leaves]
    for (let x = 12; x <= 84; x++)
        for (const y of [12, 67])
            if (Math.abs(x - 48) > 3)
                actualParts.push({
                    x: x * 16,
                    y: y * 16,
                    width: 16,
                    height: 16,
                })
    for (let y = 12; y <= 67; y++)
        for (const x of [12, 84])
            if (Math.abs(y - 40) > 3)
                actualParts.push({
                    x: x * 16,
                    y: y * 16,
                    width: 16,
                    height: 16,
                })
    for (const building of buildings)
        for (const part of actualParts)
            assert.equal(
                intersect(tileRect(building), tileRect(part), 2),
                false,
                `${label}: fortifications/roof clearance`
            )
    for (const prop of layer(map, 'Depth props').objects) {
        const rectangle = tileRect(prop)
        if (leaves.some((leaf) => intersect(rectangle, tileRect(leaf))))
            continue
        for (const part of actualParts)
            assert.equal(
                intersect(rectangle, tileRect(part), 2),
                false,
                `${label}: no later prop in fortification buffer`
            )
        for (const building of buildings) {
            const house = tileRect(building)
            if (
                rectangle.x >= house.x &&
                rectangle.y >= house.y &&
                rectangle.x + rectangle.w <= house.x + house.w &&
                rectangle.y + rectangle.h <= house.y + house.h
            )
                continue
            assert.equal(
                intersect(rectangle, house, 2),
                false,
                `${label}: two free cells around house`
            )
        }
    }
    const junctions = [...corners, ...supports]
    for (const part of actualParts.filter(
        (entry) => entry.width === 16 && entry.height === 16
    )) {
        if (
            junctions.some((junction) =>
                intersect(tileRect(part), tileRect(junction))
            )
        )
            continue
        const x = part.x / 16,
            y = part.y / 16
        assert.equal(
            structures[y * 96 + x],
            512 + ([12, 67].includes(y) ? 100 : 123),
            `${label}: unchanged complete stone wall`
        )
    }

    for (const gate of gates) {
        const opening = JSON.parse(value(gate, 'opening'))
        assert.equal(value(gate, 'openingWidth'), 7, label)
        for (const [x, y] of cells(opening)) {
            assert.equal(
                solid[y * 96 + x],
                0,
                `${label}: seven-tile gate opening`
            )
            assert.equal(
                visual[y * 96 + x],
                0,
                `${label}: unobstructed gate art`
            )
        }
    }
    for (const [cx, cy, dx, dy] of [
        [48, 12, 0, 1],
        [48, 67, 0, 1],
        [12, 40, 1, 0],
        [84, 40, 1, 0],
    ])
        for (let step = -3; step <= 3; step++)
            for (let side = -1; side <= 1; side++) {
                const x = cx + step * dx + (1 - dx) * side,
                    y = cy + step * dy + (1 - dy) * side
                assert.equal(
                    solid[y * 96 + x],
                    0,
                    `${label}: character passage through gate`
                )
                assert.equal(
                    layer(map, 'Paths and ponds').data[y * 96 + x],
                    pavingGid,
                    label
                )
            }
    const anchors = layer(map, 'City anchors').objects
    const graves = anchors.filter((entry) =>
        value(entry, 'anchorId')?.startsWith('spawn.grave-')
    )
    const cemetery = anchors.find(
        (entry) => value(entry, 'anchorId') === 'cemetery'
    )
    const plaza = anchors.find((entry) => value(entry, 'anchorId') === 'plaza')
    assert.equal(plaza.width, 160, label)
    assert.equal(plaza.height, 160, label)
    const chapel = buildings.find((entry) => value(entry, 'kind') === 'chapel')
    assert.equal(graves.length, 6, label)
    assert.equal(
        cemetery.x - chapel.x - chapel.width,
        32,
        `${label}: chapel/cemetery two-tile passage`
    )
    assert.equal(cemetery.y, chapel.y, label)
    const connected = reached(map, [
        Math.floor(graves[0].x / 16),
        Math.floor(graves[0].y / 16),
    ])
    const reachable = (x, y) =>
        assert.ok(
            connected.has(Math.floor(y / 16) * 96 + Math.floor(x / 16)),
            `${label}: reachable ${x}/${y}`
        )
    const portals = anchors.filter((entry) =>
        value(entry, 'anchorId')?.startsWith('portal.')
    )
    assert.equal(portals.length, 4, `${label}: city portal capacity`)
    for (const [index, portal] of portals.entries()) {
        const cell = Math.floor(portal.y / 16) * 96 + Math.floor(portal.x / 16)
        assert.equal(layer(map, 'Paths and ponds').data[cell], pavingGid, label)
        assert.ok(portal.x > plaza.x && portal.x < plaza.x + plaza.width, label)
        assert.ok(
            portal.y > plaza.y && portal.y < plaza.y + plaza.height,
            label
        )
        assert.ok(
            portals
                .slice(0, index)
                .every(
                    (other) =>
                        Math.hypot(portal.x - other.x, portal.y - other.y) >= 32
                ),
            label
        )
    }
    for (const grave of graves) {
        const cell = Math.floor(grave.y / 16) * 96 + Math.floor(grave.x / 16)
        assert.equal(solid[cell], 0, label)
        assert.equal(
            layer(map, 'Paths and ponds').data[cell],
            soilGid,
            `${label}: awakening on grave earth`
        )
        assert.ok(
            grave.x > cemetery.x && grave.x < cemetery.x + cemetery.width,
            label
        )
        assert.ok(
            grave.y > cemetery.y && grave.y < cemetery.y + cemetery.height,
            label
        )
        reachable(grave.x, grave.y)
    }
    for (const anchor of anchors.filter(
        (entry) =>
            entry.type === 'city_anchor' && value(entry, 'anchorId') !== 'bell'
    ))
        reachable(anchor.x, anchor.y)
    for (const building of buildings) {
        reachable(value(building, 'entryX'), value(building, 'entryY'))
        reachable(value(building, 'interiorX'), value(building, 'interiorY'))
        const x = Math.floor(value(building, 'entryX') / 16),
            y = Math.floor(value(building, 'entryY') / 16) + 1
        for (let dx = 0; dx < 2; dx++) {
            assert.equal(solid[y * 96 + x + dx], 0, label)
            assert.equal(
                layer(map, 'Paths and ponds').data[y * 96 + x + dx],
                pavingGid,
                `${label}: two-tile door approach`
            )
        }
    }
    for (const [x, y] of [
        [48, 0],
        [48, 79],
        [0, 40],
        [95, 40],
        [48, 40],
    ])
        reachable(x * 16 + 8, y * 16 + 8)
    assert.equal(
        layer(map, 'Grave sources').objects.length,
        0,
        `${label}: peaceful cemetery never spawns undead`
    )
    const bell = layer(map, 'World interactions').objects.find(
        (entry) => entry.type === 'bell'
    )
    assert.equal(value(bell, 'interactionId'), 'novogorod:memory-bell', label)
    assert.ok(
        bell.x > chapel.x && bell.x + bell.width < chapel.x + chapel.width,
        label
    )
    assert.ok(
        bell.y > chapel.y && bell.y + bell.height < chapel.y + chapel.height,
        label
    )
    assert.equal(
        layer(map, 'Building covers').data[
            Math.floor(bell.y / 16) * 96 + Math.floor(bell.x / 16)
        ] > 0,
        true,
        label
    )
    for (const object of layer(map, 'World interactions').objects) {
        const rectangle = tileRect(object)
        const adjacent = []
        for (let x = rectangle.x; x < rectangle.x + rectangle.w; x++)
            adjacent.push([x, rectangle.y - 1], [x, rectangle.y + rectangle.h])
        for (let y = rectangle.y; y < rectangle.y + rectangle.h; y++)
            adjacent.push([rectangle.x - 1, y], [rectangle.x + rectangle.w, y])
        assert.ok(
            adjacent.some(([x, y]) => connected.has(y * 96 + x)),
            `${label}: reachable interaction ${object.name}`
        )
    }
}

for (const style of ['grid', 'organic', 'ring'])
    test(`100 ${style} seeds preserve geometry, reachability and deterministic art`, () => {
        const layouts = new Set()
        for (let seed = 0; seed < 100; seed++) {
            const map = generateCity(`city-seed-${seed}`, style)
            const repeated = generateCity(`city-seed-${seed}`, style)
            const hash = (data) =>
                createHash('sha256').update(JSON.stringify(data)).digest('hex')
            assert.equal(
                hash(map),
                hash(repeated),
                `${style}/${seed}: reproducible complete map`
            )
            layouts.add(
                JSON.stringify(
                    layer(map, 'Buildings').objects.map((entry) => [
                        entry.x,
                        entry.y,
                    ])
                )
            )
            verify(map, style, `${style}/${seed}`)
        }
        assert.ok(layouts.size > 20, `${style}: real layout variation`)
    })
test('every checked fallback renders the same constraints and styles are chosen from the full pool', () => {
    const definition = WORLD_LOCATION_DEFINITIONS.find(
            (entry) => entry.id === CENTER_LOCATION_ID
        ),
        styles = new Set()
    for (const style of ['grid', 'organic', 'ring'])
        for (let seed = 0; seed < 8; seed++) {
            const map = generateWorldMap(definition, {
                seed,
                style,
                forceCityFallback: true,
            })
            assert.equal(value(map, 'cityLayoutFallback'), true)
            verify(map, style, `fallback/${style}/${seed}`)
        }
    for (let seed = 0; seed < 120; seed++) {
        const map = generateCity(seed)
        const chosen = value(map, 'cityStyle')
        styles.add(chosen)
        assert.deepEqual(
            generateCity(seed, chosen),
            map,
            'explicit chosen style reproduces default city'
        )
    }
    assert.deepEqual(styles, new Set(['grid', 'organic', 'ring']))
    assert.throws(() => generateCity('seed', 'unknown'), /Unknown city layout/)
    assert.throws(() => generateCity(''), /requires a seed/)
    assert.throws(() => generateCity(Number.NaN), /requires a seed/)
})
test('fortification sound bounds cover exactly the painted wall cells and leave gate openings free', () => {
    const map = generateCity('fortification-sound-footprints', 'grid')
    const objects = layer(map, 'Fortifications').objects
    const walls = objects.filter((object) => object.type === 'wall')
    assert.equal(walls.length, 8)
    assert.ok(walls.every((wall) => wall.width === 16 || wall.height === 16))
    assert.equal(new Set(objects.map(({ id }) => id)).size, objects.length)
    const wallCells = new Set(
        walls.flatMap((wall) => cells(tileRect(wall)).map(String))
    )
    const plannedCells = new Set(
        planFortifications().walls.map(([x, y]) => String([x, y]))
    )
    assert.deepEqual(wallCells, plannedCells)
    for (const gate of objects.filter((object) => object.type === 'gate')) {
        assert.ok(
            cells(JSON.parse(value(gate, 'opening'))).every(
                (cell) => !wallCells.has(String(cell))
            )
        )
    }
})

test('all other 24 region maps remain byte-equivalent to their authored definitions', () => {
    for (const definition of WORLD_LOCATION_DEFINITIONS.filter(
        (entry) => entry.id !== CENTER_LOCATION_ID
    )) {
        const expected = JSON.parse(
            fs.readFileSync(
                new URL(
                    `../apps/frontend/public/game/map/${definition.id}.json`,
                    import.meta.url
                ),
                'utf8'
            )
        )
        assert.equal(
            JSON.stringify(generateWorldMap(definition)),
            JSON.stringify(expected),
            definition.id
        )
    }
})
