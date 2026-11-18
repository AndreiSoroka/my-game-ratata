import {
    getWorldLocationDefinition,
    type Vector2,
    WORLD_DIRECTIONS,
    type WorldDirection,
    worldLocationNeighbor,
} from '@my-game-ratata/contracts'

export interface MapLandmarkDefinition {
    id: string
    name: string
    kind: string
    position: Vector2
    direction?: WorldDirection
    destinationLocationId?: string
}
interface LandmarkMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: Array<{
        type: string
        objects?: Array<{
            id?: string | number
            type: string
            name?: string
            x: number
            y: number
            properties?: Array<{ name: string; value: unknown }>
        }>
    }>
}

export function readMapLandmarks(
    map: LandmarkMap,
    locationId: string
): MapLandmarkDefinition[] {
    const seen = new Set<string>()
    return map.layers
        .filter((layer) => layer.type === 'objectgroup')
        .flatMap((layer) => layer.objects ?? [])
        .filter((object) => object.type === 'landmark')
        .map((object) => {
            const id = String(object.id ?? '')
            const properties = new Map(
                (object.properties ?? []).map((property) => [
                    property.name,
                    property.value,
                ])
            )
            const kind = properties.get('kind')
            const name = object.name ?? ''
            if (
                id.length === 0 ||
                seen.has(id) ||
                name.length === 0 ||
                typeof kind !== 'string' ||
                invalidPosition(object, map)
            ) {
                throw new Error('Invalid or duplicate authored landmark')
            }
            seen.add(id)
            const landmark: MapLandmarkDefinition = {
                id,
                name,
                kind,
                position: { x: object.x, y: object.y },
            }
            if (kind === 'gate') {
                readGate(landmark, properties, locationId)
            }
            return landmark
        })
}

function invalidPosition(point: Vector2, map: LandmarkMap): boolean {
    return (
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x >= map.width * map.tilewidth ||
        point.y >= map.height * map.tileheight
    )
}

function readGate(
    landmark: MapLandmarkDefinition,
    properties: ReadonlyMap<string, unknown>,
    locationId: string
): void {
    const direction = properties.get('direction')
    const destination = properties.get('destinationLocationId')
    if (
        typeof direction !== 'string' ||
        !Object.hasOwn(WORLD_DIRECTIONS, direction) ||
        typeof destination !== 'string' ||
        getWorldLocationDefinition(destination) === undefined ||
        worldLocationNeighbor(locationId, direction as WorldDirection)?.id !==
            destination
    ) {
        throw new Error('Invalid authored gate destination')
    }
    landmark.direction = direction as WorldDirection
    landmark.destinationLocationId = destination
}
