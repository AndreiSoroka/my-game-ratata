import type { SkyPoint } from './constellationGeometry'
import type { PlacedSkyComponent } from './constellationLayoutTypes'

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

export function packComponents(
    components: PlacedSkyComponent[],
    centerNodeId: string,
    random: () => number,
    certified = false
): Record<string, SkyPoint> | undefined {
    const center = components.find((component) =>
        component.ids.includes(centerNodeId)
    )
    const origin = center?.positions[centerNodeId]
    if (center === undefined || origin === undefined) {
        throw new Error('Starting constellation root is missing')
    }
    const initial = translateComponent(center, -origin.x, -origin.y)
    const rest = components
        .filter((component) => component !== center)
        .map((component) => ({ component, order: random() }))
        .sort((a, b) => a.order - b.order)
        .map(({ component }) => component)
    const maximum = Math.max(
        ...components.map((component) => component.circle.radius)
    )
    const radius = Math.max(
        2 * maximum + 220,
        Math.hypot(initial.circle.x, initial.circle.y) +
            initial.circle.radius +
            maximum +
            220
    )
    const phase = random() * Math.PI * 2
    const placed = [initial]
    for (const [index, component] of rest.entries()) {
        const candidate = certified
            ? ringPosition(component, radius, phase + (index * Math.PI) / 3)
            : randomPosition(component, placed, radius, random)
        if (candidate === undefined) {
            return undefined
        }
        placed.push(candidate)
    }
    return Object.assign(
        {},
        ...placed.map((component) => component.positions)
    ) as Record<string, SkyPoint>
}

function ringPosition(
    component: PlacedSkyComponent,
    radius: number,
    angle: number
): PlacedSkyComponent {
    return translateComponent(
        component,
        Math.cos(angle) * radius - component.circle.x,
        Math.sin(angle) * radius - component.circle.y
    )
}
function randomPosition(
    component: PlacedSkyComponent,
    placed: PlacedSkyComponent[],
    radius: number,
    random: () => number
): PlacedSkyComponent | undefined {
    for (let attempt = 0; attempt < 32; attempt += 1) {
        const angle = random() * Math.PI * 2
        const candidate = ringPosition(
            component,
            radius * (0.65 + random() * 0.65),
            angle
        )
        if (
            placed.every(
                (other) =>
                    Math.hypot(
                        candidate.circle.x - other.circle.x,
                        candidate.circle.y - other.circle.y
                    ) >=
                    candidate.circle.radius + other.circle.radius + 160
            )
        ) {
            return candidate
        }
    }
    return undefined
}
