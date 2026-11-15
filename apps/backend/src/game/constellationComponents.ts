import type { SkyPoint } from './constellationGeometry'
import type {
    ConstellationTopologyNode,
    SkyBranch,
    SkyComponent,
} from './constellationLayoutTypes'
import { constellationTemplatePositions } from './constellationTemplates'

export function skyComponents(
    nodes: readonly ConstellationTopologyNode[]
): SkyComponent[] {
    const adjacent = new Map(nodes.map((node) => [node.id, [] as string[]]))
    const edges = nodes.flatMap((node) =>
        node.parents.map((from) => ({ from, to: node.id }))
    )
    for (const edge of edges) {
        if (!adjacent.has(edge.from) || !adjacent.has(edge.to)) {
            throw new Error(
                `Unknown personal constellation edge: ${edge.from}>${edge.to}`
            )
        }
        adjacent.get(edge.from)?.push(edge.to)
        adjacent.get(edge.to)?.push(edge.from)
    }
    const seen = new Set<string>()
    const result: SkyComponent[] = []
    for (const node of nodes) {
        if (seen.has(node.id)) {
            continue
        }
        const ids = connectedSide(node.id, adjacent)
        ids.forEach((id) => seen.add(id))
        const positions: Record<string, SkyPoint> = {}
        for (const id of ids) {
            const point = constellationTemplatePositions[id]
            if (point === undefined) {
                throw new Error(
                    `Missing irregular constellation template: ${id}`
                )
            }
            positions[id] = { ...point }
        }
        result.push({
            ids,
            positions,
            edges: edges.filter((edge) => ids.includes(edge.from)),
            branches: branchCuts(ids, adjacent),
        })
    }
    if (seen.size !== nodes.length || adjacent.size !== nodes.length) {
        throw new Error('Duplicate personal constellation nodes')
    }
    return result
}

function connectedSide(
    start: string,
    adjacent: Map<string, string[]>,
    blocked?: { from: string; to: string }
): string[] {
    const seen = new Set([start]),
        queue = [start]
    for (const at of queue) {
        for (const next of adjacent.get(at) ?? []) {
            if (
                seen.has(next) ||
                (blocked !== undefined &&
                    ((at === blocked.from && next === blocked.to) ||
                        (at === blocked.to && next === blocked.from)))
            ) {
                continue
            }
            seen.add(next)
            queue.push(next)
        }
    }
    return queue
}

function branchCuts(
    ids: string[],
    adjacent: Map<string, string[]>
): SkyBranch[] {
    const root = ids.find((id) => id.endsWith('.root'))
    if (root === undefined) {
        throw new Error('Constellation component has no root')
    }
    const order = connectedSide(root, adjacent),
        reached = new Set([root])
    const branches: SkyBranch[] = []
    for (const anchor of order) {
        for (const child of adjacent.get(anchor) ?? []) {
            if (reached.has(child)) {
                continue
            }
            reached.add(child)
            if ((adjacent.get(anchor)?.length ?? 0) < 3) {
                continue
            }
            const descendants = connectedSide(child, adjacent, {
                from: anchor,
                to: child,
            })
            if (!descendants.includes(root)) {
                branches.push({ anchor, descendants })
            }
        }
    }
    return branches
}

export function variedComponent(
    component: SkyComponent,
    random: () => number,
    varyBranches: boolean
): Record<string, SkyPoint> {
    const positions = Object.fromEntries(
        Object.entries(component.positions).map(([id, point]) => [
            id,
            { ...point },
        ])
    )
    if (varyBranches) {
        permuteLeaves(component.branches, positions, random)
        for (const branch of component.branches) {
            const anchor = positions[branch.anchor]
            if (anchor === undefined) {
                continue
            }
            const angle = (random() - 0.5) * 0.4,
                scale = 0.9 + random() * 0.26
            for (const id of branch.descendants) {
                const point = positions[id]
                if (point === undefined) {
                    continue
                }
                const x = (point.x - anchor.x) * scale,
                    y = (point.y - anchor.y) * scale
                positions[id] = {
                    x: anchor.x + x * Math.cos(angle) - y * Math.sin(angle),
                    y: anchor.y + x * Math.sin(angle) + y * Math.cos(angle),
                }
            }
        }
    }
    const angle = random() * Math.PI * 2,
        reflection = random() < 0.5 ? -1 : 1
    const scaleX = 1.2 + random() * 0.5,
        scaleY = 1.2 + random() * 0.5
    for (const [id, point] of Object.entries(positions)) {
        const x = point.x * scaleX * reflection,
            y = point.y * scaleY
        positions[id] = {
            x: x * Math.cos(angle) - y * Math.sin(angle),
            y: x * Math.sin(angle) + y * Math.cos(angle),
        }
    }
    return positions
}

/** Leaf relabeling permutes branch order while preserving the certified geometric edge set. */
function permuteLeaves(
    branches: SkyBranch[],
    positions: Record<string, SkyPoint>,
    random: () => number
): void {
    const anchors = new Map<string, string[]>()
    for (const branch of branches) {
        const id = branch.descendants[0]
        if (branch.descendants.length !== 1 || id === undefined) {
            continue
        }
        const siblings = anchors.get(branch.anchor) ?? []
        siblings.push(id)
        anchors.set(branch.anchor, siblings)
    }
    for (const siblings of anchors.values()) {
        const points = siblings.map((id) => positions[id])
        for (let index = points.length - 1; index > 0; index -= 1) {
            const other = Math.floor(random() * (index + 1))
            const point = points[index]
            points[index] = points[other]
            points[other] = point
        }
        for (const [index, id] of siblings.entries()) {
            const point = points[index]
            if (point !== undefined) {
                positions[id] = { ...point }
            }
        }
    }
}
