<script setup lang="ts">
import { useId, useTemplateRef, watch } from 'vue'

import {
    ChatComposer,
    ChatComposerFrame,
    ChatFrame,
    type ChatHistoryEntry,
    type ChatHistoryFilter,
    ChatHistoryPanel,
    ChatToolbar,
} from '@/entities/chats'

defineProps<{
    entries: readonly ChatHistoryEntry[]
    draft: string
    maxLength: number
    typing: boolean
    historyAttrs?: Record<string, unknown>
    composerAttrs?: Record<string, unknown>
    buttonAttrs?: Record<string, unknown>
}>()
const emit = defineEmits<{ 'update:draft': [value: string] }>()
const filter = defineModel<ChatHistoryFilter>('filter', { default: 'all' })
const collapsed = defineModel<boolean>('collapsed', { default: false })
const historyId = useId()
const composer = useTemplateRef<InstanceType<typeof ChatComposer>>('composer')

watch(collapsed, () => composer.value?.focusAtEnd(), { flush: 'post' })
</script>

<template>
    <ChatFrame :collapsed="collapsed">
        <template #toolbar>
            <ChatToolbar
                v-bind="historyAttrs"
                v-model:filter="filter"
                v-model:collapsed="collapsed"
                :history-id="historyId"
                :button-attrs="buttonAttrs"
            />
        </template>
        <template #history>
            <ChatHistoryPanel
                v-bind="historyAttrs"
                :filter="filter"
                :collapsed="collapsed"
                :entries="entries"
                :list-id="historyId"
                :button-attrs="buttonAttrs"
            />
        </template>
        <template v-if="typing" #composer>
            <ChatComposerFrame :framed="!collapsed">
                <ChatComposer
                    ref="composer"
                    v-bind="composerAttrs"
                    :draft="draft"
                    :max-length="maxLength"
                    @update:draft="emit('update:draft', $event)"
                />
            </ChatComposerFrame>
        </template>
    </ChatFrame>
</template>
