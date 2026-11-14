import type { WorldObjectBounds } from './environment'
import type { Vector2 } from './index'

export interface InteractionBoundarySegment {
    from: Vector2
    to: Vector2
    normal: Vector2
}

export function nearestInteractionPoint(
    point: Vector2,
    areas: readonly WorldObjectBounds[]
): Vector2 {
    let closest = { ...point }
    let distance = Infinity
    for (const area of areas) {
        const candidate = {
            x: clamp(point.x, area.x, area.x + area.width),
            y: clamp(point.y, area.y, area.y + area.height),
        }
        const next = Math.hypot(point.x - candidate.x, point.y - candidate.y)
        if (next < distance) {
            closest = candidate
            distance = next
        }
    }
    return closest
}

export function distanceToInteractionAreas(
    point: Vector2,
    areas: readonly WorldObjectBounds[]
): number {
    if (areas.length === 0) {
        return Infinity
    }
    const closest = nearestInteractionPoint(point, areas)
    return Math.hypot(point.x - closest.x, point.y - closest.y)
}

/** Exterior edges of a rectangle union, without seams between adjacent water rows. */
export function interactionBoundary(
    areas: readonly WorldObjectBounds[]
): InteractionBoundarySegment[] {
    const result = new Map<string, InteractionBoundarySegment>()
    for (const area of areas) {
        for (const edge of rectangleEdges(area)) {
            for (const part of splitEdge(edge, areas)) {
                const middle = {
                    x: (part.from.x + part.to.x) / 2 + part.normal.x * 0.01,
                    y: (part.from.y + part.to.y) / 2 + part.normal.y * 0.01,
                }
                if (areas.some((candidate) => contains(candidate, middle))) {
                    continue
                }
                const key = `${String(part.from.x)}:${String(part.from.y)}:${String(part.to.x)}:${String(part.to.y)}`
                result.set(key, part)
            }
        }
    }
    return [...result.values()]
}

export function interactionApproachPoints(
    point: Vector2,
    areas: readonly WorldObjectBounds[],
    margin = 1
): Vector2[] {
    const result = new Map<string, Vector2>()
    for (const edge of interactionBoundary(areas)) {
        const projection = {
            x: clamp(point.x, edge.from.x, edge.to.x),
            y: clamp(point.y, edge.from.y, edge.to.y),
        }
        const center = {
            x: (edge.from.x + edge.to.x) / 2,
            y: (edge.from.y + edge.to.y) / 2,
        }
        for (const base of [projection, center]) {
            const candidate = {
                x: base.x + edge.normal.x * margin,
                y: base.y + edge.normal.y * margin,
            }
            if (areas.some((area) => contains(area, candidate))) {
                continue
            }
            result.set(
                `${String(candidate.x)}:${String(candidate.y)}`,
                candidate
            )
        }
    }
    return [...result.values()].sort(
        (a, b) =>
            Math.hypot(a.x - point.x, a.y - point.y) -
            Math.hypot(b.x - point.x, b.y - point.y)
    )
}

function rectangleEdges(area: WorldObjectBounds): InteractionBoundarySegment[] {
    const left = area.x,
        top = area.y,
        right = area.x + area.width,
        bottom = area.y + area.height
    return [
        {
            from: { x: left, y: top },
            to: { x: right, y: top },
            normal: { x: 0, y: -1 },
        },
        {
            from: { x: left, y: bottom },
            to: { x: right, y: bottom },
            normal: { x: 0, y: 1 },
        },
        {
            from: { x: left, y: top },
            to: { x: left, y: bottom },
            normal: { x: -1, y: 0 },
        },
        {
            from: { x: right, y: top },
            to: { x: right, y: bottom },
            normal: { x: 1, y: 0 },
        },
    ]
}

function splitEdge(
    edge: InteractionBoundarySegment,
    areas: readonly WorldObjectBounds[]
): InteractionBoundarySegment[] {
    const axis = edge.from.y === edge.to.y ? 'x' : 'y'
    const start = edge.from[axis],
        end = edge.to[axis]
    const cuts = new Set([start, end])
    for (const area of areas) {
        for (const value of [
            area[axis],
            area[axis] + (axis === 'x' ? area.width : area.height),
        ]) {
            if (value > start && value < end) {
                cuts.add(value)
            }
        }
    }
    const values = [...cuts].sort((a, b) => a - b)
    return values.slice(1).map((value, index) => ({
        from: { ...edge.from, [axis]: values[index] ?? start },
        to: { ...edge.to, [axis]: value },
        normal: edge.normal,
    }))
}

function contains(area: WorldObjectBounds, point: Vector2): boolean {
    return (
        point.x >= area.x &&
        point.x < area.x + area.width &&
        point.y >= area.y &&
        point.y < area.y + area.height
    )
}

function clamp(value: number, start: number, end: number): number {
    return Math.max(start, Math.min(value, end))
}
