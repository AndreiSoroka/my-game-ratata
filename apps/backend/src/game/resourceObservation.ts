import {
    abilityIds,
    type CharacterResourceChecks,
    FARM_SOW_ENERGY,
    isPrayerAbility,
    prayerAbilityIds,
    prayerManaCost,
    type ResourceCheck,
    resourceFillPercent,
    type ResourceSnapshot,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    effectiveAbility,
    effectiveDashCost,
    effectiveTheftCost,
} from './effectiveParameters'

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
    character: GameCharacter
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
                .filter((id) => !isPrayerAbility(id))
                .map((id) => {
                    const ability = effectiveAbility(character, id)
                    return [id, check(ability.mana, ability.energy)]
                })
        ) as CharacterResourceChecks['abilities'],
        prayers: Object.fromEntries(
            prayerAbilityIds.map((id) => [
                id,
                {
                    devotion: check(prayerManaCost('devotion')),
                    restore: check(prayerManaCost('restore')),
                    harm: check(prayerManaCost('harm')),
                    revive: check(prayerManaCost('revive')),
                    purify_grave: check(prayerManaCost('purify_grave')),
                },
            ])
        ) as CharacterResourceChecks['prayers'],
        dash: check(0, effectiveDashCost(character)),
        sow: check(0, FARM_SOW_ENERGY),
        steal: check(0, effectiveTheftCost(character)),
    }
}
