import type { HealthSnapshot } from '@my-game-ratata/contracts'

import type { ResourceNumbers } from '../model/playerVitals'

export function healthBarPercent(health: HealthSnapshot): number {
    return health.kind === 'percent'
        ? health.percent
        : Math.max(0, Math.min(100, (health.current / Math.max(1, health.max)) * 100))
}

export function healthText(health: HealthSnapshot): string {
    return health.kind === 'exact' ? resourceNumbersText(health) : ''
}

export function resourceNumbersText({ current, max }: ResourceNumbers): string {
    return `${Math.round(current)}/${Math.round(max)}`
}
