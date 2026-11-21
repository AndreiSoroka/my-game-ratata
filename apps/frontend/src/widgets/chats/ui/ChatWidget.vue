<script setup lang="ts">
import {
    ChatComposer,
    type ChatHistoryEntry,
    type ChatHistoryFilter,
    ChatHistoryPanel,
} from '@/entities/chats'

defineProps<{
    entries: readonly ChatHistoryEntry[]
    draft: string
    maxLength: number
    typing: boolean
    historyAttrs?: Record<string, unknown>
    composerAttrs?: Record<string, unknown>
}>()
const emit = defineEmits<{ 'update:draft': [value: string] }>()
const filter = defineModel<ChatHistoryFilter>('filter', { default: 'all' })
const collapsed = defineModel<boolean>('collapsed', { default: false })
</script>

<template>
    <div>
        <ChatHistoryPanel
            v-bind="historyAttrs"
            v-model:filter="filter"
            v-model:collapsed="collapsed"
            :entries="entries"
        />
        <ChatComposer
            v-if="typing"
            v-bind="composerAttrs"
            :draft="draft"
            :max-length="maxLength"
            @update:draft="emit('update:draft', $event)"
        />
    </div>
</template>
