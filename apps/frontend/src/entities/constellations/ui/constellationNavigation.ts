import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'

export function constellationHitTargets(
    nodes: readonly ConstellationNodeSnapshot[],
    unitScale: number,
    overview: boolean,
    debug: boolean,
    isVisible: (node: ConstellationNodeSnapshot) => boolean
): Map<string, number> {
    const markers = nodes.filter(
        (node) => (!overview || node.parents.length === 0) && isVisible(node)
    )
    const maximumRadius = 22 * unitScale
    const minimumSpacingSquared = (18 * unitScale) ** 2
    const radii = new Map<string, number>()
    for (const node of markers) {
        if (!debug && !node.unlocked) continue
        let closestMarkerSquared = Infinity
        let closestCandidateSquared = Infinity
        for (const other of markers) {
            if (node === other) continue
            const distanceSquared = (node.x - other.x) ** 2 + (node.y - other.y) ** 2
            closestMarkerSquared = Math.min(closestMarkerSquared, distanceSquared)
            if (debug || other.unlocked) {
                closestCandidateSquared = Math.min(closestCandidateSquared, distanceSquared)
            }
        }
        if (node.parents.length !== 0 && closestCandidateSquared < minimumSpacingSquared) continue
        // Leave a gap between targets, including around visible locked markers.
        radii.set(node.id, Math.min(maximumRadius, 0.45 * Math.sqrt(closestMarkerSquared)))
    }
    return radii
}

export function nextConstellationNode(
    nodes: readonly ConstellationNodeSnapshot[],
    current: ConstellationNodeSnapshot,
    direction: number[]
) {
    const [dx = 0, dy = 0] = direction
    const score = (node: ConstellationNodeSnapshot) =>
        Math.hypot(node.x - current.x, node.y - current.y) +
        Math.abs((node.x - current.x) * dy - (node.y - current.y) * dx) * 2
    return nodes
        .filter(
            (node) =>
                node.id !== current.id && (node.x - current.x) * dx + (node.y - current.y) * dy > 0
        )
        .sort((a, b) => score(a) - score(b))[0]
}
