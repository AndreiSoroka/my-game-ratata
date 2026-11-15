export function chancePercent(value: number): string {
    return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value * 100)}%`
}

export function criticalChance(base: number, bonus = 0): number {
    return Math.min(0.95, base + bonus)
}

export function swordDodgeChance(base: number, equipment: number, soundSword: boolean): number {
    return Math.min(0.95, Math.max(0, Math.min(0.95, base + equipment)) + (soundSword ? 0.03 : 0))
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
