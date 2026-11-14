import type { GraveSourceDefinition, Vector2 } from '@my-game-ratata/contracts'

export interface AuthoredEncounters {
    graves: GraveSourceDefinition[]
    slimeHabitats: Vector2[]
}
export interface EncounterMapObject {
    x: number
    y: number
    width: number
    height: number
    type: string
    properties?: Array<{ name: string; value: unknown }>
}
interface EncounterMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: Array<{ name: string; objects?: EncounterMapObject[] }>
}

/** Parse authored semantics only: atlas tiles never decide spawning at runtime. */
export function readEncounterData(
    map: EncounterMap,
    locationId: string
): AuthoredEncounters | undefined {
    const graveLayer = map.layers.find(
        (layer) => layer.name === 'Grave sources'
    )
    const habitatLayer = map.layers.find(
        (layer) => layer.name === 'Slime habitats'
    )
    if (graveLayer === undefined && habitatLayer === undefined) {
        return undefined
    }
    const ids = new Set<string>()
    const props =
        map.layers.find((layer) => layer.name === 'Depth props')?.objects ?? []
    const graves = (graveLayer?.objects ?? []).map((object) => {
        const id = sourceId(object, 'sourceId', ids)
        const prop = props.find(
            (candidate) =>
                property(candidate, 'propId') === property(object, 'propId')
        )
        if (
            object.type !== 'grave_source' ||
            !validPoint(object, map) ||
            prop === undefined ||
            !contains(prop, object)
        ) {
            throw new Error(`Invalid grave source in ${locationId}`)
        }
        return { id, locationId, position: { x: object.x, y: object.y } }
    })
    const slimeHabitats = (habitatLayer?.objects ?? []).map((object) => {
        sourceId(object, 'habitatId', ids)
        if (object.type !== 'slime_shore' || !validPoint(object, map)) {
            throw new Error(`Invalid slime habitat in ${locationId}`)
        }
        return { x: object.x, y: object.y }
    })
    return { graves, slimeHabitats }
}

function sourceId(
    object: EncounterMapObject,
    name: string,
    ids: Set<string>
): string {
    const id = property(object, name)
    if (typeof id !== 'string' || id.length === 0 || ids.has(id)) {
        throw new Error('Invalid or repeated encounter source ID')
    }
    ids.add(id)
    return id
}
function property(object: EncounterMapObject, name: string): unknown {
    return object.properties?.find((entry) => entry.name === name)?.value
}
function validPoint(point: Vector2, map: EncounterMap): boolean {
    return (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.width * map.tilewidth &&
        point.y < map.height * map.tileheight
    )
}
function contains(bounds: EncounterMapObject, point: Vector2): boolean {
    return (
        point.x >= bounds.x &&
        point.y >= bounds.y &&
        point.x < bounds.x + bounds.width &&
        point.y < bounds.y + bounds.height
    )
}
