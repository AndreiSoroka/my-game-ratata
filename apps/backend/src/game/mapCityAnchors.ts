import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

import type { NavigationService, TileCoordinate } from './navigation'

interface CityMapObject {
    type?: string
    x: number
    y: number
    width?: number
    height?: number
    properties?: Array<{ name: string; value: unknown }>
}
interface AnchorMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: Array<{
        name: string
        objects?: CityMapObject[]
    }>
}

/** Stable semantic points are authored by the same map that supplies collision. */
export function readCityAnchors(
    map: AnchorMap
): Readonly<Record<string, Vector2>> | undefined {
    const layer = map.layers.find((entry) => entry.name === 'City anchors')
    if (layer === undefined) {
        return undefined
    }
    const anchors: Record<string, Vector2> = {}
    for (const point of layer.objects ?? []) {
        if (point.type === 'city_area') {
            continue
        }
        const id = readAnchorId(point, anchors)
        if (!insideMap(map, point)) {
            throw new Error('Invalid city anchor position')
        }
        anchors[id] = Object.freeze({ x: point.x, y: point.y })
    }
    return Object.freeze(anchors)
}

export function readCityAreas(
    map: AnchorMap
): Readonly<Record<string, WorldObjectBounds>> | undefined {
    const layer = map.layers.find((entry) => entry.name === 'City anchors')
    if (layer === undefined) {
        return undefined
    }
    const areas: Record<string, WorldObjectBounds> = {}
    for (const area of layer.objects ?? []) {
        if (area.type !== 'city_area') {
            continue
        }
        const id = readAnchorId(area, areas)
        areas[id] = Object.freeze(readAreaBounds(map, area))
    }
    return Object.freeze(areas)
}

function readAnchorId(point: CityMapObject, existing: object): string {
    const id = point.properties?.find(
        (entry) => entry.name === 'anchorId'
    )?.value
    if (
        typeof id !== 'string' ||
        !/^[a-z][a-z0-9.-]*$/u.test(id) ||
        Object.hasOwn(existing, id)
    ) {
        throw new Error('Invalid or repeated city anchor ID')
    }
    return id
}

function insideMap(map: AnchorMap, point: Vector2): boolean {
    return (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < map.width * map.tilewidth &&
        point.y < map.height * map.tileheight
    )
}

function readAreaBounds(
    map: AnchorMap,
    area: CityMapObject
): WorldObjectBounds {
    const { x, y, width, height } = area
    if (
        !insideMap(map, area) ||
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        x + width > map.width * map.tilewidth ||
        y + height > map.height * map.tileheight
    ) {
        throw new Error('Invalid city area bounds')
    }
    return { x, y, width, height }
}

export function citySpawnPosition(
    navigation: NavigationService,
    anchorId: string,
    fallback: TileCoordinate,
    offset: Vector2 = { x: 0, y: 0 }
): Vector2 {
    const anchor = navigation.grid.cityAnchors?.[anchorId]
    if (anchor !== undefined) {
        const point = { x: anchor.x + offset.x, y: anchor.y + offset.y }
        if (navigation.isSolidTile(navigation.worldToTile(point))) {
            throw new Error(`City spawn anchor is blocked: ${anchorId}`)
        }
        return point
    }
    if (navigation.grid.cityAnchors !== undefined) {
        throw new Error(`Missing city spawn anchor: ${anchorId}`)
    }
    return walkableSpawn(navigation, navigation.tileToWorld(fallback))
}

/** Legacy/custom fixture maps have no generated city metadata. */
export function walkableSpawn(
    navigation: NavigationService,
    desired: Vector2
): Vector2 {
    const origin = navigation.worldToTile(navigation.clampWorld(desired))
    for (
        let radius = 0;
        radius < Math.max(navigation.grid.width, navigation.grid.height);
        radius++
    ) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tile = { x: origin.x + dx, y: origin.y + dy }
                if (!navigation.isSolidTile(tile)) {
                    return navigation.tileToWorld(tile)
                }
            }
        }
    }
    throw new Error('Map has no walkable spawn')
}
