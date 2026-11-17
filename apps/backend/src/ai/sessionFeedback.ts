import type { NpcAiDiagnostics } from './diagnostics'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
import type { NpcAiReply } from './types'
import type { NpcAiDiagnostic } from './types'

/** A report is model evidence; only the separate action receipt proves an outcome. */
export function recordNpcAiFeedback(
    state: NpcAiActorState,
    log: NpcAiDiagnostics,
    feedback: NpcAiDiagnostic[],
    at: number
): string | undefined {
    const task =
        state.dialogue === undefined
            ? state.task
            : { id: state.dialogue.id, request: state.dialogue.text }
    if (task === null) {
        return undefined
    }
    let comment: string | undefined
    for (const diagnostic of feedback) {
        log.record({
            actorId: state.config.actorId,
            taskId: task.id,
            request: task.request,
            category: 'model_feedback',
            diagnostic,
            at,
        })
        const key = `${diagnostic.kind}:${diagnostic.capability}:${diagnostic.detail}`
        if (!state.reportedDiagnostics.has(key)) {
            state.reportedDiagnostics.add(key)
            comment ??=
                diagnostic.detail.length <= 160
                    ? diagnostic.detail
                    : `${diagnostic.detail.slice(0, 159)}…`
        }
    }
    return comment
}
export function publishNpcAiFeedback(
    _session: Pick<NpcAiSessionActions, 'say' | 'dialogue'>,
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    reply: NpcAiReply,
    now: number
): void {
    recordNpcAiFeedback(state, diagnostics, reply.diagnostics ?? [], now)
}
