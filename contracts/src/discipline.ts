import { type AbilityId, isPrayerAction } from './abilities'

export const arcaneAbilityIds = [
    'spark',
    'barrier',
    'fireball',
    'greater_fireball',
    'chains',
    'blink',
    'dispel_magic',
    'city_portal',
] as const satisfies readonly AbilityId[]

export type ArcaneAbilityId = (typeof arcaneAbilityIds)[number]

export function isArcaneAbility(ability: unknown): ability is ArcaneAbilityId {
    return arcaneAbilityIds.some((id) => id === ability)
}

export function canLearnDiscipline(
    known: Iterable<AbilityId>,
    discipline: 'magic' | 'prayer'
): boolean {
    const opposite = discipline === 'magic' ? isPrayerAction : isArcaneAbility
    for (const ability of known) {
        if (opposite(ability)) {
            return false
        }
    }
    return true
}
