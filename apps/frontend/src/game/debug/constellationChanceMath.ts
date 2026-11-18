export function chancePercent(value: number): string {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value * 100)}%`
}
/** Probability of at least one success in the authoritative two-check advantage rule. */
export function successWithAdvantage(chance: number, advantage = false): number {
    return advantage ? 1 - (1 - chance) ** 2 : chance
}

export function criticalChance(base: number, bonus = 0): number {
    return Math.min(0.95, base + bonus)
}

/** Explanatory examples only: the authoritative service still owns the actual two rolls. */
export function theftEffectChances(front: boolean, bonus: number) {
    const detected = Math.max(0.1, Math.min(0.9, 0.68 + (front ? 0.12 : -0.08)))
    const success = Math.max(0.05, Math.min(0.9, 0.305 + (front ? 0 : 0.1) + bonus))
    return {
        detected,
        success,
        unnoticed: (1 - detected) * success,
        failedUnnoticed: (1 - detected) * (1 - success),
    }
}
