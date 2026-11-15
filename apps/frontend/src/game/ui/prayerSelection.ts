import {
    type CharacterSnapshot,
    isPrayerAbility,
    type PrayerAbilityId,
} from '@my-game-ratata/contracts'

/** Presentation follows an accepted school; changing affiliation never changes a spell. */
export function preferredPrayer(
    player: CharacterSnapshot,
    candidates?: readonly PrayerAbilityId[]
): PrayerAbilityId | undefined {
    const known = player.abilities?.known.filter(isPrayerAbility) ?? []
    const available = candidates ? known.filter((id) => candidates.includes(id)) : known
    const casting = player.abilities?.casting?.abilityId
    const action = player.control?.action
    const automatic = action?.kind === 'prayer' ? (action.abilityId ?? 'pray') : undefined
    return [casting, automatic, player.abilities?.lastPrayerAbilityId, 'pray', ...available].find(
        (id): id is PrayerAbilityId => isPrayerAbility(id) && available.includes(id)
    )
}
