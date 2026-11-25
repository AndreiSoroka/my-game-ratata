<script setup lang="ts">
import type { ClientMessage, WhisperSnapshot } from '@my-game-ratata/contracts'
import { computed, ref, watch } from 'vue'

import { privateChatHistoryEntry, PrivateChatView } from '@/entities/chats'
import { characterName } from '@/shared/lib/i18n'

import { usePrivateTyping } from '../model/usePrivateTyping'

const props = defineProps<{ conversation: WhisperSnapshot; playerId: string }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const draft = ref('')
const conversationKey = computed(() =>
    JSON.stringify([props.playerId, props.conversation.partnerId])
)
const partnerName = computed(() =>
    characterName(props.conversation.partnerId, props.conversation.partnerName)
)
const entries = computed(() => {
    const { messages, partnerId, partnerName } = props.conversation
    return messages.map((message) =>
        privateChatHistoryEntry(
            { ...message, partnerId, partnerName, senderName: partnerName },
            props.playerId
        )
    )
})
const typing = usePrivateTyping({
    partnerId: () => props.conversation.partnerId,
    available: () => props.conversation.available,
    command: (command) => emit('command', command),
})

watch(conversationKey, () => {
    typing.stop()
    draft.value = ''
})

function updateDraft(value: string): void {
    draft.value = value
    typing.input(value)
}

function send(text: string): void {
    if (!props.conversation.available) return
    typing.stop()
    emit('command', { type: 'whisper', targetId: props.conversation.partnerId, text })
    draft.value = ''
}
</script>

<template>
    <PrivateChatView
        :key="conversationKey"
        :entries="entries"
        :partner-name="partnerName"
        :available="conversation.available"
        :draft="draft"
        @update:draft="updateDraft"
        @send="send"
        @blur="typing.stop"
    />
</template>
