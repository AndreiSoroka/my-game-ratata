import {
    CENTER_LOCATION_ID,
    type DungeonRevealSnapshot,
    readTrainingMapData,
    type TrainingMapData,
} from '@my-game-ratata/contracts'

import { type AmbientTerrain, readAmbientTerrain } from './mapAmbientTerrain'
import { type MapBuilding, readMapBuildings } from './mapBuildings'
import { type MapDepthProp, readDepthProps } from './mapDepthProps'
import { type DungeonLight, readDungeonLights } from './mapDungeonLights'
import { createDungeonRevealUpdater } from './mapDungeonReveals'
import type { TiledLandmark } from './mapLandmarks'
import { type FootstepMap, readFootstepLegend, readFootstepMap } from './mapSurfaces'
import { type MapVisibility, readMapVisibility } from './mapVisibility'
import { type AnimatedWater, readWaterAnimation } from './mapWaterAnimation'
import {
    fetchJson,
    findTileset,
    type LoadedTileset,
    loadTileset,
    type TiledTilesetRef,
} from './tiledMapAssets'
import { redrawDungeonTiles, renderDepthProp, renderMap } from './tiledMapRendering'

interface TiledLayer {
    data?: number[]
    height: number
    name: string
    opacity?: number
    properties?: { name: string; value: unknown }[]
    objects?: TiledLandmark[]
    type: string
    visible: boolean
    width: number
}

interface TiledMap {
    height: number
    layers: TiledLayer[]
    properties?: { name: string; value: unknown }[]
    tileheight: number
    tilesets: TiledTilesetRef[]
    tilewidth: number
    width: number
}

export interface RenderedTiledMap {
    ambientTerrain?: AmbientTerrain
    animatedWater?: AnimatedWater
    training: TrainingMapData
    bitmap: HTMLCanvasElement
    buildings: MapBuilding[]
    depthProps: MapDepthProp[]
    dungeonLights?: DungeonLight[]
    applyDungeonReveals?: (reveals: readonly DungeonRevealSnapshot[]) => boolean
    harvestGraphics: HarvestGraphics
    footsteps: FootstepMap
    visibility: MapVisibility
    height: number
    tileHeight: number
    tileWidth: number
    width: number
    worldHeight: number
    worldWidth: number
}

export interface HarvestGraphics {
    branches?: HTMLCanvasElement
    forest: HTMLCanvasElement
    apple?: HTMLCanvasElement
    pine?: HTMLCanvasElement
    stump: HTMLCanvasElement
    sapling: HTMLCanvasElement
    grave: HTMLCanvasElement
}

export async function loadRenderedTiledMap(
    baseUrl = '/game/map',
    mapName = `${CENTER_LOCATION_ID}.json`,
    assetUrl?: string
): Promise<RenderedTiledMap> {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const mapUrl = new URL(assetUrl ?? `${normalizedBase}${mapName}`, window.location.origin)
    const map = await fetchJson<TiledMap>(mapUrl)
    const tilesets = await Promise.all(
        map.tilesets.map((tileset) => loadTileset(normalizedBase, tileset))
    )
    const bitmap = renderMap(map, tilesets)
    const waterTileset = tilesets.find(({ tileset }) => tileset.name === 'water')
    const buildings = map.layers.some((layer) => layer.name === 'Building covers')
        ? readMapBuildings(
              map.layers.find((layer) => layer.name === 'Buildings')?.objects ?? [],
              renderMap(map, tilesets, true)
          )
        : []

    return {
        animatedWater: readWaterAnimation(map, tilesets, waterTileset),
        ambientTerrain: readAmbientTerrain(
            map,
            waterTileset && {
                firstgid: waterTileset.firstgid,
                tilecount: waterTileset.tileset.tilecount,
            }
        ),
        training: readTrainingMapData(
            map,
            mapName === 'map1.json' ? CENTER_LOCATION_ID : mapName.replace(/\.json$/, '')
        ),
        bitmap,
        buildings,
        depthProps: readDepthProps(
            map.layers.find((layer) => layer.name === 'Depth props')?.objects ?? [],
            (canvas, tiles, columns) => renderDepthProp(canvas, tiles, columns, map, tilesets)
        ),
        harvestGraphics: readHarvestGraphics(map, tilesets),
        ...readTerrain(map, bitmap, tilesets),
        height: map.height,
        tileHeight: map.tileheight,
        tileWidth: map.tilewidth,
        width: map.width,
        worldHeight: map.height * map.tileheight,
        worldWidth: map.width * map.tilewidth,
    }
}

function readTerrain(map: TiledMap, bitmap: HTMLCanvasElement, tilesets: LoadedTileset[]) {
    const dungeonLights = readDungeonLights(map)
    const footsteps = readFootstepMap(map)
    const visibility = readMapVisibility(map)
    const applyDungeonReveals =
        dungeonLights === undefined
            ? undefined
            : dungeonUpdater(map, bitmap, tilesets, visibility, footsteps)
    return {
        dungeonLights,
        footsteps,
        visibility,
        ...(applyDungeonReveals === undefined ? {} : { applyDungeonReveals }),
    }
}

function dungeonUpdater(
    map: TiledMap,
    bitmap: HTMLCanvasElement,
    tilesets: LoadedTileset[],
    visibility: MapVisibility,
    footsteps: FootstepMap
) {
    const floor = map.layers.find(({ name }) => name === 'Stone floor')?.data
    const walls = map.layers.find(({ name }) => name === 'Dungeon walls')?.data
    if (!floor || !walls) return undefined
    const surfaces = map.layers.find(({ name }) => name === 'Footstep surfaces')?.properties
    return createDungeonRevealUpdater({
        floor,
        walls,
        visibility,
        footsteps,
        surfaceLegend: readFootstepLegend(surfaces),
        hasTile: (gid) => {
            const atlas = findTileset(gid, tilesets)
            return (
                atlas !== undefined && gid - atlas.firstgid < (atlas.tileset.tilecount ?? Infinity)
            )
        },
        redraw: (indices) => redrawDungeonTiles(bitmap, map, tilesets, indices),
    })
}

function readHarvestGraphics(map: TiledMap, tilesets: LoadedTileset[]): HarvestGraphics {
    const objects =
        map.tilesets.find((tileset) => tileset.source === 'tilesets/MysticWoods/objects.json')
            ?.firstgid ?? 198
    const bitmap = (x: number, y: number, columns: number, rows: number) => {
        const canvas = document.createElement('canvas')
        canvas.width = columns * 16
        canvas.height = rows * 16
        const tiles = Array.from(
            { length: columns * rows },
            (_, index) => objects + (y + Math.floor(index / columns)) * 16 + x + (index % columns)
        )
        renderDepthProp(canvas, tiles, columns, map, tilesets)
        return canvas
    }
    return {
        branches: branchesBitmap(),
        forest: bitmap(0, 5, 3, 4),
        apple: bitmap(3, 5, 3, 4),
        pine: pineBitmap(map, tilesets),
        stump: bitmap(10, 5, 2, 2),
        sapling: bitmap(6, 7, 2, 2),
        grave: bitmap(6, 0, 1, 1),
    }
}

function branchesBitmap(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const context = canvas.getContext('2d')
    if (context) {
        context.strokeStyle = '#503b28'
        context.lineWidth = 3
        context.beginPath()
        context.moveTo(2, 12)
        context.lineTo(13, 5)
        context.moveTo(3, 5)
        context.lineTo(12, 12)
        context.stroke()
        context.strokeStyle = '#b08b52'
        context.lineWidth = 1
        context.stroke()
    }
    return canvas
}

function pineBitmap(map: TiledMap, tilesets: LoadedTileset[]): HTMLCanvasElement {
    const town =
        map.tilesets.find((tileset) => tileset.source.includes('TinyTown'))?.firstgid ?? 512
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 32
    renderDepthProp(canvas, [town + 4, town + 16], 1, map, tilesets)
    return canvas
}
