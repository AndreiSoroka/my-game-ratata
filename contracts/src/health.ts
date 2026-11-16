export interface ExactHealthSnapshot {
    kind: 'exact'
    current: number
    max: number
}
export interface PercentHealthSnapshot {
    kind: 'percent'
    percent: number
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
