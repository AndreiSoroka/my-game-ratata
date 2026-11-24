import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import { snapshotCharacterRoute } from '../game/characterRoute'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcAiDecisionError } from './actions'
import { trackNpcAiAttack } from './attackResolution'
import { npcDecisionAudienceError } from './decisionAudience'
import { npcDecisionExchangeError } from './decisionExchange'
import type { NpcAiDiagnostics } from './diagnostics'
import { beginNpcGuide } from './guide'
import { npcBoardPublicationContext } from './questPresentation'
import { reportNpcRequestStatus } from './requestStatus'
import { enqueueNpcAiEvent, type NpcAiActorState } from './runtimeState'
import {
    addressedDecision,
    publishNpcDecisionResult,
    rememberNpcInspection,
    rememberNpcMerchant,
} from './sessionMemory'
import type { NpcAiReply } from './types'

export class NpcAiExecution {
    public constructor(
        private readonly room: GameRoom,
        private readonly companions: CompanionService,
        private readonly diagnostics: NpcAiDiagnostics,
        private readonly id: (kind: string) => string,
        private readonly finish: (
            state: NpcAiActorState,
            now: number,
            waitMs: number
        ) => void
    ) {}
    public execute(
        state: NpcAiActorState,
        actor: GameCharacter,
        reply: NpcAiReply,
        rawDecision: AgentDecision,
        now: number
    ): void {
        const decision = addressedDecision(state, rawDecision)
        const exchangeError = npcDecisionExchangeError(
            this.room,
            actor,
            decision
        )
        if (decision.type === 'guide' && exchangeError === undefined) {
            this.guide(state, actor, decision, now)
            return
        }
        const result =
            exchangeError === undefined
                ? this.decide(state, actor, decision, now)
                : { accepted: false, error: exchangeError, events: [] }
        publishNpcDecisionResult(this.room, state, reply, decision, result, now)
        const id = this.id('action')
        if (
            result.accepted &&
            this.trackPendingAction(state, actor, decision, reply, id, now)
        ) {
            return
        }
        this.resolveImmediateAction(
            state,
            actor,
            reply,
            decision,
            result,
            id,
            now
        )
    }

    private resolveImmediateAction(
        state: NpcAiActorState,
        actor: GameCharacter,
        reply: NpcAiReply,
        decision: AgentDecision,
        result: AgentDecisionResult,
        id: string,
        now: number
    ): void {
        this.recordResult(state, decision, result, id, now)
        if (!result.accepted) {
            reportNpcRequestStatus(
                this.room,
                this.diagnostics,
                state,
                'failed',
                now,
                result.error ?? 'Действие отклонено.'
            )
        }
        if (result.accepted && decision.type === 'interact') {
            rememberNpcMerchant(this.room, state, actor, decision, now)
            rememberNpcInspection(this.room, state, decision.targetId, now)
        }
        enqueueNpcAiEvent(state, resolvedNpcEvent(id, decision, result, now))
        if (reply.done && result.accepted) {
            this.finish(state, now, reply.waitMs)
        }
    }

    private trackPendingAction(
        state: NpcAiActorState,
        actor: GameCharacter,
        decision: AgentDecision,
        reply: NpcAiReply,
        id: string,
        now: number
    ): boolean {
        if (decision.type === 'move_to') {
            this.trackMovement(state, actor, decision, reply, id, now)
        } else if (
            decision.type === 'attack' &&
            trackNpcAiAttack(state, actor, decision, reply, id)
        ) {
            this.diagnostics.record({
                actorId: actor.id,
                taskId: state.task?.id ?? '',
                request: state.task?.request ?? '',
                category: 'action_started',
                action: decision,
                reason: 'attack_started',
                receiptId: id,
                at: now,
            })
        } else {
            return false
        }
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            'started',
            now
        )
        return true
    }

    private guide(
        state: NpcAiActorState,
        actor: GameCharacter,
        decision: Extract<AgentDecision, { type: 'guide' }>,
        now: number
    ): void {
        const id = this.id('guide')
        const result = beginNpcGuide(
            this.room,
            this.companions,
            state,
            decision,
            id,
            now
        )
        this.room.publishEvents(result.events)
        this.diagnostics.record({
            actorId: actor.id,
            taskId: state.task?.id ?? '',
            request: state.task?.request ?? '',
            category: result.accepted ? 'action_started' : 'action_rejected',
            action: decision,
            reason: result.error ?? 'guiding',
            receiptId: id,
            at: now,
        })
        reportNpcRequestStatus(
            this.room,
            this.diagnostics,
            state,
            result.accepted ? 'started' : 'failed',
            now,
            result.error ?? undefined
        )
        if (!result.accepted) {
            enqueueNpcAiEvent(state, {
                kind: 'action',
                id,
                decision,
                status: 'failed',
                reason: result.error ?? 'rejected',
                at: now,
            })
        }
    }

    private decide(
        state: NpcAiActorState,
        actor: GameCharacter,
        decision: AgentDecision,
        now: number
    ): AgentDecisionResult {
        const audienceError = this.audienceError(state, actor, decision)
        if (audienceError !== undefined) {
            return { accepted: false, error: audienceError, events: [] }
        }
        if (this.room.social.isDecision(decision)) {
            return this.room.social.decide(
                actor,
                decision,
                now,
                npcBoardPublicationContext(state)
            )
        }
        const error = npcAiDecisionError(
            actor,
            state.config.role,
            decision,
            this.room.navigationFor(actor)
        )
        if (
            error === undefined &&
            decision.type === 'move_to' &&
            state.token !== undefined
        ) {
            this.companions.setModelControlExclusive(
                actor,
                state.token,
                true,
                now
            )
        }
        return error === undefined
            ? this.companions.decide(
                  actor,
                  decision,
                  this.room,
                  now,
                  state.token
              )
            : { accepted: false, error, events: [] }
    }

    private audienceError(
        state: NpcAiActorState,
        actor: GameCharacter,
        decision: AgentDecision
    ): string | undefined {
        const partnerId = state.task?.requesterId
        return partnerId != null &&
            state.task?.audienceKey?.startsWith('whisper:') === true
            ? npcDecisionAudienceError(this.room, decision, actor.id, partnerId)
            : undefined
    }

    private recordResult(
        state: NpcAiActorState,
        decision: AgentDecision,
        result: AgentDecisionResult,
        receiptId: string,
        at: number
    ): void {
        this.diagnostics.record({
            actorId: state.config.actorId,
            taskId: state.task?.id ?? '',
            request: state.task?.request ?? '',
            category: result.accepted ? 'action_completed' : 'action_rejected',
            action: decision,
            reason: result.accepted ? 'resolved' : (result.error ?? 'rejected'),
            receiptId,
            at,
        })
    }

    private trackMovement(
        state: NpcAiActorState,
        actor: GameCharacter,
        decision: Extract<AgentDecision, { type: 'move_to' }>,
        reply: NpcAiReply,
        id: string,
        now: number
    ): void {
        this.room.adventureForWorkers().closeConversations(actor.id)
        const destination =
            snapshotCharacterRoute(actor)?.route?.points.at(-1)?.position ??
            decision.target
        state.pending = {
            id,
            decision,
            locationId: actor.locationId,
            destination: { ...destination },
            deadline: now + 120_000,
            done: reply.done,
            waitMs: reply.waitMs,
        }
    }
}

function resolvedNpcEvent(
    id: string,
    decision: AgentDecision,
    result: AgentDecisionResult,
    now: number
): import('./types').NpcAiEvent {
    return {
        kind: 'action',
        id,
        decision,
        status: result.accepted ? 'completed' : 'failed',
        reason: result.accepted ? 'resolved' : (result.error ?? 'rejected'),
        at: now,
    }
}
