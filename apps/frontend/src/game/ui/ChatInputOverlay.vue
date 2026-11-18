<script setup lang="ts">
import type { ChatInputState } from '../runtime/chatInput'
import GameFrame from './primitives/GameFrame.vue'

defineProps<{
    state: ChatInputState
}>()
</script>

<template>
    <div class="chat-input game-frame-host" role="status" aria-live="polite">
        <GameFrame variant="inset" />
        <span>&gt;</span>
        <span class="chat-input__draft">{{ state.draft }}</span>
        <span class="chat-input__count"> {{ state.draft.length }}/{{ state.maxLength }} </span>
    </div>
</template>

<style scoped>
.chat-input {
    position: absolute;
    right: 14px;
    bottom: 14px;
    left: 14px;
    z-index: 4;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
    max-width: 720px;
    padding: 9px 12px;
    border: 1px solid transparent;
}

.chat-input__draft {
    min-width: 0;
    overflow-wrap: anywhere;
}

.chat-input__count {
    color: #95a6b9;
    font-size: 12px;
}
</style>
