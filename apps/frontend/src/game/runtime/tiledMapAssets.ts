export interface TiledTilesetRef {
    firstgid: number
    source: string
}

interface TiledTileset {
    columns: number
    image: string
    name?: string
    tilecount?: number
    tileheight: number
    tilewidth: number
}

export interface LoadedTileset {
    firstgid: number
    image: HTMLImageElement
    tileset: TiledTileset
}

export function findTileset(
    gid: number,
    tilesets: readonly LoadedTileset[]
): LoadedTileset | undefined {
    for (let index = tilesets.length - 1; index >= 0; index--) {
        const tileset = tilesets[index]!
        if (gid >= tileset.firstgid) return tileset
    }
    return undefined
}

export async function loadTileset(
    baseUrl: string,
    reference: TiledTilesetRef
): Promise<LoadedTileset> {
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

export async function fetchJson<T>(url: URL): Promise<T> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to load ${url.pathname}`)
    return (await response.json()) as T
}

export function loadImage(src: string): Promise<HTMLImageElement> {
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
