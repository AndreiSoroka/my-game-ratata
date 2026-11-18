import {
    CENTER_LOCATION_ID,
    readTrainingMapData,
    type TrainingMapData,
} from '@my-game-ratata/contracts'

import { type MapBuilding, readMapBuildings } from './mapBuildings'
import { type MapDepthProp, readDepthProps } from './mapDepthProps'
import type { TiledLandmark } from './mapLandmarks'
import { type FootstepMap, readFootstepMap } from './mapSurfaces'
import { type MapVisibility, readMapVisibility } from './mapVisibility'
import { drawConnectedTerrain } from './terrainAutotile'

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

interface TiledTilesetRef {
    firstgid: number
    source: string
}

interface TiledMap {
    height: number
    layers: TiledLayer[]
    tileheight: number
    tilesets: TiledTilesetRef[]
    tilewidth: number
    width: number
}

interface TiledTileset {
    columns: number
    image: string
    tileheight: number
    tilewidth: number
}

interface LoadedTileset {
    firstgid: number
    image: HTMLImageElement
    tileset: TiledTileset
}

export interface RenderedTiledMap {
    training: TrainingMapData
    bitmap: HTMLCanvasElement
    buildings: MapBuilding[]
    depthProps: MapDepthProp[]
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
    const buildings = map.layers.some((layer) => layer.name === 'Building covers')
        ? readMapBuildings(
              map.layers.find((layer) => layer.name === 'Buildings')?.objects ?? [],
              renderMap(map, tilesets, true)
          )
        : []

    return {
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
        footsteps: readFootstepMap(map),
        visibility: readMapVisibility(map),
        height: map.height,
        tileHeight: map.tileheight,
        tileWidth: map.tilewidth,
        width: map.width,
        worldHeight: map.height * map.tileheight,
        worldWidth: map.width * map.tilewidth,
    }
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

async function loadTileset(baseUrl: string, reference: TiledTilesetRef): Promise<LoadedTileset> {
    const sourceUrl = new URL(`${baseUrl}${reference.source}`, window.location.origin)
    const tileset = await fetchJson<TiledTileset>(sourceUrl)
    const imageUrl = new URL(tileset.image, sourceUrl)
    const image = await loadImage(imageUrl.toString())

    return {
        firstgid: reference.firstgid,
        image,
        tileset,
    }
}

async function fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url)

    if (!response.ok) {
        throw new Error(`Failed to load ${url.pathname}`)
    }

    return (await response.json()) as T
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.addEventListener('load', () => {
            resolve(image)
        })
        image.addEventListener('error', () => {
            reject(new Error(`Failed to load ${src}`))
        })
        image.src = src
    })
}

function renderMap(
    map: TiledMap,
    tilesets: LoadedTileset[],
    onlyCovers = false
): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = map.width * map.tilewidth
    canvas.height = map.height * map.tileheight
    const context = canvas.getContext('2d')

    if (context === null) {
        throw new Error('Canvas 2D is not available')
    }

    context.imageSmoothingEnabled = false

    for (const layer of map.layers) {
        if ((layer.name === 'Building covers') !== onlyCovers) continue
        renderLayer(context, map, layer, tilesets)
    }

    return canvas
}

function renderLayer(
    context: CanvasRenderingContext2D,
    map: TiledMap,
    layer: TiledLayer,
    tilesets: LoadedTileset[]
): void {
    if (layer.type !== 'tilelayer' || layer.data === undefined || !layer.visible) {
        return
    }

    context.globalAlpha = layer.opacity ?? 1

    for (let index = 0; index < layer.data.length; index += 1) {
        const gid = layer.data[index] ?? 0

        if (gid !== 0) {
            drawTile(
                context,
                map,
                gid,
                index,
                tilesets,
                layer.name === 'Paths and ponds' ? layer.data : undefined
            )
        }
    }

    context.globalAlpha = 1
}

function drawTile(
    context: CanvasRenderingContext2D,
    map: TiledMap,
    gid: number,
    index: number,
    tilesets: LoadedTileset[],
    terrain?: number[]
): void {
    const loaded = findTileset(gid, tilesets)

    if (loaded === undefined) {
        return
    }

    if (
        terrain &&
        drawConnectedTerrain(
            context,
            loaded.image,
            terrain,
            map.width,
            map.height,
            index,
            map.tilewidth,
            map.tileheight
        )
    )
        return

    const tileId = gid - loaded.firstgid
    const sourceX = (tileId % loaded.tileset.columns) * loaded.tileset.tilewidth
    const sourceY = Math.floor(tileId / loaded.tileset.columns) * loaded.tileset.tileheight
    const destX = (index % map.width) * map.tilewidth
    const destY = Math.floor(index / map.width) * map.tileheight

    context.drawImage(
        loaded.image,
        sourceX,
        sourceY,
        loaded.tileset.tilewidth,
        loaded.tileset.tileheight,
        destX,
        destY,
        map.tilewidth,
        map.tileheight
    )
}

function renderDepthProp(
    canvas: HTMLCanvasElement,
    tiles: number[],
    columns: number,
    map: TiledMap,
    tilesets: LoadedTileset[]
): void {
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    const propMap = { ...map, width: columns }
    tiles.forEach((gid, index) => {
        if (gid !== 0) drawTile(context, propMap, gid, index, tilesets)
    })
}

function findTileset(gid: number, tilesets: LoadedTileset[]): LoadedTileset | undefined {
    return [...tilesets].reverse().find((tileset) => gid >= tileset.firstgid)
}
