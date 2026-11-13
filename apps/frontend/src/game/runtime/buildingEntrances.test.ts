import { describe, expect, it } from 'vitest'

import { BuildingEntrances } from './buildingEntrances'
import type { MapBuilding } from './mapBuildings'

const guild = (): MapBuilding => ({
    id: 'guild',
    name: 'Гильдия искателей',
    x: 576,
    y: 384,
    width: 144,
    height: 144,
    entry: { x: 648, y: 520 },
    cover: document.createElement('canvas'),
})

describe('public building entrance metadata', () => {
    it('returns detached plain landmarks without canvas assets', () => {
        const entrances = new BuildingEntrances()
        const building = guild()
        entrances.replace('city', [building])
        const first = entrances.read('city')
        expect(first).toEqual([
            {
                id: 'guild',
                name: 'Гильдия искателей',
                entry: { x: 648, y: 520 },
                bounds: { x: 576, y: 384, width: 144, height: 144 },
            },
        ])
        expect(JSON.parse(JSON.stringify(first))).toEqual(first)
        first[0]!.entry.x = 999
        first[0]!.bounds.width = 0
        building.entry.y = 0
        expect(entrances.read('city')[0]).toMatchObject({
            entry: { x: 648, y: 520 },
            bounds: { width: 144 },
        })
    })

    it('hides the old location during loading, replaces it on arrival and clears on disposal', () => {
        const entrances = new BuildingEntrances()
        entrances.replace('city', [guild()])
        expect(entrances.read('outskirts')).toEqual([])
        expect(entrances.read(undefined)).toEqual([])
        // An obsolete async load may be abandoned while the current map remains rendered.
        expect(entrances.read('city')).toHaveLength(1)
        entrances.replace('outskirts', [])
        expect(entrances.read('city')).toEqual([])
        entrances.replace('city', [guild()])
        entrances.clear()
        expect(entrances.read('city')).toEqual([])
    })
})
