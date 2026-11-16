import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'

/** A live room-owned view shared by all controllers, never a second simulation. */
export interface PrayerAuraEnvironment {
    characters: () => Iterable<GameCharacter>
    navigationFor: (locationId: string) => NavigationService | undefined
    sameParty: (firstId: string, secondId: string) => boolean
}

export function bindPrayerAuraEnvironment(
    characters: Iterable<GameCharacter>,
    environment: PrayerAuraEnvironment
): void {
    for (const character of characters) {
        character.prayerAuraEnvironment = environment
    }
}

/** Isolated domain callers supply their ordinary validated action context. */
export function ensurePrayerAuraEnvironment(
    actor: GameCharacter,
    context: {
        characters: readonly GameCharacter[]
        navigation: NavigationService
        sameParty?: (firstId: string, secondId: string) => boolean
    }
): void {
    if (actor.prayerAuraEnvironment !== undefined) {
        return
    }
    bindPrayerAuraEnvironment([actor, ...context.characters], {
        characters: () => context.characters,
        navigationFor: (locationId) =>
            locationId === context.navigation.grid.id
                ? context.navigation
                : undefined,
        sameParty: context.sameParty ?? (() => false),
    })
}
