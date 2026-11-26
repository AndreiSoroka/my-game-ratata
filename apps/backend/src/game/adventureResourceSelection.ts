import type { AdventureResourceNode } from '@my-game-ratata/contracts'

type ResourceCandidate = Readonly<
    Pick<
        AdventureResourceNode,
        'id' | 'kind' | 'locationId' | 'phase' | 'remaining'
    > & {
        position: Readonly<AdventureResourceNode['position']>
    }
>
export type ResourcePriority = (node: ResourceCandidate) => number
export type ResourceTieBreak = (
    first: ResourceCandidate,
    second: ResourceCandidate
) => number

export function snapshotResources(
    nodes: AdventureResourceNode[],
    locationId?: string,
    nodeId?: string
): AdventureResourceNode[] {
    if (nodeId !== undefined) {
        const node = nodes.find(
            (entry) =>
                entry.id === nodeId &&
                (locationId === undefined || entry.locationId === locationId)
        )
        return node === undefined ? [] : [structuredClone(node)]
    }
    return structuredClone(
        locationId === undefined
            ? nodes
            : nodes.filter((node) => node.locationId === locationId)
    )
}

/** Score live candidates once and copy only the selected snapshot. */
export function bestResourceSnapshot(
    nodes: readonly AdventureResourceNode[],
    priority: ResourcePriority,
    tieBreak: ResourceTieBreak
): AdventureResourceNode | undefined {
    let selected: AdventureResourceNode | undefined
    let best = Infinity
    for (const node of nodes) {
        const score = priority(node)
        if (
            score < best ||
            (score === best &&
                selected !== undefined &&
                tieBreak(node, selected) < 0)
        ) {
            selected = node
            best = score
        }
    }
    return selected === undefined ? undefined : structuredClone(selected)
}
