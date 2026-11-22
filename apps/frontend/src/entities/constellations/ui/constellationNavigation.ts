import type { ConstellationNodeSnapshot } from '@my-game-ratata/contracts'

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
