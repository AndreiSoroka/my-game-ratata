import type { GameCharacter } from './character'
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
