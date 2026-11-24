<script setup lang="ts">
import { computed } from 'vue'

import {
    ChatComposer,
    ChatComposerFrame,
    ChatFrame,
    type ChatHistoryEntry,
    ChatHistoryPanel,
} from '@/entities/chats'
import { tGame } from '@/shared/lib/i18n'
import { hudPanelButtonColors, UiButton } from '@/shared/ui/common'

const props = withDefaults(
    defineProps<{
        entries: readonly ChatHistoryEntry[]
        partnerName: string
        available: boolean
        maxLength?: number
    }>(),
    { maxLength: 400 }
)
const draft = defineModel<string>('draft', { required: true })
const emit = defineEmits<{ send: [text: string]; blur: [] }>()
const canSend = computed(() => props.available && Boolean(draft.value.trim()))

function send(): void {
    if (canSend.value) emit('send', draft.value.trim())
}

function handleEnter(event: KeyboardEvent): void {
    if (event.repeat && !event.isComposing) event.preventDefault()
}
</script>

<template>
    <ChatFrame
        class="private-conversation"
        role="region"
        :aria-label="tGame('game.chat.privateConversation')"
    >
        <template #history>
            <ChatHistoryPanel
                :entries="entries"
                :private-conversation="{ partnerName, available }"
            />
        </template>
        <template #composer>
            <ChatComposerFrame>
                <form
                    class="private-conversation__form"
                    @submit.prevent="send"
                    @keydown.enter.stop="handleEnter"
                    @keyup.enter.stop
                >
                    <ChatComposer
                        v-model:draft="draft"
                        :disabled="!available"
                        :max-length="maxLength"
                        :aria-label="tGame('game.chat.privateInput')"
                        :placeholder="tGame('game.chat.privatePlaceholder')"
                        focus-ring
                        @blur="emit('blur')"
                    />
                    <UiButton
                        appearance="panel"
                        panel="panel-001"
                        :colors="hudPanelButtonColors"
                        class="private-conversation__send"
                        type="submit"
                        :disabled="!canSend"
                        :aria-label="tGame('game.chat.privateSend')"
                        :title="tGame('game.chat.privateSendKey')"
                    >
                        <span aria-hidden="true">↗</span>
                    </UiButton>
                </form>
            </ChatComposerFrame>
        </template>
    </ChatFrame>
</template>

<style scoped>
.private-conversation {
    --chat-frame-height: var(--whisper-panel-height, clamp(128px, 23dvh, 176px));
    --chat-frame-gap: 4px;
    padding: 3px;
}

.private-conversation__form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px;
}

.private-conversation__send {
    --ui-button-panel-padding: 0;
    min-inline-size: 36px;
    min-block-size: 36px;
    font:
        20px/1 system-ui,
        sans-serif;
}
</style>
