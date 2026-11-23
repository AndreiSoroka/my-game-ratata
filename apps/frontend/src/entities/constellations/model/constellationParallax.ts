import {
    constellationIds,
    type ConstellationNodeSnapshot,
    type ConstellationSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

const layerCount = 5
const maximumDragReduction = 0.03
const maximumPanOffsetPixels = 6
const maximumZoomExpansion = 0.01
const maximumZoomOffsetPixels = 2
const depths = new Map(
    constellationIds.map((id, index) => [id, (index % layerCount) / (layerCount - 1)])
)

interface ParallaxViewport {
    drag: Vector2
    center: Vector2
    unitScale: number
    zoomDelta: number
}

export function projectConstellationStars(
    snapshot: ConstellationSnapshot,
    viewport: ParallaxViewport
): ConstellationSnapshot {
    const { drag, zoomDelta } = viewport
    if (drag.x === 0 && drag.y === 0 && zoomDelta === 0) return snapshot

    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const offsets = starOffsets(snapshot, viewport)
    return {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => ({
            ...node,
            ...translate(node, offsets.get(node.id)!),
        })),
        edges: snapshot.edges.map((edge) => {
            const from = nodesById.get(edge.from)
            const to = nodesById.get(edge.to)
            if (!from || !to || !edge.via?.length) return edge

            const start = offsets.get(from.id)!
            const end = offsets.get(to.id)!
            return { ...edge, via: projectBends(from, to, edge.via, start, end) }
        }),
    }
}

function starOffsets(
    snapshot: ConstellationSnapshot,
    viewport: ParallaxViewport
): Map<string, Vector2> {
    const { drag, center, unitScale, zoomDelta } = viewport
    const pan = limitOffset(
        {
            x: -drag.x * unitScale * maximumDragReduction,
            y: -drag.y * unitScale * maximumDragReduction,
        },
        maximumPanOffsetPixels * unitScale
    )
    const zoomExpansion = maximumZoomExpansion * Math.max(0, Math.min(1, zoomDelta))
    return new Map(
        snapshot.nodes.map((node) => {
            const zoom = limitOffset(
                {
                    x: (node.x - center.x) * zoomExpansion,
                    y: (node.y - center.y) * zoomExpansion,
                },
                maximumZoomOffsetPixels * unitScale
            )
            const depth = starDepth(node)
            return [
                node.id,
                {
                    x: (pan.x + zoom.x) * depth,
                    y: (pan.y + zoom.y) * depth,
                },
            ]
        })
    )
}

function starDepth(node: ConstellationNodeSnapshot): number {
    if (node.parents.length === 0) return depths.get(node.constellationId) ?? 0
    // The wire ID is stable when a star changes from closed to learned.
    let hash = 0
    for (let index = 0; index < node.id.length; index++) {
        hash = Math.imul(hash, 31) + node.id.charCodeAt(index)
    }
    return ((hash >>> 0) % layerCount) / (layerCount - 1)
}

function limitOffset(offset: Vector2, maximum: number): Vector2 {
    const distance = Math.hypot(offset.x, offset.y)
    if (distance <= maximum) return offset
    const factor = maximum / distance
    return { x: offset.x * factor, y: offset.y * factor }
}

function translate(point: Vector2, offset: Vector2): Vector2 {
    return { x: point.x + offset.x, y: point.y + offset.y }
}

function projectBends(
    from: Vector2,
    to: Vector2,
    bends: Vector2[],
    start: Vector2,
    end: Vector2
): Vector2[] {
    if (start.x === end.x && start.y === end.y) return bends.map((point) => translate(point, start))

    let previous = from
    let distance = 0
    const distances = bends.map((point) => {
        distance += Math.hypot(point.x - previous.x, point.y - previous.y)
        previous = point
        return distance
    })
    const total = distance + Math.hypot(to.x - previous.x, to.y - previous.y)

    return bends.map((point, index) => {
        const progress = total > 0 ? distances[index]! / total : (index + 1) / (bends.length + 1)
        return {
            x: point.x + start.x + (end.x - start.x) * progress,
            y: point.y + start.y + (end.y - start.y) * progress,
        }
    })
}
