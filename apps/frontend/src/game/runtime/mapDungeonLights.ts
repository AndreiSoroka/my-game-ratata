import type { Vector2 } from '@my-game-ratata/contracts'

import type { TiledLandmark } from './mapLandmarks'

export interface DungeonLight extends Vector2 {
    radius: number
}

interface DungeonMapSource {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    properties?: { name: string; value: unknown }[]
    layers: { name: string; type: string; objects?: TiledLandmark[] }[]
}

/** An empty dungeon light list still means that the map is underground. */
export function readDungeonLights(map: DungeonMapSource): DungeonLight[] | undefined {
    if (!map.properties?.some(({ name, value }) => name === 'dungeon' && value === true))
        return undefined

    const lights = map.layers.find(
        ({ type, name }) => type === 'objectgroup' && name === 'Dungeon lights'
    )?.objects
    const worldWidth = map.width * map.tilewidth
    const worldHeight = map.height * map.tileheight
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < worldWidth && y < worldHeight
    return (lights ?? []).flatMap(({ point, x, y, properties }) => {
        if (
            !point ||
            !inside(x, y) ||
            properties?.some(({ name, value }) => name === 'lit' && value === false)
        )
            return []
        const radius = properties?.find((property) => property.name === 'radius')?.value ?? 80
        return typeof radius === 'number' && radius >= 8 && radius <= 192 ? [{ x, y, radius }] : []
    })
}
