import type { KnowledgeResult } from './characterKnowledge'
import type { DeepMemoryResult } from './characterMemory'
import type { NpcKnowledgeScope } from './knowledgeScope'
import type { NpcAiActorState } from './runtimeState'
import { npcReplyIssue, NpcReplyRejected } from './taskConsent'
import type {
    NpcAiContext,
    NpcAiReply,
    NpcInformationRequest,
    NpcReplyIssue,
} from './types'

export interface TurnInformation {
    validateReply?: (reply: NpcAiReply) => NpcReplyProblem | undefined
    commitReply?: (reply: NpcAiReply) => Promise<NpcReplyProblem | undefined>
    refreshContext?: () => NpcAiContext
    reserveCall?: () => boolean
    current?: () => boolean
    lookup?: (personId: string) => Promise<DeepMemoryResult>
    search?: (query: string) => Promise<KnowledgeResult>
    scope?: () => NpcKnowledgeScope
}
export interface NpcReplyProblem {
    code: NpcReplyIssue
    reason?: { code: string; detail: string }
}
function lookupOnly(reply: NpcAiReply): boolean {
    const task = reply.taskAcceptance ?? 'none'
    return (
        reply.decision === null &&
        reply.speech == null &&
        reply.companionOrder == null &&
        task === 'none'
    )
}
export async function resolveTurnInformation(
    state: NpcAiActorState,
    context: NpcAiContext,
    information: TurnInformation,
    decide: (input: NpcAiContext) => Promise<NpcAiReply>,
    aborted: Promise<never>
): Promise<NpcAiReply> {
    const input = { ...context }
    // A new model-selected turn never inherits retrieved articles from an earlier input.
    delete input.knowledge
    delete input.informationResults
    assertCurrent(information)
    const reply = canonicalNpcReply(input, await decide(input))
    assertCurrent(information)
    const request = reply.informationRequest
    if (request == null) {
        return correctReply(input, reply, information, decide)
    }
    if (!lookupOnly(reply)) {
        return correctReply(
            input,
            reply,
            information,
            decide,
            'information_request_mixed'
        )
    }
    assertCurrent(information)
    assertLookupAvailable(request, input, information)
    if (information.reserveCall?.() !== true) {
        throw new Error('Information lookup call budget exhausted')
    }
    const result = await Promise.race([
        lookupContext(request, state, information),
        aborted,
    ])
    assertCurrent(information)
    const scope = information.scope?.() ?? input.knowledgeScope
    const final = canonicalNpcReply(
        input,
        await decide({
            ...input,
            ...result,
            ...(scope === undefined
                ? {}
                : {
                      knowledgeScope: {
                          ...scope,
                          canSearch: false,
                          lookupsRemaining: 0,
                      },
                  }),
        })
    )
    assertCurrent(information)
    if (final.informationRequest != null) {
        throw new Error('One information lookup is allowed per request')
    }
    const issue = replyProblem(input, final, information)
    if (issue !== undefined) {
        throw new NpcReplyRejected(issue.code)
    }
    return final
}

export async function correctReply(
    input: NpcAiContext,
    reply: NpcAiReply,
    information: TurnInformation,
    decide: (input: NpcAiContext) => Promise<NpcAiReply>,
    forcedIssue?: NpcReplyIssue | NpcReplyProblem
): Promise<NpcAiReply> {
    const issue =
        typeof forcedIssue === 'string'
            ? { code: forcedIssue }
            : (forcedIssue ?? replyProblem(input, reply, information))
    if (issue === undefined) {
        return reply
    }
    assertCurrent(information)
    if (information.reserveCall?.() !== true) {
        throw new NpcReplyRejected(issue.code)
    }
    let corrected: NpcAiReply
    try {
        corrected = canonicalNpcReply(
            input,
            await decide(
                correctionInput(
                    information.refreshContext?.() ?? input,
                    reply,
                    issue,
                    information
                )
            )
        )
    } catch {
        throw new NpcReplyRejected(issue.code)
    }
    assertCurrent(information)
    const nextIssue = refreshedReplyProblem(input, corrected, information)
    if (corrected.informationRequest != null) {
        throw new NpcReplyRejected(issue.code)
    }
    if (nextIssue !== undefined) {
        throw new NpcReplyRejected(nextIssue.code)
    }
    return corrected
}

function correctionInput(
    input: NpcAiContext,
    reply: NpcAiReply,
    issue: NpcReplyProblem,
    information: TurnInformation
): NpcAiContext {
    const scope = information.scope?.() ?? input.knowledgeScope
    return {
        ...input,
        replyCorrection: {
            draftSpeech:
                reply.speech ??
                (reply.decision?.type === 'speak' ? reply.decision.text : null),
            code: issue.code,
            ...(issue.reason === undefined ? {} : { reason: issue.reason }),
            decision: reply.decision,
            taskAcceptance: reply.taskAcceptance ?? 'none',
            companionOrder: reply.companionOrder,
            ...(reply.informationRequest === undefined
                ? {}
                : { informationRequest: reply.informationRequest }),
        },
        ...(scope === undefined
            ? {}
            : {
                  knowledgeScope: {
                      ...scope,
                      canSearch: false,
                      lookupsRemaining: 0,
                  },
              }),
    }
}

function replyProblem(
    input: NpcAiContext,
    reply: NpcAiReply,
    information: TurnInformation
): NpcReplyProblem | undefined {
    const code = npcReplyIssue(input, reply)
    return code === undefined ? information.validateReply?.(reply) : { code }
}

function refreshedReplyProblem(
    input: NpcAiContext,
    reply: NpcAiReply,
    information: TurnInformation
): NpcReplyProblem | undefined {
    return replyProblem(
        information.refreshContext?.() ?? input,
        reply,
        information
    )
}

/** A matching redundant low-level follow must not bypass or duplicate the consentful order. */
export function canonicalNpcReply(
    input: NpcAiContext,
    reply: NpcAiReply
): NpcAiReply {
    const speaker = input.events.find((event) => event.kind === 'message')
    const partnerId =
        speaker?.kind === 'message' ? speaker.senderId : input.task?.requesterId
    return reply.companionOrder === 'follow' &&
        reply.decision?.type === 'follow' &&
        partnerId != null &&
        reply.decision.targetId === partnerId
        ? { ...reply, decision: null }
        : reply
}

function assertCurrent(information: TurnInformation): void {
    if (information.current?.() === false) {
        throw new Error('Information lookup was cancelled')
    }
}

function assertLookupAvailable(
    request: NpcInformationRequest,
    input: NpcAiContext,
    information: TurnInformation
): void {
    if (
        request.type === 'knowledge_search' &&
        (information.search === undefined ||
            input.knowledgeScope?.canSearch === false ||
            input.knowledgeScope?.lookupsRemaining === 0)
    ) {
        throw new Error('Knowledge search is unavailable')
    }
}

async function lookupContext(
    request: NpcInformationRequest,
    state: NpcAiActorState,
    information: TurnInformation
): Promise<Partial<NpcAiContext>> {
    if (request.type === 'knowledge_search') {
        if (information.search === undefined) {
            throw new Error('Knowledge search is unavailable')
        }
        return {
            knowledge: {
                ...(await information.search(request.query)),
                query: request.query,
            },
        }
    }
    const query = state.dialogue?.text ?? state.task?.request ?? ''
    return {
        informationResults:
            information.lookup === undefined
                ? state.mind.deep(request.personId, query)
                : await information.lookup(request.personId),
    }
}

export function reserveInputCall(
    state: NpcAiActorState,
    sourceId: string
): void {
    const calls = state.modelCallsByInput.get(sourceId) ?? 0
    if (calls >= 2) {
        throw new Error('Per-input model call budget exhausted')
    }
    state.modelCallsByInput.set(sourceId, calls + 1)
    if (state.modelCallsByInput.size > 256) {
        const oldest = state.modelCallsByInput.keys().next().value
        if (oldest !== undefined) {
            state.modelCallsByInput.delete(oldest)
        }
    }
}

export function inputSource(
    state: NpcAiActorState,
    context: NpcAiContext
): string {
    return (
        state.dialogue?.id ??
        context.events.at(-1)?.id ??
        state.task?.id ??
        state.mind.conversationId
    )
}
