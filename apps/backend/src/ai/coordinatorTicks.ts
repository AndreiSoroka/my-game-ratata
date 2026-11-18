import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { prepareNpcActor } from './actorLifecycle'
import { npcCommandProblem } from './commandValidation'
import type { NpcAiDiagnostics } from './diagnostics'
import { npcSelfActivityInterrupted } from './npcAutonomy'
import { npcGreetingStillAvailable } from './npcInitiative'
import { reportNpcRequestStatus } from './requestStatus'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiSessionActions } from './session'

/** Simulation-owned commit point; the asynchronous turn stays alive until this resolves. */
export class NpcAiTicks {
    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly sessions: NpcAiSessionActions,
        private readonly diagnostics: NpcAiDiagnostics
    ) {}

    public yieldBackground(state: NpcAiActorState, now: number): void {
        if (
            state.controller === undefined ||
            state.dialogue !== undefined ||
            state.task?.requesterId != null
        ) {
            return
        }
        const inbox = state.inbox
        this.sessions.cancel(state, now)
        state.inbox = inbox
        state.idleSince = undefined
    }

    public before(state: NpcAiActorState, now: number): void {
        const actor = prepareNpcActor(
            this.room,
            this.companions,
            this.sessions,
            state,
            now
        )
        if (actor === undefined) {
            return
        }
        this.preemptBackground(state, now)
        if (!this.finalize(state, actor, now)) {
            return
        }
        if (state.pending !== undefined) {
            const point =
                snapshotCharacterRoute(actor)?.route?.points.at(-1)?.position
            if (point !== undefined) {
                state.pending.destination = { ...point }
            }
        }
        const ready = state.ready
        state.ready = undefined
        if (ready !== undefined) {
            this.applyReady(state, actor, ready, now)
        }
    }

    private preemptBackground(state: NpcAiActorState, now: number): void {
        const greetingInterrupted =
            state.task?.background === 'greeting' &&
            !npcGreetingStillAvailable(
                this.room,
                state,
                state.task.targetId ?? '',
                now
            )
        if (
            greetingInterrupted ||
            npcSelfActivityInterrupted(this.room, state, now)
        ) {
            const inbox = state.inbox
            this.sessions.cancel(state, now)
            state.inbox = inbox
            state.idleSince = undefined
        }
    }

    private finalize(
        state: NpcAiActorState,
        actor: GameCharacter,
        now: number
    ): boolean {
        const draft = state.finalizing
        if (draft === undefined) {
            return true
        }
        state.finalizing = undefined
        if (
            this.controlChanged(state, actor) ||
            state.mind.retirementRevision !== draft.retirementRevision
        ) {
            this.cancelChanged(state, now)
            draft.resolve({
                code: 'command_unavailable',
                reason: {
                    code: 'control_changed',
                    detail: 'Управление персонажем изменилось во время ответа.',
                },
            })
            return false
        }
        const problem = npcCommandProblem(
            this.room,
            this.companions,
            state,
            draft.reply,
            now
        )
        if (problem === undefined) {
            this.sessions.applyReply(state, actor, draft.reply, now)
        }
        draft.resolve(problem)
        return true
    }

    private controlChanged(
        state: NpcAiActorState,
        actor: GameCharacter
    ): boolean {
        return (
            state.turnControlRevision !== undefined &&
            state.turnControlRevision !== this.companions.controlRevision(actor)
        )
    }

    private cancelChanged(state: NpcAiActorState, now: number): void {
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'cancelled',
            now,
            'Управление спутником изменилось во время ответа.'
        )
        const inbox = state.inbox
        this.sessions.cancel(state, now)
        state.inbox = inbox
    }

    private applyReady(
        state: NpcAiActorState,
        actor: GameCharacter,
        ready: NonNullable<NpcAiActorState['ready']>,
        now: number
    ): void {
        if (this.controlChanged(state, actor)) {
            this.cancelChanged(state, now)
            return
        }
        if ('invalidReply' in ready) {
            this.sessions.rejectReply(state, ready.invalidReply, now)
        } else if ('error' in ready) {
            this.sessions.failure(state, ready.error, ready.events, now)
        } else {
            this.sessions.applyReply(state, actor, ready.reply, now)
        }
    }
}
