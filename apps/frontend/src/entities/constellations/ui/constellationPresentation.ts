import type {
    ConstellationId,
    ConstellationNodeSnapshot,
    ConstellationSnapshot,
} from '@my-game-ratata/contracts'

export function constellationVisibility(zoom: number) {
    const root = revealBetween(zoom, 1, 2.5)
    const closed = revealBetween(zoom, 1.15, 4)
    const levelLocked = revealBetween(zoom, 2.5, 6)
    return (node: ConstellationNodeSnapshot): number => {
        if (node.unlocked) return 1
        if (node.levelLocked) return levelLocked
        return node.parents.length === 0 ? root : closed
    }
}

function revealBetween(zoom: number, start: number, end: number): number {
    const progress = Math.max(0, Math.min(1, Math.log(zoom / start) / Math.log(end / start)))
    return progress * progress * (3 - 2 * progress)
}

export function constellationEdges(
    sky: ConstellationSnapshot,
    colors: ReadonlyMap<ConstellationId, string>,
    visibility: (node: ConstellationNodeSnapshot) => number,
    nodeEnabled?: (node: ConstellationNodeSnapshot) => boolean
) {
    const nodes = new Map(sky.nodes.map((node) => [node.id, node]))
    return sky.edges.flatMap(({ from, to, via, crossLink }) => {
        const source = nodes.get(from)
        const target = nodes.get(to)
        if (!source || !target) return []
        const enabled = nodeEnabled ? nodeEnabled(source) && nodeEnabled(target) : target.unlocked
        return [
            {
                id: `${from}:${to}`,
                points: [source, ...(via ?? []), target]
                    .map((point) => `${point.x},${point.y}`)
                    .join(' '),
                color: enabled ? colors.get(target.constellationId) : '#8b969e',
                opacity: (enabled ? 0.7 : 0.2) * Math.min(visibility(source), visibility(target)),
                dash: crossLink ? '8 4 2 4' : enabled ? undefined : '3 4',
                crossLink,
                classes: {
                    'constellation-edge--cross-link': crossLink,
                    'constellation-edge--closed': !source.unlocked || !target.unlocked,
                },
            },
        ]
    })
}
