import type { Vector2 } from '@my-game-ratata/contracts'

export type FootstepSurface = 'grass' | 'stone' | 'dirt' | 'wood'
export interface FootstepMap {
    width: number
    height: number
    tileWidth: number
    tileHeight: number
    surfaces: FootstepSurface[]
}
interface SurfaceMapSource {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: {
        name: string
        data?: number[]
        properties?: { name: string; value: unknown }[]
    }[]
}
export function readFootstepMap(map: SurfaceMapSource): FootstepMap {
    const layer = map.layers.find((candidate) => candidate.name === 'Footstep surfaces')
    const legend = readFootstepLegend(layer?.properties)
    return {
        width: map.width,
        height: map.height,
        tileWidth: map.tilewidth,
        tileHeight: map.tileheight,
        surfaces: Array.from(
            { length: map.width * map.height },
            (_, index) => legend.get(layer?.data?.[index] ?? 0) ?? 'grass'
        ),
    }
}
export function readFootstepLegend(
    properties: readonly { name: string; value: unknown }[] = []
): Map<number, FootstepSurface> {
    const legend = new Map<number, FootstepSurface>()
    for (const property of properties) {
        if (property.name.startsWith('surface.') && isSurface(property.value)) {
            legend.set(Number(property.name.slice(8)), property.value)
        }
    }
    return legend
}
export function surfaceAt(map: FootstepMap, point: Vector2): FootstepSurface {
    const x = Math.floor(point.x / map.tileWidth)
    const y = Math.floor(point.y / map.tileHeight)
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 'grass'
    return map.surfaces[y * map.width + x] ?? 'grass'
}
function isSurface(value: unknown): value is FootstepSurface {
    return value === 'grass' || value === 'stone' || value === 'dirt' || value === 'wood'
}
