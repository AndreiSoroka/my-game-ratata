import type { AgentDecision } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from '../game/agentDecisions'
import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcAssistanceContext } from './dialogueOrders'
import { beginNpcSelfTravel, stopNpcSelfTravelEscort } from './guide'
import { npcSelfTravelTargetError } from './guideTargets'
import { npcFollowInitiativeProblem } from './npcFollowInitiative'
import { type NpcAiActorState, npcAiBusyFor } from './runtimeState'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiEvent, NpcAiReply } from './types'

type Heard = Extract<NpcAiEvent, { kind: 'message' }>
export type NpcSelfDecision = Extract<
    AgentDecision,
    {
        type:
            | 'travel_to'
            | 'leave_companion'
            | 'propose_follow'
            | 'start_following'
    }
>

export function isNpcSelfDecision(
    decision: AgentDecision | null
): decision is NpcSelfDecision {
    return (
        decision?.type === 'travel_to' ||
        decision?.type === 'leave_companion' ||
        decision?.type === 'propose_follow' ||
        decision?.type === 'start_following'
    )
}

export function npcSelfDecisionProblem(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    decision: NpcSelfDecision,
    now: number
): NpcReplyProblem | undefined {
    const issue = selfDecisionConsentProblem(state, reply)
    if (issue !== undefined) {
        return issue
    }
    const heard = state.dialogue
    const hasSpeech = (reply.speech?.trim().length ?? 0) > 0
    if (
        decision.type === 'propose_follow' ||
        decision.type === 'start_following'
    ) {
        return hasSpeech
            ? npcFollowInitiativeProblem(room, companions, state, decision, now)
            : problem('Скажи путнику, что хочешь идти вместе.')
    }
    if (decision.type === 'travel_to') {
        return selfTravelProblem(room, state, actor, decision, heard, hasSpeech)
    }
    return canLeaveCompanion(companions, state, actor, now)
        ? undefined
        : problem('Сейчас я ни за кем не следую.')
}

function selfTravelProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: Extract<NpcSelfDecision, { type: 'travel_to' }>,
    heard: Heard | undefined,
    hasSpeech: boolean
): NpcReplyProblem | undefined {
    if (decision.inviteEscort && (heard === undefined || !hasSpeech)) {
        return problem('Пригласи текущего собеседника проводить тебя.')
    }
    const currentTrip = state.guide?.decision
    if (
        currentTrip?.type === 'travel_to' &&
        currentTrip.targetKey === decision.targetKey
    ) {
        return undefined
    }
    const error = npcSelfTravelTargetError(
        room,
        actor,
        state.config.role,
        decision.targetKey
    )
    return error === undefined ? undefined : problem(error)
}

function selfDecisionConsentProblem(
    state: NpcAiActorState,
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    if (
        reply.companionOrder != null ||
        reply.taskAcceptance === 'accept' ||
        reply.taskAcceptance === 'replace'
    ) {
        return problem('Собственное решение не требует принятия поручения.')
    }
    const heard = state.dialogue
    if (heard?.system === true || heard?.ambiguous === true) {
        return problem('Сначала уточни, кто с тобой говорит.')
    }
    if (heard !== undefined && npcAiBusyFor(state, heard.senderId)) {
        return problem('Я уже дала слово другому путнику.')
    }
    return undefined
}

function canLeaveCompanion(
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number
): boolean {
    const speaker = state.dialogue?.senderId
    return (
        actor.soul.companion?.leaderId != null ||
        (speaker !== undefined &&
            (state.guide?.escortId === speaker ||
                companions.hasFollowProposal(actor, speaker, now)))
    )
}

export function soloTravelPromiseProblem(
    state: NpcAiActorState,
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    const decision = reply.decision
    const travellingAlone =
        state.guide?.decision.type === 'travel_to' &&
        state.guide.escortId === undefined
    if (
        state.config.role !== 'companion' ||
        decision?.type === 'travel_to' ||
        travellingAlone
    ) {
        return undefined
    }
    const speech =
        reply.speech ?? (decision?.type === 'speak' ? decision.text : '')
    const promisesSoloTravel =
        /(?:^|[.!?]\s+)(?:(?:да|хорошо),?\s+)?(?:я\s+)?(?:(?:сама|сам)\s+(?:[^.!?]{0,48}\s)?(?:дойду|доберусь|пойду|вернусь)|(?:дойду|доберусь|пойду|вернусь|иду)\s+(?:сама|сам|одна|один))(?=[^\p{L}]|$)/iu.test(
            speech
        ) ||
        /(?:^|[.!?]\s+)(?:yes,?\s+)?i(?:'ll|’ll| will)\s+(?:go|get there|head back|return|walk back)\s+(?:on my own|alone|by myself)/iu.test(
            speech
        )
    return promisesSoloTravel
        ? problem(
              'Самостоятельный путь ещё не начат. Выбери travel_to с известной целью или ответь без обещания идти самостоятельно.'
          )
        : undefined
}

export function applyNpcSelfDecision(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: NpcSelfDecision,
    id: string,
    now: number,
    heard?: Heard
): AgentDecisionResult {
    if (
        state.token === undefined ||
        !companions.isModelControlOwner(actor, state.token, now)
    ) {
        return rejected('Сейчас я не могу изменить свой маршрут.')
    }
    switch (decision.type) {
        case 'travel_to':
            return beginNpcSelfTravel(
                room,
                companions,
                state,
                decision,
                id,
                now,
                decision.inviteEscort ? heard?.senderId : undefined
            )
        case 'leave_companion':
            return leaveCompanion(companions, state, actor, now, heard)
        case 'propose_follow':
        case 'start_following':
            return beginFollowInitiative(room, companions, actor, decision, now)
    }
}

function beginFollowInitiative(
    room: GameRoom,
    companions: CompanionService,
    actor: GameCharacter,
    decision: Extract<
        NpcSelfDecision,
        { type: 'propose_follow' | 'start_following' }
    >,
    now: number
): AgentDecisionResult {
    const leader = room.getCharacter(decision.targetId)
    if (leader === undefined) {
        return rejected('Путник уже ушёл.')
    }
    const context = npcAssistanceContext(room)
    const check = companions.checkSelfFollowing(
        actor,
        leader,
        now,
        context,
        decision.type === 'propose_follow' ? 'propose' : 'start'
    )
    if (!check.accepted) {
        return rejected(check.reason.detail)
    }
    if (decision.type === 'propose_follow') {
        companions.noteFollowProposal(actor, leader.id, now)
    } else {
        const result = companions.applyModelOrder(
            leader,
            actor,
            {
                type: 'companion_request',
                targetId: actor.id,
                request: 'follow',
            },
            now,
            context
        )
        if (!result.accepted) {
            return rejected(result.reason.detail)
        }
    }
    return { accepted: true, error: null, events: [] }
}

function leaveCompanion(
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    now: number,
    heard: Heard | undefined
): AgentDecisionResult {
    const leaderId = actor.soul.companion?.leaderId
    if (leaderId != null) {
        if (heard !== undefined && heard.senderId !== leaderId) {
            return rejected('Этот путник не ведёт меня.')
        }
        companions.releaseAssistance(leaderId, actor)
    }
    if (heard !== undefined) {
        const stoppedEscort = stopNpcSelfTravelEscort(
            state.guide,
            heard.senderId
        )
        if (
            stoppedEscort ||
            heard.senderId === leaderId ||
            companions.hasFollowProposal(actor, heard.senderId, now)
        ) {
            companions.recordFollowRefusal(actor, heard.senderId)
        }
    }
    return { accepted: true, error: null, events: [] }
}

function problem(detail: string): NpcReplyProblem {
    return {
        code: 'command_unavailable',
        reason: { code: 'self_decision', detail },
    }
}

function rejected(error: string): AgentDecisionResult {
    return { accepted: false, error, events: [] }
}
