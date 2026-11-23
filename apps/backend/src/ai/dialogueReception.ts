import {
    detectSpeechLanguage,
    type SpeechFocus,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { afterNpcSpokenName } from '../game/npcSpeechNames'
import type { GameRoom } from '../game/room'
import { canHearSpeech } from '../game/socialSpeech'
import type { NpcAiDiagnostics } from './diagnostics'
import { rememberNpcAddressedSpeech } from './memoryObservation'
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
            (targetId === undefined || state.actor.id === targetId) &&
            (state.config.mode !== 'dialogue_only' ||
                (state.actor.id === targetId &&
                    (event.system !== true ||
                        event.conversationId !== undefined))) &&
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
        targetId === undefined
            ? named
            : candidates.find((state) => state.actor?.id === targetId)
    const companion = candidates.find(
        (state) => state.actor?.soul.companion?.leaderId === requester.id
    )
    if (selected !== undefined) {
        return [selected]
    }
    return companion === undefined ? candidates : [companion]
}
function namedAtStart(state: NpcAiActorState, text: string): boolean {
    return afterSpokenName(state, text) !== undefined
}

export function heardSpeechLanguage(
    text: string,
    states: Iterable<NpcAiActorState>
) {
    for (const state of states) {
        const remainder = afterSpokenName(state, text)
        if (remainder !== undefined) {
            return detectSpeechLanguage(remainder)
        }
    }
    return detectSpeechLanguage(text)
}

function afterSpokenName(
    state: NpcAiActorState,
    text: string
): string | undefined {
    return afterNpcSpokenName(
        state.config.actorId,
        state.actor?.nickname ?? '',
        text
    )
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
    if (
        state.awaitingFreshRequest &&
        event.system === true &&
        event.conversationId === undefined
    ) {
        return
    }
    if (event.system !== true || event.conversationId !== undefined) {
        state.awaitingFreshRequest = false
    }
    const heard = heardSpeechFor(state, event, ambiguous, status)
    if (replacePendingSpeech(state, heard)) {
        return
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
function heardSpeechFor(
    state: NpcAiActorState,
    event: Heard,
    ambiguous: boolean,
    status?: ReceptionStatus
): Heard {
    const heard: Heard = { ...event, ambiguous: event.ambiguous ?? ambiguous }
    rememberNpcAddressedSpeech(state, heard)
    if (state.actor !== undefined) {
        heard.actorPosition = { ...state.actor.position }
        heard.actorLocationId = state.actor.locationId
    }
    delete heard.focus
    const focus = visibleFocus(state, event, status)
    if (focus !== undefined) {
        heard.focus = focus
    }
    return status !== undefined &&
        state.actor !== undefined &&
        heard.socialReaction === undefined
        ? status.room.social.society.observeDialogue(state.actor, heard)
        : heard
}

function replacePendingSpeech(state: NpcAiActorState, heard: Heard): boolean {
    if (heard.conversationId !== undefined) {
        const replaceAt = state.inbox.findIndex(
            (item) =>
                item.conversationId !== undefined &&
                item.senderId === heard.senderId
        )
        if (replaceAt !== -1) {
            state.inbox.splice(replaceAt, 1, heard)
            state.nextAt = heard.at
            return true
        }
    }
    return false
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
        status.room.social.npcSpeech.fail(dropped, now)
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
