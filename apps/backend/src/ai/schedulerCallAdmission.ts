import type { GameRoom } from '../game/room'
import type { NpcAiCallBudget } from './callBudget'
import type { NpcAiDiagnostics } from './diagnostics'
import { reportNpcRequestStatus } from './requestStatus'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import { npcAiMessageAvailable } from './schedulerPolicy'
import type { NpcAiSessionActions } from './session'
import type { NpcAiEvent } from './types'

type Message = Extract<NpcAiEvent, { kind: 'message' }>

interface MinuteWait {
    state: NpcAiActorState
    until: number
}

const maxMinuteWaitMs = 10_000
const minReplyTimeMs = 10_000
const callLimitMessage = 'Лимит размышлений исчерпан. Попробуй позже.'

/** Applies quota delays to the existing inbox and task queue using real time. */
export class NpcAiCallAdmission {
    private readonly minuteWaits = new Map<Message, MinuteWait>()

    public constructor(
        private readonly room: GameRoom,
        private readonly budget: NpcAiCallBudget,
        private readonly sessions: NpcAiSessionActions,
        private readonly diagnostics: NpcAiDiagnostics
    ) {}

    public allows(state: NpcAiActorState, wall: number, now: number): boolean {
        const background =
            state.inbox.length === 0 && state.task?.requesterId == null
        const limit = this.budget.limit(wall, background)
        if (limit === undefined) {
            return true
        }
        state.budgetUntil = limit.until
        if (state.inbox.length === 0) {
            recordNpcTaskLimit(this.diagnostics, state, limit.reason, now)
            if (
                !background &&
                this.budget.longLimit(wall, false) !== undefined
            ) {
                this.sessions.finishWithNotice(
                    state,
                    'Я пока исчерпала время на размышления. Попробуем позже.',
                    now
                )
            }
        }
        return false
    }

    public reviewInboxes(
        states: Iterable<NpcAiActorState>,
        wall: number,
        now: number
    ): void {
        this.expire(wall, now)
        const limit = this.budget.limit(wall, false)
        if (limit === undefined) {
            return
        }
        const longLimit = this.budget.longLimit(wall, false)
        for (const state of states) {
            const actor = state.actor
            if (state.inbox.length === 0 || !npcAiActorAvailable(actor)) {
                continue
            }
            state.inbox = state.inbox.filter((message) =>
                npcAiMessageAvailable(this.room, actor, message, now)
            )
            if (state.inbox.length === 0) {
                continue
            }
            recordNpcTaskLimit(
                this.diagnostics,
                state,
                longLimit?.reason ?? limit.reason,
                now
            )
            if (longLimit === undefined) {
                this.deferInbox(state, wall, limit.until, now)
            } else {
                for (const message of state.inbox) {
                    this.fail(state, message, now)
                }
                state.inbox = []
            }
        }
    }

    private deferInbox(
        state: NpcAiActorState,
        wall: number,
        opensAt: number,
        now: number
    ): void {
        state.inbox = state.inbox.filter((message) => {
            const until =
                this.minuteWaits.get(message)?.until ??
                Math.min(
                    wall + maxMinuteWaitMs,
                    (message.replyDeadline ?? wall) - minReplyTimeMs
                )
            if (opensAt <= until) {
                this.minuteWaits.set(message, { state, until })
                return true
            }
            this.fail(state, message, now)
            return false
        })
    }

    private expire(wall: number, now: number): void {
        for (const [message, { state, until }] of this.minuteWaits) {
            if (wall <= until) {
                continue
            }
            this.minuteWaits.delete(message)
            if (!state.inbox.includes(message)) {
                continue
            }
            state.inbox = state.inbox.filter((pending) => pending !== message)
            const actor = state.actor
            if (
                npcAiActorAvailable(actor) &&
                npcAiMessageAvailable(this.room, actor, message, now)
            ) {
                this.fail(state, message, now)
            }
        }
    }

    public clear(): void {
        this.minuteWaits.clear()
    }

    public started(message: Message | undefined): void {
        if (message !== undefined) {
            this.minuteWaits.delete(message)
        }
    }

    private fail(state: NpcAiActorState, message: Message, now: number): void {
        this.minuteWaits.delete(message)
        this.room.social.npcSpeech.fail(message, now)
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'failed',
            now,
            callLimitMessage,
            message
        )
    }
}

export function recordNpcTaskLimit(
    diagnostics: NpcAiDiagnostics,
    state: NpcAiActorState,
    reason: string,
    at: number
): void {
    diagnostics.record({
        actorId: state.config.actorId,
        taskId: state.inbox[0]?.id ?? state.task?.id ?? '',
        request: state.inbox[0]?.text ?? state.task?.request ?? '',
        category: 'task_limit',
        reason,
        at,
    })
}
