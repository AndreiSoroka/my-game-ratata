import type { Vector2 } from '@my-game-ratata/contracts'

import type { EncounterMapObject } from './encounterData'
import type { MapGrid } from './navigation'
import type { TiledMap } from './navigationGrid'

export interface DungeonPassage {
    id: string
    destinationLocationId: string
    destinationPassageId: string
    direction: 'up' | 'down'
    position: Vector2
    arrival: Vector2
    triggerRadius: number
}

export function readDungeonMapData(
    map: TiledMap,
    mapId: string
): Pick<MapGrid, 'dungeonPassages' | 'dungeonSkeletons' | 'dungeonFatZombies'> {
    const passages = objects(map, 'Dungeon passages').map((object) =>
        readDungeonPassage(object, map, mapId)
    )
    if (
        passages.length > 2 ||
        new Set(passages.map(({ id }) => id)).size !== passages.length ||
        new Set(passages.map(({ direction }) => direction)).size !==
            passages.length
    ) {
        throw new Error(`Invalid dungeon passage set on ${mapId}`)
    }
    return {
        ...readDungeonSpawns(map, mapId),
        ...(passages.length === 0 ? {} : { dungeonPassages: passages }),
    }
}

function readDungeonSpawns(
    map: TiledMap,
    mapId: string
): Pick<MapGrid, 'dungeonSkeletons' | 'dungeonFatZombies'> {
    const skeletons: Vector2[] = []
    const fatZombies: Vector2[] = []
    const spawnTiles = new Set<number>()
    const deepDungeon = allowsFatZombies(map)
    for (const object of objects(map, 'Dungeon spawns')) {
        const position = { x: object.x, y: object.y }
        const group =
            object.type === 'skeleton'
                ? skeletons
                : object.type === 'fat_zombie' && deepDungeon
                  ? fatZombies
                  : undefined
        if (group === undefined || !inside(position, map)) {
            throw new Error(`Invalid dungeon enemy on ${mapId}`)
        }
        const tile =
            Math.floor(position.x / map.tilewidth) +
            Math.floor(position.y / map.tileheight) * map.width
        if (spawnTiles.has(tile)) {
            throw new Error(`Duplicate dungeon spawn tile on ${mapId}`)
        }
        spawnTiles.add(tile)
        group.push(position)
    }
    return {
        ...(skeletons.length === 0 ? {} : { dungeonSkeletons: skeletons }),
        ...(fatZombies.length === 0 ? {} : { dungeonFatZombies: fatZombies }),
    }
}

function allowsFatZombies(map: TiledMap): boolean {
    const floor = map.properties?.find(
        ({ name }) => name === 'dungeonFloor'
    )?.value
    return (
        typeof floor === 'number' &&
        Number.isInteger(floor) &&
        floor >= 2 &&
        floor <= 5 &&
        map.properties?.find(({ name }) => name === 'dungeon')?.value === true
    )
}

function readDungeonPassage(
    object: EncounterMapObject,
    map: TiledMap,
    mapId: string
): DungeonPassage {
    const id = property(object, 'id')
    const destinationLocationId = property(object, 'destinationLocationId')
    const destinationPassageId = property(object, 'destinationPassageId')
    const direction = property(object, 'direction')
    const arrival = {
        x: property(object, 'arrivalX'),
        y: property(object, 'arrivalY'),
    }
    const position = { x: object.x, y: object.y }
    if (
        !isId(id) ||
        !isId(destinationLocationId) ||
        destinationLocationId === mapId ||
        !isId(destinationPassageId) ||
        (direction !== 'up' && direction !== 'down') ||
        !inside(position, map) ||
        !inside(arrival, map)
    ) {
        throw new Error(`Invalid dungeon passage on ${mapId}`)
    }
    return {
        id,
        destinationLocationId,
        destinationPassageId,
        direction,
        position,
        arrival,
        triggerRadius: readTriggerRadius(object, mapId),
    }
}

function isId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0
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

function inside(
    point: { x: unknown; y: unknown },
    map: TiledMap
): point is Vector2 {
    return (
        typeof point.x === 'number' &&
        typeof point.y === 'number' &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.width * map.tilewidth &&
        point.y < map.height * map.tileheight
    )
}
