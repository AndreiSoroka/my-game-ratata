import type { TheftClientMessage } from '@my-game-ratata/contracts'

import type { AdventureService } from './adventure'
import type { GameCharacter } from './character'
import type { NavigationService } from './navigation'
import type { TheftService } from './theft'

export function createRoomTheftRequester(
    theft: TheftService,
    adventure: AdventureService,
    characters: ReadonlyMap<string, GameCharacter>,
    navigationFor: (actor: GameCharacter) => NavigationService
) {
    return (actor: GameCharacter, message: TheftClientMessage, now: number) =>
        theft.handle(actor, message, {
            adventure,
            characters: characters.values(),
            navigation: navigationFor(actor),
            now,
        })
}
