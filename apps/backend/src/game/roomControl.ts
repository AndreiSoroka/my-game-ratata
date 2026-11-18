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
    if (interruptsForestWork(message)) {
        actor.interruptWork?.()
    }
    if (
        [
            'dash',
            'interact',
            'pray',
            'revive',
            'cast_spell',
            'use_ability',
            'gather',
            'plant_tree',
            'farm_action',
            'farm_supply',
            'world_interact',
            'equipment_action',
            'inventory_action',
        ].includes(message.type)
    ) {
        cancelCharacterControl(actor)
    }
    return false
}
function interruptsForestWork(message: ClientMessage): boolean {
    if (message.type === 'move_input') {
        return message.axis.x !== 0 || message.axis.y !== 0
    }
    return !['chat', 'plant_tree_preview', 'join', 'move_to'].includes(
        message.type
    )
}
export function controlIntent(
    actor: GameCharacter,
    message: CharacterControlCommand,
    room: GameRoom,
    now: number
): boolean {
    return setCharacterControl(actor, message, room, now)
}

export function createRoomControlRequester(room: GameRoom) {
    return (
        actor: GameCharacter,
        message: CharacterControlCommand,
        now: number
    ): boolean => controlIntent(actor, message, room, now)
}
