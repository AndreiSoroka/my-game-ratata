import { drawConnectedTerrain } from './terrainAutotile'
import { findTileset, type LoadedTileset } from './tiledMapAssets'

interface MapTileLayer {
    data?: number[]
    name: string
    opacity?: number
    type: string
    visible: boolean
}

interface MapTiles {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: readonly MapTileLayer[]
}

export function renderMap(
    map: MapTiles,
    tilesets: LoadedTileset[],
    onlyCovers = false
): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = map.width * map.tilewidth
    canvas.height = map.height * map.tileheight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is not available')
    context.imageSmoothingEnabled = false
    for (const layer of map.layers) {
        if ((layer.name === 'Building covers') !== onlyCovers || !isVisibleTileLayer(layer))
            continue
        const area = layer.name === 'Paths and ponds' ? layer.data : undefined
        context.globalAlpha = layer.opacity ?? 1
        layer.data.forEach((gid, index) => drawTile(context, map, gid, index, tilesets, area))
    }
    context.globalAlpha = 1
    return canvas
}

/** Clear the baked wall pixels and draw all visible layers again at the affected coordinates. */
export function redrawDungeonTiles(
    canvas: HTMLCanvasElement,
    map: MapTiles,
    tilesets: LoadedTileset[],
    indices: ReadonlySet<number>
): void {
    const context = canvas.getContext('2d')
    if (!context) return
    for (const index of indices) {
        const { x, y } = tilePosition(map, index)
        context.clearRect(x, y, map.tilewidth, map.tileheight)
    }
    for (const layer of map.layers) {
        if (layer.name === 'Building covers' || !isVisibleTileLayer(layer)) continue
        context.globalAlpha = layer.opacity ?? 1
        for (const index of indices) drawTile(context, map, layer.data[index] ?? 0, index, tilesets)
    }
    context.globalAlpha = 1
}

function isVisibleTileLayer(layer: MapTileLayer): layer is MapTileLayer & { data: number[] } {
    return layer.type === 'tilelayer' && layer.data !== undefined && layer.visible
}

function tilePosition(map: MapTiles, index: number) {
    return {
        x: (index % map.width) * map.tilewidth,
        y: Math.floor(index / map.width) * map.tileheight,
    }
}

function drawTile(
    context: CanvasRenderingContext2D,
    map: MapTiles,
    gid: number,
    index: number,
    tilesets: LoadedTileset[],
    terrain?: number[]
): void {
    const loaded = gid === 0 ? undefined : findTileset(gid, tilesets)
    if (!loaded) return
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
    const { x, y } = tilePosition(map, index)
    context.drawImage(
        loaded.image,
        sourceX,
        sourceY,
        loaded.tileset.tilewidth,
        loaded.tileset.tileheight,
        x,
        y,
        map.tilewidth,
        map.tileheight
    )
}

export function renderDepthProp(
    canvas: HTMLCanvasElement,
    tiles: number[],
    columns: number,
    map: MapTiles,
    tilesets: LoadedTileset[]
): void {
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    const propMap = { ...map, width: columns }
    tiles.forEach((gid, index) => drawTile(context, propMap, gid, index, tilesets))
}
