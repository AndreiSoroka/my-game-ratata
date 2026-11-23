import type { AgentDecisionResult } from '../game/agentDecisions'
import { agentSpeech } from '../game/agentSpeech'
import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { NpcAiDiagnostics } from './diagnostics'
import { replySpeech } from './dialogueResult'
import { replySpeechLanguage } from './npcSpeechLanguage'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import {
    applyNpcSelfDecision,
    isNpcSelfDecision,
    type NpcSelfDecision,
} from './selfDecisions'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>

export function commitNpcSelfDecision(
    room: GameRoom,
    companions: CompanionService,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: NpcSelfDecision,
    id: string,
    now: number,
    heard?: Heard
): AgentDecisionResult {
    const result = applyNpcSelfDecision(
        room,
        companions,
        state,
        actor,
        decision,
        id,
        now,
        heard
    )
    room.publishEvents(result.events)
    diagnostics.record({
        actorId: actor.id,
        taskId: heard?.id ?? state.task?.id ?? id,
        request: heard?.text ?? state.task?.request ?? '',
        category: selfDecisionCategory(decision, result.accepted),
        action: decision,
        receiptId: id,
        reason: result.error ?? decision.type,
        at: now,
    })
    if (result.accepted && decision.type === 'travel_to') {
        beginTravelTask(room, diagnostics, state, id, now, heard)
    }
    return result
}

function selfDecisionCategory(decision: NpcSelfDecision, accepted: boolean) {
    return accepted
        ? decision.type === 'travel_to'
            ? 'action_started'
            : 'action_completed'
        : 'action_rejected'
}

export function applyNpcBackgroundSelfDecision(
    room: GameRoom,
    companions: CompanionService,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    id: (kind: string) => string,
    now: number,
    finish: (accepted: boolean) => void
): boolean {
    const decision = reply.decision
    if (!isNpcSelfDecision(decision)) {
        return false
    }
    const result = commitNpcSelfDecision(
        room,
        companions,
        diagnostics,
        state,
        actor,
        decision,
        id('self-action'),
        now
    )
    if (result.accepted) {
        speakNpcFollowInitiative(room, state, actor, decision, reply, now)
    }
    if (!result.accepted || decision.type !== 'travel_to') {
        finish(result.accepted)
    }
    return true
}

function speakNpcFollowInitiative(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: NpcSelfDecision,
    reply: NpcAiReply,
    now: number
): void {
    if (
        decision.type !== 'propose_follow' &&
        decision.type !== 'start_following'
    ) {
        return
    }
    const text = replySpeech(reply)
    if (text !== null) {
        const result = agentSpeech(
            actor,
            { type: 'speak', text, targetId: decision.targetId },
            room,
            now
        )
        const language = replySpeechLanguage(room, state, reply, now)
        room.publishEvents(
            result.events.map((event) => ({ ...event, language }))
        )
    }
}

export function reportDialogueSelfDecision(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    event: Heard,
    decision: NpcSelfDecision,
    result: AgentDecisionResult,
    now: number
): void {
    if (!result.accepted) {
        room.social.npcSpeech.fail(event, now)
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            'failed',
            now,
            result.error ?? undefined,
            event
        )
    } else if (decision.type !== 'travel_to') {
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            'completed',
            now,
            undefined,
            event
        )
    }
}

function beginTravelTask(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    id: string,
    now: number,
    heard: Heard | undefined
): void {
    if (state.task?.requesterId != null) {
        reportNpcRequestStatus(room, diagnostics, state, 'cancelled', now)
    }
    if (heard !== undefined && state.travelRequest?.id !== heard.id) {
        finishNpcTravelStatus(room, diagnostics, state, 'cancelled', now)
        state.travelRequest = heard
    }
    state.task = {
        id,
        requesterId: null,
        request: 'Самостоятельный путь.',
        steps: 1,
    }
    state.pending = undefined
    state.attack = undefined
    state.events = []
    if (heard !== undefined) {
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            'started',
            now,
            undefined,
            heard
        )
    }
}

export function finishNpcTravelStatus(
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    status: 'completed' | 'failed' | 'cancelled',
    now: number,
    reason?: string
): void {
    const heard = state.travelRequest
    if (heard !== undefined) {
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            status,
            now,
            reason,
            heard
        )
        state.travelRequest = undefined
    }
}
