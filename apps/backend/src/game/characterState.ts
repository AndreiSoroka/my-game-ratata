import type {
    ArrowAbilityId,
    AttackAbilityId,
    AttackDelivery,
    AttackGeometry,
    AttackOrigin,
    CharacterFacing,
    ProjectilePath,
    SpellSkillId,
    Vector2,
    WorldCombatTarget,
} from '@my-game-ratata/contracts'

import type { ResourceSpendReceipt } from './resourcePractice'

export interface UsefulArrowHit {
    abilityId: ArrowAbilityId
    targetId: string
    locationId: string
    at: number
}

export interface ArrowAttack {
    abilityId: ArrowAbilityId
    origin: Vector2
    aim: Vector2
    facing: CharacterFacing
    range: number
    mobile: boolean
    moved: boolean
    openerDamage: number
    previousHit: UsefulArrowHit | undefined
}

export interface PendingAttackHit {
    actionId?: string
    origin?: AttackOrigin
    delivery?: AttackDelivery
    geometry?: AttackGeometry
    weaponAttack?: boolean
    arrow?: ArrowAttack
    sparkPath?: ProjectilePath
    comboBonus?: number
    stunDurationMs?: number
    resourceSpends?: ResourceSpendReceipt[] | undefined
    weaponInstanceId?: string | undefined
    abilityId?: AttackAbilityId | SpellSkillId | 'ash_exhaustion' | undefined
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

export function createPendingAttackHit(
    now: number,
    attack: Omit<PendingAttackHit, 'hitAt'> & { windupMs: number },
    weaponInstanceId: string | undefined
): PendingAttackHit {
    const { windupMs, ...fields } = attack
    return {
        ...fields,
        weaponInstanceId:
            attack.weaponAttack === true ||
            attack.abilityId === undefined ||
            attack.abilityId === 'skeleton_strike'
                ? weaponInstanceId
                : undefined,
        target: attack.target === undefined ? undefined : { ...attack.target },
        underpowered: attack.underpowered ?? false,
        hitAt: now + windupMs,
    }
}

export function regen(
    current: number,
    max: number,
    perSecond: number,
    deltaMs: number
): number {
    // An Angelic revival may supply excess resources until they are actually spent.
    if (current >= max) {
        return Math.max(0, current)
    }
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
