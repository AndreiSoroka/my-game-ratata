import type { AgentDecision } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import type { GameRoom } from '../game/room'
import { npcAiDecisionError } from './actions'
import { npcDecisionAudienceError } from './decisionAudience'
import { npcDecisionExchangeError } from './decisionExchange'
import { npcAssistanceContext } from './dialogueOrders'
import { npcGuideTargetError } from './guideTargets'
import { npcRoleProblem } from './npcRoleValidation'
import {
    npcSpeechLanguageProblem,
    replySpeechLanguage,
} from './npcSpeechLanguage'
import { npcAiObservedAttackError } from './observation'
import { npcQuestPresentationProblem } from './questPresentation'
import { type NpcAiActorState, npcAiBusyFor } from './runtimeState'
import {
    isNpcSelfDecision,
    npcSelfDecisionProblem,
    soloTravelPromiseProblem,
} from './selfDecisions'
import { npcSelfReferenceProblem } from './speechSelfReference'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiReply } from './types'
export { npcCommandCapabilities } from './commandCapabilities'

/** Pure validation, repeated on the simulation tick immediately before commit. */
export function npcCommandProblem(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    const actor = state.actor
    if (actor === undefined) {
        return problem('unavailable', 'Персонаж сейчас недоступен.')
    }
    const language = replySpeechLanguage(room, state, reply, now)
    return (
        npcSpeechLanguageProblem(reply, language) ??
        (language === 'ru'
            ? npcSelfReferenceProblem(actor, reply, speechAudience(room, state))
            : undefined) ??
        npcRoleProblem(room, state, actor, reply, now) ??
        backgroundProblem(state, reply) ??
        taskClaimProblem(room, state, actor, reply) ??
        companionProblem(room, companions, state, actor, reply, now) ??
        soloTravelPromiseProblem(state, reply) ??
        decisionProblem(room, companions, state, actor, reply, now) ??
        npcQuestPresentationProblem(room, state, actor, reply, now)
    )
}

function speechAudience(room: GameRoom, state: NpcAiActorState) {
    if (state.actor?.npcIdentityProfile === undefined) {
        return { humanAddressee: false }
    }
    const id =
        state.dialogue?.senderId ??
        state.task?.requesterId ??
        state.task?.targetId
    const partner = room.getCharacter(id ?? '')
    return {
        humanAddressee:
            partner?.controllerKind === 'network_player' &&
            partner.creatureType === 'humanoid',
    }
}

function acceptsTask(reply: NpcAiReply): boolean {
    return (
        reply.taskAcceptance === 'accept' || reply.taskAcceptance === 'replace'
    )
}
function backgroundProblem(
    state: NpcAiActorState,
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    const claimsTask = acceptsTask(reply) || reply.companionOrder != null
    if (
        state.task?.background === 'greeting' &&
        (reply.decision !== null || claimsTask)
    ) {
        return problem(
            'greeting_only',
            'Можно начать разговор одной репликой, но нельзя принимать поручение или выполнять действие от имени собеседника.'
        )
    }
    const ownDecision =
        reply.decision === null ||
        isNpcSelfDecision(reply.decision) ||
        ['move_to', 'interact', 'speak', 'wait', 'cancel_control'].includes(
            reply.decision.type
        )
    if (
        state.task?.background === 'self_activity' &&
        (claimsTask || !ownDecision)
    ) {
        return problem(
            'self_activity_only',
            'Это собственное короткое занятие в текущей локации, а не чужое поручение, договор или сопровождение.'
        )
    }
    return undefined
}
function taskClaimProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply
): NpcReplyProblem | undefined {
    const event = state.dialogue
    if (
        event === undefined ||
        (!acceptsTask(reply) && reply.companionOrder == null)
    ) {
        return undefined
    }
    if (event.system === true || npcAiBusyFor(state, event.senderId)) {
        return problem(
            'busy',
            'Персонаж сейчас занят и не может принять это поручение.'
        )
    }
    return room.social.exchanges.isPaused(actor.id)
        ? problem('exchange', 'Сначала нужно завершить текущий обмен.')
        : undefined
}
function companionProblem(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    if (reply.companionOrder == null) {
        return undefined
    }
    const partner = room.getCharacter(state.dialogue?.senderId ?? '')
    if (partner === undefined) {
        return problem('unavailable', 'Собеседник сейчас недоступен.')
    }
    const check = companions.checkOrder(
        partner,
        actor,
        {
            type: 'companion_request',
            targetId: actor.id,
            request: reply.companionOrder,
            ...(reply.waitMode == null ? {} : { waitMode: reply.waitMode }),
        },
        now,
        npcAssistanceContext(room)
    )
    return check.accepted
        ? undefined
        : { code: 'command_unavailable', reason: check.reason }
}
function decisionProblem(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    const decision = reply.decision
    if (decision === null) {
        return undefined
    }
    const exchangeError = npcDecisionExchangeError(room, actor, decision)
    if (exchangeError !== undefined) {
        return problem('exchange', exchangeError)
    }
    if (room.social.isDecision(decision)) {
        return socialDecisionProblem(room, state, actor, decision)
    }
    const error =
        decision.type === 'guide'
            ? npcGuideTargetError(
                  room,
                  actor,
                  state.config.role,
                  decision.targetKey
              )
            : npcAiDecisionError(
                  actor,
                  state.config.role,
                  decision,
                  room.navigationFor(actor)
              )
    if (error !== undefined) {
        return problem('role_or_navigation', error)
    }
    if (isNpcSelfDecision(decision)) {
        return npcSelfDecisionProblem(
            room,
            companions,
            state,
            actor,
            reply,
            decision,
            now
        )
    }
    if (decision.type === 'attack') {
        const attackError = npcAiObservedAttackError(room, actor, decision, now)
        return attackError === undefined
            ? undefined
            : problem('attack_target', attackError)
    }
    return undefined
}

function socialDecisionProblem(
    room: GameRoom,
    state: NpcAiActorState,
    actor: GameCharacter,
    decision: AgentDecision
): NpcReplyProblem | undefined {
    const senderId = state.dialogue?.senderId
    const error =
        senderId === undefined
            ? undefined
            : npcDecisionAudienceError(room, decision, actor.id, senderId)
    if (error !== undefined) {
        return problem('audience', error)
    }
    const discussion =
        decision.type === 'exchange_accept'
            ? room.social.exchangeAcceptanceProblem(actor, decision)
            : undefined
    return discussion === undefined
        ? undefined
        : problem('exchange_discussion', discussion)
}

function problem(code: string, detail: string): NpcReplyProblem {
    return { code: 'command_unavailable', reason: { code, detail } }
}
