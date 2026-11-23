import type { GameCharacter } from '../game/character'
import type { CompanionService } from '../game/companions'
import {
    isConversationOnly,
    npcCanOfferService,
    npcServiceOffers,
} from '../game/npcRoster'
import type { GameRoom } from '../game/room'
import { npcAiDecisionError } from './actions'
import { npcCombatReactionProblem } from './combatReactions'
import { npcDecisionAudienceError } from './decisionAudience'
import { npcDecisionExchangeError } from './decisionExchange'
import { npcAssistanceContext } from './dialogueOrders'
import { npcGuideTargetError } from './guideTargets'
import { npcRoleProblem } from './npcRoleValidation'
import {
    npcSpeechLanguageProblem,
    replySpeechLanguage,
} from './npcSpeechLanguage'
import { npcQuestPresentationProblem } from './questPresentation'
import { type NpcAiActorState, npcAiBusyFor } from './runtimeState'
import { npcSelfReferenceProblem } from './speechSelfReference'
import type { NpcReplyProblem } from './turnInformation'
import type { NpcAiContext, NpcAiReply } from './types'

export function npcCommandCapabilities(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    now: number
): NonNullable<NpcAiContext['commandCapabilities']> | undefined {
    const actor = state.actor
    if (actor === undefined) {
        return undefined
    }
    const { canFight, canFollow } = companions.capabilities(actor)
    const partner = room.getCharacter(
        state.dialogue?.senderId ?? state.task?.requesterId ?? ''
    )
    const dialogueOnly = isConversationOnly(
        state.config.role,
        state.config.mode
    )
    const serviceOffers = npcServiceOffers.filter((service) =>
        npcCanOfferService(actor.id, service)
    )
    return {
        canFight: !dialogueOnly && canFight,
        canFollow: !dialogueOnly && canFollow,
        serviceOffers,
        movementScope: dialogueOnly
            ? 'none'
            : state.config.role === 'city_coordinator'
              ? 'city'
              : 'region',
        orders: dialogueOnly
            ? {}
            : allowedOrders(room, companions, actor, partner, now),
    }
}

function allowedOrders(
    room: GameRoom,
    companions: CompanionService,
    actor: GameCharacter,
    partner: GameCharacter | undefined,
    now: number
): NonNullable<NpcAiContext['commandCapabilities']>['orders'] {
    if (partner === undefined) {
        return {}
    }
    const orders: NonNullable<NpcAiContext['commandCapabilities']>['orders'] =
        {}
    const context = npcAssistanceContext(room)
    for (const request of [
        'follow',
        'help',
        'guard',
        'wait',
        'dismiss',
    ] as const) {
        const check = companions.checkOrder(
            partner,
            actor,
            { type: 'companion_request', targetId: actor.id, request },
            now,
            context
        )
        orders[request] = check.accepted
            ? { allowed: true }
            : { allowed: false, reason: check.reason }
    }
    return orders
}

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
    const speechProblem =
        npcSpeechLanguageProblem(reply, language) ??
        (language === 'ru'
            ? npcSelfReferenceProblem(actor, reply, speechAudience(room, state))
            : undefined)
    if (
        state.task?.background === 'combat_reaction' &&
        state.dialogue === undefined
    ) {
        return speechProblem ?? npcCombatReactionProblem(reply)
    }
    return (
        speechProblem ??
        npcWorldCommandProblem(room, companions, state, actor, reply, now)
    )
}

function npcWorldCommandProblem(
    room: GameRoom,
    companions: CompanionService,
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply,
    now: number
): NpcReplyProblem | undefined {
    return (
        npcRoleProblem(room, state, actor, reply, now) ??
        backgroundProblem(state, reply) ??
        taskClaimProblem(room, state, actor, reply) ??
        companionProblem(room, companions, state, actor, reply, now) ??
        decisionProblem(room, state, actor, reply) ??
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
    state: NpcAiActorState,
    actor: GameCharacter,
    reply: NpcAiReply
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
        const error =
            state.dialogue === undefined
                ? undefined
                : npcDecisionAudienceError(
                      room,
                      decision,
                      actor.id,
                      state.dialogue.senderId
                  )
        return error === undefined ? undefined : problem('audience', error)
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
    return error === undefined
        ? undefined
        : problem('role_or_navigation', error)
}

function problem(code: string, detail: string): NpcReplyProblem {
    return { code: 'command_unavailable', reason: { code, detail } }
}
