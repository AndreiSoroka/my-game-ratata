import type { SpeechFocus } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { companionProfiles } from '../game/companionProfiles'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import type { NpcAiDiagnostics } from './diagnostics'
import { buildNpcAiObservation } from './observation'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>
interface ReceptionStatus {
    room: GameRoom
    diagnostics: NpcAiDiagnostics
}
type HearingRoom = Pick<GameRoom, 'navigationFor'>

export function receiveNpcSpeech(
    room: HearingRoom,
    states: Map<string, NpcAiActorState>,
    requester: GameCharacter,
    event: Heard,
    targetId: string | undefined,
    active: boolean,
    status?: ReceptionStatus
): void {
    if (!active || requester.controllerKind !== 'network_player') {
        return
    }
    const candidates = hearingCandidates(
        room,
        states,
        requester,
        event,
        targetId
    )
    const listeners = chooseListeners(candidates, requester, event, targetId)
    for (const state of listeners) {
        queueSpeech(state, event, listeners.length > 1, status)
    }
}

function hearingCandidates(
    room: HearingRoom,
    states: Map<string, NpcAiActorState>,
    requester: GameCharacter,
    event: Heard,
    targetId: string | undefined
): NpcAiActorState[] {
    return [...states.values()].filter(
        (state) =>
            state.actor !== undefined &&
            (event.channel !== 'whisper' || state.actor.id === targetId) &&
            canHearSpeech(
                state.actor,
                requester,
                room.navigationFor(requester),
                event.at,
                event.channel === 'whisper' && event.legacy !== true ? 48 : 80
            )
    )
}
function chooseListeners(
    candidates: NpcAiActorState[],
    requester: GameCharacter,
    event: Heard,
    targetId: string | undefined
): NpcAiActorState[] {
    const named = candidates.find((state) => namedAtStart(state, event.text))
    const selected =
        named ?? candidates.find((state) => state.actor?.id === targetId)
    const companion = candidates.find(
        (state) => state.actor?.soul.companion?.leaderId === requester.id
    )
    if (selected !== undefined) {
        return [selected]
    }
    return companion === undefined ? candidates : [companion]
}
function namedAtStart(state: NpcAiActorState, text: string): boolean {
    const normalized = text.trim().toLocaleLowerCase()
    const names = companionProfiles[state.config.actorId]?.dialogueNames ?? [
        state.actor?.nickname ?? '',
    ]
    return names.some((alias) => {
        const name = alias.trim().toLocaleLowerCase()
        return (
            name.length > 0 &&
            normalized.startsWith(name) &&
            (normalized.length === name.length ||
                /^[\s,!?:.—-]/u.test(
                    normalized.slice(name.length, name.length + 1)
                ))
        )
    })
}
function queueSpeech(
    state: NpcAiActorState,
    event: Heard,
    ambiguous: boolean,
    status?: ReceptionStatus
): void {
    if (
        state.inbox.some((item) => item.id === event.id) ||
        state.dialogue?.id === event.id
    ) {
        return
    }
    if (state.awaitingFreshRequest && event.system === true) {
        return
    }
    if (event.system !== true) {
        state.awaitingFreshRequest = false
    }
    const heard: Heard = { ...event, ambiguous }
    if (state.actor !== undefined) {
        heard.actorPosition = { ...state.actor.position }
        heard.actorLocationId = state.actor.locationId
    }
    delete heard.focus
    const focus = visibleFocus(state, event, status)
    if (focus !== undefined) {
        heard.focus = focus
    }
    if (state.inbox.length >= 8) {
        dropOldest(state, event.at, status)
    }
    state.inbox.push(heard)
    state.nextAt = event.at
    if (status !== undefined) {
        reportNpcRequestStatus(
            status.room,
            status.diagnostics,
            state,
            'heard',
            event.at,
            undefined,
            heard
        )
        reportNpcRequestStatus(
            status.room,
            status.diagnostics,
            state,
            'queued',
            event.at,
            undefined,
            heard
        )
    }
}
function visibleFocus(
    state: NpcAiActorState,
    event: Heard,
    status?: ReceptionStatus
): SpeechFocus | undefined {
    if (
        event.focus === undefined ||
        state.actor === undefined ||
        status === undefined
    ) {
        return undefined
    }
    const focus = buildNpcAiObservation(
        status.room,
        state.actor,
        state.config.role,
        event.at
    ).targets.find((target) => target.key === event.focus?.key)
    return focus === undefined
        ? undefined
        : {
              key: focus.key,
              id: focus.id,
              kind: focus.kind,
              name: focus.name,
              position: focus.position,
              details: focus.details,
          }
}
function dropOldest(
    state: NpcAiActorState,
    now: number,
    status?: ReceptionStatus
): void {
    const dropped = state.inbox.shift()
    if (dropped !== undefined && status !== undefined) {
        reportNpcRequestStatus(
            status.room,
            status.diagnostics,
            state,
            'failed',
            now,
            'Очередь переполнена; сообщение не обработано.',
            dropped
        )
    }
}

export function legacyNpcRequest(
    requester: GameCharacter,
    text: string,
    id: string,
    now: number
): Heard {
    return {
        kind: 'message',
        id,
        senderId: requester.id,
        text,
        locationId: requester.locationId,
        position: { ...requester.position },
        at: now,
        channel: 'whisper',
        legacy: true,
    }
}
