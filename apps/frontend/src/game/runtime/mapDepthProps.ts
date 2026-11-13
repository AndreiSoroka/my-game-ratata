import type { TiledLandmark } from './mapLandmarks'

export interface MapDepthProp {
    id: string
    x: number
    y: number
    width: number
    height: number
    baseY: number
    bitmap: HTMLCanvasElement
}

export function readDepthProps(
    objects: TiledLandmark[],
    draw: (canvas: HTMLCanvasElement, tiles: number[], columns: number) => void
): MapDepthProp[] {
    return objects.flatMap((object) => {
        const data = depthPropData(object)
        if (data === undefined) return []
        const bitmap = document.createElement('canvas')
        bitmap.width = data.width
        bitmap.height = data.height
        draw(bitmap, data.tiles, data.columns)
        return [{ id: String(object.id), x: object.x, y: object.y, ...data, bitmap }]
    })
}

export function depthPropData(object: TiledLandmark):
    | {
          width: number
          height: number
          baseY: number
          tiles: number[]
          columns: number
      }
    | undefined {
    if (object.type !== 'depth_prop' || !object.width || !object.height) return undefined
    const property = (name: string) => object.properties?.find((item) => item.name === name)?.value
    const baseY = property('baseY')
    const columns = property('columns')
    const rawTiles = property('tiles')
    if (!finiteNumber(baseY) || !positiveInteger(columns) || typeof rawTiles !== 'string')
        return undefined
    try {
        const tiles: unknown = JSON.parse(rawTiles)
        if (
            !Array.isArray(tiles) ||
            tiles.length > 4096 ||
            !tiles.every((tile) => Number.isInteger(tile) && tile >= 0)
        )
            return undefined
        return {
            width: object.width,
            height: object.height,
            baseY,
            columns,
            tiles: tiles as number[],
        }
    } catch {
        return undefined
    }
}

function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}
function positiveInteger(value: unknown): value is number {
    return finiteNumber(value) && Number.isInteger(value) && value > 0
}
