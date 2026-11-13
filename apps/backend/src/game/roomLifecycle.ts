import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import {
    advanceRevive,
    retireCharacter,
    shouldRetireCharacter,
} from './characterLife'
import type { CharacterController } from './controllers'
import { normalizeNickname } from './identity'
import type { RoomSocket } from './roomMessaging'

interface LifeContext {
    characters: Map<string, GameCharacter>
    connections: Map<RoomSocket, string | undefined>
    controllers: Map<string, CharacterController>
    nicknames: Map<string, string>
    now: number
    onEvents: (events: GameEventPayload[]) => void
    abilityContextFor?: (actor: GameCharacter, now: number) => AbilityContext
}

export function advanceRoomLives(context: LifeContext): void {
    const { characters, now, onEvents } = context
    for (const character of characters.values()) {
        if (character.abilities.casting === null) {
            continue
        }
        onEvents(
            advanceRevive(
                character,
                (id) => characters.get(id),
                now,
                undefined,
                context.abilityContextFor?.(character, now)
            )
        )
    }
    for (const character of characters.values()) {
        if (!shouldRetireCharacter(character, now)) {
            continue
        }
        const event = retireCharacter(character)
        onEvents([event])
        for (const [ws, id] of context.connections) {
            if (id !== character.id) {
                continue
            }
            context.connections.set(ws, undefined)
        }
        characters.delete(character.id)
        context.controllers.delete(character.id)
        context.nicknames.delete(normalizeNickname(character.nickname))
    }
}
