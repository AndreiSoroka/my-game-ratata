import fs from 'node:fs'
import path from 'node:path'

import {
    type AuthoredContainerDefinition,
    authoredMessage,
    type AuthoredTextKey,
    type LocalizedMessage,
    type WorldObjectBounds,
    type WorldObjectKind,
    worldSignMessages,
    worldSignPresentation,
} from '@my-game-ratata/contracts'

import { readAuthoredContainer } from './containerData'
import { resolveMapRoot } from './mapFiles'
import { readInteractionAreas } from './worldObjectGeometry'

export interface WorldObjectDefinition {
    id: string
    kind: WorldObjectKind
    name: string
    nameMessage?: LocalizedMessage
    text: string
    textMessage?: LocalizedMessage
    locationId: string
    bounds: WorldObjectBounds
    interactionAreas?: WorldObjectBounds[]
}

interface MapObject extends WorldObjectBounds {
    name?: string
    type: string
    properties?: Array<{ name: string; value: unknown }>
}
interface ObjectMap {
    layers: Array<{ name: string; type?: string; objects?: MapObject[] }>
}

const cache = new Map<string, WorldObjectDefinition[]>()

/** Authored map metadata is loaded once; no atlas/GID rules in gameplay. */
export function loadWorldObjects(locationId: string): WorldObjectDefinition[] {
    const existing = cache.get(locationId)
    if (existing !== undefined) {
        return existing
    }
    const root = resolveMapRoot()
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
            object.type !== 'water' &&
            object.type !== 'bell' &&
            object.type !== 'quest_board'
        ) {
            return []
        }
        const id = propertyValue(object, 'interactionId')
        const text = propertyValue(object, 'text')
        if (
            typeof id !== 'string' ||
            typeof text !== 'string' ||
            !validBounds(object)
        ) {
            throw new Error(`Invalid world interaction in ${locationId}`)
        }
        const interactionAreas = readInteractionAreas(
            propertyValue(object, 'interactionAreas'),
            object,
            object.type
        )
        const name = object.name ?? ''
        const presentation = worldObjectPresentation(
            object,
            locationId,
            name,
            text
        )
        return [
            {
                id,
                text,
                locationId,
                kind: object.type,
                name,
                ...presentation,
                ...(interactionAreas === undefined ? {} : { interactionAreas }),
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

const objectNames: Readonly<Partial<Record<string, AuthoredTextKey>>> = {
    Колодец: 'world.well',
    'Чистая вода': 'world.water',
    'Поилка с водой': 'world.trough',
    'Вода у берега': 'world.pond',
    'Колокол памяти': 'world.bell',
}

function worldObjectPresentation(
    object: MapObject,
    locationId: string,
    name: string,
    text: string
) {
    if (object.type === 'quest_board') {
        return { nameMessage: authoredMessage('world.questBoard') }
    }
    if (object.type !== 'sign') {
        const key = Object.hasOwn(objectNames, name)
            ? objectNames[name]
            : undefined
        return key === undefined ? {} : { nameMessage: authoredMessage(key) }
    }
    const nameKey = propertyValue(object, 'nameMessageKey')
    const textKey = propertyValue(object, 'textMessageKey')
    if (
        typeof nameKey === 'string' &&
        worldSignMessages[nameKey]?.[0] === name &&
        typeof textKey === 'string' &&
        worldSignMessages[textKey]?.[0] === text
    ) {
        return { nameMessage: { key: nameKey }, textMessage: { key: textKey } }
    }
    return worldSignPresentation(locationId, name, text)
}

export function readWorldContainers(
    map: ObjectMap,
    locationId: string
): AuthoredContainerDefinition[] {
    return readWorldObjects(map, locationId)
        .filter((object) => object.kind === 'barrel')
        .map((object) => {
            const source = map.layers
                .find((layer) => layer.name === 'World interactions')
                ?.objects?.find(
                    (entry) =>
                        propertyValue(entry, 'interactionId') === object.id
                )
            if (source === undefined) {
                throw new Error(`Missing container ${object.id}`)
            }
            return readAuthoredContainer(source, object, map)
        })
}

function propertyValue(object: MapObject, name: string): unknown {
    return object.properties?.find((property) => property.name === name)?.value
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
