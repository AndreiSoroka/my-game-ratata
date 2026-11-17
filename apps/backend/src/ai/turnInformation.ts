import type { DeepMemoryResult } from './characterMemory'
import type { NpcAiActorState } from './runtimeState'
import type { NpcAiContext, NpcAiReply } from './types'

export interface TurnInformation {
    prepare?: () => Promise<NpcAiContext>
    reserveCall?: () => boolean
    lookup?: (personId: string) => Promise<DeepMemoryResult>
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
    const input =
        information.prepare === undefined
            ? context
            : await Promise.race([information.prepare(), aborted])
    const reply = await decide(input)
    const request = reply.informationRequest
    if (request == null) {
        return reply
    }
    if (!lookupOnly(reply)) {
        throw new Error(
            'A memory lookup cannot also speak, accept a task or act'
        )
    }
    if (information.reserveCall?.() !== true) {
        throw new Error('Deep memory call budget exhausted')
    }
    const query = state.dialogue?.text ?? state.task?.request ?? ''
    const result =
        information.lookup === undefined
            ? state.mind.deep(request.personId, query)
            : await Promise.race([
                  information.lookup(request.personId),
                  aborted,
              ])
    const final = await decide({ ...input, informationResults: result })
    if (final.informationRequest != null) {
        throw new Error('One deep memory lookup is allowed per request')
    }
    return final
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
