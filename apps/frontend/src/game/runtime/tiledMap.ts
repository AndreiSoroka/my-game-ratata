interface TiledLayer {
    data?: number[]
    height: number
    name: string
    opacity?: number
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
    bitmap: HTMLCanvasElement
    height: number
    tileHeight: number
    tileWidth: number
    width: number
    worldHeight: number
    worldWidth: number
}

export async function loadRenderedTiledMap(
    baseUrl = '/game/map',
    mapName = 'map1.json'
): Promise<RenderedTiledMap> {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
    const mapUrl = new URL(`${normalizedBase}${mapName}`, window.location.origin)
    const map = await fetchJson<TiledMap>(mapUrl)
    const tilesets = await Promise.all(
        map.tilesets.map((tileset) => loadTileset(normalizedBase, tileset))
    )
    const bitmap = renderMap(map, tilesets)

    return {
        bitmap,
        height: map.height,
        tileHeight: map.tileheight,
        tileWidth: map.tilewidth,
        width: map.width,
        worldHeight: map.height * map.tileheight,
        worldWidth: map.width * map.tilewidth,
    }
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

function renderMap(map: TiledMap, tilesets: LoadedTileset[]): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = map.width * map.tilewidth
    canvas.height = map.height * map.tileheight
    const context = canvas.getContext('2d')

    if (context === null) {
        throw new Error('Canvas 2D is not available')
    }

    context.imageSmoothingEnabled = false

    for (const layer of map.layers) {
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
            drawTile(context, map, gid, index, tilesets)
        }
    }

    context.globalAlpha = 1
}

function drawTile(
    context: CanvasRenderingContext2D,
    map: TiledMap,
    gid: number,
    index: number,
    tilesets: LoadedTileset[]
): void {
    const loaded = findTileset(gid, tilesets)

    if (loaded === undefined) {
        return
    }

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

function findTileset(gid: number, tilesets: LoadedTileset[]): LoadedTileset | undefined {
    return [...tilesets].reverse().find((tileset) => gid >= tileset.firstgid)
}
