import {
    abilityIds,
    type CharacterResourceChecks,
    FARM_SOW_ENERGY,
    isMotherPrayer,
    isPrayerAction,
    prayerActionIds,
    prayerManaCost,
    type ResourceCheck,
    resourceFillPercent,
    type ResourceSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import {
    effectiveAbility,
    effectiveDashCost,
    effectiveTheftCost,
} from './effectiveParameters'
import { effectiveMaxMana } from './effectiveResources'
import { hasMotherPrayerAura } from './motherPrayerPlan'

export function observeResource(
    resource: ResourceSnapshot,
    exact: boolean
): ResourceSnapshot {
    if (exact || resource.kind === 'percent') {
        return { ...resource }
    }
    return {
        kind: 'percent',
        percent: resourceFillPercent(resource),
        hasCapacity: resource.max > 0,
    }
}

export function resourceChecks(
    character: GameCharacter,
    now = Date.now()
): CharacterResourceChecks {
    const check = (mana: number, energy = 0): ResourceCheck =>
        character.mana < mana
            ? 'mana'
            : character.energy < energy
              ? 'energy'
              : 'ready'
    return {
        abilities: Object.fromEntries(
            abilityIds
                .filter((id) => !isPrayerAction(id))
                .map((id) => {
                    const ability = effectiveAbility(character, id)
                    return [id, check(ability.mana, ability.energy)]
                })
        ) as CharacterResourceChecks['abilities'],
        prayers: Object.fromEntries(
            prayerActionIds.map((id) => [
                id,
                {
                    devotion: check(
                        isMotherPrayer(id) &&
                            (hasMotherPrayerAura(character) ||
                                constellationModifiers(character)
                                    .prayerLastLight)
                            ? minimumMotherCost(character)
                            : 0
                    ),
                    restore: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('restore', id)
                    ),
                    harm: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('harm', id)
                    ),
                    ward: check(
                        isMotherPrayer(id) ? minimumMotherCost(character) : 5
                    ),
                    revive: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('revive', id)
                    ),
                    purify_grave: check(
                        isMotherPrayer(id)
                            ? minimumMotherCost(character)
                            : prayerManaCost('purify_grave', id)
                    ),
                },
            ])
        ) as CharacterResourceChecks['prayers'],
        dash: check(0, effectiveDashCost(character, now)),
        sow: check(0, FARM_SOW_ENERGY),
        steal: check(0, effectiveTheftCost(character)),
    }
}

function minimumMotherCost(character: GameCharacter): number {
    return constellationModifiers(character).prayerLastLight
        ? effectiveMaxMana(character) * 0.3
        : 5
}
