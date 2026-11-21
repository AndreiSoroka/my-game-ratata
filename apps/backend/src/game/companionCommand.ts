import type { CompanionClientMessage } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    type AssistanceContext,
    type CompanionAssistance,
    companionReachText,
} from './companionAssistance'
import type { CompanionRuntime } from './companionMovement'
import { applyCompanionOrder } from './companionOrders'
import {
    type CompanionProfile,
    companionProfiles,
    refusalFor,
    residentProfile,
} from './companionProfiles'
import { canRequest, release, sync } from './companionState'

export interface CompanionDenial {
    code:
        | 'unavailable'
        | 'cannot_speak'
        | 'human_controlled'
        | 'busy'
        | 'not_following'
        | 'cannot_follow'
        | 'cannot_fight'
        | 'introduction_required'
        | 'assistance_condition'
    detail: string
}
export type CompanionCommandCheck =
    { accepted: true } | { accepted: false; reason: CompanionDenial }

export function createCompanionRuntime(
    character: GameCharacter
): CompanionRuntime {
    return {
        anchor: { ...character.position },
        anchorLocation: character.locationId,
        lastPlanAt: 0,
        lastReply: null,
        leaderId: null,
        metActors: new Set<string>(),
        order: 'idle',
        profile: companionProfiles[character.id] ?? residentProfile,
        controlRevision: 0,
    }
}

/** Shared validation: no speech, consent, acquaintance or movement mutations. */
export function checkCompanionCommand(
    actor: GameCharacter,
    npc: GameCharacter | undefined,
    state: CompanionRuntime | undefined,
    message: CompanionClientMessage,
    assistance: CompanionAssistance,
    now: number,
    context?: AssistanceContext
): CompanionCommandCheck {
    if (!canRequest(actor, npc) || state === undefined) {
        return deny(
            'unavailable',
            `Нужен живой собеседник ${companionReachText(actor, context)}.`
        )
    }
    const speaker = speakerDenial(npc)
    if (speaker !== undefined) {
        return { accepted: false, reason: speaker }
    }
    if (message.request === 'talk') {
        return { accepted: true }
    }
    const ownership = ownershipDenial(actor, state, message)
    if (ownership !== undefined) {
        return { accepted: false, reason: ownership }
    }
    if (message.request === 'dismiss') {
        return { accepted: true }
    }
    const willingness = profileDenial(actor, state, message, context)
    if (willingness !== undefined) {
        return { accepted: false, reason: willingness }
    }
    const error = assistance.requestError(actor, npc, context, now)
    return error === null
        ? { accepted: true }
        : deny('assistance_condition', error)
}

function speakerDenial(npc: GameCharacter): CompanionDenial | undefined {
    if (!npc.soul.canSpeak) {
        return deny(
            'cannot_speak',
            'Это существо не владеет речью. Вид существа и способность говорить — разные вещи.'
        ).reason
    }
    if (npc.controllerKind === 'network_player') {
        return deny(
            'human_controlled',
            'Другой человек решает за своего героя сам.'
        ).reason
    }
    return undefined
}

function ownershipDenial(
    actor: GameCharacter,
    state: CompanionRuntime,
    message: CompanionClientMessage
): CompanionDenial | undefined {
    if (state.leaderId !== null && state.leaderId !== actor.id) {
        return deny(
            'busy',
            'Я уже дала слово другому спутнику. Решать за него тебе не позволю.'
        ).reason
    }
    if (message.request === 'dismiss' && state.leaderId !== actor.id) {
        return deny('not_following', 'Наши дороги пока не были связаны.').reason
    }
    return undefined
}

function profileDenial(
    actor: GameCharacter,
    state: CompanionRuntime,
    message: CompanionClientMessage,
    context?: AssistanceContext
): CompanionDenial | undefined {
    if (message.request === 'follow' && !state.profile.canFollow) {
        return deny(
            'cannot_follow',
            'Этот персонаж не соглашается следовать за игроком; он может самостоятельно заниматься доступными ему местными делами.'
        ).reason
    }
    if (message.request === 'help' && !state.profile.canFight) {
        return deny('cannot_fight', 'Этот персонаж не участвует в сражениях.')
            .reason
    }
    if (
        state.profile.needsIntroduction &&
        !state.metActors.has(actor.id) &&
        context?.conversation !== true
    ) {
        return deny(
            'introduction_required',
            'Сначала познакомимся: поговори со мной.'
        ).reason
    }
    return undefined
}

function deny(
    code: CompanionDenial['code'],
    detail: string
): Extract<CompanionCommandCheck, { accepted: false }> {
    return { accepted: false, reason: { code, detail } }
}

/** Model orders use the same checks and state changes without creating a scripted spoken reply. */
export function applyModelCompanionCommand(
    actor: GameCharacter,
    npc: GameCharacter,
    state: CompanionRuntime,
    message: CompanionClientMessage,
    assistance: CompanionAssistance,
    now: number,
    context: AssistanceContext
): CompanionCommandCheck {
    const result = checkCompanionCommand(
        actor,
        npc,
        state,
        message,
        assistance,
        now,
        context
    )
    if (!result.accepted) {
        return result
    }
    if (message.request === 'dismiss') {
        release(npc, state)
    } else if (message.request !== 'talk') {
        applyCompanionOrder(npc, actor, state, message, now)
        sync(npc, state)
    }
    if (context.conversation === true) {
        state.metActors.add(actor.id)
    }
    return result
}

export function scriptedCompanionDenial(
    profile: CompanionProfile,
    request: CompanionClientMessage['request'],
    reason: CompanionDenial
): string {
    if (reason.code === 'cannot_follow' || reason.code === 'cannot_fight') {
        return refusalFor(profile, request) ?? reason.detail
    }
    return reason.code === 'introduction_required'
        ? 'Я не пойду с незнакомцем. Сначала поговорим, а потом решу сама.'
        : reason.detail
}

export function scriptedCompanionGreeting(
    actor: GameCharacter,
    state: CompanionRuntime
): string {
    return state.metActors.has(actor.id)
        ? `Помню тебя, ${actor.nickname}. ${state.leaderId === actor.id ? 'Я рядом по собственной воле.' : state.profile.greeting}`
        : state.profile.greeting
}
