import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { WORLD_LOCATION_DEFINITIONS } from '@my-game-ratata/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadHarvestSources } from '../src/game/harvestData'
import { HarvestResources } from '../src/game/harvestResources'
import { loadNavigationService } from '../src/game/navigation'

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../frontend/public/game/map'
)
interface MapData {
    layers: Array<{
        name: string
        objects?: Array<{
            name: string
            properties: Array<{ name: string; value: unknown }>
        }>
    }>
}

afterEach(() => vi.unstubAllGlobals())

describe('authored resource metadata', () => {
    it('gives every visible tree one stable harvest source, including city pines', () => {
        const sources = loadHarvestSources()
        expect(new Set(sources.map((source) => source.id)).size).toBe(
            sources.length
        )
        for (const { id } of WORLD_LOCATION_DEFINITIONS) {
            const map = JSON.parse(
                fs.readFileSync(path.join(root, `${id}.json`), 'utf8')
            ) as MapData
            const trees = (
                map.layers.find((layer) => layer.name === 'Depth props')
                    ?.objects ?? []
            ).filter((prop) => prop.name === 'tree')
            const nodes = sources.filter(
                (node) => node.locationId === id && node.source === 'tree'
            )
            expect(nodes).toHaveLength(trees.length)
            for (const tree of trees) {
                const propId = tree.properties.find(
                    (property) => property.name === 'propId'
                )?.value
                expect(
                    nodes.filter((node) => node.propId === propId)
                ).toHaveLength(1)
            }
        }
        expect(sources.some((node) => node.source === 'stone')).toBe(true)
    })

    it('reconstructs the exact authored collision mask from base terrain plus resource footprints', () => {
        vi.stubGlobal('Bun', { env: {} })
        const navigation = new Map(
            WORLD_LOCATION_DEFINITIONS.map(({ id }) => [
                id,
                loadNavigationService(id),
            ])
        )
        const before = new Map(
            [...navigation].map(([id, service]) => [
                id,
                service.grid.solid.slice(),
            ])
        )
        const resources = new HarvestResources(
            structuredClone(loadHarvestSources())
        )
        resources.update(
            0,
            (id) => {
                const service = navigation.get(id)
                if (service === undefined) {
                    throw new Error('Missing map')
                }
                return service
            },
            []
        )
        for (const [id, service] of navigation) {
            expect(service.grid.solid, id).toEqual(before.get(id))
        }
    })
})
