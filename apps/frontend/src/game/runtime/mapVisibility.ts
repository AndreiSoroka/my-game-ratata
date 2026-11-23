import type {
    AdventureResourceNode,
    Vector2,
    ViewportBounds,
    WorldObjectBounds,
} from '@my-game-ratata/contracts'
import { interactionApproachPoints } from '@my-game-ratata/contracts'

import { WorldInterestCache } from './worldInterest'

export interface MapVisibility {
    width: number
    height: number
    tileWidth: number
    tileHeight: number
    solid: boolean[]
    resourceBase?: boolean[]
    resourceSignature?: string
    resourceInterest?: WorldInterestCache<AdventureResourceNode>
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
    const resourceCells =
        map.layers.find((layer) => layer.name === 'Resource collision')?.data ?? []
    return {
        width: map.width,
        height: map.height,
        tileWidth: map.tilewidth,
        tileHeight: map.tileheight,
        solid,
        resourceBase: solid.map((blocked, index) => blocked && !resourceCells[index]),
    }
}

/** Mirrors server-authored obstacle states; client does not decide depletion or growth. */
export function updateResourceVisibility(
    map: MapVisibility,
    nodes: readonly AdventureResourceNode[],
    viewBounds?: ViewportBounds
): void {
    map.resourceInterest ??= new WorldInterestCache<AdventureResourceNode>()
    const sources = map.resourceInterest.update(
        nodes.filter((node) => node.source !== undefined),
        viewBounds
    ).nodes
    const signature = JSON.stringify(
        sources.map((node) => [node.id, node.phase, node.collisionBounds])
    )
    if (signature === map.resourceSignature) return
    map.resourceSignature = signature
    map.resourceBase ??= map.solid.slice()
    map.solid = map.resourceBase.slice()
    for (const node of sources) {
        const bounds = node.collisionBounds
        if (!bounds) continue
        for (
            let y = Math.floor(bounds.y / map.tileHeight);
            y < Math.ceil((bounds.y + bounds.height) / map.tileHeight);
            y++
        ) {
            for (
                let x = Math.floor(bounds.x / map.tileWidth);
                x < Math.ceil((bounds.x + bounds.width) / map.tileWidth);
                x++
            ) {
                if (x >= 0 && y >= 0 && x < map.width && y < map.height)
                    map.solid[y * map.width + x] = true
            }
        }
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
    range = 48,
    interactionAreas?: readonly WorldObjectBounds[]
): boolean {
    if (!mapHasLineOfSight(map, from, from)) return false
    const reachable = (point: Vector2): boolean =>
        Math.hypot(point.x - from.x, point.y - from.y) <= range &&
        mapHasLineOfSight(map, from, point)
    if (!bounds) return reachable(position)
    return interactionApproachPoints(from, interactionAreas ?? [bounds]).some(reachable)
}
