import type { GraveSourceDefinition, Vector2 } from '@my-game-ratata/contracts'

export interface AuthoredEncounters {
    graves: GraveSourceDefinition[]
    slimeHabitats: Vector2[]
    ashRefuge?: { home: Vector2; chestId: string; chest: Vector2 }
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
    const refugeLayer = map.layers.find((layer) => layer.name === 'Ash refuge')
    if (
        [graveLayer, habitatLayer, refugeLayer].every(
            (layer) => layer === undefined
        )
    ) {
        return undefined
    }
    const ids = new Set<string>()
    const props =
        map.layers.find((layer) => layer.name === 'Depth props')?.objects ?? []
    const graves = (graveLayer?.objects ?? []).map((object) => {
        const id = sourceId(object, 'sourceId', ids)
        const propId = property(object, 'propId')
        const prop = props.find(
            (candidate) => property(candidate, 'propId') === propId
        )
        if (
            object.type !== 'grave_source' ||
            typeof propId !== 'string' ||
            propId.length === 0 ||
            !validPoint(object, map) ||
            prop === undefined ||
            !contains(prop, object)
        ) {
            throw new Error(`Invalid grave source in ${locationId}`)
        }
        return {
            id,
            locationId,
            propId,
            position: { x: object.x, y: object.y },
        }
    })
    const slimeHabitats = (habitatLayer?.objects ?? []).map((object) => {
        sourceId(object, 'habitatId', ids)
        if (object.type !== 'slime_shore' || !validPoint(object, map)) {
            throw new Error(`Invalid slime habitat in ${locationId}`)
        }
        return { x: object.x, y: object.y }
    })
    const ashRefuge =
        refugeLayer === undefined
            ? undefined
            : readAshRefuge(refugeLayer.objects ?? [], map, locationId)
    return {
        graves,
        slimeHabitats,
        ...(ashRefuge === undefined ? {} : { ashRefuge }),
    }
}

function readAshRefuge(
    objects: EncounterMapObject[],
    map: EncounterMap,
    locationId: string
) {
    const home = objects.filter(({ type }) => type === 'ash_home')
    const chests = objects.filter(({ type }) => type === 'ash_chest')
    const [point] = home
    const [chest] = chests
    const chestId = chest === undefined ? undefined : property(chest, 'chestId')
    if (
        home.length !== 1 ||
        chests.length !== 1 ||
        point === undefined ||
        chest === undefined ||
        typeof chestId !== 'string' ||
        chestId.length === 0 ||
        !validPoint(point, map) ||
        !validPoint(chest, map)
    ) {
        throw new Error(`Invalid Ash refuge in ${locationId}`)
    }
    return {
        home: { x: point.x, y: point.y },
        chestId,
        chest: { x: chest.x, y: chest.y },
    }
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
