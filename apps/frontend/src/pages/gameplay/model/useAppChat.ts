import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { type Ref, ref, watch } from 'vue'

import { createChatHistoryStore } from '@/entities/chats'

import { type ChatInputState, chatMaxLength } from '../../../game/runtime/chatInput'

export function useAppChat(
    snapshot: Ref<WorldSnapshot | undefined>,
    playerId: Ref<string | undefined>
) {
    const chatInput = ref<ChatInputState>({ active: false, draft: '', maxLength: chatMaxLength })
    const chatHistory = createChatHistoryStore()
    watch([playerId, () => snapshot.value?.serverEpoch], ([id, epoch]) =>
        chatHistory.session(epoch, id)
    )
    return { chatInput, chatHistory }
}
