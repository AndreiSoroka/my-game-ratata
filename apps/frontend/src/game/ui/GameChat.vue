<script setup lang="ts">
import type { ChatInputState } from '../runtime/chatInput'
import type { ChatHistoryEntry } from './chatHistory'
import ChatHistoryPanel from './ChatHistoryPanel.vue'
import ChatInputOverlay from './ChatInputOverlay.vue'

defineProps<{ state: ChatInputState; entries: ChatHistoryEntry[] }>()
</script>
<template>
    <ChatInputOverlay v-if="state.active" :state="state" />
    <ChatHistoryPanel :entries="entries" :typing="state.active" />
</template>
