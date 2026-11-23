import {
    authoredPhrase,
    type CharacterControlCommand,
    type ClientMessage,
    PERSONAL_HOSTILITY_RANGE,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    cancelCharacterControl,
    setCharacterControl,
    snapshotControl,
} from './characterControl'
import { canWitnessCombatant } from './combatWitnesses'
import { available } from './crimeRules'
import { hasDeclaredHostility, setDeclaredHostility } from './personalHostility'
import type { GameRoom } from './room'
export function handleRoomControl(
    actor: GameCharacter,
    message: ClientMessage,
    room: GameRoom,
    now: number
): boolean {
    if (message.type === 'set_personal_hostility') {
        setPersonalHostility(actor, message, room, now)
        return true
    }
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
                    ...authoredPhrase('combat.actionTargetUnavailable'),
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

function setPersonalHostility(
    actor: GameCharacter,
    message: Extract<ClientMessage, { type: 'set_personal_hostility' }>,
    room: GameRoom,
    now: number
): void {
    const target = room.getCharacter(message.targetId)
    if (
        !available(actor) ||
        !available(target) ||
        target === actor ||
        target.trainingTarget !== undefined ||
        !canWitnessCombatant(
            actor,
            target,
            room.navigationFor(actor),
            PERSONAL_HOSTILITY_RANGE,
            now
        )
    ) {
        room.publishEvents([
            {
                kind: 'notice',
                actorId: actor.id,
                audienceIds: [actor.id],
                ...authoredPhrase('combat.actionTargetUnavailable'),
            },
        ])
        return
    }
    if (message.hostile === hasDeclaredHostility(actor, target)) {
        return
    }
    setDeclaredHostility(actor, target, message.hostile)
    if (!message.hostile) {
        const control = snapshotControl(actor)
        if (
            control.targetId === target.id &&
            (control.mode === 'attack' || control.mode === 'action')
        ) {
            cancelCharacterControl(actor)
        }
    }
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
