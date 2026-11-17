import { agentSpeech } from '../game/agentSpeech'
import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import type { NpcAiDiagnostics } from './diagnostics'
import { NpcAiDialogue } from './dialogue'
import { reportNpcRequestStatus } from './requestStatus'
import {
    enqueueNpcAiEvent,
    npcAiActorAvailable,
    type NpcAiActorState,
} from './runtimeState'
import { NpcAiExecution } from './sessionExecution'
import { failNpcTurn } from './sessionFailure'
import { publishNpcAiFeedback } from './sessionFeedback'
import { rememberNpcReply, taskSpeech } from './sessionMemory'
import type { NpcAiConfig, NpcAiEvent, NpcAiReply } from './types'

export class NpcAiSessionActions {
    public readonly dialogue: NpcAiDialogue
    private readonly execution: NpcAiExecution
    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly config: NpcAiConfig,
        private readonly diagnostics: NpcAiDiagnostics,
        private readonly id: (kind: string) => string
    ) {
        this.dialogue = new NpcAiDialogue(room, companions, diagnostics)
        this.execution = new NpcAiExecution(
            room,
            companions,
            diagnostics,
            id,
            (state, now, waitMs) => this.finish(state, now, waitMs)
        )
    }

    public applyReply(
        state: NpcAiActorState,
        actor: GameCharacter,
        reply: NpcAiReply,
        now: number
    ): void {
        if (state.token === undefined) {
            return
        }
        if (state.config.mode === 'dialogue_only') {
            reply = {
                ...reply,
                decision: null,
                taskAcceptance: 'none',
                companionOrder: null,
                done: true,
            }
        }
        publishNpcAiFeedback(this, this.diagnostics, state, reply, now)
        const conversational = state.dialogue !== undefined
        if (this.dialogue.respond(state, actor, reply, now)) {
            if (state.task === null) {
                this.release(state, now)
            }
            return
        }
        if (state.task === null) {
            return
        }
        rememberNpcReply(state, reply.memory)
        state.retry = 0
        if (!conversational && reply.speech != null) {
            taskSpeech(this.dialogue, state, reply.speech, now)
        }
        if (reply.decision === null) {
            this.wait(state, reply, now)
            return
        }
        this.execution.execute(state, actor, reply, reply.decision, now)
    }

    private wait(state: NpcAiActorState, reply: NpcAiReply, now: number): void {
        if (reply.done) {
            this.finish(state, now, reply.waitMs)
        } else {
            state.nextAt =
                now + Math.max(1_000, Math.min(300_000, reply.waitMs))
            enqueueNpcAiEvent(state, {
                kind: 'world',
                id: this.id('wait'),
                reason: 'requested_review',
                at: now,
            })
        }
    }

    public failure(
        state: NpcAiActorState,
        error: string,
        events: NpcAiEvent[],
        now: number
    ): void {
        if (state.retry >= 1) {
            reportNpcRequestStatus(
                this.room,
                this.diagnostics,
                state,
                'failed',
                now,
                error
            )
        }
        failNpcTurn(
            this,
            this.diagnostics,
            this.config,
            state,
            error,
            events,
            now
        )
    }

    public say(
        state: NpcAiActorState,
        recipientId: string,
        text: string,
        now: number
    ): void {
        const actor = state.actor
        if (!npcAiActorAvailable(actor)) {
            return
        }
        const decision = { type: 'speak' as const, text, targetId: recipientId }
        const result =
            state.token === undefined
                ? agentSpeech(actor, decision, this.room, now)
                : this.companions.decide(
                      actor,
                      decision,
                      this.room,
                      now,
                      state.token
                  )
        this.room.publishEvents(result.events)
    }

    public finishWithNotice(
        state: NpcAiActorState,
        text: string,
        now: number
    ): void {
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'failed',
            now,
            text
        )
        if (state.task?.requesterId != null) {
            this.say(state, state.task.requesterId, text, now)
        }
        this.finish(state, now, this.config.limits.reviewIntervalMs, false)
    }

    public finish(
        state: NpcAiActorState,
        now: number,
        waitMs: number,
        completed = true
    ): void {
        if (completed) {
            reportNpcRequestStatus(
                this.room,
                this.diagnostics,
                state,
                'completed',
                now
            )
        }
        this.release(state, now)
        state.task = null
        state.events = []
        state.pending = undefined
        state.guide = undefined
        state.reportedDiagnostics.clear()
        state.reviewAt =
            now + Math.max(this.config.limits.reviewIntervalMs, waitMs)
    }

    public cancel(state: NpcAiActorState, now: number): void {
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'cancelled',
            now,
            'Поручение отменено.'
        )
        state.generation += 1
        state.controller?.abort()
        state.ready = undefined
        state.pending = undefined
        state.guide = undefined
        state.task = null
        state.events = []
        state.inbox = []
        state.dialogue = undefined
        state.reportedDiagnostics.clear()
        state.turnControlRevision = undefined
        this.release(state, now)
    }

    public release(state: NpcAiActorState, now: number): void {
        if (
            this.room.social.exchanges.isPaused(state.config.actorId) ||
            state.dialogue !== undefined
        ) {
            return
        }
        if (
            state.config.mode !== 'dialogue_only' &&
            state.actor !== undefined &&
            state.token !== undefined
        ) {
            this.companions.releaseModelControl(
                state.actor,
                state.token,
                this.room,
                now
            )
        }
        state.token = undefined
    }
}
