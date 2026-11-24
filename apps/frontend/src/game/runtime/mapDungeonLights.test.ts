import { expect, it } from 'vitest'

import { readDungeonLights } from './mapDungeonLights'

it('only enables darkness on dungeon maps and only draws usable lit point objects', () => {
    const properties = [{ name: 'dungeon', value: true }]
    const dungeon = { width: 6, height: 3, tilewidth: 16, tileheight: 16, properties, layers: [] }
    expect(readDungeonLights({ ...dungeon, properties: [] })).toBeUndefined()
    expect(readDungeonLights(dungeon)).toEqual([])
    const torch = { name: 'Torch', point: true, x: 20, y: 36 }
    expect(
        readDungeonLights({
            ...dungeon,
            layers: [
                {
                    name: 'Dungeon lights',
                    type: 'objectgroup',
                    objects: [
                        { ...torch, properties: [{ name: 'radius', value: 48 }] },
                        { ...torch, properties: [{ name: 'lit', value: false }] },
                        { ...torch, properties: [{ name: 'radius', value: Infinity }] },
                        { ...torch, point: false },
                        { ...torch, y: 48 },
                    ],
                },
            ],
        })
    ).toEqual([{ x: 20, y: 36, radius: 48 }])
})
