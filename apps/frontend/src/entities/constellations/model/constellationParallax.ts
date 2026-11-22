import {
    type ConstellationId,
    constellationIds,
    type ConstellationSnapshot,
    type Vector2,
} from '@my-game-ratata/contracts'

const maximumDragReduction = 0.06
const maximumOffsetPixels = 8
const zeroOffset = { x: 0, y: 0 }

/** The viewport already follows the cursor 1:1, so branch depth offsets part of that motion. */
export function projectConstellationBranches(
    snapshot: ConstellationSnapshot,
    drag: Vector2,
    unitScale: number
): ConstellationSnapshot {
    const dragLength = Math.hypot(drag.x, drag.y)
    if (dragLength === 0) return snapshot

    const offsets = new Map<ConstellationId, Vector2>()
    for (const [index, id] of constellationIds.entries()) {
        const reduction = (maximumDragReduction * index) / (constellationIds.length - 1)
        const pixels = Math.min(maximumOffsetPixels, dragLength * reduction)
        const factor = (-pixels / dragLength) * unitScale
        offsets.set(id, { x: drag.x * factor, y: drag.y * factor })
    }

    const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
    return {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => ({
            ...node,
            ...translate(node, offsets.get(node.constellationId) ?? zeroOffset),
        })),
        edges: snapshot.edges.map((edge) => {
            const from = nodesById.get(edge.from)
            const to = nodesById.get(edge.to)
            if (!from || !to || !edge.via?.length) return edge

            const start = offsets.get(from.constellationId) ?? zeroOffset
            const end = offsets.get(to.constellationId) ?? zeroOffset
            return { ...edge, via: projectBends(from, to, edge.via, start, end) }
        }),
    }
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
    if (start === end) return bends.map((point) => translate(point, start))

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
