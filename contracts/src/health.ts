export interface ExactHealthSnapshot {
    kind: 'exact'
    current: number
    max: number
}
export interface PercentHealthSnapshot {
    kind: 'percent'
    percent: number
    /** Private segment widths, from left to right. Percent is the sum of lit widths. */
    segments?: readonly number[]
    /** A partially filled last segment can look full while this pool can still be restored. */
    needsRestoration?: boolean
}
export type HealthSnapshot = ExactHealthSnapshot | PercentHealthSnapshot

/** The public health band always rounds down, including party views. */
export function healthPercent(health: HealthSnapshot): number {
    const percent =
        health.kind === 'percent'
            ? health.percent
            : (health.current / Math.max(1, health.max)) * 100
    return Math.floor(Math.max(0, Math.min(100, percent)))
}

export function healthNeedsRestoration(health: HealthSnapshot): boolean {
    return health.kind === 'exact'
        ? health.max > 0 && health.current < health.max
        : (health.needsRestoration ?? health.percent < 100)
}
