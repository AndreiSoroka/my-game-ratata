import type { Vector2 } from '@my-game-ratata/contracts'

import type { EncounterMapObject } from './encounterData'
import type { MapGrid } from './navigation'
import type { TiledMap } from './navigationGrid'

export interface DungeonPassage {
    id: string
    destinationLocationId: string
    position: Vector2
    arrival: Vector2
    triggerRadius: number
}

export function readDungeonMapData(
    map: TiledMap,
    mapId: string
): Pick<MapGrid, 'dungeonPassage' | 'dungeonSkeletons'> {
    const passages = objects(map, 'Dungeon passages').map((object) => {
        const id = property(object, 'id')
        const destinationLocationId = property(object, 'destinationLocationId')
        const x = property(object, 'arrivalX')
        const y = property(object, 'arrivalY')
        const position = { x: object.x, y: object.y }
        if (
            typeof id !== 'string' ||
            id.length === 0 ||
            typeof destinationLocationId !== 'string' ||
            destinationLocationId === mapId ||
            typeof x !== 'number' ||
            typeof y !== 'number' ||
            !inside(position, map) ||
            !inside({ x, y }, map)
        ) {
            throw new Error(`Invalid dungeon passage on ${mapId}`)
        }
        return {
            id,
            destinationLocationId,
            position,
            arrival: { x, y },
            triggerRadius: readTriggerRadius(object, mapId),
        }
    })
    const skeletons = objects(map, 'Dungeon spawns').map((object) => {
        const point = { x: object.x, y: object.y }
        if (object.type !== 'skeleton' || !inside(point, map)) {
            throw new Error(`Invalid dungeon skeleton on ${mapId}`)
        }
        return point
    })
    if (passages.length > 1) {
        throw new Error(`Multiple dungeon passages on ${mapId}`)
    }
    const [passage] = passages
    return {
        ...(passage === undefined ? {} : { dungeonPassage: passage }),
        ...(skeletons.length === 0 ? {} : { dungeonSkeletons: skeletons }),
    }
}

function objects(map: TiledMap, name: string): readonly EncounterMapObject[] {
    return (
        map.layers.find(
            (layer) => layer.type === 'objectgroup' && layer.name === name
        )?.objects ?? []
    )
}

function property(object: EncounterMapObject, name: string): unknown {
    return object.properties?.find((entry) => entry.name === name)?.value
}

function readTriggerRadius(object: EncounterMapObject, mapId: string): number {
    const radius = property(object, 'triggerRadius')
    if (radius === undefined) {
        return 7
    }
    if (
        typeof radius !== 'number' ||
        !Number.isInteger(radius) ||
        radius <= 0
    ) {
        throw new Error(`Invalid dungeon passage radius on ${mapId}`)
    }
    return radius
}

function inside(point: Vector2, map: TiledMap): boolean {
    return (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.width * map.tilewidth &&
        point.y < map.height * map.tileheight
    )
}
