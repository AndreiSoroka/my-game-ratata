import {
    type CharacterSnapshot,
    isPrayerAction,
    type PrayerActionId,
} from '@my-game-ratata/contracts'

/** Presentation follows an accepted school; changing affiliation never changes a spell. */
export function preferredPrayer(
    player: CharacterSnapshot,
    candidates?: readonly PrayerActionId[]
): PrayerActionId | undefined {
    const known = player.abilities?.known.filter(isPrayerAction) ?? []
    const available = candidates ? known.filter((id) => candidates.includes(id)) : known
    const casting = player.abilities?.casting?.abilityId
    const action = player.control?.action
    const automatic = action?.kind === 'prayer' ? (action.abilityId ?? 'pray') : undefined
    return [casting, automatic, player.abilities?.lastPrayerAbilityId, 'pray', ...available].find(
        (id): id is PrayerActionId => isPrayerAction(id) && available.includes(id)
    )
}
