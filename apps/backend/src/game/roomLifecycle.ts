import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import {
    advanceRevive,
    canAbandonLife,
    retireCharacter,
    shouldRetireCharacter,
} from './characterLife'
import { setCharacterControlSource } from './characterSoul'
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
    delayRetirement?: (character: GameCharacter, now: number) => boolean
    afterRevival?: () => void
    abilityContextFor?: (actor: GameCharacter, now: number) => AbilityContext
    beforeRetire?: (
        character: GameCharacter,
        now: number,
        abandoned: boolean
    ) => (() => void) | undefined
}

export function advanceRoomLives(context: LifeContext): void {
    const { characters, now, onEvents } = context
    for (const character of characters.values()) {
        if (character.abilities.casting === null) {
            continue
        }
        const events = advanceRevive(
            character,
            (id) => characters.get(id),
            now,
            undefined,
            context.abilityContextFor?.(character, now)
        )
        if (events.some(({ kind }) => kind === 'revive')) {
            context.afterRevival?.()
        }
        onEvents(events)
    }
    for (const character of characters.values()) {
        if (context.delayRetirement?.(character, now) !== true) {
            finalizeRoomLife(context, character)
        }
    }
}

export function finalizeRoomLife(
    context: LifeContext,
    character: GameCharacter,
    abandoned = false
): boolean {
    if (
        context.characters.get(character.id) !== character ||
        !(abandoned
            ? canAbandonLife(character)
            : shouldRetireCharacter(character, context.now))
    ) {
        return false
    }
    const afterRetire = context.beforeRetire?.(
        character,
        context.now,
        abandoned
    )
    const event = retireCharacter(character)
    afterRetire?.()
    context.onEvents([event])
    character.connected = false
    setCharacterControlSource(character, 'script')
    for (const [ws, id] of context.connections) {
        if (id === character.id) {
            context.connections.set(ws, undefined)
        }
    }
    context.characters.delete(character.id)
    context.controllers.delete(character.id)
    const nickname = normalizeNickname(character.nickname)
    if (context.nicknames.get(nickname) === character.id) {
        context.nicknames.delete(nickname)
    }
    return true
}
