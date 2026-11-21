<script setup lang="ts">
import type { ChatHistoryEntry } from '@/entities/chats'
import { ChatWidget } from '@/widgets/chats'

import type { ChatInputState } from '../runtime/chatInput'
import { permitsWorldMovement } from './keyboardOwnership'
import { useEscapeOwner } from './uiEscapeOwners'

const props = defineProps<{ state: ChatInputState; entries: readonly ChatHistoryEntry[] }>()
const emit = defineEmits<{ draft: [value: string] }>()

function handleHistoryKey(event: KeyboardEvent): void {
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
        document.activeElement.closest('[data-public-chat-reader]') !== null,
    escape: () => document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus(),
})
</script>
<template>
    <ChatWidget
        class="game-chat"
        :class="{ 'game-chat--typing': state.active }"
        :entries="entries"
        :draft="state.draft"
        :max-length="state.maxLength"
        :typing="state.active"
        :history-attrs="historyAttrs"
        :composer-attrs="composerAttrs"
        @pointerdown.stop
        @update:draft="emit('draft', $event)"
    />
</template>

<style scoped>
.game-chat {
    position: absolute;
    bottom: max(104px, var(--game-hotbar-top, 0px));
    left: 12px;
    z-index: 5;
    display: grid;
    gap: 8px;
    width: min(370px, calc(100% - 24px));
}

.game-chat--typing {
    bottom: max(64px, var(--game-hotbar-top, 0px));
}

@media (max-width: 740px) {
    .game-chat {
        bottom: max(170px, var(--game-hotbar-top, 0px));
        width: min(300px, calc(100% - 24px));
    }
}
</style>
