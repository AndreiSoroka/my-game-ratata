import {
    interiorTerrainTile,
    terrainAtlasStart,
    type TerrainQuarter,
    terrainQuarters,
} from './terrainAutotile'
import { findTileset, type LoadedTileset } from './tiledMapAssets'

export { terrainQuarterSize as waterQuarterSize } from './terrainAutotile'

export const waterAtlasWidth = 96
export const waterAtlasHeight = 64

export type WaterQuarter = TerrainQuarter

export interface AnimatedWater {
    baseAtlas: HTMLImageElement
    frameUrls: readonly string[]
    quarters: readonly WaterQuarter[]
}

interface WaterAnimationLayer {
    name: string
    type: string
    visible: boolean
    opacity?: number
    data?: readonly number[]
}

interface WaterAnimationMap {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: readonly WaterAnimationLayer[]
}

/** The first frame is already part of the map bitmap. */
export function readWaterAnimation(
    map: WaterAnimationMap,
    tilesets: readonly LoadedTileset[],
    water: LoadedTileset | undefined
): AnimatedWater | undefined {
    if (!water) return undefined
    const atlas = waterAtlasUrl(water)
    if (!atlas) return undefined
    const terrainIndex = map.layers.findIndex(isOpaqueTerrain)
    const cells = map.layers[terrainIndex]?.data
    if (!cells) return undefined
    const overlays = map.layers.slice(terrainIndex + 1).filter(isStaticOverlay)
    const quarters = shoreQuarters(map, cells, overlays, tilesets, water)
    if (quarters.length === 0) return undefined
    return {
        baseAtlas: water.image,
        frameUrls: [2, 3, 4, 5, 6].map((frame) => new URL(`water${frame}.png`, atlas).href),
        quarters,
    }
}

function waterAtlasUrl({ firstgid, image, tileset }: LoadedTileset): URL | undefined {
    if (
        terrainAtlasStart(firstgid) !== firstgid ||
        tileset.name !== 'water' ||
        tileset.columns !== 6 ||
        tileset.tilecount !== 24 ||
        tileset.tilewidth !== 16 ||
        tileset.tileheight !== 16 ||
        image.naturalWidth !== waterAtlasWidth ||
        image.naturalHeight !== waterAtlasHeight
    )
        return undefined

    const url = new URL(image.src)
    return url.pathname.endsWith('/assets/MysticWoods/tilesets/water1.png') ? url : undefined
}

function isOpaqueTerrain(layer: WaterAnimationLayer): boolean {
    return (
        layer.name === 'Paths and ponds' &&
        layer.type === 'tilelayer' &&
        layer.visible &&
        (layer.opacity ?? 1) === 1
    )
}

function isStaticOverlay(layer: WaterAnimationLayer): boolean {
    // Roof covers are rendered independently above the map actor.
    return (
        layer.name !== 'Building covers' &&
        layer.type === 'tilelayer' &&
        layer.visible &&
        (layer.opacity ?? 1) > 0
    )
}

function shoreQuarters(
    { width, height, tilewidth, tileheight }: WaterAnimationMap,
    cells: readonly number[],
    overlays: readonly WaterAnimationLayer[],
    tilesets: readonly LoadedTileset[],
    water: LoadedTileset
): WaterQuarter[] {
    const quarters: WaterQuarter[] = []
    const count = Math.min(cells.length, width * height)
    for (let index = 0; index < count; index++) {
        const gid = cells[index] ?? 0
        if (
            terrainAtlasStart(gid) !== water.firstgid ||
            findTileset(gid, tilesets) !== water ||
            overlays.some((layer) => (layer.data?.[index] ?? 0) !== 0)
        )
            continue

        for (const { tile, ...quarter } of terrainQuarters(
            cells,
            width,
            height,
            index,
            tilewidth,
            tileheight
        ) ?? []) {
            if (tile !== interiorTerrainTile) quarters.push(quarter)
        }
    }
    return quarters
}
