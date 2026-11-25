import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

/** Public map landmarks; these contain no live residents or private stock. */
export interface MapBuildingDefinition {
    id: string
    name: string
    kind?: string
    bounds: WorldObjectBounds
    entry: Vector2
    interior: Vector2
}

interface BuildingObject extends WorldObjectBounds {
    id?: number | string
    name?: string
    type: string
    properties?: Array<{ name: string; value: unknown }>
}
interface BuildingMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: Array<{ name: string; type: string; objects?: BuildingObject[] }>
}

/** Read the same authored entrances and covers used by the map renderer. */
export function readMapBuildings(map: BuildingMap): MapBuildingDefinition[] {
    const objects = map.layers
        .filter((layer) => layer.type === 'objectgroup')
        .flatMap((layer) => layer.objects ?? [])
        .filter((object) => object.type === 'building')
    const seen = new Set<string>()
    return objects.map((object) => {
        const id = String(object.id ?? object.name ?? '')
        const bounds = {
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height,
        }
        const entry = {
            x: numberProperty(object, 'entryX', object.x + object.width / 2),
            y: numberProperty(object, 'entryY', object.y + object.height),
        }
        const interior = {
            x: numberProperty(object, 'interiorX', entry.x),
            y: numberProperty(object, 'interiorY', entry.y),
        }
        const kind = buildingKind(object)
        if (
            id.length === 0 ||
            seen.has(id) ||
            typeof object.name !== 'string' ||
            !validBounds(bounds, map) ||
            !validPoint(entry, map) ||
            !validPoint(interior, map)
        ) {
            throw new Error('Invalid or repeated authored building')
        }
        seen.add(id)
        return {
            id,
            name: object.name,
            ...(kind === undefined ? {} : { kind }),
            bounds,
            entry,
            interior,
        }
    })
}

function buildingKind(object: BuildingObject): string | undefined {
    const kind = object.properties?.find(({ name }) => name === 'kind')?.value
    if (kind !== undefined && typeof kind !== 'string') {
        throw new Error('Invalid building property kind')
    }
    return kind
}

export function containsBuildingPoint(
    bounds: WorldObjectBounds,
    point: Vector2
): boolean {
    return (
        point.x >= bounds.x &&
        point.y >= bounds.y &&
        point.x < bounds.x + bounds.width &&
        point.y < bounds.y + bounds.height
    )
}

/** A roof hides its residents until the observer enters the same building. */
export function visibleBuildingPoint(
    buildings: readonly MapBuildingDefinition[],
    observer: Vector2,
    target: Vector2
): boolean {
    return buildings.every(
        (building) =>
            !containsBuildingPoint(building.bounds, target) ||
            containsBuildingPoint(building.bounds, observer)
    )
}

function numberProperty(
    object: BuildingObject,
    name: string,
    fallback: number
): number {
    const value = object.properties?.find(
        (property) => property.name === name
    )?.value
    if (value === undefined) {
        return fallback
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid building property ${name}`)
    }
    return value
}

function validPoint(point: Vector2, map: BuildingMap): boolean {
    return (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.width * map.tilewidth &&
        point.y < map.height * map.tileheight
    )
}

function validBounds(bounds: WorldObjectBounds, map: BuildingMap): boolean {
    return (
        Object.values(bounds).every(Number.isFinite) &&
        bounds.width > 0 &&
        bounds.height > 0 &&
        validPoint(bounds, map) &&
        bounds.x + bounds.width <= map.width * map.tilewidth &&
        bounds.y + bounds.height <= map.height * map.tileheight
    )
}
