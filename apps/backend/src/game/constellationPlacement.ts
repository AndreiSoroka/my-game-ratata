import type { ConstellationRegion } from '@my-game-ratata/contracts'

import type { SkyEdge, SkyPoint } from './constellationGeometry'
import type { PlacedSkyComponent } from './constellationLayoutTypes'

export interface SkyPackingContext {
    placed: readonly PlacedSkyComponent[]
    links: readonly SkyEdge[]
    phase: number
    certified: boolean
}
interface Placement {
    offset: SkyPoint
    bounds: ConstellationRegion
    circle: PlacedSkyComponent['circle']
}
const schoolGap = 800

/** A whole constellation is an obstacle, including the empty spaces between its stars. */
export function chooseConstellationPlacement(
    component: PlacedSkyComponent,
    context: SkyPackingContext
): SkyPoint | undefined {
    const linked = context.placed.filter((other) =>
        connected(component, other, context.links)
    )
    const anchors = linked.length > 0 ? linked : context.placed
    const steps = context.certified ? 64 : 32
    let best: { score: number; offset: SkyPoint } | undefined
    for (const anchor of anchors) {
        for (const scale of [1, 1.3, 1.6]) {
            const radius =
                (component.circle.radius + anchor.circle.radius + schoolGap) *
                scale
            for (let index = 0; index < steps; index += 1) {
                const angle = context.phase + (index * Math.PI * 2) / steps
                const candidate = placement(component, {
                    x:
                        anchor.circle.x +
                        Math.cos(angle) * radius -
                        component.circle.x,
                    y:
                        anchor.circle.y +
                        Math.sin(angle) * radius -
                        component.circle.y,
                })
                if (!hasRoom(candidate, context.placed)) {
                    continue
                }
                const score = placementScore(component, candidate, context)
                if (best === undefined || score < best.score) {
                    best = { score, offset: candidate.offset }
                }
            }
        }
    }
    return best?.offset
}
function placement(component: PlacedSkyComponent, offset: SkyPoint): Placement {
    return {
        offset,
        bounds: {
            ...component.bounds,
            x: component.bounds.x + offset.x,
            y: component.bounds.y + offset.y,
        },
        circle: {
            ...component.circle,
            x: component.circle.x + offset.x,
            y: component.circle.y + offset.y,
        },
    }
}
function hasRoom(
    candidate: Placement,
    placed: readonly PlacedSkyComponent[]
): boolean {
    return placed.every(
        (other) =>
            Math.hypot(
                candidate.circle.x - other.circle.x,
                candidate.circle.y - other.circle.y
            ) >=
                candidate.circle.radius +
                    other.circle.radius +
                    schoolGap -
                    0.001 && !overlap(candidate.bounds, other.bounds, schoolGap)
    )
}
function overlap(
    a: ConstellationRegion,
    b: ConstellationRegion,
    gap: number
): boolean {
    return (
        a.x < b.x + b.width + gap &&
        a.x + a.width + gap > b.x &&
        a.y < b.y + b.height + gap &&
        a.y + a.height + gap > b.y
    )
}
function connected(
    a: PlacedSkyComponent,
    b: PlacedSkyComponent,
    edges: readonly SkyEdge[]
): boolean {
    return edges.some(
        (edge) =>
            (a.positions[edge.from] !== undefined &&
                b.positions[edge.to] !== undefined) ||
            (a.positions[edge.to] !== undefined &&
                b.positions[edge.from] !== undefined)
    )
}
function placementScore(
    component: PlacedSkyComponent,
    candidate: Placement,
    context: SkyPackingContext
): number {
    const groups = [...context.placed, component]
    const rectangles = [
        ...context.placed.map((other) => other.bounds),
        candidate.bounds,
    ]
    const point = (id: string) => {
        const own = component.positions[id]
        return own === undefined
            ? context.placed.find((other) => other.positions[id] !== undefined)
                  ?.positions[id]
            : { x: own.x + candidate.offset.x, y: own.y + candidate.offset.y }
    }
    let length = 0,
        obstructions = 0
    for (const edge of context.links) {
        const from = point(edge.from),
            to = point(edge.to)
        const a = groups.findIndex(
            (group) => group.positions[edge.from] !== undefined
        )
        const b = groups.findIndex(
            (group) => group.positions[edge.to] !== undefined
        )
        if (from === undefined || to === undefined || a === b) {
            continue
        }
        if (a === groups.length - 1 || b === groups.length - 1) {
            length += Math.hypot(to.x - from.x, to.y - from.y)
        }
        for (const [index, bounds] of rectangles.entries()) {
            if (
                index !== a &&
                index !== b &&
                segmentCrossesRegion(from, to, bounds, 240)
            ) {
                obstructions += 1
            }
        }
    }
    const width =
        Math.max(...rectangles.map((b) => b.x + b.width)) -
        Math.min(...rectangles.map((b) => b.x))
    const height =
        Math.max(...rectangles.map((b) => b.y + b.height)) -
        Math.min(...rectangles.map((b) => b.y))
    return obstructions * 10_000_000 + length + (width + height) * 0.05
}

/** Liang–Barsky clipping, with a margin for labels and routed local prerequisites. */
export function segmentCrossesRegion(
    a: SkyPoint,
    b: SkyPoint,
    box: ConstellationRegion,
    margin = 0
): boolean {
    let from = 0,
        to = 1
    const dx = b.x - a.x,
        dy = b.y - a.y
    const planes = [
        [-dx, a.x - box.x + margin],
        [dx, box.x + box.width + margin - a.x],
        [-dy, a.y - box.y + margin],
        [dy, box.y + box.height + margin - a.y],
    ]
    for (const [p = 0, q = 0] of planes) {
        if (p === 0) {
            if (q < 0) {
                return false
            }
        } else if (p < 0) {
            from = Math.max(from, q / p)
        } else {
            to = Math.min(to, q / p)
        }
        if (from > to) {
            return false
        }
    }
    return true
}
