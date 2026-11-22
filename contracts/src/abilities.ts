import {
    bladeAbilityDefinitions,
    bladeAbilityIds,
    type BladeAttackAbilityId,
} from './bladeAbilities'
export * from './bladeAbilities'

export const prayerAbilityIds = [
    'pray',
    'pray_road',
    'pray_lantern',
    'pray_grave',
] as const
export type PrayerAbilityId = (typeof prayerAbilityIds)[number]
/** Canonical schools remain independent from standalone cast actions. */
export type PrayerSchoolId = PrayerAbilityId
export const prayerActionIds = [...prayerAbilityIds, 'pray_woven'] as const
export type PrayerActionId = (typeof prayerActionIds)[number]
export function isPrayerAction(value: unknown): value is PrayerActionId {
    return (
        typeof value === 'string' &&
        prayerActionIds.includes(value as PrayerActionId)
    )
}
export function prayerSchoolId(actionId: PrayerActionId): PrayerSchoolId {
    return actionId === 'pray_woven' ? 'pray' : actionId
}
export function isMotherPrayer(actionId: PrayerActionId): boolean {
    return prayerSchoolId(actionId) === 'pray'
}
export function isPrayerAbility(value: unknown): value is PrayerAbilityId {
    return (
        typeof value === 'string' &&
        prayerAbilityIds.includes(value as PrayerAbilityId)
    )
}
export const abilityIds = [
    ...prayerActionIds,
    ...bladeAbilityIds,
    'spark',
    'barrier',
    'shot',
    'skeleton_strike',
    'fireball',
    'greater_fireball',
    'chains',
    'blink',
    'dispel_magic',
    'city_portal',
] as const
export type AbilityId = (typeof abilityIds)[number]
export type LearnAbilityId = PrayerAbilityId | 'spark' | 'barrier' | 'shot'
export type AttackAbilityId =
    'spark' | 'shot' | 'skeleton_strike' | BladeAttackAbilityId
export type BasicAttackKind = 'melee' | 'arrow' | 'spark'
export type DamageKind = 'physical' | 'arcane' | 'holy' | 'unholy'
export type PrayerMode =
    'restore' | 'revive' | 'harm' | 'ward' | 'devotion' | 'purify_grave'
export type PrayerIntent =
    | {
          mode: Exclude<PrayerMode, 'purify_grave'>
          targetId?: string
          target?: never
      }
    | {
          mode: 'purify_grave'
          target: import('./graves').WorldCombatTarget
          targetId?: never
      }
export interface PrayerPreview {
    abilityId?: PrayerActionId
    intent: PrayerIntent | null
    manaCost: number
    harmfulTargets: number
    /** Actual bounded recipients of Kara, when supplied by a resolved preview. */
    harmfulTargetIds?: string[]
    includesAllies: boolean
    includesSelf: boolean
    unavailableReason: string | null
    radius?: number
    durationMs?: number
    cost?: PrayerCostSnapshot
    targetCount?: number
}
/** Percentage prices disclose their rule without revealing the unknown maximum MP. */
export interface PrayerCostSnapshot {
    manaPerTarget: number
    healingManaFraction?: number
}
/** Public action parameters; numeric damage knowledge is projected separately. */
export interface AbilityUsageSnapshot {
    cycleMs?: number
    movementMs?: number
    geometry?: import('./combat').AttackGeometry
    mana: number
    energy: number
    cooldownMs: number
    range: number
    windupMs: number
    radius?: number
    durationMs?: number
    manaPerSecond?: number
    manaFraction?: number
}
export interface CharacterAbilitiesSnapshot {
    known: AbilityId[]
    parameters?: Partial<Record<AbilityId, AbilityUsageSnapshot>>
    cooldowns: Partial<Record<AbilityId, number>>
    barrier: { remaining?: number; expiresAt: number } | null
    magicChannel?: import('./magic').MagicChannelSnapshot
    rootedUntil?: number
    /** Healing alias retained for existing presentation fixtures. */
    prayer?: PrayerParametersSnapshot
    prayers?: Partial<Record<PrayerActionId, PrayerParametersSnapshot>>
    lastPrayerAbilityId?: PrayerActionId
    casting: {
        abilityId: PrayerActionId
        mode?: Exclude<PrayerMode, 'devotion'>
        target?: import('./graves').WorldCombatTarget
        targetId: string
        startedAt: number
        completesAt: number
        uninterruptible?: boolean
        walkWhileCasting?: boolean
    } | null
}
export type AbilityClientMessage =
    | {
          type: 'use_ability'
          abilityId: Exclude<AbilityId, PrayerActionId>
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | { type: 'use_ability'; abilityId: PrayerActionId; intent: PrayerIntent }
    | { type: 'learn_ability'; abilityId: LearnAbilityId; targetId: string }
    | { type: 'cancel_prayer' }
    | { type: 'cancel_magic' }
export interface PrayerParametersSnapshot {
    radius: number
    durationMs: number
    manaCost: number
    area: boolean
    harm: boolean
    targetLimit?: number
    wardRank?: number
    hasAuras?: boolean
    aurasSuppressed?: boolean
    energyRecoveryRadius?: number
    cost?: PrayerCostSnapshot
}
export interface AbilityDefinition {
    cycleMs?: number
    movementMs?: number
    name: string
    mana: number
    energy: number
    cooldownMs: number
    range: number
    windupMs: number
    stunMs?: number
    damage?: number
    maxDamage?: number
}
export const ABILITY_DEFINITIONS: Record<AbilityId, AbilityDefinition> = {
    ...bladeAbilityDefinitions,
    pray: {
        name: 'Молитва',
        mana: 5,
        energy: 0,
        cooldownMs: 3000,
        range: 48,
        windupMs: 3000,
    },
    pray_woven: {
        name: 'Сплетённая молитва',
        mana: 5,
        energy: 0,
        cooldownMs: 3000,
        range: 48,
        windupMs: 3000,
    },
    pray_road: {
        name: 'Молитва странника',
        mana: 5,
        energy: 0,
        cooldownMs: 3000,
        range: 48,
        windupMs: 3000,
    },
    pray_lantern: {
        name: 'Молитва ясности',
        mana: 5,
        energy: 0,
        cooldownMs: 3000,
        range: 48,
        windupMs: 3000,
    },
    pray_grave: {
        name: 'Молитва праха',
        mana: 5,
        energy: 0,
        cooldownMs: 3000,
        range: 48,
        windupMs: 3000,
    },
    spark: {
        name: 'Искра',
        mana: 6,
        energy: 5,
        cooldownMs: 800,
        range: 80,
        windupMs: 200,
        damage: 3,
        maxDamage: 6,
    },
    barrier: {
        name: 'Барьер',
        mana: 4,
        energy: 0,
        cooldownMs: 10000,
        range: 0,
        windupMs: 0,
    },
    shot: {
        name: 'Выстрел',
        mana: 0,
        energy: 10,
        cooldownMs: 550,
        range: 64,
        windupMs: 50,
        damage: 4,
        maxDamage: 7,
    },
    skeleton_strike: {
        name: 'Костяной удар',
        mana: 0,
        energy: 24,
        cooldownMs: 8000,
        range: 19.2,
        windupMs: 600,
        stunMs: 800,
    },
    fireball: {
        name: 'Огненная стрела',
        mana: 15,
        energy: 0,
        cooldownMs: 5000,
        range: 160,
        windupMs: 400,
        damage: 10,
        maxDamage: 40,
    },
    greater_fireball: {
        name: 'Большой огненный шар',
        mana: 40,
        energy: 0,
        cooldownMs: 8000,
        range: 192,
        windupMs: 400,
        damage: 50,
        maxDamage: 120,
    },
    chains: {
        name: 'Оковы',
        mana: 5,
        energy: 0,
        cooldownMs: 18000,
        range: 0,
        windupMs: 0,
    },
    blink: {
        name: 'Мерцание',
        mana: 10,
        energy: 0,
        cooldownMs: 8000,
        range: 0,
        windupMs: 0,
    },
    dispel_magic: {
        name: 'Рассеивание',
        mana: 12,
        energy: 0,
        cooldownMs: 12000,
        range: 0,
        windupMs: 0,
    },
    city_portal: {
        name: 'Портал',
        mana: 0,
        energy: 0,
        cooldownMs: 120000,
        range: 0,
        windupMs: 10000,
    },
}
export const BARRIER_RULES = { durationMs: 5000 } as const
export const PRAYER_RULES = {
    harmLevel: 3,
    harmChanceBonus: 0.2,
    radius: 48,
} as const
