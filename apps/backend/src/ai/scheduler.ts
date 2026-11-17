import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { NpcAiDiagnostics } from './diagnostics'
import { npcDialogueContext } from './dialogueContext'
import { reportNpcRequestStatus } from './requestStatus'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'
import { invokeNpcAiTurn } from './turn'
import type { NpcAiConfig, NpcAiProvider } from './types'

export class NpcAiScheduler {
    private readonly calls: number[] = []
    private readonly backgroundCalls: number[] = []
    private busy = false
    private scheduled = false

    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly config: NpcAiConfig,
        private readonly provider: NpcAiProvider,
        private readonly clock: () => number,
        private readonly diagnostics: NpcAiDiagnostics,
        private readonly sessions: NpcAiSessionActions,
        private readonly states: Map<string, NpcAiActorState>,
        private readonly current: () => boolean,
        private readonly nextId: (kind: string) => string
    ) {}

    public schedule(): void {
        if (this.scheduled || this.busy || !this.current()) {
            return
        }
        this.scheduled = true
        queueMicrotask(() => {
            this.scheduled = false
            if (!this.current() || this.busy) {
                return
            }
            const now = this.clock()
            const states = [...this.states.values()].filter(
                (state) =>
                    ((state.task !== null &&
                        state.events.length > 0 &&
                        state.guide === undefined &&
                        state.pending === undefined) ||
                        state.inbox.length > 0) &&
                    state.ready === undefined &&
                    state.controller === undefined &&
                    state.nextAt <= now &&
                    !state.awaitingFreshRequest &&
                    npcAiActorAvailable(state.actor)
            )
            states.sort(
                (a, b) =>
                    Number(b.inbox.length > 0 || b.task?.requesterId != null) -
                    Number(a.inbox.length > 0 || a.task?.requesterId != null)
            )
            const state = states[0]
            if (state !== undefined) {
                this.begin(state, now)
            }
        })
    }

    private begin(state: NpcAiActorState, now: number): void {
        if (!npcAiActorAvailable(state.actor)) {
            return
        }
        if (!this.withinLimits(state, now)) {
            return
        }
        if (state.token === undefined) {
            const token = this.nextId(`lease-${String(++state.generation)}`)
            if (
                !this.companions.claimModelControl(
                    state.actor,
                    token,
                    now,
                    false
                )
            ) {
                state.nextAt = now + 1_000
                return
            }
            state.token = token
        }
        state.dialogue = state.inbox.shift()
        state.controlRevision = this.companions.controlRevision(state.actor)
        state.turnControlRevision = state.controlRevision
        if (state.dialogue === undefined && state.task !== null) {
            state.task.steps += 1
        }
        const context = npcDialogueContext(
            this.room,
            this.sessions.dialogue,
            state,
            state.actor,
            now
        )
        this.busy = true
        this.calls.push(now)
        if (state.dialogue === undefined && state.task?.requesterId == null) {
            this.backgroundCalls.push(now)
        }
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'thinking',
            now
        )
        void invokeNpcAiTurn(state, context, this.provider, () =>
            this.current()
        ).finally(() => {
            this.busy = false
            this.schedule()
        })
    }

    private withinLimits(state: NpcAiActorState, now: number): boolean {
        this.trimCalls(now)
        if (!this.withinCallBudget(state, now)) {
            return false
        }
        if (
            state.inbox.length === 0 &&
            (state.task?.steps ?? 0) >= this.config.limits.maxDecisionsPerTask
        ) {
            this.recordLimit(state, 'decision_limit', now)
            this.sessions.finishWithNotice(
                state,
                'Не получилось закончить поручение за отведённое время.',
                now
            )
            return false
        }
        return true
    }

    private trimCalls(now: number): void {
        while (
            this.calls[0] !== undefined &&
            this.calls[0] <= now - 3_600_000
        ) {
            this.calls.shift()
        }
        while (
            this.backgroundCalls[0] !== undefined &&
            this.backgroundCalls[0] <= now - 3_600_000
        ) {
            this.backgroundCalls.shift()
        }
    }

    private withinCallBudget(state: NpcAiActorState, now: number): boolean {
        const background =
            state.inbox.length === 0 && state.task?.requesterId == null
        if (
            background &&
            this.backgroundCalls.length >=
                Math.floor((this.config.limits.maxCallsPerHour * 2) / 3)
        ) {
            this.recordLimit(state, 'background_call_limit', now)
            this.sessions.finish(state, now, 3_600_000)
            state.nextAt = (this.backgroundCalls[0] ?? now) + 3_600_000
            state.reviewAt = state.nextAt
            return false
        }
        if (this.calls.length >= this.config.limits.maxCallsPerHour) {
            this.recordLimit(state, 'hourly_call_limit', now)
            for (const message of state.inbox) {
                reportNpcRequestStatus(
                    this.room,
                    this.diagnostics,
                    state,
                    'failed',
                    now,
                    'Лимит размышлений исчерпан. Попробуй позже.',
                    message
                )
            }
            state.inbox = []
            this.sessions.finishWithNotice(
                state,
                'Я пока исчерпала время на размышления. Попробуем позже.',
                now
            )
            state.nextAt = (this.calls[0] ?? now) + 3_600_000
            state.reviewAt = state.nextAt
            return false
        }
        return true
    }

    private recordLimit(
        state: NpcAiActorState,
        reason: string,
        at: number
    ): void {
        this.diagnostics.record({
            actorId: state.config.actorId,
            taskId: state.inbox[0]?.id ?? state.task?.id ?? '',
            request: state.inbox[0]?.text ?? state.task?.request ?? '',
            category: 'task_limit',
            reason,
            at,
        })
    }
}
