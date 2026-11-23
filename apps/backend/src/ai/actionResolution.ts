import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcActionPaused } from './actionPause'
import { npcAiActionReceipt } from './actions'
import { reconcileNpcAiAttack } from './attackResolution'
import type { NpcAiDiagnostics } from './diagnostics'
import { reconcileNpcGuide } from './guide'
import { reportNpcRequestStatus } from './requestStatus'
import { enqueueNpcAiEvent, type NpcAiActorState } from './runtimeState'
import { rememberNpcScouting } from './scouting'
import { finishNpcTravelStatus } from './selfDecisionSession'
import type { NpcAiSessionActions } from './session'
import type { NpcAiEvent } from './types'

type ActionReceipt = Extract<NpcAiEvent, { kind: 'action' }>

export function reconcileNpcAction(
    room: GameRoom,
    companions: CompanionService,
    sessions: NpcAiSessionActions,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): void {
    if (npcActionPaused(state, actor.id, now, room)) {
        return
    }
    if (state.guide !== undefined) {
        reconcileGuideAction(
            room,
            companions,
            sessions,
            diagnostics,
            state,
            now
        )
    } else if (state.attack !== undefined) {
        reconcileAttackAction(room, sessions, diagnostics, state, actor, now)
    } else {
        reconcileRouteAction(
            room,
            companions,
            sessions,
            diagnostics,
            state,
            actor,
            now
        )
    }
}

function reconcileAttackAction(
    room: GameRoom,
    sessions: NpcAiSessionActions,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): void {
    const attack = state.attack
    const result = reconcileNpcAiAttack(state, actor, now)
    if (attack === undefined || result === undefined) {
        return
    }
    state.attack = undefined
    const completed = result.status === 'completed'
    if (state.task !== null) {
        state.task.lastAttackFailed = !completed
    }
    recordActionReceipt(diagnostics, state, actor, result, now)
    if (!completed) {
        reportNpcRequestStatus(room, diagnostics, state, 'failed', now)
    }
    enqueueNpcAiEvent(state, result)
    if (attack.done) {
        sessions.finish(state, now, attack.waitMs, completed)
    }
}

function reconcileRouteAction(
    room: GameRoom,
    companions: CompanionService,
    sessions: NpcAiSessionActions,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): void {
    const pending = state.pending
    if (pending === undefined) {
        return
    }
    const result = npcAiActionReceipt(pending, actor, now)
    if (result?.kind !== 'action') {
        return
    }
    state.pending = undefined
    if (result.status === 'completed') {
        rememberNpcScouting(room, state, actor, result.id, now)
    } else {
        companions.decide(
            actor,
            { type: 'cancel_control' },
            room,
            now,
            state.token
        )
    }
    recordActionReceipt(diagnostics, state, actor, result, now)
    enqueueNpcAiEvent(state, result)
    if (pending.done && result.status === 'completed') {
        sessions.finish(state, now, pending.waitMs)
    }
}

function reconcileGuideAction(
    room: GameRoom,
    companions: CompanionService,
    sessions: NpcAiSessionActions,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    now: number
): void {
    const actor = state.actor
    if (actor === undefined) {
        return
    }
    const result = reconcileNpcGuide(room, companions, state, now)
    if (result?.kind !== 'action') {
        return
    }
    if (result.status !== 'completed') {
        companions.decide(
            actor,
            { type: 'cancel_control' },
            room,
            now,
            state.token
        )
    }
    state.guide = undefined
    state.pending = undefined
    recordActionReceipt(diagnostics, state, actor, result, now)
    if (result.decision.type === 'travel_to') {
        finishSelfTravel(room, sessions, diagnostics, state, actor, result, now)
    } else {
        finishGuidedTrip(room, sessions, diagnostics, state, actor, result, now)
    }
}

function finishSelfTravel(
    room: GameRoom,
    sessions: NpcAiSessionActions,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    result: ActionReceipt,
    now: number
): void {
    const completed = result.status === 'completed'
    if (completed) {
        rememberNpcScouting(room, state, actor, result.id, now)
    }
    finishNpcTravelStatus(
        room,
        diagnostics,
        state,
        completed ? 'completed' : 'failed',
        now,
        completed ? undefined : result.reason
    )
    sessions.finish(state, now, 0, false)
}

function finishGuidedTrip(
    room: GameRoom,
    sessions: NpcAiSessionActions,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    result: ActionReceipt,
    now: number
): void {
    if (result.status !== 'completed') {
        if (terminalGuideFailure(result.reason)) {
            sessions.finishWithNotice(state, result.reason, now)
            return
        }
        reportNpcRequestStatus(
            room,
            diagnostics,
            state,
            'failed',
            now,
            result.reason
        )
    } else if (state.task !== null) {
        state.task.concluding = true
        rememberNpcScouting(room, state, actor, result.id, now)
    }
    enqueueNpcAiEvent(state, result)
}

function recordActionReceipt(
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    actor: GameCharacter,
    result: ActionReceipt,
    now: number
): void {
    diagnostics.record({
        actorId: actor.id,
        taskId: state.task?.id ?? '',
        request: state.task?.request ?? '',
        category:
            result.status === 'completed'
                ? 'action_completed'
                : 'action_failed',
        action: result.decision,
        reason: result.reason,
        receiptId: result.id,
        at: now,
    })
}

function terminalGuideFailure(reason: string): boolean {
    return (
        reason === 'Собеседник не вернулся к проводнику.' ||
        reason ===
            'Сопровождение прервано: истекло время или изменилась локация.'
    )
}
