import {
    ABILITY_DEFINITIONS,
    type DamageKind,
    type PrayerAbilityId,
    type PrayerMode,
} from './abilities'
import { type CreatureType, creatureTypes } from './creatures'
import { GRAVE_PURIFY_MANA_COST } from './graves'
import { REVIVE_MANA_COST } from './life'
import type { DeityId, SkillId } from './progression'

export function prayerManaCost(mode: PrayerMode): number {
    if (mode === 'devotion') {
        return 0
    }
    return mode === 'purify_grave'
        ? GRAVE_PURIFY_MANA_COST
        : mode === 'revive'
          ? REVIVE_MANA_COST
          : ABILITY_DEFINITIONS.pray.mana
}
export interface DeityPrayerProfile {
    resource: 'hp' | 'energy' | 'mana'
    restoreTypes: readonly CreatureType[]
    reviveTypes: readonly CreatureType[]
    harmTypes: readonly CreatureType[]
    damageKind: DamageKind
}
const organic = creatureTypes.filter(
    (type) => type !== 'undead' && type !== 'construct'
)
export const DEITY_PRAYER_PROFILES: Record<DeityId, DeityPrayerProfile> = {
    hearth: {
        resource: 'hp',
        restoreTypes: organic,
        reviveTypes: organic,
        harmTypes: ['undead'],
        damageKind: 'holy',
    },
    road: {
        resource: 'energy',
        restoreTypes: creatureTypes,
        reviveTypes: [],
        harmTypes: [],
        damageKind: 'holy',
    },
    lantern: {
        resource: 'mana',
        restoreTypes: creatureTypes,
        reviveTypes: [],
        harmTypes: [],
        damageKind: 'holy',
    },
    grave: {
        resource: 'hp',
        restoreTypes: ['undead'],
        reviveTypes: ['undead'],
        harmTypes: organic,
        damageKind: 'unholy',
    },
}

export interface PrayerSchoolDefinition {
    deityId: DeityId
    faithSkillId: SkillId
    miracleSkillId: SkillId
    constellationId: import('./development').ConstellationId
    canPurify: boolean
}
export const PRAYER_SCHOOL_DEFINITIONS: Record<
    PrayerAbilityId,
    PrayerSchoolDefinition
> = {
    pray: {
        deityId: 'hearth',
        faithSkillId: 'faith',
        miracleSkillId: 'miracles',
        constellationId: 'prayer',
        canPurify: true,
    },
    pray_road: {
        deityId: 'road',
        faithSkillId: 'road_faith',
        miracleSkillId: 'road_miracles',
        constellationId: 'prayer_road',
        canPurify: false,
    },
    pray_lantern: {
        deityId: 'lantern',
        faithSkillId: 'lantern_faith',
        miracleSkillId: 'lantern_miracles',
        constellationId: 'prayer_lantern',
        canPurify: false,
    },
    pray_grave: {
        deityId: 'grave',
        faithSkillId: 'grave_faith',
        miracleSkillId: 'grave_miracles',
        constellationId: 'prayer_grave',
        canPurify: false,
    },
}
export function prayerAbilityForDeity(deityId: DeityId): PrayerAbilityId {
    return {
        hearth: 'pray',
        road: 'pray_road',
        lantern: 'pray_lantern',
        grave: 'pray_grave',
    }[deityId] as PrayerAbilityId
}
export const PRAYER_SCHOOL_PROFILES: Record<
    PrayerAbilityId,
    DeityPrayerProfile
> = {
    pray: DEITY_PRAYER_PROFILES.hearth,
    pray_road: DEITY_PRAYER_PROFILES.road,
    pray_lantern: DEITY_PRAYER_PROFILES.lantern,
    pray_grave: { ...DEITY_PRAYER_PROFILES.grave, harmTypes: [] },
}
export function profileForPrayer(
    abilityId: PrayerAbilityId
): DeityPrayerProfile {
    return PRAYER_SCHOOL_PROFILES[abilityId]
}
