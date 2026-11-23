import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { peekMemoryForCharacter } from './characterMinds'

/** Retirement closes a living identity, retaining its attributed historical archive. */
export function archiveRoomConversations(
    events: GameEventPayload[],
    characters: Iterable<GameCharacter>,
    archiveTasks: (id: string, now: number) => void,
    now = Date.now()
): void {
    const minds = [...characters].flatMap((actor) => {
        const memory = peekMemoryForCharacter(actor)
        return memory === undefined ? [] : [memory]
    })
    for (const event of events) {
        if (event.kind !== 'permadeath' || event.actorId === undefined) {
            continue
        }
        for (const memory of minds) {
            memory.archivePerson(event.actorId, now)
        }
        archiveTasks(event.actorId, now)
    }
}
