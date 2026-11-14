import type { GameEventPayload, SoulSnapshot } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { CompanionRuntime } from './companionMovement'
import { distance } from './math'
import { createSpeechEvent } from './speechReceipts'

const replyRecipients = new WeakMap<GameCharacter, string>()

/** Reply audience belongs to server state, never the public soul contract. */
export function setCompanionReplyRecipient(
    character: GameCharacter,
    recipientId: string | undefined
): void {
    if (recipientId === undefined) {
        replyRecipients.delete(character)
    } else {
        replyRecipients.set(character, recipientId)
    }
}

export function snapshotCompanionSoul(
    character: GameCharacter | undefined,
    soul: SoulSnapshot,
    viewerId: string | undefined
): SoulSnapshot {
    const recipientId =
        character === undefined ? undefined : replyRecipients.get(character)
    const readable =
        recipientId === undefined ||
        recipientId === viewerId ||
        character?.id === viewerId
    return {
        ...soul,
        companion:
            soul.companion === null
                ? null
                : {
                      ...soul.companion,
                      lastReply: readable ? soul.companion.lastReply : null,
                  },
    }
}

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
        distance(actor.position, npc.position) <= 64
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
    state.order = 'idle'
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
    setCompanionReplyRecipient(npc, actor?.id)
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
