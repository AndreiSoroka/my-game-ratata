import {
    type ConstellationId,
    constellationIds,
    type ConstellationNodeSnapshot,
    type ConstellationSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

const layerCount = 5
const maximumDragReduction = 0.06
const maximumZoomExpansion = 0.04
const maximumOffsetPixels = 8
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
    const offsets = constellationOffsets(snapshot, viewport)
    return {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => ({
            ...node,
            ...translate(node, offsets.get(node.constellationId)!),
        })),
        edges: snapshot.edges.map((edge) => {
            const from = nodesById.get(edge.from)
            const to = nodesById.get(edge.to)
            if (!from || !to || !edge.via?.length) return edge

            const start = offsets.get(from.constellationId)!
            const end = offsets.get(to.constellationId)!
            return { ...edge, via: projectBends(from, to, edge.via, start, end) }
        }),
    }
}

function constellationOffsets(
    snapshot: ConstellationSnapshot,
    { drag, center, unitScale, zoomDelta }: ParallaxViewport
): Map<ConstellationId, Vector2> {
    const zoomExpansion = maximumZoomExpansion * Math.max(-1, Math.min(1, zoomDelta))
    const limit = maximumOffsetPixels * unitScale
    const offsets = new Map<ConstellationId, Vector2>()
    for (const [id, node] of constellationAnchors(snapshot.nodes)) {
        const region = snapshot.layout?.regions[id]
        const anchor = region
            ? { x: region.x + region.width / 2, y: region.y + region.height / 2 }
            : node
        const x = (anchor.x - center.x) * zoomExpansion - drag.x * unitScale * maximumDragReduction
        const y = (anchor.y - center.y) * zoomExpansion - drag.y * unitScale * maximumDragReduction
        const distance = Math.hypot(x, y)
        const factor = (depths.get(id) ?? 0) * (distance > limit ? limit / distance : 1)
        offsets.set(id, { x: x * factor, y: y * factor })
    }
    return offsets
}

function constellationAnchors(nodes: ConstellationSnapshot['nodes']) {
    const anchors = new Map<ConstellationId, ConstellationNodeSnapshot>()
    for (const node of nodes) {
        const current = anchors.get(node.constellationId)
        const isRoot = node.parents.length === 0
        const currentIsRoot = current?.parents.length === 0
        if (
            !current ||
            (isRoot && !currentIsRoot) ||
            (isRoot === currentIsRoot && node.id < current.id)
        ) {
            anchors.set(node.constellationId, node)
        }
    }
    return anchors
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
