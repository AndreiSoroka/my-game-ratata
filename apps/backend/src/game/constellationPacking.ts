import type { SkyEdge, SkyPoint } from './constellationGeometry'
import type { PlacedSkyComponent } from './constellationLayoutTypes'
import {
    chooseConstellationPlacement,
    type SkyPackingContext,
} from './constellationPlacement'

export function describeComponent(
    positions: Record<string, SkyPoint>
): PlacedSkyComponent {
    const values = Object.values(positions)
    const x =
        (Math.min(...values.map((p) => p.x)) +
            Math.max(...values.map((p) => p.x))) /
        2
    const y =
        (Math.min(...values.map((p) => p.y)) +
            Math.max(...values.map((p) => p.y))) /
        2
    return {
        ids: Object.keys(positions),
        positions,
        bounds: {
            x: Math.min(...values.map((p) => p.x)),
            y: Math.min(...values.map((p) => p.y)),
            width:
                Math.max(...values.map((p) => p.x)) -
                Math.min(...values.map((p) => p.x)),
            height:
                Math.max(...values.map((p) => p.y)) -
                Math.min(...values.map((p) => p.y)),
        },
        circle: {
            x,
            y,
            radius: Math.max(
                100,
                ...values.map((p) => Math.hypot(p.x - x, p.y - y))
            ),
        },
    }
}

export function translateComponent(
    component: PlacedSkyComponent,
    x: number,
    y: number
): PlacedSkyComponent {
    return {
        ...component,
        bounds: {
            ...component.bounds,
            x: component.bounds.x + x,
            y: component.bounds.y + y,
        },
        circle: {
            ...component.circle,
            x: component.circle.x + x,
            y: component.circle.y + y,
        },
        positions: Object.fromEntries(
            Object.entries(component.positions).map(([id, point]) => [
                id,
                { x: point.x + x, y: point.y + y },
            ])
        ),
    }
}

/** Place prerequisite neighbors before unrelated schools; score routes as well as footprints. */
export function packComponents(
    components: PlacedSkyComponent[],
    centerNodeId: string,
    random: () => number,
    certified = false,
    links: readonly SkyEdge[] = []
): Record<string, SkyPoint> | undefined {
    const center = components.find((component) =>
        component.ids.includes(centerNodeId)
    )
    const origin = center?.positions[centerNodeId]
    if (center === undefined || origin === undefined) {
        throw new Error('Starting constellation root is missing')
    }
    const placed = [translateComponent(center, -origin.x, -origin.y)]
    const owners = new Map(
        components.flatMap((component, index) =>
            component.ids.map((id) => [id, index] as const)
        )
    )
    const bridges = links.filter(
        (edge) => owners.get(edge.from) !== owners.get(edge.to)
    )
    const remaining = components
        .filter((component) => component !== center)
        .map((component) => ({ component, order: random() }))
    const phase = random() * Math.PI * 2
    while (remaining.length > 0) {
        const context: SkyPackingContext = {
            placed,
            links: bridges,
            phase,
            certified,
        }
        remaining.sort((a, b) => {
            const connections =
                connectionCount(b.component, context) -
                connectionCount(a.component, context)
            if (connections !== 0) {
                return connections
            }
            const count = b.component.ids.length - a.component.ids.length
            return count === 0 ? a.order - b.order : count
        })
        const next = remaining.shift()?.component
        if (next === undefined) {
            break
        }
        const translation = chooseConstellationPlacement(next, context)
        if (translation === undefined) {
            return undefined
        }
        placed.push(translateComponent(next, translation.x, translation.y))
    }
    return Object.assign(
        {},
        ...placed.map((component) => component.positions)
    ) as Record<string, SkyPoint>
}

function connectionCount(
    component: PlacedSkyComponent,
    context: SkyPackingContext
): number {
    const own = new Set(component.ids)
    const existing = new Set(context.placed.flatMap((other) => other.ids))
    return context.links.filter(
        (edge) =>
            (own.has(edge.from) && existing.has(edge.to)) ||
            (own.has(edge.to) && existing.has(edge.from))
    ).length
}
