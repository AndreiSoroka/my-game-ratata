import type { GameRoom } from '../game/room'
import type { NpcAiDiagnostics } from './diagnostics'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
import type { NpcAiConfig, NpcAiEvent, NpcReplyIssue } from './types'
export function failNpcTurn(
    session: Pick<
        NpcAiSessionActions,
        'release' | 'finishWithNotice' | 'dialogue'
    >,
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    config: NpcAiConfig,
    state: NpcAiActorState,
    error: string,
    events: NpcAiEvent[],
    now: number
): void {
    if (state.retry >= 1) {
        if (state.dialogue !== undefined) {
            room.social.npcSpeech.fail(state.dialogue, now)
        }
        reportNpcRequestStatus(room, diagnostics, state, 'failed', now, error)
    }
    if (state.dialogue !== undefined) {
        const event = state.dialogue
        diagnostics.record({
            actorId: state.config.actorId,
            taskId: event.id,
            request: event.text,
            category: 'provider_error',
            reason: error,
            at: now,
        })
        state.inbox.unshift(state.dialogue)
        state.dialogue = undefined
        state.retry += 1
        if (state.retry > 1) {
            state.inbox.shift()
            state.retry = 0
            session.dialogue.abortTrade(state, now)
        }
        state.nextAt = now + config.limits.retryDelayMs
        if (state.task === null) {
            session.release(state, now)
        }
        return
    }
    diagnostics.record({
        actorId: state.config.actorId,
        taskId: state.task?.id ?? '',
        request: state.task?.request ?? '',
        category: 'provider_error',
        reason: error,
        at: now,
    })
    state.retry += 1
    session.release(state, now)
    if (state.retry <= 1) {
        state.events = [...events, ...state.events].slice(-16)
        state.nextAt = now + config.limits.retryDelayMs
    } else {
        session.finishWithNotice(
            state,
            'Сейчас не получается обдумать поручение. Попробуй обратиться ко мне позже.',
            now
        )
        state.reviewAt = now + config.limits.reviewIntervalMs
    }
}

export function rejectNpcReply(
    session: Pick<NpcAiSessionActions, 'release' | 'finish'>,
    room: GameRoom,
    diagnostics: NpcAiDiagnostics,
    config: NpcAiConfig,
    state: NpcAiActorState,
    issue: NpcReplyIssue,
    now: number
): void {
    const event = state.dialogue
    const text =
        issue === 'speech_language'
            ? 'Не удалось подготовить ответ на языке разговора.'
            : 'Сейчас не получилось начать поручение.'
    diagnostics.record({
        actorId: state.config.actorId,
        taskId: event?.id ?? state.task?.id ?? '',
        request: event?.text ?? state.task?.request ?? '',
        category: 'action_rejected',
        reason: issue,
        at: now,
    })
    reportNpcRequestStatus(room, diagnostics, state, 'failed', now, text, event)
    if (event === undefined) {
        session.finish(state, now, config.limits.reviewIntervalMs, false)
        return
    }
    room.social.npcSpeech.fail(event, now)
    state.dialogue = undefined
    state.retry = 0
    if (state.task === null) {
        session.release(state, now)
    }
}
