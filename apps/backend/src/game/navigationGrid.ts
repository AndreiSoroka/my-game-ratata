import {
    CENTER_LOCATION_ID,
    readTrainingMapData,
} from '@my-game-ratata/contracts'

import { readDungeonMapData } from './dungeonMapData'
import { type EncounterMapObject, readEncounterData } from './encounterData'
import { readMapBuildings } from './mapBuildings'
import { readCityAnchors, readCityAreas } from './mapCityAnchors'
import { readMapLandmarks } from './mapLandmarks'
import type { MapGrid } from './navigation'
import { readNavigationSurfaces } from './navigationSurfaces'
import { readWorldContainers, readWorldDoors } from './worldObjectData'

interface TiledProperty {
    name: string
    type: string
    value: unknown
}

interface TiledLayer {
    objects?: EncounterMapObject[]
    data?: number[]
    height: number
    name: string
    properties?: TiledProperty[]
    type: string
    width: number
}

export interface TiledMap {
    height: number
    layers: TiledLayer[]
    tileheight: number
    tilewidth: number
    width: number
}

export function buildGrid(mapId: string, map: TiledMap): MapGrid {
    const solid = new Array<boolean>(map.width * map.height).fill(false)
    const solidLayerNames: string[] = []

    for (const layer of map.layers) {
        if (layer.type !== 'tilelayer' || layer.data === undefined) {
            continue
        }

        if (!isSolidLayer(layer)) {
            continue
        }

        solidLayerNames.push(layer.name)
        markSolidTiles(solid, layer.data)
    }

    const resourceCells =
        map.layers.find((layer) => layer.name === 'Resource collision')?.data ??
        []
    const planting = map.layers.find(
        (layer) => layer.name === 'Plantable ground'
    )?.data
    const encounters = readEncounterData(map, mapId)
    return {
        ...cityMetadata(map),
        ...readDungeonMapData(map, mapId),
        buildings: readMapBuildings(map),
        landmarks: readMapLandmarks(
            map,
            mapId === 'map1' ? CENTER_LOCATION_ID : mapId
        ),
        containers: readWorldContainers(map, mapId),
        doors: readWorldDoors(
            map,
            mapId === 'map1' ? CENTER_LOCATION_ID : mapId
        ),
        training: readTrainingMapData(
            map,
            mapId === 'map1' ? CENTER_LOCATION_ID : mapId
        ),
        ...(encounters === undefined ? {} : { encounters }),
        ...readSpeechTransparency(map),
        baseSolid: solid.map(
            (blocked, index) => blocked && (resourceCells[index] ?? 0) === 0
        ),
        plantable: solid.map((_, index) => planting?.[index] === 1),
        surfaces: readNavigationSurfaces(map),
        height: map.height,
        id: mapId,
        solid,
        solidLayerNames,
        tileHeight: map.tileheight,
        tileWidth: map.tilewidth,
        width: map.width,
    }
}

function readSpeechTransparency(
    map: TiledMap
): Pick<MapGrid, 'speechTransparent'> {
    const cells = new Set<number>()
    const props = map.layers.find(
        (layer) => layer.type === 'objectgroup' && layer.name === 'Depth props'
    )?.objects
    const independentSolids = map.layers.filter(
        (layer) =>
            layer.type === 'tilelayer' &&
            layer.name !== 'Collision' &&
            isSolidLayer(layer)
    )
    for (const prop of props ?? []) {
        if (
            prop.type !== 'depth_prop' ||
            prop.properties?.some(
                ({ name, value }) =>
                    name === 'speechTransparent' && value === true
            ) !== true
        ) {
            continue
        }
        const { left, top, right, bottom } = speechFootprint(prop, map)
        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const index = y * map.width + x
                if (
                    independentSolids.every(
                        (layer) => (layer.data?.[index] ?? 0) === 0
                    )
                ) {
                    cells.add(index)
                }
            }
        }
    }
    return cells.size === 0 ? {} : { speechTransparent: cells }
}

function speechFootprint(prop: EncounterMapObject, map: TiledMap) {
    const left = prop.x / map.tilewidth
    const top = prop.y / map.tileheight
    const right = (prop.x + prop.width) / map.tilewidth
    const bottom = (prop.y + prop.height) / map.tileheight
    if (
        ![left, top, right, bottom].every(Number.isInteger) ||
        left < 0 ||
        top < 0 ||
        right > map.width ||
        bottom > map.height ||
        right <= left ||
        bottom <= top
    ) {
        throw new Error('Invalid speech-transparent furniture footprint')
    }
    return { left, top, right, bottom }
}

function cityMetadata(
    map: TiledMap
): Pick<MapGrid, 'cityAnchors' | 'cityAreas'> {
    const cityAnchors = readCityAnchors(map)
    const cityAreas = readCityAreas(map)
    return {
        ...(cityAnchors === undefined ? {} : { cityAnchors }),
        ...(cityAreas === undefined ? {} : { cityAreas }),
    }
}

function isSolidLayer(layer: TiledLayer): boolean {
    const solidProperty = layer.properties?.find(
        (property) => property.name === 'solid'
    )

    return layer.name === 'Fence' || solidProperty?.value === true
}

function markSolidTiles(solid: boolean[], tileIds: number[]): void {
    for (let index = 0; index < tileIds.length; index += 1) {
        if (tileIds[index] !== 0) {
            solid[index] = true
        }
    }
}
