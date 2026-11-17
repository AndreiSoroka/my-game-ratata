import type { NpcAiActorState } from './runtimeState'

export function rememberConversation(
    state: NpcAiActorState,
    key: string,
    memory: string
): void {
    state.conversations.delete(key)
    state.conversations.set(key, memory.slice(0, 2000))
}

export function rememberDialogueReply(
    state: NpcAiActorState,
    event: Extract<import('./types').NpcAiEvent, { kind: 'message' }>,
    reply: import('./types').NpcAiReply
): void {
    if (reply.personMemoryUpdate != null) {
        state.mind.updatePerson(reply.personMemoryUpdate, event.senderId)
    }
    const key =
        event.channel === 'whisper' ? `whisper:${event.senderId}` : 'say'
    rememberConversation(state, key, reply.memory.slice(0, 2000))
}
export function finishOfferRequest(
    state: NpcAiActorState,
    event: Extract<import('./types').NpcAiEvent, { kind: 'message' }>,
    decision: import('@my-game-ratata/contracts').AgentDecision,
    accepted: boolean
): void {
    if (
        accepted &&
        ['quest_propose', 'worker_quest_propose'].includes(decision.type) &&
        state.task?.sourceId === event.id
    ) {
        state.task = null
        state.events = []
        state.awaitingFreshRequest = state.inbox.length === 0
    }
}
