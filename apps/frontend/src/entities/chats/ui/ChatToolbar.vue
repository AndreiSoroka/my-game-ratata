<script setup lang="ts">
import './chatButton.css'

import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, selectedDarkPanelButtonColors, UiButton } from '@/shared/ui/common'

import type { ChatHistoryFilter } from '../model/chatHistory'

defineProps<{ historyId?: string; buttonAttrs?: Record<string, unknown> }>()
const filter = defineModel<ChatHistoryFilter>('filter', { default: 'all' })
const collapsed = defineModel<boolean>('collapsed', { default: false })

const channels = [
    ['all', 'game.conversation.allChannels'],
    ['say', 'game.conversation.nearbyChannel'],
    ['whisper', 'game.conversation.privateChannel'],
] as const
</script>

<template>
    <header class="chat-toolbar">
        <nav
            v-show="!collapsed"
            class="chat-toolbar__channels"
            :aria-label="tGame('game.conversation.chatChannels')"
        >
            <UiButton
                v-for="[channel, label] in channels"
                :key="channel"
                v-bind="buttonAttrs"
                appearance="panel"
                panel="panel-001"
                class="chat-button"
                :highlighted="filter === channel || undefined"
                :colors="filter === channel ? selectedDarkPanelButtonColors : darkPanelButtonColors"
                :aria-pressed="filter === channel"
                @click="filter = channel"
            >
                {{ tGame(label) }}
            </UiButton>
        </nav>
        <UiButton
            v-bind="buttonAttrs"
            appearance="panel"
            panel="panel-001"
            class="chat-button chat-toolbar__toggle"
            :colors="darkPanelButtonColors"
            :aria-controls="historyId"
            :aria-expanded="!collapsed"
            :aria-label="
                collapsed
                    ? tGame('game.conversation.expandChatHistory')
                    : tGame('game.conversation.collapseChatHistory')
            "
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
