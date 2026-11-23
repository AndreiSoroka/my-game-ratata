import { type ArrowAbilityId, arrowAbilityIds } from './arrowAbilities'
import { type AshRiteId, ashRiteIds, type AshRiteMessage } from './ashRites'
import { bladeAbilityIds, type BladeAttackAbilityId } from './bladeAbilities'
import type { PrayerParametersSnapshot } from './prayerPreviewTypes'

export { ABILITY_DEFINITIONS } from './abilityDefinitions'
export {
    type ArrowAbilityId,
    isArrowAbility,
    QUICK_SHOT_RULES,
} from './arrowAbilities'
export * from './ashRites'
export * from './bladeAbilities'
export type { PrayerParametersSnapshot } from './prayerPreviewTypes'

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
    ...ashRiteIds,
    ...bladeAbilityIds,
    'spark',
    'barrier',
    ...arrowAbilityIds,
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
    'spark' | ArrowAbilityId | 'skeleton_strike' | BladeAttackAbilityId
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
        /** Caster-centered area or reach of the active prayer, in world pixels. */
        radius?: number
        uninterruptible?: boolean
        walkWhileCasting?: boolean
    } | null
}
export type AbilityClientMessage =
    | {
          type: 'use_ability'
          abilityId: Exclude<AbilityId, PrayerActionId | AshRiteId>
          targetId?: string
          target?: import('./graves').WorldCombatTarget
      }
    | { type: 'use_ability'; abilityId: PrayerActionId; intent: PrayerIntent }
    | AshRiteMessage
    | { type: 'learn_ability'; abilityId: LearnAbilityId; targetId: string }
    | { type: 'cancel_prayer' }
    | { type: 'cancel_magic' }
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
export const BARRIER_RULES = { durationMs: 5000 } as const
export const PRAYER_RULES = {
    harmLevel: 3,
    harmChanceBonus: 0.2,
    radius: 48,
} as const
