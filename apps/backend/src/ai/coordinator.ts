import type {
    CompanionClientMessage,
    CompanionRequest,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { reconcileNpcAction } from './actionResolution'
import { prepareNpcActor } from './actorLifecycle'
import { reviewNpcAiCity } from './cityReview'
import { NpcAiDiagnostics } from './diagnostics'
import { legacyNpcRequest, receiveNpcSpeech } from './dialogueReception'
import {
    npcReplyActivities,
    rememberHeardSpeech,
    rememberVisiblePeople,
} from './memoryObservation'
import { buildNpcAiObservation } from './observation'
import { reportNpcRequestStatus } from './requestStatus'
import {
    canAddressNpcAi,
    createNpcAiState,
    npcAiActorAvailable,
    type NpcAiActorState,
} from './runtimeState'
import { NpcAiScheduler } from './scheduler'
import { NpcAiSessionActions } from './session'
import type { NpcAiConfig, NpcAiProvider } from './types'

/** Model turns run outside the tick; only validated intentions enter simulation. */
export class NpcAiCoordinator {
    private readonly states = new Map<string, NpcAiActorState>()
    private readonly sessions: NpcAiSessionActions
    private readonly scheduler: NpcAiScheduler
    private active = false
    private sequence = 0
    private nextObservation = 0

    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly config: NpcAiConfig,
        provider: NpcAiProvider,
        private readonly clock = Date.now,
        private readonly diagnostics = new NpcAiDiagnostics()
    ) {
        this.sessions = new NpcAiSessionActions(
            room,
            companions,
            config,
            diagnostics,
            (kind) => this.id(kind)
        )
        for (const npc of config.npcs) {
            this.states.set(
                npc.actorId,
                createNpcAiState(npc, room.getCharacter(npc.actorId))
            )
        }
        this.scheduler = new NpcAiScheduler(
            room,
            companions,
            config,
            provider,
            clock,
            diagnostics,
            this.sessions,
            this.states,
            () => this.active,
            (kind) => this.id(kind)
        )
    }

    public start(): void {
        this.active = this.config.enabled
    }

    public stop(): void {
        this.active = false
        for (const state of this.states.values()) {
            this.sessions.cancel(state, this.clock())
        }
        this.scheduler.stop()
    }

    public talk(
        requester: GameCharacter,
        message: CompanionClientMessage,
        now: number
    ): boolean {
        const state = this.states.get(message.targetId)
        const actor = this.room.getCharacter(message.targetId)
        const text = message.text?.trim()
        if (
            !this.active ||
            state === undefined ||
            text === undefined ||
            text.length === 0
        ) {
            return false
        }
        if (!canAddressNpcAi(this.room, requester, actor, now)) {
            return false
        }
        this.hear(
            requester,
            legacyNpcRequest(requester, text, this.id('request'), now),
            actor.id
        )
        return true
    }

    public configured(id: string): boolean {
        return this.config.enabled && this.states.has(id)
    }

    public canControl(id: string, now: number): boolean {
        const state = this.states.get(id)
        return (
            state?.actor !== undefined &&
            state.token !== undefined &&
            state.config.mode !== 'dialogue_only' &&
            this.companions.isModelControlOwner(state.actor, state.token, now)
        )
    }

    public withdraw(
        requester: GameCharacter,
        targetId: string,
        now: number
    ): boolean {
        const state = this.states.get(targetId)
        const actor = this.room.getCharacter(targetId)
        if (
            actor?.soul.companion?.leaderId !== requester.id ||
            state === undefined
        ) {
            return false
        }
        this.sessions.cancel(state, now)
        return this.companions.releaseAssistance(requester.id, actor)
    }

    public hear(
        requester: GameCharacter,
        event: Extract<import('./types').NpcAiEvent, { kind: 'message' }>,
        targetId?: string
    ): void {
        rememberHeardSpeech(this.room, this.states, requester, event, targetId)
        receiveNpcSpeech(
            this.room,
            this.states,
            requester,
            event,
            targetId,
            this.active,
            { room: this.room, diagnostics: this.diagnostics }
        )
        this.scheduler.schedule()
    }

    public dismiss(
        requester: GameCharacter,
        targetId: string,
        now: number,
        request: CompanionRequest = 'dismiss'
    ): void {
        const state = this.states.get(targetId)
        if (
            state?.task?.requesterId !== requester.id ||
            !canAddressNpcAi(this.room, requester, state.actor, now)
        ) {
            return
        }
        const capabilities = this.companions.capabilities(state.actor)
        if (
            (request === 'follow' && !capabilities.canFollow) ||
            (request === 'help' && !capabilities.canFight)
        ) {
            return
        }
        this.sessions.cancel(state, now)
    }

    public replyActivities() {
        return npcReplyActivities(this.states.values())
    }

    public beforeTick(now: number): void {
        if (!this.active) {
            return
        }
        for (const state of this.states.values()) {
            const actor = prepareNpcActor(
                this.room,
                this.companions,
                this.sessions,
                state,
                now
            )
            if (actor === undefined) {
                continue
            }
            if (state.pending !== undefined) {
                const point =
                    snapshotCharacterRoute(actor)?.route?.points.at(
                        -1
                    )?.position
                if (point !== undefined) {
                    state.pending.destination = { ...point }
                }
            }
            const ready = state.ready
            state.ready = undefined
            if (ready === undefined) {
                continue
            }
            this.applyReady(state, actor, ready, now)
        }
    }

    private applyReady(
        state: NpcAiActorState,
        actor: GameCharacter,
        ready: NonNullable<NpcAiActorState['ready']>,
        now: number
    ): void {
        if (
            state.turnControlRevision !== undefined &&
            state.turnControlRevision !== this.companions.controlRevision(actor)
        ) {
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
            return
        }
        if ('error' in ready) {
            this.sessions.failure(state, ready.error, ready.events, now)
        } else {
            this.sessions.applyReply(state, actor, ready.reply, now)
        }
    }

    public afterTick(now: number): void {
        if (!this.active) {
            return
        }
        const observe = now >= this.nextObservation
        if (observe) {
            this.nextObservation = now + 250
        }
        for (const state of this.states.values()) {
            if (!npcAiActorAvailable(state.actor)) {
                continue
            }
            if (observe) {
                const observation = buildNpcAiObservation(
                    this.room,
                    state.actor,
                    state.config.role,
                    now
                )
                rememberVisiblePeople(
                    state,
                    observation.targets,
                    observation.locationId,
                    now
                )
            }
            reconcileNpcAction(
                this.room,
                this.companions,
                this.sessions,
                this.diagnostics,
                state,
                state.actor,
                now
            )
            if (
                state.config.role === 'city_coordinator' &&
                now >= state.inspectAt
            ) {
                reviewNpcAiCity(
                    state,
                    state.actor,
                    now,
                    this.room,
                    this.config.limits.reviewIntervalMs,
                    (kind) => this.id(kind)
                )
            }
        }
        this.scheduler.schedule()
    }

    private id(kind: string): string {
        return `npc-ai:${kind}:${String(++this.sequence)}`
    }
}
