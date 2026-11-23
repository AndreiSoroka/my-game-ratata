import { isNpcQuestDecision } from '../game/npcQuestCommands'
import type { GameRoom } from '../game/room'
import { type NpcAiActorState, npcAiBusyFor } from './runtimeState'
import { isNpcSelfDecision } from './selfDecisions'
import type {
    NpcAiContext,
    NpcAiReply,
    NpcReplyIssue,
    NpcTaskConsent,
} from './types'

/** This capability reveals no other speaker, task ID, channel or private task text. */
export function npcTaskConsent(
    room: GameRoom,
    state: NpcAiActorState
): NpcTaskConsent {
    const partnerId = state.dialogue?.senderId
    const unavailable =
        state.config.mode === 'dialogue_only' ||
        (partnerId !== undefined && npcAiBusyFor(state, partnerId)) ||
        room.social.exchanges.isPaused(state.config.actorId)
    if (unavailable) {
        return { state: 'busy', allowed: ['none', 'decline'] }
    }
    if (state.task?.requesterId != null) {
        return { state: 'own_task', allowed: ['none', 'replace', 'decline'] }
    }
    return { state: 'idle', allowed: ['none', 'accept', 'replace', 'decline'] }
}

export function npcReplyNeedsTask(reply: NpcAiReply): boolean {
    const decision = reply.decision
    return (
        reply.companionOrder != null ||
        (decision !== null &&
            !isNpcSelfDecision(decision) &&
            decision.type !== 'speak' &&
            !decision.type.startsWith('exchange_') &&
            !isNpcQuestDecision(decision))
    )
}

/** Check the relationship between fields before any speech, memory update or action. */
export function npcReplyIssue(
    context: NpcAiContext,
    reply: NpcAiReply
): NpcReplyIssue | undefined {
    const message = context.events.find((event) => event.kind === 'message')
    if (message === undefined && context.task?.concluding === true) {
        return closingReplyIssue(reply)
    }
    if (message?.kind !== 'message') {
        return undefined
    }
    return messageReplyIssue(
        context.taskConsent,
        reply,
        message.legacy === true
    )
}

function messageReplyIssue(
    consent: NpcTaskConsent | undefined,
    reply: NpcAiReply,
    legacy: boolean
): NpcReplyIssue | undefined {
    const acceptance = reply.taskAcceptance ?? 'none'
    const implicitLegacy = legacy && reply.taskAcceptance === undefined
    const accepts =
        acceptance === 'accept' || acceptance === 'replace' || implicitLegacy
    if (npcReplyNeedsTask(reply) && !accepts) {
        return 'task_consent_required'
    }
    if (
        accepts &&
        consent !== undefined &&
        !consent.allowed.includes(acceptance) &&
        !implicitLegacy
    ) {
        return consent.state === 'own_task'
            ? 'task_replace_required'
            : 'task_unavailable'
    }
    return undefined
}

function closingReplyIssue(reply: NpcAiReply): NpcReplyIssue | undefined {
    return (reply.decision !== null && reply.decision.type !== 'speak') ||
        reply.companionOrder != null ||
        reply.taskAcceptance === 'accept' ||
        reply.taskAcceptance === 'replace'
        ? 'task_concluded'
        : undefined
}

/** A terminal invalid output must not enter the provider retry queue. */
export class NpcReplyRejected extends Error {
    public constructor(public readonly code: NpcReplyIssue) {
        super(`Invalid NPC reply: ${code}`)
    }
}
