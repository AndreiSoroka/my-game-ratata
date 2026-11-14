import type { CombatHitQuality } from '@my-game-ratata/contracts'

export function combatHitQuality(
    roll: number,
    low: number,
    high: number,
    critical: boolean,
    underpowered: boolean
): CombatHitQuality {
    if (critical) {
        return 'critical'
    }
    if (underpowered) {
        return 'weak'
    }
    if (high <= low) {
        return 'normal'
    }
    const fraction = (roll - low) / (high - low)
    return fraction < 1 / 3 ? 'weak' : fraction >= 2 / 3 ? 'strong' : 'normal'
}
