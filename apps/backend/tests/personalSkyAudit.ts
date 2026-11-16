import type { SkyPoint } from '../src/game/constellationGeometry'
import type {
    ConstellationTopologyNode,
    RealizedConstellationLayout,
} from '../src/game/constellationLayoutTypes'

interface AuditEdge {
    from: string
    to: string
    vertices: SkyPoint[]
}
const tolerance = 0.00001

/** Deliberately independent of the production orientation-based validator. */
export function auditPersonalSky(
    topology: readonly ConstellationTopologyNode[],
    sky: RealizedConstellationLayout
): string | undefined {
    const points = Object.entries(sky.positions)
    for (const [index, [id, point]] of points.entries()) {
        for (const [otherId, other] of points.slice(index + 1)) {
            if (
                Math.hypot(point.x - other.x, point.y - other.y) <
                80 - tolerance
            ) {
                return `Node spacing ${id}/${otherId}`
            }
        }
    }
    const edges = topology.flatMap((node) =>
        node.parents.map((from): AuditEdge => ({
            from,
            to: node.id,
            vertices: [
                point(sky, from),
                ...(sky.edgeWaypoints[`${from}>${node.id}`] ?? []),
                point(sky, node.id),
            ],
        }))
    )
    for (const edge of edges) {
        for (const [id, value] of points) {
            if (id === edge.from || id === edge.to) {
                continue
            }
            for (let step = 1; step < edge.vertices.length; step += 1) {
                if (
                    nearestDistance(
                        value,
                        required(edge.vertices[step - 1]),
                        required(edge.vertices[step])
                    ) <
                    36 - tolerance
                ) {
                    return `Edge clearance ${edge.from}>${edge.to}/${id}`
                }
            }
        }
    }
    for (const [index, edge] of edges.entries()) {
        for (const other of edges.slice(index + 1)) {
            const allowed = [edge.from, edge.to]
                .filter((id) => id === other.from || id === other.to)
                .map((id) => point(sky, id))
            if (conflictingPaths(edge.vertices, other.vertices, allowed)) {
                return `Edge intersection ${edge.from}>${edge.to}/${other.from}>${other.to}`
            }
        }
    }
    return undefined
}

function point(sky: RealizedConstellationLayout, id: string): SkyPoint {
    return required(sky.positions[id])
}
function required(value: SkyPoint | undefined): SkyPoint {
    if (value === undefined) {
        throw new Error('Missing sky point in independent audit')
    }
    return value
}
function nearestDistance(value: SkyPoint, a: SkyPoint, b: SkyPoint): number {
    const vx = b.x - a.x,
        vy = b.y - a.y
    const fraction = Math.max(
        0,
        Math.min(
            1,
            ((value.x - a.x) * vx + (value.y - a.y) * vy) / (vx * vx + vy * vy)
        )
    )
    return Math.hypot(
        value.x - a.x - fraction * vx,
        value.y - a.y - fraction * vy
    )
}
function conflictingPaths(
    a: SkyPoint[],
    b: SkyPoint[],
    allowed: SkyPoint[]
): boolean {
    for (let first = 1; first < a.length; first += 1) {
        for (let second = 1; second < b.length; second += 1) {
            const hit = intersection(
                required(a[first - 1]),
                required(a[first]),
                required(b[second - 1]),
                required(b[second])
            )
            if (hit === 'overlap') {
                return true
            }
            if (
                hit !== undefined &&
                !allowed.some(
                    (p) => Math.hypot(hit.x - p.x, hit.y - p.y) < tolerance
                )
            ) {
                return true
            }
        }
    }
    return false
}
function intersection(
    a: SkyPoint,
    b: SkyPoint,
    c: SkyPoint,
    d: SkyPoint
): SkyPoint | 'overlap' | undefined {
    const rx = b.x - a.x,
        ry = b.y - a.y,
        sx = d.x - c.x,
        sy = d.y - c.y
    const denominator = rx * sy - ry * sx
    if (Math.abs(denominator) < tolerance) {
        return parallelIntersection(a, b, c, d)
    }
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator
    if (
        t < -tolerance ||
        t > 1 + tolerance ||
        u < -tolerance ||
        u > 1 + tolerance
    ) {
        return undefined
    }
    return { x: a.x + t * rx, y: a.y + t * ry }
}
function parallelIntersection(
    a: SkyPoint,
    b: SkyPoint,
    c: SkyPoint,
    d: SkyPoint
): SkyPoint | 'overlap' | undefined {
    const rx = b.x - a.x,
        ry = b.y - a.y
    if (Math.abs((c.x - a.x) * ry - (c.y - a.y) * rx) > tolerance) {
        return undefined
    }
    const axis = Math.abs(rx) >= Math.abs(ry) ? 'x' : 'y'
    const from = Math.max(
        Math.min(a[axis], b[axis]),
        Math.min(c[axis], d[axis])
    )
    const to = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]))
    if (to < from - tolerance) {
        return undefined
    }
    if (to - from > tolerance) {
        return 'overlap'
    }
    const fraction = (from - a[axis]) / (b[axis] - a[axis])
    return { x: a.x + rx * fraction, y: a.y + ry * fraction }
}
