import type { DamageKind } from './abilities'
import { type CreatureType, creatureTypes } from './creatures'
import type { DeityId } from './progression'
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
