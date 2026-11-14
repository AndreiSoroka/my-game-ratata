import type {
    AttackAbilityId,
    SpellSkillId,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'
export interface PendingAttackHit {
    weaponInstanceId?: string | undefined
    abilityId?: AttackAbilityId | SpellSkillId | undefined
    rawDamage?: number | undefined
    maxRange?: number | undefined
    target?: WorldCombatTarget | undefined
    targetId?: string | undefined
    canStun: boolean
    damageMultiplier: number
    underpowered?: boolean
    hitAt: number
    targetEnergyDrain: number
}

export interface AttackResourceSpend {
    canStun: boolean
    fullyPowered: boolean
}

export function regen(
    current: number,
    max: number,
    perSecond: number,
    deltaMs: number
): number {
    if (max <= 0 || perSecond <= 0) {
        return Math.max(0, Math.min(current, max))
    }

    return Math.max(0, Math.min(max, current + perSecond * (deltaMs / 1000)))
}

export function spendResource(current: number, cost: number): number {
    if (cost <= 0) {
        return current
    }

    if (current < cost) {
        return 0
    }

    return Math.max(0, current - cost)
}
