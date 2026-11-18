import type { NpcAiDiagnostics } from './diagnostics'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
import type { NpcAiConfig, NpcAiEvent } from './types'
export function failNpcTurn(
    session: Pick<
        NpcAiSessionActions,
        'release' | 'finishWithNotice' | 'dialogue'
    >,
    diagnostics: NpcAiDiagnostics,
    config: NpcAiConfig,
    state: NpcAiActorState,
    error: string,
    events: NpcAiEvent[],
    now: number
): void {
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
