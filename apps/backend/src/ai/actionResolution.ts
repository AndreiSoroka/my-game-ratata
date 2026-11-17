import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcActionPaused } from './actionPause'
import { npcAiActionReceipt } from './actions'
import type { NpcAiDiagnostics } from './diagnostics'
import { reconcileNpcGuide } from './guide'
import { reportNpcRequestStatus } from './requestStatus'
import { enqueueNpcAiEvent, type NpcAiActorState } from './runtimeState'
import { rememberNpcScouting } from './scouting'
import type { NpcAiSessionActions } from './session'

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
        return
    }
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
    const task = state.task ?? { id: '', request: '' }
    diagnostics.record({
        actorId: actor.id,
        taskId: task.id,
        request: task.request,
        category:
            result.status === 'completed'
                ? 'action_completed'
                : 'action_failed',
        action: pending.decision,
        reason: result.reason,
        receiptId: result.id,
        at: now,
    })
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
    if (result?.kind === 'action') {
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
        } else {
            completeGuide(room, state, actor, result.id, now)
        }
        enqueueNpcAiEvent(state, result)
    }
}

function completeGuide(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    receiptId: string,
    now: number
): void {
    if (state.task !== null) {
        state.task.concluding = true
        rememberNpcScouting(room, state, actor, receiptId, now)
    }
}

function terminalGuideFailure(reason: string): boolean {
    return (
        reason === 'Собеседник не вернулся к проводнику.' ||
        reason ===
            'Сопровождение прервано: истекло время или изменилась локация.'
    )
}
