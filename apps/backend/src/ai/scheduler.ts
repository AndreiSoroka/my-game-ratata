import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { NpcAiCallBudget } from './callBudget'
import type { CharacterKnowledge } from './characterKnowledge'
import { markNpcCombatReactionStarted } from './combatReactions'
import { npcCommandProblem } from './commandValidation'
import type { NpcAiDiagnostics } from './diagnostics'
import { npcDialogueContext } from './dialogueContext'
import { prepareKnowledgeCatalog } from './knowledgeCatalog'
import { npcKnowledgeInformation } from './knowledgeInformation'
import { characterKnowledgeScope } from './knowledgeScope'
import { NecromancerTurns } from './necromancerTurns'
import { acquireNpcTurnLease } from './npcTurnLease'
import { reportNpcRequestStatus } from './requestStatus'
import { createRoomKnowledge } from './roomKnowledge'
import { npcAiActorAvailable, type NpcAiActorState } from './runtimeState'
import {
    prepareNpcReplyCommit,
    prepareNpcTurnEligibility,
} from './schedulerCommit'
import { isBackgroundNpcTurn, prepareNpcAiTurns } from './schedulerPolicy'
import type { NpcAiSessionActions } from './session'
import { invokeNpcAiTurn } from './turn'
import type { NpcAiConfig, NpcAiProvider } from './types'

export class NpcAiScheduler {
    private readonly knowledge: CharacterKnowledge
    private readonly budget: NpcAiCallBudget
    private readonly necromancerTurns: NecromancerTurns
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
    ) {
        this.knowledge = createRoomKnowledge(room)
        this.budget = new NpcAiCallBudget(config.limits.maxCallsPerHour)
        this.necromancerTurns = new NecromancerTurns(
            room,
            companions,
            config,
            provider,
            clock,
            nextId,
            room.realNow
        )
        prepareKnowledgeCatalog(room, [...states.keys()])
    }

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
            const state = prepareNpcAiTurns(
                this.room,
                this.states.values(),
                now
            )[0]
            if (state !== undefined) {
                this.begin(state, now)
            } else {
                this.beginNecromancer(now)
            }
        })
    }

    public beforeTick(now: number): void {
        this.necromancerTurns.maintain(now)
    }

    public interruptAdvice(): void {
        this.necromancerTurns.interrupt()
    }

    private beginNecromancer(now: number): void {
        const wall = this.room.realNow()
        if (
            !this.room.allowsAutonomousNpcAi() ||
            this.budget.limit(wall, true) !== undefined
        ) {
            return
        }
        const turn = this.necromancerTurns.begin(now)
        if (turn === undefined) {
            return
        }
        this.busy = true
        this.budget.spend(wall, true)
        void turn.finally(() => {
            this.busy = false
            this.schedule()
        })
    }

    private begin(state: NpcAiActorState, now: number): void {
        const actor = state.actor
        if (!npcAiActorAvailable(actor) || !this.withinLimits(state, now)) {
            return
        }
        const combat =
            state.task?.background === 'combat_reaction' &&
            state.inbox.length === 0
        if (
            !acquireNpcTurnLease(
                this.companions,
                actor,
                state,
                now,
                combat || state.inbox[0]?.nearby !== undefined,
                this.nextId
            )
        ) {
            return
        }
        state.dialogue = state.inbox.shift()
        markNpcCombatReactionStarted(state, this.room.realNow())
        state.controlRevision = this.companions.controlRevision(actor)
        state.turnControlRevision = state.controlRevision
        if (state.dialogue === undefined && state.task !== null) {
            state.task.steps += 1
        }
        const { departures } = this.room.social.npcSpeech.turns
        const context = npcDialogueContext(
            this.room,
            this.sessions.dialogue,
            state,
            actor,
            now,
            combat ? {} : departures.take(actor)
        )
        this.busy = true
        this.budget.spend(this.room.realNow(), isBackgroundNpcTurn(state))
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'thinking',
            now
        )
        this.launch(state, actor, context, combat)
    }

    private launch(
        state: NpcAiActorState,
        actor: import('../game/character').GameCharacter,
        context: import('./types').NpcAiContext,
        combat: boolean
    ): void {
        const eligible = prepareNpcTurnEligibility(
            this.room,
            this.companions,
            state,
            actor,
            this.clock
        )
        const current = () => this.current() && eligible()
        void invokeNpcAiTurn(
            state,
            {
                ...context,
                knowledgeScope: characterKnowledgeScope(
                    actor,
                    !combat && this.informationCallAvailable(state)
                ),
            },
            this.provider,
            current,
            {
                ...npcKnowledgeInformation({
                    state,
                    actor,
                    room: this.room,
                    companions: this.companions,
                    knowledge: this.knowledge,
                    current,
                    clock: this.clock,
                }),
                reserveCall: () =>
                    !combat && current() && this.reserveInformationCall(state),
                validateReply: (reply) =>
                    npcCommandProblem(
                        this.room,
                        this.companions,
                        state,
                        reply,
                        this.clock()
                    ),
                refreshContext: () =>
                    npcDialogueContext(
                        this.room,
                        this.sessions.dialogue,
                        state,
                        actor,
                        this.clock()
                    ),
                commitReply: prepareNpcReplyCommit(state, current),
            },
            this.room.realNow
        ).finally(() => {
            this.busy = false
            this.schedule()
        })
    }

    private informationCallAvailable(state: NpcAiActorState): boolean {
        return (
            this.budget.limit(
                this.room.realNow(),
                isBackgroundNpcTurn(state)
            ) === undefined
        )
    }

    private reserveInformationCall(state: NpcAiActorState): boolean {
        const at = this.room.realNow()
        if (!this.informationCallAvailable(state)) {
            return false
        }
        this.budget.spend(at, isBackgroundNpcTurn(state))
        return true
    }

    public stop(): void {
        this.necromancerTurns.stop()
        this.knowledge.stop()
        void this.diagnostics.flush()
    }

    private withinLimits(state: NpcAiActorState, now: number): boolean {
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

    private withinCallBudget(state: NpcAiActorState, now: number): boolean {
        const background =
            state.inbox.length === 0 && state.task?.requesterId == null
        const limit = this.budget.limit(this.room.realNow(), background)
        if (limit === undefined) {
            return true
        }
        this.recordLimit(state, limit.reason, now)
        if (limit.reason === 'background_call_limit') {
            this.sessions.finish(state, now, 3_600_000)
        } else {
            for (const message of state.inbox) {
                this.room.social.npcSpeech.fail(message, now)
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
        }
        state.budgetUntil = limit.until
        return false
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
