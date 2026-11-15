import type { HealthSnapshot } from '@my-game-ratata/contracts'

export function healthBarPercent(health: HealthSnapshot): number {
    return health.kind === 'percent'
        ? health.percent
        : Math.max(0, Math.min(100, (health.current / Math.max(1, health.max)) * 100))
}
export function healthText(health: HealthSnapshot): string {
    return health.kind === 'exact'
        ? `${roundedResourceNumber(health.current)}/${roundedResourceNumber(health.max)}`
        : ''
}

export function roundedResourceNumber(value: number): string {
    return String(Math.round(value))
}
