import type { SkyPoint } from './constellationGeometry'

export interface LocalRouteBounds {
    left: number
    right: number
    top: number
    bottom: number
}

export function localRouteBounds(
    points: readonly SkyPoint[]
): LocalRouteBounds {
    return {
        left: Math.min(...points.map((point) => point.x)) - 160,
        right: Math.max(...points.map((point) => point.x)) + 160,
        top: Math.min(...points.map((point) => point.y)) - 160,
        bottom: Math.max(...points.map((point) => point.y)) + 160,
    }
}

export function insideLocalRoute(
    point: SkyPoint,
    bounds: LocalRouteBounds
): boolean {
    return (
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
    )
}

/** Small fixed corridors keep local routing bounded independently of the number of stars. */
export function localRouteCorridors(
    positions: Readonly<Record<string, SkyPoint>>,
    bounds: LocalRouteBounds,
    start: SkyPoint,
    end: SkyPoint
): SkyPoint[] {
    const bevel =
        Math.min(bounds.right - bounds.left, bounds.bottom - bounds.top) * 0.08
    const x = (bounds.left + bounds.right) / 2,
        y = (bounds.top + bounds.bottom) / 2
    const perimeter = [
        { x: bounds.left + bevel, y: bounds.top + bevel },
        { x, y: bounds.top },
        { x: bounds.right - bevel, y: bounds.top + bevel },
        { x: bounds.right, y },
        { x: bounds.right - bevel, y: bounds.bottom - bevel },
        { x, y: bounds.bottom },
        { x: bounds.left + bevel, y: bounds.bottom - bevel },
        { x: bounds.left, y },
    ]
    const root = Object.entries(positions).find(([id]) =>
        id.endsWith('.root')
    )?.[1]
    const central = root === undefined ? [] : ring(root, 180, 8)
    return [
        ...perimeter,
        ...central,
        ...ring(start, 100, 4),
        ...ring(end, 100, 4),
    ].filter((point) => insideLocalRoute(point, bounds))
}

function ring(center: SkyPoint, radius: number, count: number): SkyPoint[] {
    return Array.from({ length: count }, (_, index) => {
        const angle = (index * Math.PI * 2) / count
        return {
            x: center.x + Math.cos(angle) * radius,
            y: center.y + Math.sin(angle) * radius,
        }
    })
}
