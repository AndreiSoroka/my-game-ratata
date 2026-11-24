<script setup lang="ts">
import { ref } from 'vue'

import type { ChatHistoryEntry } from '@/entities/chats'
import { ChatWidget } from '@/widgets/chats'

import type { ChatInputState } from '../runtime/chatInput'
import { isWorldHudButton, permitsWorldMovement, publicChatOwnsKey } from './keyboardOwnership'
import { useEscapeOwner } from './uiEscapeOwners'
import { worldHudButtonAttrs } from './uiKeyboard'

const props = defineProps<{ state: ChatInputState; entries: readonly ChatHistoryEntry[] }>()
const emit = defineEmits<{ draft: [value: string] }>()
const collapsed = ref(true)

function handleChatTab(event: KeyboardEvent): void {
    if (!props.state.active || event.key !== 'Tab' || !publicChatOwnsKey(event)) return
    event.preventDefault()
    if (!(event.currentTarget instanceof HTMLElement)) return
    const editor = event.currentTarget.querySelector<HTMLInputElement>(
        'input[data-public-chat-input]'
    )
    if (editor !== document.activeElement) editor?.focus({ preventScroll: true })
}

function handleHistoryKey(event: KeyboardEvent): void {
    if (isWorldHudButton(event.target)) return
    const target = event.target
    if (
        props.state.active &&
        event.key === 'Enter' &&
        target instanceof HTMLElement &&
        target.closest('button') === null
    )
        return
    if (!permitsWorldMovement(event)) event.stopPropagation()
}

const historyAttrs = {
    'data-game-input-owner': '',
    'data-world-movement': 'wasd',
    'data-public-chat-reader': '',
    onKeydown: handleHistoryKey,
    onKeyup: handleHistoryKey,
}
const composerAttrs = { autofocus: true, 'data-public-chat-input': '' }

useEscapeOwner({
    priority: 10,
    active: () =>
        document.activeElement instanceof HTMLElement &&
        !isWorldHudButton(document.activeElement) &&
        document.activeElement.closest('[data-public-chat-reader]') !== null,
    escape: () => document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus(),
})
</script>
<template>
    <ChatWidget
        v-model:collapsed="collapsed"
        class="game-chat"
        :entries="entries"
        :draft="state.draft"
        :max-length="state.maxLength"
        :typing="state.active"
        :history-attrs="historyAttrs"
        :composer-attrs="composerAttrs"
        :button-attrs="worldHudButtonAttrs"
        @keydown.capture="handleChatTab"
        @pointerdown.stop
        @update:draft="emit('draft', $event)"
    />
</template>

<style scoped>
.game-chat {
    position: absolute;
    --game-chat-bottom: var(--game-hotbar-bottom);
    bottom: var(--game-chat-bottom);
    left: 12px;
    z-index: 5;
    width: min(370px, calc(100% - 24px));
    max-block-size: calc(100% - var(--game-chat-bottom) - 12px);
}

@media (max-width: 1140px) {
    .game-chat {
        --game-chat-bottom: var(--game-hotbar-top);
    }
}

@media (max-width: 740px) {
    .game-chat {
        width: min(300px, calc(100% - 24px));
    }
}
</style>
