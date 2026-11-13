import type { Vector2, WorldObjectBounds } from '@my-game-ratata/contracts'

export interface MapVisibility {
    width: number
    height: number
    tileWidth: number
    tileHeight: number
    solid: boolean[]
}
interface VisibilitySource {
    width: number
    height: number
    tilewidth: number
    tileheight: number
    layers: {
        type: string
        name: string
        data?: number[]
        properties?: { name: string; value: unknown }[]
    }[]
}

/** Read collision metadata once when the map loads, independently of visible atlas layers. */
export function readMapVisibility(map: VisibilitySource): MapVisibility {
    const solid = Array.from({ length: map.width * map.height }, () => false)
    for (const layer of map.layers) {
        if (layer.type !== 'tilelayer' || !layer.data) continue
        if (
            layer.name !== 'Fence' &&
            !layer.properties?.some(
                (property) => property.name === 'solid' && property.value === true
            )
        )
            continue
        layer.data.forEach((gid, index) => {
            if (gid !== 0 && index < solid.length) solid[index] = true
        })
    }
    return {
        width: map.width,
        height: map.height,
        tileWidth: map.tilewidth,
        tileHeight: map.tileheight,
        solid,
    }
}

export function mapHasLineOfSight(map: MapVisibility, from: Vector2, to: Vector2): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8))
    for (let index = 1; index <= steps; index += 1) {
        const x = Math.floor((from.x + ((to.x - from.x) * index) / steps) / map.tileWidth)
        const y = Math.floor((from.y + ((to.y - from.y) * index) / steps) / map.tileHeight)
        if (x < 0 || y < 0 || x >= map.width || y >= map.height || map.solid[y * map.width + x])
            return false
    }
    return true
}

/** Reach a clear exterior edge of solid props; point targets require a clear ray to their position. */
export function interactionHasLineOfSight(
    map: MapVisibility,
    from: Vector2,
    position: Vector2,
    bounds?: WorldObjectBounds,
    range = 48
): boolean {
    if (!mapHasLineOfSight(map, from, from)) return false
    const reachable = (point: Vector2): boolean =>
        Math.hypot(point.x - from.x, point.y - from.y) <= range &&
        mapHasLineOfSight(map, from, point)
    if (!bounds) return reachable(position)
    const { x, y, width, height } = bounds
    const horizontal = Math.max(x, Math.min(x + width, from.x))
    const vertical = Math.max(y, Math.min(y + height, from.y))
    return [
        { x: horizontal, y: y - 1 },
        { x: horizontal, y: y + height + 1 },
        { x: x - 1, y: vertical },
        { x: x + width + 1, y: vertical },
    ].some(reachable)
}
