import {
    COMPANION_REQUEST_RANGE,
    type GameEventPayload,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CompanionRuntime } from './companionMovement'
import { distance } from './math'
import { createSpeechEvent } from './speechReceipts'

export function canRequest(
    actor: GameCharacter,
    npc: GameCharacter | undefined
): npc is GameCharacter {
    return (
        npc !== undefined &&
        actor.id !== npc.id &&
        actor.alive &&
        (actor.controllerKind !== 'network_player' || actor.connected) &&
        npc.alive &&
        !actor.tags.has('offline') &&
        !npc.tags.has('offline') &&
        !npc.tags.has('state.retired') &&
        actor.faction === npc.faction &&
        actor.locationId === npc.locationId &&
        distance(actor.position, npc.position) <= COMPANION_REQUEST_RANGE
    )
}

export function availableLeader(
    leader: GameCharacter | undefined
): leader is GameCharacter {
    return (
        leader !== undefined &&
        leader.alive &&
        !leader.tags.has('offline') &&
        !leader.tags.has('state.retired')
    )
}

export function release(
    character: GameCharacter,
    state: CompanionRuntime
): void {
    state.leaderId = null
    delete state.leaderDeathSequence
    delete state.regionalLeg
    state.order = 'idle'
    state.waitMode = undefined
    state.waitDeparted = false
    delete state.waitResumeOrder
    delete state.waitResumeLeaderId
    state.controlRevision = (state.controlRevision ?? 0) + 1
    character.setMoveInput({ x: 0, y: 0 })
    character.clearPath()
    sync(character, state)
}

export function sync(character: GameCharacter, state: CompanionRuntime): void {
    character.soul.companion = {
        canFight: state.profile.canFight,
        lastReply: state.lastReply,
        leaderId: state.leaderId,
        order: state.order,
        controlRevision: state.controlRevision ?? 0,
        ...(state.waitMode === undefined ? {} : { waitMode: state.waitMode }),
    }
}

export function notice(actor: GameCharacter, text: string): GameEventPayload[] {
    return [{ actorId: actor.id, kind: 'notice', text }]
}

export function replyToCompanion(
    npc: GameCharacter,
    actor: GameCharacter | undefined,
    state: CompanionRuntime,
    text: string
): GameEventPayload[] {
    state.lastReply = text
    sync(npc, state)
    return npc.soul.canSpeak
        ? [
              createSpeechEvent(
                  npc,
                  text,
                  actor === undefined
                      ? {}
                      : { targetId: actor.id, audienceIds: [actor.id] }
              ),
          ]
        : []
}
