import type {
    ConstellationId,
    ConstellationRegion,
    ConstellationSnapshot,
} from '@my-game-ratata/contracts'

/** Only received nodes and local routes contribute; hidden future branches never widen this view. */
export function observedPathBounds(
    sky: ConstellationSnapshot,
    id: ConstellationId
): ConstellationRegion | undefined {
    const nodes = sky.nodes.filter((node) => node.constellationId === id)
    if (nodes.length === 0) return sky.layout?.regions[id]
    const ids = new Set(nodes.map((node) => node.id))
    const points = [
        ...nodes,
        ...sky.edges
            .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
            .flatMap((edge) => edge.via ?? []),
    ]
    const x = Math.min(...points.map((point) => point.x))
    const y = Math.min(...points.map((point) => point.y))
    return {
        x,
        y,
        width: Math.max(...points.map((point) => point.x)) - x,
        height: Math.max(...points.map((point) => point.y)) - y,
    }
}
