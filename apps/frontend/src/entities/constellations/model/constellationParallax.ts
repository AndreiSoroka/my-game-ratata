import type { ConstellationSnapshot, Vector2 } from '@my-game-ratata/contracts'

const layerCount = 5
const maximumDragReduction = 0.06
const maximumZoomExpansion = 0.04
const maximumOffsetPixels = 8

interface ParallaxViewport {
    drag: Vector2
    center: Vector2
    unitScale: number
    zoomDelta: number
}

export function projectConstellationStars(
    snapshot: ConstellationSnapshot,
    { drag, center, unitScale, zoomDelta }: ParallaxViewport
): ConstellationSnapshot {
    if (drag.x === 0 && drag.y === 0 && zoomDelta === 0) return snapshot

    const zoomExpansion = maximumZoomExpansion * Math.max(-1, Math.min(1, zoomDelta))
    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const offsets = new Map<string, Vector2>()
    const nodes = snapshot.nodes.map((node) => {
        const x = (node.x - center.x) * zoomExpansion - drag.x * unitScale * maximumDragReduction
        const y = (node.y - center.y) * zoomExpansion - drag.y * unitScale * maximumDragReduction
        const limit = maximumOffsetPixels * unitScale
        const distance = Math.hypot(x, y)
        const factor = starDepth(node.id) * (distance > limit ? limit / distance : 1)
        const offset = { x: x * factor, y: y * factor }
        offsets.set(node.id, offset)
        return { ...node, ...translate(node, offset) }
    })
    return {
        ...snapshot,
        nodes,
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

function starDepth(id: string): number {
    let hash = 2166136261
    for (let index = 0; index < id.length; index++) {
        hash = Math.imul(hash ^ id.charCodeAt(index), 16777619)
    }
    return ((hash >>> 0) % layerCount) / (layerCount - 1)
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
