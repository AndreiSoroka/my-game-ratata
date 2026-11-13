import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
    WorldObjectBounds,
    WorldObjectKind,
} from '@my-game-ratata/contracts'

export interface WorldObjectDefinition {
    id: string
    kind: WorldObjectKind
    name: string
    text: string
    locationId: string
    bounds: WorldObjectBounds
}

interface MapObject extends WorldObjectBounds {
    name: string
    type: string
    properties?: Array<{ name: string; value: unknown }>
}
interface ObjectMap {
    layers: Array<{ name: string; type: string; objects?: MapObject[] }>
}

const cache = new Map<string, WorldObjectDefinition[]>()

/** Authored map metadata is loaded once; no atlas/GID rules in gameplay. */
export function loadWorldObjects(locationId: string): WorldObjectDefinition[] {
    const existing = cache.get(locationId)
    if (existing !== undefined) {
        return existing
    }
    const root =
        process.env['GAME_MAP_ROOT'] ??
        path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            '../../../../apps/frontend/public/game/map'
        )
    const map = JSON.parse(
        fs.readFileSync(path.join(root, `${locationId}.json`), 'utf8')
    ) as ObjectMap
    const objects = readWorldObjects(map, locationId)
    cache.set(locationId, objects)
    return objects
}

export function readWorldObjects(
    map: ObjectMap,
    locationId: string
): WorldObjectDefinition[] {
    const layer = map.layers.find(
        (candidate) =>
            candidate.type === 'objectgroup' &&
            candidate.name === 'World interactions'
    )
    return (layer?.objects ?? []).flatMap((object) => {
        if (
            object.type !== 'sign' &&
            object.type !== 'barrel' &&
            object.type !== 'water'
        ) {
            return []
        }
        const id = object.properties?.find(
            (property) => property.name === 'interactionId'
        )?.value
        const text = object.properties?.find(
            (property) => property.name === 'text'
        )?.value
        if (
            typeof id !== 'string' ||
            typeof text !== 'string' ||
            !validBounds(object)
        ) {
            throw new Error(`Invalid world interaction in ${locationId}`)
        }
        return [
            {
                id,
                text,
                locationId,
                kind: object.type,
                name: object.name,
                bounds: {
                    x: object.x,
                    y: object.y,
                    width: object.width,
                    height: object.height,
                },
            },
        ]
    })
}

function validBounds(bounds: WorldObjectBounds): boolean {
    return (
        [bounds.x, bounds.y, bounds.width, bounds.height].every(
            Number.isFinite
        ) &&
        bounds.width > 0 &&
        bounds.height > 0
    )
}
