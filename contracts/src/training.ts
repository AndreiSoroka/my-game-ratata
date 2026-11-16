import type { WorldObjectBounds } from './environment'
import type { Vector2 } from './index'

export interface TrainingAreaDefinition {
    id: string
    locationId: string
    /** Walkable interior, excluding the fence tiles. */
    bounds: WorldObjectBounds
}

export interface TrainingTargetDefinition {
    id: string
    areaId: string
    locationId: string
    position: Vector2
    visualId: 'training_dummy'
}

export interface TrainingMapData {
    areas: TrainingAreaDefinition[]
    targets: TrainingTargetDefinition[]
}

interface TrainingMapObject {
    x: number
    y: number
    width?: number
    height?: number
    type?: string
    properties?: Array<{ name: string; value: unknown }>
}

interface TrainingMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: Array<{ name: string; objects?: TrainingMapObject[] }>
}

/** Authored semantics shared by navigation and presentation, independent of tiles. */
export function readTrainingMapData(
    map: TrainingMap,
    locationId: string
): TrainingMapData {
    const objects =
        map.layers.find((layer) => layer.name === 'Training grounds')
            ?.objects ?? []
    const ids = new Set<string>()
    const areas: TrainingAreaDefinition[] = []
    const targets: TrainingTargetDefinition[] = []
    for (const object of objects) {
        if (object.type !== 'training_area') {
            continue
        }
        const id = readId(object, 'areaId', ids)
        const bounds = readAreaBounds(object, map, locationId)
        if (areas.some((area) => overlaps(area.bounds, bounds))) {
            throw new Error(`Overlapping training areas in ${locationId}`)
        }
        areas.push({ id, locationId, bounds })
    }
    for (const object of objects) {
        if (object.type === 'training_area') {
            continue
        }
        targets.push(readTarget(object, map, locationId, areas, ids))
    }
    return { areas, targets }
}

export function trainingAreaAt(
    areas: readonly TrainingAreaDefinition[],
    locationId: string,
    position: Vector2
): TrainingAreaDefinition | undefined {
    return areas.find(
        (area) =>
            area.locationId === locationId && contains(area.bounds, position)
    )
}

function property(object: TrainingMapObject, name: string): unknown {
    return object.properties?.find((entry) => entry.name === name)?.value
}

function readAreaBounds(
    object: TrainingMapObject,
    map: TrainingMap,
    locationId: string
): WorldObjectBounds {
    const { x, y, width, height } = object
    if (
        !validPoint(object, map) ||
        width === undefined ||
        height === undefined ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        x + width > map.width * map.tilewidth ||
        y + height > map.height * map.tileheight
    ) {
        throw new Error(`Invalid training area in ${locationId}`)
    }
    return { x, y, width, height }
}

function readId(
    object: TrainingMapObject,
    name: string,
    ids: Set<string>
): string {
    const id = property(object, name)
    if (typeof id !== 'string' || id.trim().length === 0 || ids.has(id)) {
        throw new Error('Invalid or repeated training ID')
    }
    ids.add(id)
    return id
}

function validPoint(point: Vector2, map: TrainingMap): boolean {
    return (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.width * map.tilewidth &&
        point.y < map.height * map.tileheight
    )
}

function contains(bounds: WorldObjectBounds, point: Vector2): boolean {
    return (
        point.x >= bounds.x &&
        point.y >= bounds.y &&
        point.x < bounds.x + bounds.width &&
        point.y < bounds.y + bounds.height
    )
}

function overlaps(a: WorldObjectBounds, b: WorldObjectBounds): boolean {
    return (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
    )
}

function readTarget(
    object: TrainingMapObject,
    map: TrainingMap,
    locationId: string,
    areas: readonly TrainingAreaDefinition[],
    ids: Set<string>
): TrainingTargetDefinition {
    const id = readId(object, 'targetId', ids)
    const areaId = property(object, 'areaId')
    const area = areas.find((candidate) => candidate.id === areaId)
    if (
        object.type !== 'training_dummy' ||
        !validPoint(object, map) ||
        property(object, 'visualId') !== 'training_dummy' ||
        area === undefined ||
        !contains(area.bounds, object)
    ) {
        throw new Error(`Invalid training target in ${locationId}`)
    }
    return {
        id,
        areaId: area.id,
        locationId,
        position: { x: object.x, y: object.y },
        visualId: 'training_dummy',
    }
}
