import type {
    CharacterControlCommand,
    ClientMessage,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { cancelCharacterControl, setCharacterControl } from './characterControl'
import type { GameRoom } from './room'
export function handleRoomControl(
    actor: GameCharacter,
    message: ClientMessage,
    room: GameRoom,
    now: number
): boolean {
    if (
        message.type === 'auto_action' ||
        message.type === 'auto_attack' ||
        message.type === 'follow' ||
        message.type === 'cancel_control'
    ) {
        if (!setCharacterControl(actor, message, room, now)) {
            room.publishEvents([
                {
                    kind: 'notice',
                    actorId: actor.id,
                    text: 'Цель недоступна для этого действия.',
                },
            ])
        }
        return true
    }
    if (
        [
            'dash',
            'interact',
            'pray',
            'revive',
            'cast_spell',
            'use_ability',
        ].includes(message.type)
    ) {
        cancelCharacterControl(actor)
    }
    return false
}
export function controlIntent(
    actor: GameCharacter,
    message: CharacterControlCommand,
    room: GameRoom,
    now: number
): boolean {
    return setCharacterControl(actor, message, room, now)
}
