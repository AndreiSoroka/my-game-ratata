<script setup lang="ts">
import type { ChatInputState } from '../runtime/chatInput'
import type { ChatHistoryEntry } from './chatHistory'
import ChatHistoryPanel from './ChatHistoryPanel.vue'
import ChatInputOverlay from './ChatInputOverlay.vue'

defineProps<{ state: ChatInputState; entries: ChatHistoryEntry[] }>()
const emit = defineEmits<{ draft: [value: string] }>()
</script>
<template>
    <div class="game-chat" :class="{ 'game-chat--typing': state.active }">
        <ChatHistoryPanel :entries="entries" :typing="state.active" />
        <ChatInputOverlay v-if="state.active" :state="state" @draft="emit('draft', $event)" />
    </div>
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
