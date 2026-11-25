import {
    type DungeonRevealCell,
    type DungeonRevealSnapshot,
    ITEM_DEFINITIONS,
    type ItemId,
    type Vector2,
} from '@my-game-ratata/contracts'

import type { EncounterMapObject } from './encounterData'
import type { TiledMap } from './navigationGrid'

export const dungeonSecretLayer = 'Dungeon secrets'

interface SecretItem {
    itemId: ItemId
    quantity: number
}

export interface DungeonSecretReward {
    chest: { x: number; y: number; items: SecretItem[] }
    guards: Vector2[]
}

export interface DungeonSecretDefinition extends DungeonRevealSnapshot {
    position: Vector2
    reward?: DungeonSecretReward
}

export function readDungeonSecrets(
    map: TiledMap,
    mapId: string
): DungeonSecretDefinition[] {
    const objects =
        map.layers.find((layer) => layer.name === dungeonSecretLayer)
            ?.objects ?? []
    if (objects.length === 0) {
        return []
    }
    try {
        if (objects.length > 2) {
            throw new Error('Too many hidden walls')
        }
        const secrets: DungeonSecretDefinition[] = []
        for (const [index, object] of objects.entries()) {
            const parent = secrets.at(-1)?.id
            const requires = jsonProperty(object, 'requires')
            const secret = readSecret(object, map, index === objects.length - 1)
            if ((requires ?? undefined) !== parent || secret.id === parent) {
                throw new Error('Invalid hidden wall order')
            }
            secrets.push(secret)
        }
        return secrets
    } catch (cause) {
        throw new Error(`Invalid dungeon secret on ${mapId}`, { cause })
    }
}

function readSecret(
    object: EncounterMapObject,
    map: TiledMap,
    isFinal: boolean
): DungeonSecretDefinition {
    const id = property(object, 'id')
    const position = { x: object.x, y: object.y }
    const cells = jsonProperty(object, 'tiles')
    const wallIndex =
        Math.floor(position.y / map.tileheight) * map.width +
        Math.floor(position.x / map.tilewidth)
    if (
        typeof id !== 'string' ||
        id.length === 0 ||
        !isMapPoint(position, map) ||
        !Array.isArray(cells) ||
        !cells.every((cell) => isRevealCell(cell, map.width * map.height)) ||
        new Set(cells.map((cell) => cell.index)).size !== cells.length ||
        !cells.some((cell) => cell.index === wallIndex && !cell.solid)
    ) {
        throw new Error('Invalid hidden wall or map patch')
    }
    const reward = readReward(object, map)
    if (Boolean(reward) !== isFinal) {
        throw new Error('Only the last hidden wall opens the treasure room')
    }
    return { id, cells, position, ...(reward === undefined ? {} : { reward }) }
}

function readReward(
    object: EncounterMapObject,
    map: TiledMap
): DungeonSecretReward | undefined {
    const chest = jsonProperty(object, 'chest')
    const guards = jsonProperty(object, 'guards')
    if (chest === undefined && guards === undefined) {
        return undefined
    }
    if (
        !isMapPoint(chest, map) ||
        !('items' in chest) ||
        !Array.isArray(chest.items) ||
        chest.items.length !== 3 ||
        !chest.items.every(isSecretItem) ||
        !Array.isArray(guards) ||
        guards.length !== 2 ||
        !guards.every((guard) => isMapPoint(guard, map))
    ) {
        throw new Error('Invalid hidden treasure or guards')
    }
    return { chest: { ...chest, items: chest.items }, guards }
}

function property(object: EncounterMapObject, name: string): unknown {
    return object.properties?.find((entry) => entry.name === name)?.value
}

function jsonProperty(object: EncounterMapObject, name: string): unknown {
    const value = property(object, name)
    return typeof value === 'string' ? JSON.parse(value) : value
}

function isRevealCell(
    value: unknown,
    cellCount: number
): value is DungeonRevealCell {
    return (
        isRecord(value) &&
        isNonnegativeInteger(value['index']) &&
        value['index'] < cellCount &&
        isNonnegativeInteger(value['floorGid']) &&
        isNonnegativeInteger(value['wallGid']) &&
        isNonnegativeInteger(value['surfaceGid']) &&
        typeof value['solid'] === 'boolean'
    )
}

function isMapPoint(value: unknown, map: TiledMap): value is Vector2 {
    return (
        isRecord(value) &&
        typeof value['x'] === 'number' &&
        value['x'] >= 0 &&
        value['x'] < map.width * map.tilewidth &&
        typeof value['y'] === 'number' &&
        value['y'] >= 0 &&
        value['y'] < map.height * map.tileheight
    )
}

function isSecretItem(value: unknown): value is SecretItem {
    return (
        isRecord(value) &&
        typeof value['itemId'] === 'string' &&
        Object.hasOwn(ITEM_DEFINITIONS, value['itemId']) &&
        isNonnegativeInteger(value['quantity']) &&
        value['quantity'] > 0 &&
        value['quantity'] <=
            (ITEM_DEFINITIONS[value['itemId'] as ItemId].maxStack ?? 1)
    )
}

function isNonnegativeInteger(value: unknown): value is number {
    return (
        typeof value === 'number' && value >= 0 && Number.isSafeInteger(value)
    )
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object'
}
