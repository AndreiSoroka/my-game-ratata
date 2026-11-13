import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    advanceRevive,
    beginRevive,
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
}

export function advanceRoomLives(context: LifeContext): void {
    const { characters, now, onEvents } = context
    for (const character of characters.values()) {
        if (
            character.controllerKind === 'scripted' &&
            character.heroClass === 'cleric'
        ) {
            const target = [...characters.values()].find(
                (candidate) =>
                    !candidate.alive &&
                    candidate.mortal &&
                    candidate.reviveUntil > now &&
                    candidate.faction === character.faction &&
                    candidate.locationId === character.locationId &&
                    Math.hypot(
                        candidate.position.x - character.position.x,
                        candidate.position.y - character.position.y
                    ) <= 48
            )
            if (target !== undefined) {
                beginRevive(character, target, now)
            }
        }
        onEvents(advanceRevive(character, (id) => characters.get(id), now))
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
