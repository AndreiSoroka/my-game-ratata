import type { NpcAiActorState } from './runtimeState'
import type { NpcAiEvent, NpcAiTask } from './types'

export function dialogueConversationKey(
    event: Extract<NpcAiEvent, { kind: 'message' }>
): string {
    return `${event.channel === 'whisper' ? 'whisper' : 'say'}:${event.senderId}`
}

export function taskConversationKey(task: NpcAiTask | null): string {
    const personId =
        task?.requesterId ??
        (task?.background === 'greeting' ? task.targetId : undefined)
    return personId == null
        ? 'city'
        : `${task?.audienceKey?.startsWith('whisper:') === true ? 'whisper' : 'say'}:${personId}`
}

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
    rememberConversation(
        state,
        dialogueConversationKey(event),
        reply.memory.slice(0, 2000)
    )
}
export function finishOfferRequest(
    state: NpcAiActorState,
    event: Extract<import('./types').NpcAiEvent, { kind: 'message' }>,
    decision: import('@my-game-ratata/contracts').AgentDecision,
    accepted: boolean
): void {
    if (
        accepted &&
        [
            'quest_propose',
            'worker_quest_propose',
            'quest_invitation_answer',
        ].includes(decision.type) &&
        state.task?.sourceId === event.id
    ) {
        state.task = null
        state.events = []
        state.awaitingFreshRequest = state.inbox.length === 0
    }
}
