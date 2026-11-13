import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { loadNavigationService } from '../src/game/navigation'

interface Property {
    name: string
    value: unknown
}
interface MapObject {
    id: number
    name: string
    type: string
    x: number
    y: number
    width: number
    height: number
    properties: Property[]
}
interface Layer {
    name: string
    data?: number[]
    objects?: MapObject[]
    visible?: boolean
}
interface GeneratedMap {
    width: number
    height: number
    layers: Layer[]
    tilesets: Array<{ firstgid: number; source: string }>
}
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
beforeEach(() => vi.stubGlobal('Bun', { env: {} }))
afterEach(() => vi.unstubAllGlobals())
const barrelGids = new Set([201, 641, 642, 853])
function load(id: string): GeneratedMap {
    return JSON.parse(
        fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
    ) as GeneratedMap
}
function property(object: MapObject, name: string): unknown {
    return object.properties.find((item) => item.name === name)?.value
}
function objects(map: GeneratedMap, name: string): MapObject[] {
    return map.layers.find((layer) => layer.name === name)?.objects ?? []
}
function data(map: GeneratedMap, name: string): number[] {
    return map.layers.find((layer) => layer.name === name)?.data ?? []
}
function propTiles(object: MapObject): number[] {
    return JSON.parse(String(property(object, 'tiles'))) as number[]
}
function reachableCells(id: string): Set<number> {
    const { grid } = loadNavigationService(id)
    const start = 40 * grid.width + 48
    const reached = new Set([start])
    const queue = [start]
    for (const index of queue) {
        const x = index % grid.width,
            y = Math.floor(index / grid.width)
        for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ] as const) {
            const next = (y + dy) * grid.width + x + dx
            if (
                x + dx < 0 ||
                y + dy < 0 ||
                x + dx >= grid.width ||
                y + dy >= grid.height ||
                grid.solid[next] === true ||
                reached.has(next)
            ) {
                continue
            }
            reached.add(next)
            queue.push(next)
        }
    }
    return reached
}
function perimeter(object: MapObject, width: number): number[] {
    const result: number[] = []
    const left = object.x / 16,
        top = object.y / 16
    const right = (object.x + object.width) / 16,
        bottom = (object.y + object.height) / 16
    for (let x = left; x < right; x += 1) {
        result.push((top - 1) * width + x, bottom * width + x)
    }
    for (let y = top; y < bottom; y += 1) {
        result.push(y * width + left - 1, y * width + right)
    }
    return result
}

describe('complete map art and physical interactions', () => {
    it.each(WORLD_LOCATION_DEFINITIONS.map((location) => location.id))(
        '%s keeps ground flat and complete props separate from terrain',
        (id) => {
            const map = load(id)
            expect(new Set(data(map, 'Grass'))).toEqual(new Set([37]))
            expect(
                data(map, 'Trees and landmarks').every((gid) => gid === 0)
            ).toBe(true)
            expect(data(map, 'Paths and ponds')).not.toContain(94)
            const surfaces = data(map, 'Footstep surfaces')
            data(map, 'Paths and ponds').forEach((gid, index) => {
                if (gid === 1024) {
                    expect(surfaces[index]).toBe(94)
                }
                if (gid === 1025) {
                    expect(surfaces[index]).toBe(585)
                }
            })
            const references = map.tilesets.map((reference) => {
                const source = path.join(root, reference.source)
                const tileset = JSON.parse(fs.readFileSync(source, 'utf8')) as {
                    tilecount: number
                    image: string
                }
                expect(
                    fs.existsSync(
                        path.resolve(path.dirname(source), tileset.image)
                    )
                ).toBe(true)
                return { first: reference.firstgid, count: tileset.tilecount }
            })
            const props = objects(map, 'Depth props')
            expect(props.length).toBeGreaterThan(0)
            for (const prop of props) {
                const tiles = propTiles(prop)
                expect(prop.type).toBe('depth_prop')
                expect(Number(property(prop, 'columns')) * 16).toBe(prop.width)
                expect(tiles.length).toBe((prop.width * prop.height) / 256)
                expect(Number(property(prop, 'baseY'))).toBeGreaterThan(
                    prop.y + prop.height - 16
                )
                expect(Number(property(prop, 'baseY'))).toBeLessThanOrEqual(
                    prop.y + prop.height
                )
                for (const gid of tiles) {
                    const reference = references.findLast(
                        (entry) => gid >= entry.first
                    )
                    expect(reference).toBeDefined()
                    expect(gid - (reference?.first ?? 0)).toBeLessThan(
                        reference?.count ?? 0
                    )
                }
                if (prop.name === 'tree') {
                    expect([
                        [48, 64, 12],
                        [16, 32, 2],
                    ]).toContainEqual([prop.width, prop.height, tiles.length])
                }
            }
        }
    )
})

describe('whole interior furnishings', () => {
    it('uses complete tables, benches, beds and bookcases rather than skipping their blocked parts', () => {
        const city = objects(load('map-2-2'), 'Depth props').filter(
            (prop) => prop.name === 'furniture'
        )
        const complete = new Map([
            [207, [207, 208, 209]],
            [217, [217, 218]],
            [242, [242, 258]],
            [241, [241, 257]],
        ])
        for (const [start, expected] of complete) {
            const matches = city.filter((prop) => propTiles(prop)[0] === start)
            if (start !== 217) {
                expect(matches.length).toBeGreaterThan(0)
            }
            for (const prop of matches) {
                expect(propTiles(prop)).toEqual(expected)
            }
        }
        const farm = objects(load('map-2-1'), 'Depth props')
        expect(
            farm.some((prop) => JSON.stringify(propTiles(prop)) === '[217,218]')
        ).toBe(true)
        expect(
            farm.some(
                (prop) =>
                    JSON.stringify(propTiles(prop)) === '[878,879]' &&
                    prop.width === 32 &&
                    prop.height === 16
            )
        ).toBe(true)
    })
})

describe('physical world interactions', () => {
    it.each(WORLD_LOCATION_DEFINITIONS.map((location) => location.id))(
        '%s exposes reachable signs, solid barrels and water edges',
        (id) => {
            const map = load(id)
            const interactions = objects(map, 'World interactions')
            const solid = data(map, 'Collision')
            const reached = reachableCells(id)
            const ids = interactions.map((object) =>
                property(object, 'interactionId')
            )
            expect(new Set(ids).size).toBe(ids.length)
            expect(
                interactions.filter((object) => object.type === 'sign').length
            ).toBeGreaterThanOrEqual(5)
            for (const object of interactions) {
                expect(['sign', 'barrel', 'water']).toContain(object.type)
                expect(property(object, 'action')).toBe(
                    object.type === 'sign'
                        ? 'read'
                        : object.type === 'barrel'
                          ? 'search'
                          : 'drink'
                )
                expect(property(object, 'text')).toBeTypeOf('string')
                expect(
                    perimeter(object, map.width).some((cell) =>
                        reached.has(cell)
                    ),
                    property(object, 'interactionId') as string
                ).toBe(true)
                if (object.type === 'sign') {
                    continue
                }
                for (
                    let y = object.y / 16;
                    y < (object.y + object.height) / 16;
                    y += 1
                ) {
                    for (
                        let x = object.x / 16;
                        x < (object.x + object.width) / 16;
                        x += 1
                    ) {
                        expect(solid[y * map.width + x]).toBe(1)
                    }
                }
            }
            for (const prop of objects(map, 'Depth props')) {
                const tiles = propTiles(prop)
                for (let index = 0; index < tiles.length; index += 1) {
                    if (!barrelGids.has(tiles[index] ?? 0)) {
                        continue
                    }
                    const x = prop.x + (index % (prop.width / 16)) * 16
                    const y =
                        prop.y + Math.floor(index / (prop.width / 16)) * 16
                    expect(
                        interactions.some(
                            (object) =>
                                object.type === 'barrel' &&
                                object.x === x &&
                                object.y === y
                        )
                    ).toBe(true)
                    expect(solid[(y / 16) * map.width + x / 16]).toBe(1)
                }
            }
        }
    )
})

describe('complete authored city pines', () => {
    it('keeps every pine crown attached to its trunk and only blocks the trunk tile', () => {
        const city = load('map-2-2')
        const pines = objects(city, 'Depth props').filter((prop) =>
            propTiles(prop).includes(516)
        )
        const solid = data(city, 'Collision')
        expect(pines).toHaveLength(7)
        for (const pine of pines) {
            expect(propTiles(pine)).toEqual([516, 528])
            expect([pine.width, pine.height]).toEqual([16, 32])
            expect(pine.name).toBe('tree')
            const top = (pine.y / 16) * city.width + pine.x / 16
            expect(solid[top]).toBe(0)
            expect(solid[top + city.width]).toBe(1)
            expect(Number(property(pine, 'baseY'))).toBeGreaterThan(pine.y + 16)
        }
    })
})
