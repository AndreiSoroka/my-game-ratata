import type { CharacterFacing, Vector2 } from '@my-game-ratata/contracts'

export const zeroVector = (): Vector2 => ({ x: 0, y: 0 })

export function facingDirection(facing: CharacterFacing): Vector2 {
    return {
        up: { x: 0, y: -1 },
        down: { x: 0, y: 1 },
        left: { x: -1, y: 0 },
        right: { x: 1, y: 0 },
    }[facing]
}

export function distance(a: Vector2, b: Vector2): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/** First entry along a segment whose start is outside the circle. */
export function circleEntryFraction(
    from: Vector2,
    to: Vector2,
    center: Vector2,
    radius: number
): number | undefined {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const x = from.x - center.x
    const y = from.y - center.y
    const a = dx * dx + dy * dy
    const b = x * dx + y * dy
    const c = x * x + y * y - radius * radius
    const discriminant = b * b - a * c
    if (a === 0 || c <= 0 || b >= 0 || discriminant < 0) {
        return undefined
    }
    const entry = (-b - Math.sqrt(discriminant)) / a
    return entry <= 1 ? entry : undefined
}

export function normalize(input: Vector2): Vector2 {
    const length = Math.hypot(input.x, input.y)

    if (length === 0) {
        return zeroVector()
    }

    return {
        x: input.x / length,
        y: input.y / length,
    }
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

export function moveToward(
    origin: Vector2,
    target: Vector2,
    maxDistance: number
): Vector2 {
    const dx = target.x - origin.x
    const dy = target.y - origin.y
    const length = Math.hypot(dx, dy)

    if (length <= maxDistance || length === 0) {
        return { ...target }
    }

    return {
        x: origin.x + (dx / length) * maxDistance,
        y: origin.y + (dy / length) * maxDistance,
    }
}

export function resolveFacing(
    vector: Vector2,
    fallback: CharacterFacing
): CharacterFacing {
    if (vector.x === 0 && vector.y === 0) {
        return fallback
    }

    if (Math.abs(vector.y) > Math.abs(vector.x)) {
        return vector.y >= 0 ? 'down' : 'up'
    }

    return vector.x >= 0 ? 'right' : 'left'
}
