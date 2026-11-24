import { expect, it } from 'vitest'

import { distanceToWater, isNearFortification, readAmbientTerrain } from './mapAmbientTerrain'

const size = { tileWidth: 16, tileHeight: 24 }

it('identifies water by the authored tileset range and measures from wet tile edges', () => {
    const terrain = readAmbientTerrain(
        {
            width: 4,
            height: 2,
            layers: [
                {
                    name: 'Paths and ponds',
                    type: 'tilelayer',
                    data: [85, 9001, 0x80000000 + 9003, 9004, 0, 0, 0, 0],
                },
                { name: 'Grass', type: 'tilelayer', data: [9001, 0, 0, 0, 0, 0, 0, 0] },
            ],
        },
        { firstgid: 9001, tilecount: 3 }
    )

    expect([...terrain.water]).toEqual([0, 1, 1, 0, 0, 0, 0, 0])
    expect(distanceToWater(terrain, { x: 24, y: 12 }, size, 5)).toBe(0)
    expect(distanceToWater(terrain, { x: 0, y: 12 }, size, 5)).toBe(1)
    expect(distanceToWater(terrain, { x: 0, y: 48 }, size, 5)).toBeCloseTo(Math.sqrt(2))
    expect(distanceToWater(terrain, { x: 160, y: 24 }, size, 5)).toBe(Infinity)
})

it('uses only valid wall and gate footprints and is symmetric across each side', () => {
    const wall = { type: 'wall', x: 16, y: 120, width: 200, height: 24 }
    const gate = { type: 'gate', x: 216, y: 96, width: 48, height: 48 }
    const terrain = readAmbientTerrain({
        width: 30,
        height: 30,
        layers: [
            {
                name: 'Fortifications',
                type: 'objectgroup',
                objects: [wall, gate, { ...wall, type: 'gate_leaf' }, { ...gate, width: 0 }],
            },
        ],
    })

    expect(terrain.fortifications).toHaveLength(2)
    for (const y of [24, 240]) {
        expect(isNearFortification(terrain, { x: 128, y }, size, 4)).toBe(true)
    }
    for (const y of [23, 241]) {
        expect(isNearFortification(terrain, { x: 128, y }, size, 4)).toBe(false)
    }
    expect(isNearFortification(terrain, { x: 320, y: 108 }, size, 4)).toBe(true)
    expect(distanceToWater(terrain, { x: 16, y: 24 }, size, 5)).toBe(Infinity)
})
