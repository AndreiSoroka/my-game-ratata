import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import { memoryForCharacter } from './characterMinds'
import { addressedSpeechPartner } from './memorySpeechAttribution'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>

/** Hearing records do not start model turns; NPCs can hear each other without a response loop. */
export function rememberHeardSpeech(
    room: Pick<GameRoom, 'navigationFor' | 'getCharacter'>,
    states: ReadonlyMap<string, NpcAiActorState>,
    speaker: GameCharacter,
    event: Heard,
    targetId?: string
): void {
    const actors = memoryParticipants(room, states, speaker, targetId)
    for (const listener of actors.values()) {
        if (
            listener.id !== speaker.id &&
            event.channel === 'whisper' &&
            listener.id !== targetId
        ) {
            continue
        }
        if (
            listener.id !== speaker.id &&
            !canHearSpeech(
                listener,
                speaker,
                room.navigationFor(listener),
                event.at,
                event.channel === 'whisper' ? 48 : 80
            )
        ) {
            continue
        }
        memoryForCharacter(listener).remember({
            id: event.id.replace(/^say:/, 'speech:'),
            senderId: speaker.id,
            senderName: speaker.nickname,
            ...(targetId === undefined ? {} : { recipientId: targetId }),
            text: event.text,
            channel: event.channel ?? 'say',
            source: event.system === true ? 'authoritative' : 'heard',
            at: event.at,
            locationId: event.locationId,
        })
    }
}

export function rememberPublishedSpeech(
    room: Pick<GameRoom, 'navigationFor' | 'getCharacter'>,
    events: GameEventPayload[],
    actors: Iterable<GameCharacter>,
    at: number
): void {
    const listeners = [...actors].filter(
        (actor) => actor.controllerKind !== 'network_player'
    )
    for (const event of events) {
        const speaker = room.getCharacter(event.actorId ?? '')
        if (
            event.kind !== 'chat' ||
            typeof event.text !== 'string' ||
            speaker === undefined ||
            event.speechId === undefined
        ) {
            continue
        }
        const memory = eventMemory(
            event,
            speaker,
            event.text,
            event.speechId,
            at
        )
        for (const listener of listeners) {
            if (remembersEvent(listener, speaker, event, room, at)) {
                memoryForCharacter(listener).remember(memory)
            }
        }
    }
}
function remembersEvent(
    listener: GameCharacter,
    speaker: GameCharacter,
    event: GameEventPayload,
    room: Pick<GameRoom, 'navigationFor'>,
    at: number
): boolean {
    if (listener.id === speaker.id) {
        return true
    }
    if (
        event.audienceIds !== undefined &&
        !event.audienceIds.includes(listener.id)
    ) {
        return false
    }
    if (event.targetId !== undefined && listener.id !== event.targetId) {
        return false
    }
    return canHearSpeech(listener, speaker, room.navigationFor(listener), at)
}
function eventMemory(
    event: GameEventPayload,
    speaker: GameCharacter,
    text: string,
    speechId: number,
    at: number
): import('./characterMemory').MemoryMessage {
    const partnerId = addressedSpeechPartner(event)
    return {
        id: `speech:${speaker.id}:${String(speechId)}`,
        senderId: speaker.id,
        senderName: speaker.nickname,
        ...(event.targetId === undefined
            ? {}
            : { recipientId: event.targetId }),
        ...(partnerId === undefined
            ? {}
            : { conversationPartnerId: partnerId }),
        text,
        channel:
            event.targetId !== undefined || event.audienceIds !== undefined
                ? 'whisper'
                : 'say',
        source: 'heard',
        at,
        locationId: speaker.locationId,
    }
}

/** Called only after resolving an actual addressee; ambient hearing never resets this clock. */
export function rememberNpcAddressedSpeech(
    state: NpcAiActorState,
    event: Heard
): void {
    if (event.system !== true && event.ambiguous !== true) {
        state.mind.recordAddressedSpeech(
            event.id.replace(/^say:/, 'speech:'),
            event.senderId,
            event.at
        )
    }
}

export function rememberVisiblePeople(
    state: NpcAiActorState,
    targets: ReadonlyArray<import('./observationTypes').NpcAiTarget>,
    locationId: string,
    now: number
): void {
    for (const target of targets) {
        if (target.kind === 'character') {
            state.mind.observe(
                target.id,
                target.name,
                target.position,
                locationId,
                now
            )
        }
    }
}

export function npcReplyActivities(states: Iterable<NpcAiActorState>) {
    return [...states].flatMap((state) =>
        [state.dialogue, ...state.inbox].flatMap((event) =>
            event === undefined ||
            event.system === true ||
            event.conversationId !== undefined ||
            state.actor?.alive !== true
                ? []
                : [
                      {
                          actorId: state.config.actorId,
                          senderId: event.senderId,
                          channel: event.channel ?? 'say',
                          id: event.id,
                      },
                  ]
        )
    )
}

function memoryParticipants(
    room: Pick<GameRoom, 'getCharacter'>,
    states: ReadonlyMap<string, NpcAiActorState>,
    speaker: GameCharacter,
    targetId?: string
): Map<string, GameCharacter> {
    const actors = new Map(
        [...states.values()].flatMap((state) =>
            state.actor === undefined ? [] : [[state.actor.id, state.actor]]
        )
    )
    if (speaker.controllerKind !== 'network_player') {
        actors.set(speaker.id, speaker)
    }
    const target = room.getCharacter(targetId ?? '')
    if (target !== undefined && target.controllerKind !== 'network_player') {
        actors.set(target.id, target)
    }
    return actors
}
