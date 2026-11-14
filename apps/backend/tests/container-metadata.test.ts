import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
    interactionApproachPoints,
    WORLD_LOCATION_DEFINITIONS,
} from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readHarvestSources } from '../src/game/harvestData'
import { loadNavigationService } from '../src/game/navigation'
import { WorldInventory } from '../src/game/worldInventory'
import { readWorldContainers } from '../src/game/worldObjectData'
import { required } from './containerTestHelpers'

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
interface MapObject {
    x: number
    y: number
    width: number
    height: number
    name: string
    type: string
    properties: Array<{ name: string; value: unknown }>
}
interface MapData {
    layers: Array<{ name: string; type: string; objects?: MapObject[] }>
}
const load = (id: string) =>
    JSON.parse(
        fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
    ) as MapData
const value = (object: MapObject, key: string) =>
    object.properties.find((entry) => entry.name === key)?.value
afterEach(() => vi.unstubAllGlobals())

describe('authored physical container and tree metadata', () => {
    it.each(WORLD_LOCATION_DEFINITIONS.map((location) => location.id))(
        '%s has finite reachable barrels matched to their original art and explicit tree profiles',
        (id) => {
            vi.stubGlobal('Bun', { env: {} })
            const map = load(id)
            const definitions = readWorldContainers(map, id)
            const navigation = loadNavigationService(id)
            const barrels = new WorldInventory(navigation)
                .snapshotChests()
                .filter((item) => item.kind === 'barrel')
            expect(barrels).toHaveLength(definitions.length)
            expect(definitions.length).toBeGreaterThan(0)
            expect(new Set(barrels.map((item) => item.id)).size).toBe(
                barrels.length
            )
            for (const definition of definitions) {
                expect(definition.contents).toEqual([
                    { itemId: 'wood', quantity: 1 },
                    { itemId: 'fiber', quantity: 1 },
                ])
                const center = {
                    x: definition.bounds.x + 8,
                    y: definition.bounds.y + 8,
                }
                expect(
                    navigation.isSolidTile(navigation.worldToTile(center))
                ).toBe(true)
                expect(
                    interactionApproachPoints(center, [definition.bounds]).some(
                        (point) =>
                            !navigation.isSolidTile(
                                navigation.worldToTile(point)
                            )
                    )
                ).toBe(true)
            }
            const trees = readHarvestSources(map, id).filter(
                (node) => node.source === 'tree'
            )
            const props = required(
                map.layers.find((layer) => layer.name === 'Depth props')
                    ?.objects
            )
            for (const tree of trees) {
                const prop = required(
                    props.find(
                        (candidate) =>
                            value(candidate, 'propId') === tree.propId
                    )
                )
                const tiles = JSON.parse(
                    value(prop, 'tiles') as string
                ) as number[]
                const expected =
                    prop.width === 16
                        ? 'pine'
                        : (required(tiles[0]) - 198) % 16 === 3
                          ? 'apple'
                          : 'forest'
                expect(value(prop, 'treeProfile')).toBe(expected)
                expect(tree.treeProfile).toBe(expected)
            }
        }
    )
    it.each([
        'missing-prop',
        'wrong-geometry',
        'unknown-item',
        'negative-quantity',
    ] as const)('rejects invalid container metadata: %s', (problem) => {
        const map = load('map-2-2')
        const barrel = required(
            map.layers
                .find((layer) => layer.name === 'World interactions')
                ?.objects?.find((object) => object.type === 'barrel')
        )
        if (problem === 'missing-prop') {
            required(
                barrel.properties.find((entry) => entry.name === 'propId')
            ).value = 'invented'
        }
        if (problem === 'wrong-geometry') {
            barrel.x += 16
        }
        if (problem === 'unknown-item') {
            required(
                barrel.properties.find((entry) => entry.name === 'contents')
            ).value = '[{"itemId":"free-gold","quantity":1}]'
        }
        if (problem === 'negative-quantity') {
            required(
                barrel.properties.find((entry) => entry.name === 'contents')
            ).value = '[{"itemId":"wood","quantity":-1}]'
        }
        expect(() => readWorldContainers(map, 'map-2-2')).toThrow()
    })
    it('rejects a tree source without its explicit profile', () => {
        const map = load('map-2-2')
        const tree = required(
            map.layers
                .find((layer) => layer.name === 'Harvest sources')
                ?.objects?.find((object) => object.type === 'tree')
        )
        tree.properties = tree.properties.filter(
            (entry) => entry.name !== 'treeProfile'
        )
        expect(() => readHarvestSources(map, 'map-2-2')).toThrow('tree profile')
    })
})
