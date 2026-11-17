import type { NpcAiActorState } from './runtimeState'

export function rememberConversation(
    state: NpcAiActorState,
    key: string,
    memory: string
): void {
    state.conversations.delete(key)
    state.conversations.set(key, memory.slice(0, 2000))
    while (state.conversations.size > 32) {
        const oldest = state.conversations.keys().next().value
        if (oldest !== undefined) {
            state.conversations.delete(oldest)
        }
    }
}
