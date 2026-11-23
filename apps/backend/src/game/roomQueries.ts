import { ABILITY_DEFINITIONS } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { distance } from './math'
import type { NavigationService } from './navigation'
import { findVisibleTarget } from './queries'
import type { RoomSocket } from './roomMessaging'
import { centerLocationId, type WorldLocations } from './worldLocations'

export function charactersInLocation(
    characters: Map<string, GameCharacter>,
    locationId: string
): Map<string, GameCharacter> {
    return new Map(
        [...characters].filter(
            ([, character]) =>
                character.locationId === locationId &&
                !character.tags.has('offline')
        )
    )
}

export function createRoomTargetFinder(
    characters: () => Map<string, GameCharacter>,
    navigationFor: (actor: GameCharacter) => NavigationService,
    clock = Date.now
) {
    return (
        observer: GameCharacter,
        radius: number,
        now = clock()
    ): GameCharacter | undefined =>
        findVisibleTarget(
            charactersInLocation(characters(), observer.locationId).values(),
            navigationFor(observer),
            observer,
            radius,
            now
        )
}

export function createNearbyCorpseFinder(world: () => WorldLocations) {
    return (actor: GameCharacter, now: number): string | undefined => {
        const { navigation, inventory } = world().get(actor.locationId)
        const byDistance = inventory.deathLoot
            .raisableCorpses(now)
            .map((chest) => ({
                chest,
                range: distance(actor.position, chest.position),
            }))
            .filter(({ range }) => range <= ABILITY_DEFINITIONS.ash_raise.range)
            .sort((a, b) => a.range - b.range)
        return byDistance.find(({ chest }) =>
            navigation.hasLineOfSight(actor.position, chest.position)
        )?.chest.id
    }
}

export function connectionsInLocation(
    connections: Map<RoomSocket, string | undefined>,
    characters: Map<string, GameCharacter>,
    locationId: string
): Map<RoomSocket, string | undefined> {
    return new Map(
        [...connections].filter(
            ([, id]) =>
                (id === undefined
                    ? centerLocationId
                    : characters.get(id)?.locationId) === locationId
        )
    )
}
