import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import { findVisibleTarget } from './queries'
import type { RoomSocket } from './roomMessaging'
import { centerLocationId } from './worldLocations'

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
    navigationFor: (actor: GameCharacter) => NavigationService
) {
    return (
        observer: GameCharacter,
        radius: number,
        now = Date.now()
    ): GameCharacter | undefined =>
        findVisibleTarget(
            charactersInLocation(characters(), observer.locationId).values(),
            navigationFor(observer),
            observer,
            radius,
            now
        )
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
