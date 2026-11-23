import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { reconcileNpcAction } from './actionResolution'
import { reviewNpcAiCity } from './cityReview'
import { rememberAndGreet } from './coordinatorSocial'
import { NpcAiTicks } from './coordinatorTicks'
import { NpcAiDiagnostics } from './diagnostics'
import { heardSpeechLanguage, receiveNpcSpeech } from './dialogueReception'
import { npcReplyActivities, rememberHeardSpeech } from './memoryObservation'
import { reviewNpcIdleActivity } from './npcAutonomy'
import { buildNpcAiObservation } from './observation'
import {
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
    private readonly ticks: NpcAiTicks
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
        this.ticks = new NpcAiTicks(
            room,
            companions,
            this.sessions,
            diagnostics
        )
        for (const npc of config.npcs) {
            const dialogueConfig =
                npc.role === 'necromancer'
                    ? { ...npc, mode: 'dialogue_only' as const }
                    : npc
            this.states.set(
                npc.actorId,
                createNpcAiState(dialogueConfig, room.getCharacter(npc.actorId))
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

    public configured(id: string): boolean {
        return this.config.enabled && this.states.has(id)
    }

    public archivePerson(id: string, now: number): void {
        for (const state of this.states.values()) {
            if (
                state.dialogue?.senderId === id ||
                state.task?.requesterId === id ||
                state.task?.targetId === id
            ) {
                const inbox = state.inbox.filter(
                    (event) => event.senderId !== id
                )
                this.sessions.cancel(state, now)
                state.inbox = inbox
            } else {
                state.inbox = state.inbox.filter(
                    (event) => event.senderId !== id
                )
            }
        }
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
        const hears = {
            ...event,
            language:
                event.language ??
                (event.system === true
                    ? undefined
                    : heardSpeechLanguage(event.text, this.states.values())) ??
                this.room.localeFor(requester.id),
        }
        rememberHeardSpeech(this.room, this.states, requester, hears, targetId)
        receiveNpcSpeech(
            this.room,
            this.states,
            requester,
            hears,
            targetId,
            this.active,
            { room: this.room, diagnostics: this.diagnostics }
        )
        this.scheduler.schedule()
    }

    public replyActivities() {
        return npcReplyActivities(this.states.values())
    }

    public cancelActor(id: string, now: number): void {
        const state = this.states.get(id)
        if (state === undefined) {
            return
        }
        for (const event of [state.dialogue, ...state.inbox]) {
            if (event !== undefined) {
                this.room.social.npcSpeech.fail(event, now)
            }
        }
        this.sessions.cancel(state, now)
    }

    public suspendAutonomy(now: number): void {
        this.scheduler.interruptAdvice()
        for (const state of this.states.values()) {
            const dialogue = state.dialogue
            if (
                dialogue !== undefined &&
                state.actor !== undefined &&
                (this.room.getCharacter(dialogue.senderId)?.connected !==
                    true ||
                    !this.room.social.npcSpeech.turns.available(
                        state.actor,
                        dialogue,
                        now
                    ))
            ) {
                this.sessions.cancelInference(state, now)
            }
            this.ticks.yieldBackground(state, now)
            state.idleSince = undefined
        }
    }

    public beforeTick(now: number): void {
        if (!this.active) {
            return
        }
        this.scheduler.beforeTick(now)
        const incoming = [...this.states.values()].some((state) =>
            state.inbox.some(
                (event) =>
                    event.system !== true || event.conversationId !== undefined
            )
        )
        if (incoming) {
            this.scheduler.interruptAdvice()
            for (const state of this.states.values()) {
                this.ticks.yieldBackground(state, now)
            }
        }
        for (const state of this.states.values()) {
            this.ticks.before(state, now)
        }
    }

    public afterTick(now: number): void {
        if (!this.active) {
            return
        }
        const proactive =
            this.config.proactive !== false && this.room.allowsAutonomousNpcAi()
        const observe = now >= this.nextObservation
        if (observe) {
            this.nextObservation = now + 250
        }
        for (const state of this.states.values()) {
            if (!npcAiActorAvailable(state.actor)) {
                continue
            }
            if (observe && state.config.mode !== 'dialogue_only') {
                const observation = buildNpcAiObservation(
                    this.room,
                    state.actor,
                    state.config.role,
                    now
                )
                rememberAndGreet(
                    this.room,
                    state,
                    observation,
                    now,
                    proactive,
                    (kind) => this.id(kind)
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
                proactive &&
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
            if (proactive) {
                reviewNpcIdleActivity(this.room, state, now, (kind) =>
                    this.id(kind)
                )
            }
        }
        this.scheduler.schedule()
    }

    private id(kind: string): string {
        return `npc-ai:${kind}:${String(++this.sequence)}`
    }
}
