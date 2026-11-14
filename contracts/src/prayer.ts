import {
    ABILITY_DEFINITIONS,
    type DamageKind,
    type PrayerMode,
} from './abilities'
import { type CreatureType, creatureTypes } from './creatures'
import { GRAVE_PURIFY_MANA_COST } from './graves'
import { REVIVE_MANA_COST } from './life'
import type { DeityId } from './progression'

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
