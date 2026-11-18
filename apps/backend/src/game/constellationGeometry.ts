export interface SkyPoint {
    x: number
    y: number
}
export interface SkyEdge {
    from: string
    to: string
    via?: readonly SkyPoint[]
    crossLink?: boolean
}
const epsilon = 1e-7

export function constellationGeometryProblem(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[],
    spacing = 80,
    clearance = 36
): string | undefined {
    const nodes = Object.entries(positions)
    return (
        nodeSpacingProblem(nodes, spacing) ??
        foreignNodeProblem(positions, edges, nodes, clearance) ??
        edgeIntersectionProblem(positions, edges)
    )
}

function nodeSpacingProblem(
    nodes: Array<[string, SkyPoint]>,
    spacing: number
): string | undefined {
    for (const [index, current] of nodes.entries()) {
        if (!Number.isFinite(current[1].x) || !Number.isFinite(current[1].y)) {
            return `Non-finite position ${current[0]}`
        }
        for (const other of nodes.slice(index + 1)) {
            if (
                distanceSquared(current[1], other[1]) <
                spacing * spacing - epsilon
            ) {
                return `Close nodes ${current[0]} / ${other[0]}`
            }
        }
    }
    return undefined
}

function foreignNodeProblem(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[],
    nodes: Array<[string, SkyPoint]>,
    clearance: number
): string | undefined {
    for (const edge of edges) {
        const points = edgePoints(positions, edge)
        for (const [id, point] of nodes) {
            if (id === edge.from || id === edge.to) {
                continue
            }
            for (let step = 1; step < points.length; step += 1) {
                if (
                    segmentDistanceSquared(
                        point,
                        requirePoint(points[step - 1]),
                        requirePoint(points[step])
                    ) <
                    clearance * clearance - epsilon
                ) {
                    return `Edge through node ${edge.from}>${edge.to} / ${id}`
                }
            }
        }
    }
    return undefined
}

function edgeIntersectionProblem(
    positions: Readonly<Record<string, SkyPoint>>,
    edges: readonly SkyEdge[]
): string | undefined {
    const paths = edges.map((edge) => edgePoints(positions, edge))
    for (const [index, edge] of edges.entries()) {
        const points = paths[index]
        if (points === undefined) {
            continue
        }
        if (selfIntersection(points)) {
            return `Self-intersection ${edge.from}>${edge.to}`
        }
        for (let other = index + 1; other < edges.length; other += 1) {
            const next = edges[other],
                nextPoints = paths[other]
            if (
                next !== undefined &&
                nextPoints !== undefined &&
                edge.crossLink !== true &&
                next.crossLink !== true &&
                pathsIntersect(
                    points,
                    nextPoints,
                    commonVertices(positions, edge, next)
                )
            ) {
                return `Intersecting edges ${edge.from}>${edge.to} / ${next.from}>${next.to}`
            }
        }
    }
    return undefined
}

function requirePoint(point: SkyPoint | undefined): SkyPoint {
    if (point === undefined) {
        throw new Error('Missing constellation edge vertex')
    }
    return point
}
function edgePoints(
    positions: Readonly<Record<string, SkyPoint>>,
    edge: SkyEdge
): SkyPoint[] {
    return [
        requirePoint(positions[edge.from]),
        ...(edge.via ?? []),
        requirePoint(positions[edge.to]),
    ]
}
function commonVertices(
    positions: Readonly<Record<string, SkyPoint>>,
    a: SkyEdge,
    b: SkyEdge
): SkyPoint[] {
    return [a.from, a.to]
        .filter((id) => id === b.from || id === b.to)
        .map((id) => requirePoint(positions[id]))
}
function selfIntersection(points: SkyPoint[]): boolean {
    for (let a = 1; a < points.length; a += 1) {
        for (let b = a + 1; b < points.length; b += 1) {
            const allowed = b === a + 1 ? [requirePoint(points[a])] : []
            if (
                segmentsConflict(
                    requirePoint(points[a - 1]),
                    requirePoint(points[a]),
                    requirePoint(points[b - 1]),
                    requirePoint(points[b]),
                    allowed
                )
            ) {
                return true
            }
        }
    }
    return false
}
function pathsIntersect(
    a: SkyPoint[],
    b: SkyPoint[],
    allowed: SkyPoint[]
): boolean {
    for (let first = 1; first < a.length; first += 1) {
        for (let second = 1; second < b.length; second += 1) {
            if (
                segmentsConflict(
                    requirePoint(a[first - 1]),
                    requirePoint(a[first]),
                    requirePoint(b[second - 1]),
                    requirePoint(b[second]),
                    allowed
                )
            ) {
                return true
            }
        }
    }
    return false
}

export function segmentsConflict(
    a: SkyPoint,
    b: SkyPoint,
    c: SkyPoint,
    d: SkyPoint,
    allowed: readonly SkyPoint[] = []
): boolean {
    const abC = orientation(a, b, c),
        abD = orientation(a, b, d)
    const cdA = orientation(c, d, a),
        cdB = orientation(c, d, b)
    if (abC * abD < -epsilon && cdA * cdB < -epsilon) {
        return true
    }
    const touches = [a, b]
        .filter((point) => onSegment(point, c, d))
        .concat([c, d].filter((point) => onSegment(point, a, b)))
        .filter(
            (point, index, all) =>
                all.findIndex(
                    (other) => distanceSquared(point, other) < epsilon
                ) === index
        )
    if (touches.length > 1) {
        return true
    }
    return touches.some(
        (point) =>
            !allowed.some((vertex) => distanceSquared(point, vertex) < epsilon)
    )
}
function orientation(a: SkyPoint, b: SkyPoint, c: SkyPoint): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
function onSegment(point: SkyPoint, a: SkyPoint, b: SkyPoint): boolean {
    return (
        Math.abs(orientation(a, b, point)) <= epsilon &&
        point.x >= Math.min(a.x, b.x) - epsilon &&
        point.x <= Math.max(a.x, b.x) + epsilon &&
        point.y >= Math.min(a.y, b.y) - epsilon &&
        point.y <= Math.max(a.y, b.y) + epsilon
    )
}
export function distanceSquared(a: SkyPoint, b: SkyPoint): number {
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2
}
export function segmentDistanceSquared(
    point: SkyPoint,
    a: SkyPoint,
    b: SkyPoint
): number {
    const dx = b.x - a.x,
        dy = b.y - a.y
    const length = dx * dx + dy * dy
    const ratio =
        length === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      1,
                      ((point.x - a.x) * dx + (point.y - a.y) * dy) / length
                  )
              )
    return (point.x - a.x - ratio * dx) ** 2 + (point.y - a.y - ratio * dy) ** 2
}
