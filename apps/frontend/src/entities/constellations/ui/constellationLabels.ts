import type {
    ConstellationNodeSnapshot,
    ConstellationRegion,
    ConstellationSnapshot,
    Vector2,
} from '@my-game-ratata/contracts'

export interface StarLabel extends ConstellationRegion {
    id: string
    text: string
    fontSize: number
    color: string
}

export function constellationLabels(
    sky: ConstellationSnapshot,
    selectedId: string | undefined,
    detailed: boolean,
    scale: number,
    view: ConstellationRegion,
    showClosed: boolean
): StarLabel[] {
    const nodes = sky.nodes.filter(
        (node) => (showClosed || node.unlocked) && (node.parents.length === 0 || detailed)
    )
    const visible = nodes.filter(
        (node) =>
            node.x >= view.x &&
            node.x <= view.x + view.width &&
            node.y >= view.y &&
            node.y <= view.y + view.height
    )
    const candidates = visible
        .filter((node) => node.parents.length === 0 || node.unlocked || node.id === selectedId)
        .sort(
            (a, b) => priority(a, selectedId) - priority(b, selectedId) || a.id.localeCompare(b.id)
        )
    const labels: StarLabel[] = []
    const edges = labelEdges(sky, showClosed)
    for (const node of candidates) {
        const root = node.parents.length === 0
        const { width, height } = labelSize(root, scale)
        const offset = 28 * scale
        const positions = [
            { x: node.x - width / 2, y: node.y + offset },
            { x: node.x - width / 2, y: node.y - offset - height },
            { x: node.x + offset, y: node.y - height / 2 },
            { x: node.x - offset - width, y: node.y - height / 2 },
        ]
        if (!detailed && root && node.id === (selectedId ?? sky.layout?.centerNodeId)) {
            positions.push(
                { x: node.x + offset, y: node.y + offset },
                { x: node.x + offset, y: node.y - offset - height },
                { x: node.x - offset - width, y: node.y + offset },
                { x: node.x - offset - width, y: node.y - offset - height }
            )
        }
        for (const point of positions) {
            const rect = {
                x: Math.max(
                    view.x + 4 * scale,
                    Math.min(view.x + view.width - width - 4 * scale, point.x)
                ),
                y: Math.max(
                    view.y + 4 * scale,
                    Math.min(view.y + view.height - height - 4 * scale, point.y)
                ),
                width,
                height,
            }
            if (
                nodes.some((other) => circleIntersects(rect, other, 26 * scale)) ||
                labels.some((other) => intersects(rect, other, 4 * scale))
            )
                continue
            if (detailed && edgeIntersects(rect, edges, scale)) continue
            labels.push(starLabel(sky, node, rect, scale))
            break
        }
    }
    return labels
}
function priority(node: ConstellationNodeSnapshot, selectedId: string | undefined): number {
    return node.id === selectedId ? 0 : node.parents.length === 0 ? 1 : 2
}
function intersects(a: ConstellationRegion, b: ConstellationRegion, gap: number): boolean {
    return (
        a.x < b.x + b.width + gap &&
        a.x + a.width + gap > b.x &&
        a.y < b.y + b.height + gap &&
        a.y + a.height + gap > b.y
    )
}
function circleIntersects(rect: ConstellationRegion, point: Vector2, radius: number): boolean {
    return (
        Math.hypot(
            point.x - Math.max(rect.x, Math.min(rect.x + rect.width, point.x)),
            point.y - Math.max(rect.y, Math.min(rect.y + rect.height, point.y))
        ) < radius
    )
}
function segmentIntersects(
    rect: ConstellationRegion,
    from: Vector2,
    to: Vector2,
    gap: number
): boolean {
    let enter = 0,
        leave = 1
    for (const [position, direction, minimum, maximum] of [
        [from.x, to.x - from.x, rect.x - gap, rect.x + rect.width + gap],
        [from.y, to.y - from.y, rect.y - gap, rect.y + rect.height + gap],
    ]) {
        if (direction === 0) {
            if (position! < minimum! || position! > maximum!) return false
            continue
        }
        const first = (minimum! - position!) / direction!,
            second = (maximum! - position!) / direction!
        enter = Math.max(enter, Math.min(first, second))
        leave = Math.min(leave, Math.max(first, second))
        if (enter > leave) return false
    }
    return true
}

function labelEdges(sky: ConstellationSnapshot, showClosed: boolean): Vector2[][] {
    const byId = new Map(sky.nodes.map((node) => [node.id, node]))
    return sky.edges.flatMap((edge) => {
        const from = byId.get(edge.from),
            to = byId.get(edge.to)
        return from && to && (showClosed || (from.unlocked && to.unlocked))
            ? [[from, ...(edge.via ?? []), to]]
            : []
    })
}
function edgeIntersects(rect: ConstellationRegion, edges: Vector2[][], scale: number): boolean {
    return edges.some((points) =>
        points
            .slice(1)
            .some((end, index) => segmentIntersects(rect, points[index]!, end, 3 * scale))
    )
}

function labelSize(root: boolean, scale: number) {
    return { width: (root ? 68 : 100) * scale, height: (root ? 34 : 32) * scale }
}
function starLabel(
    sky: ConstellationSnapshot,
    node: ConstellationNodeSnapshot,
    rect: ConstellationRegion,
    scale: number
): StarLabel {
    const path = sky.paths.find((entry) => entry.id === node.constellationId)
    const name = node.parents.length === 0 ? (path?.name ?? node.name) : node.name
    return {
        ...rect,
        id: node.id,
        text: node.unlocked && name ? name : 'Неизвестно',
        fontSize: (node.parents.length === 0 ? 12 : 11) * scale,
        color: node.unlocked ? (path?.color ?? '#dce6dd') : '#8b969e',
    }
}
