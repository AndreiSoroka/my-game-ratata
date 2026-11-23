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
    isVisible: (node: ConstellationNodeSnapshot) => boolean
): StarLabel[] {
    const nodes = sky.nodes.filter(
        (node) => isVisible(node) && (node.parents.length === 0 || detailed)
    )
    const visible = nodes.filter(
        (node) =>
            node.x >= view.x &&
            node.x <= view.x + view.width &&
            node.y >= view.y &&
            node.y <= view.y + view.height
    )
    const candidates = visible
        .filter((node) => node.unlocked)
        .sort(
            (a, b) => priority(a, selectedId) - priority(b, selectedId) || a.id.localeCompare(b.id)
        )
    const labels: StarLabel[] = []
    const edges = detailed ? labelEdges(sky, isVisible) : []
    const overviewRootId = detailed ? undefined : (selectedId ?? sky.layout?.centerNodeId)
    for (const node of candidates) {
        const content = labelContent(sky, node, scale)
        if (!content) continue
        const { width, height, positions } = labelAnchors(node, scale, overviewRootId)
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
            if (edgeIntersects(rect, edges, scale)) continue
            labels.push({ ...rect, ...content })
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

function labelEdges(
    sky: ConstellationSnapshot,
    isVisible: (node: ConstellationNodeSnapshot) => boolean
): Vector2[][] {
    const byId = new Map(sky.nodes.map((node) => [node.id, node]))
    return sky.edges.flatMap((edge) => {
        const from = byId.get(edge.from),
            to = byId.get(edge.to)
        return from && to && isVisible(from) && isVisible(to)
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

function labelAnchors(node: ConstellationNodeSnapshot, scale: number, overviewRootId?: string) {
    const root = node.parents.length === 0
    const width = (root ? 68 : 100) * scale
    const height = (root ? 34 : 32) * scale
    const offset = 28 * scale
    const { x, y } = node
    const positions = [
        { x: x - width / 2, y: y + offset },
        { x: x - width / 2, y: y - offset - height },
        { x: x + offset, y: y - height / 2 },
        { x: x - offset - width, y: y - height / 2 },
    ]
    if (root && node.id === overviewRootId) {
        positions.push(
            { x: x + offset, y: y + offset },
            { x: x + offset, y: y - offset - height },
            { x: x - offset - width, y: y + offset },
            { x: x - offset - width, y: y - offset - height }
        )
    }
    return { width, height, positions }
}
function labelContent(sky: ConstellationSnapshot, node: ConstellationNodeSnapshot, scale: number) {
    const path = sky.paths.find((entry) => entry.id === node.constellationId)
    const root = node.parents.length === 0
    const text = root ? (path?.name ?? node.name) : node.name
    if (!text) return
    return {
        id: node.id,
        text,
        fontSize: (root ? 12 : 11) * scale,
        color: path?.color ?? '#dce6dd',
    }
}
