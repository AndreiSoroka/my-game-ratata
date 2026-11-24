import type { GameCharacter } from '../game/character'
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
    NpcAiCallAdmission,
    recordNpcTaskLimit,
} from './schedulerCallAdmission'
import {
    prepareNpcReplyCommit,
    prepareNpcTurnEligibility,
} from './schedulerCommit'
import {
    isBackgroundNpcTurn,
    npcNearPlayer,
    prepareNpcAiTurns,
} from './schedulerPolicy'
import type { NpcAiSessionActions } from './session'
import { invokeNpcAiTurn } from './turn'
import type { NpcAiConfig, NpcAiProvider } from './types'

export class NpcAiScheduler {
    private readonly knowledge: CharacterKnowledge
    private readonly budget: NpcAiCallBudget
    private readonly admission: NpcAiCallAdmission
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
        this.budget = new NpcAiCallBudget(config.limits)
        this.admission = new NpcAiCallAdmission(
            room,
            this.budget,
            sessions,
            diagnostics
        )
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
        if (this.scheduled || !this.current()) {
            return
        }
        this.scheduled = true
        queueMicrotask(() => {
            this.scheduled = false
            if (!this.current()) {
                return
            }
            const now = this.clock()
            const wall = this.room.realNow()
            this.admission.reviewInboxes(this.states.values(), wall, now)
            if (this.busy) {
                return
            }
            const scarce = this.budget.isScarce(wall)
            const states = prepareNpcAiTurns(
                this.room,
                this.states.values(),
                now,
                scarce
            )
            for (const state of states) {
                if (this.begin(state, now, wall)) {
                    return
                }
            }
            this.beginNecromancer(now, wall, scarce)
        })
    }

    public beforeTick(now: number): void {
        this.necromancerTurns.maintain(now)
    }

    public interruptAdvice(): void {
        this.necromancerTurns.interrupt()
    }

    private beginNecromancer(now: number, wall: number, scarce: boolean): void {
        if (
            !this.room.allowsAutonomousNpcAi() ||
            this.budget.limit(wall, true) !== undefined
        ) {
            return
        }
        const turn = this.necromancerTurns.begin(now, scarce)
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

    private begin(state: NpcAiActorState, now: number, wall: number): boolean {
        const actor = state.actor
        if (
            !npcAiActorAvailable(actor) ||
            !this.admission.allows(state, wall, now) ||
            !this.withinDecisionLimit(state, now)
        ) {
            return false
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
            return false
        }
        state.dialogue = state.inbox.shift()
        this.admission.started(state.dialogue)
        delete state.budgetUntil
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
        return true
    }

    private launch(
        state: NpcAiActorState,
        actor: GameCharacter,
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
                    !combat &&
                        this.informationCallAvailable(
                            state,
                            actor,
                            this.room.realNow()
                        )
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
                    !combat &&
                    current() &&
                    this.reserveInformationCall(state, actor),
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

    private informationCallAvailable(
        state: NpcAiActorState,
        actor: GameCharacter,
        at: number
    ): boolean {
        const background = isBackgroundNpcTurn(state)
        return (
            this.budget.limit(at, background) === undefined &&
            (!background ||
                !this.budget.isScarce(at) ||
                npcNearPlayer(this.room, actor))
        )
    }

    private reserveInformationCall(
        state: NpcAiActorState,
        actor: GameCharacter
    ): boolean {
        const at = this.room.realNow()
        if (!this.informationCallAvailable(state, actor, at)) {
            return false
        }
        this.budget.spend(at, isBackgroundNpcTurn(state))
        return true
    }

    public stop(): void {
        this.necromancerTurns.stop()
        this.admission.clear()
        this.knowledge.stop()
        void this.diagnostics.flush()
    }

    private withinDecisionLimit(state: NpcAiActorState, now: number): boolean {
        if (
            state.inbox.length === 0 &&
            (state.task?.steps ?? 0) >= this.config.limits.maxDecisionsPerTask
        ) {
            recordNpcTaskLimit(this.diagnostics, state, 'decision_limit', now)
            this.sessions.finishWithNotice(
                state,
                'Не получилось закончить поручение за отведённое время.',
                now
            )
            return false
        }
        return true
    }
}
