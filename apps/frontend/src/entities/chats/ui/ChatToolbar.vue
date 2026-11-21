<script setup lang="ts">
import './chatButton.css'

import { UiButton, type UiButtonColors } from '@/shared/ui/common'
import { lightUiColors } from '@/shared/ui/theme'

import type { ChatHistoryFilter } from '../model/chatHistory'
import { chatButtonColors } from './chatButtonColors'

defineProps<{ historyId?: string; buttonAttrs?: Record<string, unknown> }>()
const filter = defineModel<ChatHistoryFilter>('filter', { default: 'all' })
const collapsed = defineModel<boolean>('collapsed', { default: false })

const channels = [
    ['all', 'Все'],
    ['say', 'Рядом'],
    ['whisper', 'Личные'],
] as const

const activeButtonColors = {
    ...chatButtonColors,
    highlighted: {
        ...chatButtonColors.highlighted,
        border: lightUiColors.border.gold,
        backgroundBottom: lightUiColors.border.gold,
    },
} satisfies UiButtonColors
</script>

<template>
    <header class="chat-toolbar">
        <nav v-show="!collapsed" class="chat-toolbar__channels" aria-label="Каналы чата">
            <UiButton
                v-for="[channel, label] in channels"
                :key="channel"
                v-bind="buttonAttrs"
                appearance="panel"
                panel="panel-001"
                class="chat-button"
                :highlighted="filter === channel || undefined"
                :colors="filter === channel ? activeButtonColors : chatButtonColors"
                :aria-pressed="filter === channel"
                @click="filter = channel"
            >
                {{ label }}
            </UiButton>
        </nav>
        <UiButton
            v-bind="buttonAttrs"
            appearance="panel"
            panel="panel-001"
            class="chat-button chat-toolbar__toggle"
            :colors="chatButtonColors"
            :aria-controls="historyId"
            :aria-expanded="!collapsed"
            :aria-label="collapsed ? 'Развернуть историю чата' : 'Свернуть историю чата'"
            @click="collapsed = !collapsed"
        >
            {{ collapsed ? '+' : '−' }}
        </UiButton>
    </header>
</template>

<style scoped>
.chat-toolbar,
.chat-toolbar__channels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.chat-toolbar {
    align-items: flex-start;
}

.chat-toolbar__toggle {
    margin-inline-start: auto;
}
</style>
