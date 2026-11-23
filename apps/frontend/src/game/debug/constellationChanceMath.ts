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
