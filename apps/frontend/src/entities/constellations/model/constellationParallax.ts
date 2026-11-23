import {
    constellationIds,
    type ConstellationNodeSnapshot,
    type ConstellationSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

const layerCount = 5
const maximumPerspectiveDepth = 0.25
const depths = new Map(
    constellationIds.map((id, index) => [id, (index % layerCount) / (layerCount - 1)])
)

interface ParallaxViewport {
    center: Vector2
    zoom: number
}

export function projectConstellationStars(
    snapshot: ConstellationSnapshot,
    viewport: ParallaxViewport
): ConstellationSnapshot {
    const { center, zoom } = viewport
    if (zoom <= 1) return snapshot

    const perspective = maximumPerspectiveDepth * (1 - 1 / Math.max(1, zoom))
    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
    const nodeDepths = new Map(snapshot.nodes.map((node) => [node.id, starDepth(node)]))
    return {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => ({
            ...node,
            ...projectPoint(node, nodeDepths.get(node.id)!, center, perspective),
        })),
        edges: snapshot.edges.map((edge) => {
            const from = nodesById.get(edge.from)
            const to = nodesById.get(edge.to)
            if (!from || !to || !edge.via?.length) return edge

            return {
                ...edge,
                via: projectBends(
                    from,
                    to,
                    edge.via,
                    nodeDepths.get(from.id)!,
                    nodeDepths.get(to.id)!,
                    center,
                    perspective
                ),
            }
        }),
    }
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

function projectPoint(
    point: Vector2,
    depth: number,
    center: Vector2,
    perspective: number
): Vector2 {
    if (depth === 0) return point
    const scale = 1 / (1 + depth * perspective)
    return {
        x: center.x + (point.x - center.x) * scale,
        y: center.y + (point.y - center.y) * scale,
    }
}

function projectBends(
    from: Vector2,
    to: Vector2,
    bends: Vector2[],
    startDepth: number,
    endDepth: number,
    center: Vector2,
    perspective: number
): Vector2[] {
    if (startDepth === endDepth)
        return bends.map((point) => projectPoint(point, startDepth, center, perspective))

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
        const depth = startDepth + (endDepth - startDepth) * progress
        return projectPoint(point, depth, center, perspective)
    })
}
