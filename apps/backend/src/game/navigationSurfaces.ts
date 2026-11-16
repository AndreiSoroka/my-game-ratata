import type { GroundSurface } from '@my-game-ratata/contracts'

interface SurfaceMap {
    width: number
    height: number
    layers: Array<{
        name: string
        data?: number[]
        properties?: Array<{ name: string; value: unknown }>
    }>
}

export function readNavigationSurfaces(map: SurfaceMap): GroundSurface[] {
    const layer = map.layers.find(
        (candidate) => candidate.name === 'Footstep surfaces'
    )
    const legend = new Map<number, GroundSurface>()
    for (const property of layer?.properties ?? []) {
        if (property.name.startsWith('surface.') && isSurface(property.value)) {
            legend.set(Number(property.name.slice(8)), property.value)
        }
    }
    return Array.from(
        { length: map.width * map.height },
        (_, index) => legend.get(layer?.data?.[index] ?? 0) ?? 'grass'
    )
}

function isSurface(value: unknown): value is GroundSurface {
    return (
        value === 'grass' ||
        value === 'stone' ||
        value === 'wood' ||
        value === 'dirt'
    )
}
