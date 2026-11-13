export const abilityIds = [
    'pray',
    'spark',
    'barrier',
    'shot',
    'skeleton_strike',
    'fireball',
    'greater_fireball',
] as const
export type AbilityId = (typeof abilityIds)[number]
export type LearnAbilityId = 'pray' | 'spark' | 'barrier' | 'shot'
export type AttackAbilityId = 'spark' | 'shot' | 'skeleton_strike'
export type BasicAttackKind = 'melee' | 'arrow' | 'spark'
export type DamageKind = 'physical' | 'arcane' | 'holy' | 'unholy'
export type PrayerMode = 'restore' | 'revive' | 'harm' | 'devotion'
export interface PrayerIntent {
    mode: PrayerMode
    targetId?: string
}
export interface PrayerPreview {
    intent: PrayerIntent | null
    manaCost: number
    harmfulTargets: number
    includesAllies: boolean
    includesSelf: boolean
    unavailableReason: string | null
}
export interface CharacterAbilitiesSnapshot {
    known: AbilityId[]
    cooldowns: Partial<Record<AbilityId, number>>
    barrier: { remaining: number; expiresAt: number } | null
    casting: {
        abilityId: 'pray'
        targetId: string
        startedAt: number
        completesAt: number
    } | null
}
export type AbilityClientMessage =
    | {
          type: 'use_ability'
          abilityId: Exclude<AbilityId, 'pray'>
          targetId?: string
      }
    | { type: 'use_ability'; abilityId: 'pray'; intent: PrayerIntent }
    | { type: 'learn_ability'; abilityId: LearnAbilityId; targetId: string }
export interface AbilityDefinition {
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
    pray: {
        name: 'Молитва',
        mana: 5,
        energy: 0,
        cooldownMs: 3000,
        range: 48,
        windupMs: 400,
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
        mana: 12,
        energy: 0,
        cooldownMs: 10000,
        range: 0,
        windupMs: 400,
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
        name: 'Огненный шар',
        mana: 12,
        energy: 0,
        cooldownMs: 1000,
        range: 160,
        windupMs: 400,
        damage: 8,
    },
    greater_fireball: {
        name: 'Большой огненный шар',
        mana: 24,
        energy: 0,
        cooldownMs: 2000,
        range: 192,
        windupMs: 400,
        damage: 18,
    },
}
export const BARRIER_RULES = { absorption: 8, durationMs: 5000 } as const
export const PRAYER_RULES = {
    harmLevel: 3,
    harmChanceBonus: 0.2,
    radius: 48,
} as const
