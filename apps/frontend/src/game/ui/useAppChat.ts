import type { WorldSnapshot } from '@my-game-ratata/contracts'
import { type Ref, ref, watch } from 'vue'

import { type ChatInputState, chatMaxLength } from '../runtime/chatInput'
import { createChatHistory } from './chatHistory'

export function useAppChat(
    snapshot: Ref<WorldSnapshot | undefined>,
    playerId: Ref<string | undefined>
) {
    const chatInput = ref<ChatInputState>({ active: false, draft: '', maxLength: chatMaxLength })
    const chatHistory = createChatHistory()
    watch([playerId, () => snapshot.value?.serverEpoch], ([id, epoch]) =>
        chatHistory.session(epoch, id)
    )
    return { chatInput, chatHistory }
}
