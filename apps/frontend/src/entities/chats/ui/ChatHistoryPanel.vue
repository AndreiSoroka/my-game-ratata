<script setup lang="ts">
import { computed, onMounted, ref, useId, useTemplateRef, watch } from 'vue'

import { HudFrame, UiButton, type UiButtonColors } from '@/shared/ui/common'
import { FantasyDivider } from '@/shared/ui/external'

import {
    type ChatHistoryEntry,
    type ChatHistoryFilter,
    filterChatHistory,
} from '../model/chatHistory'

const props = defineProps<{ entries: readonly ChatHistoryEntry[] }>()
const filter = defineModel<ChatHistoryFilter>('filter', { default: 'all' })
const collapsed = defineModel<boolean>('collapsed', { default: false })
const listId = useId()
const scroller = useTemplateRef<HTMLOListElement>('scroller')
const visible = computed(() => filterChatHistory(props.entries, filter.value))
const channels = [
    ['all', 'Все'],
    ['say', 'Рядом'],
    ['whisper', 'Личные'],
] as const

const buttonColors = {
    normal: {
        text: 'var(--ui-dark-panel-text)',
        border: 'var(--ui-dark-panel-ornament)',
        backgroundTop: 'var(--ui-dark-bar-track)',
        backgroundBottom: 'var(--ui-dark-panel-surface)',
    },
    highlighted: {
        text: 'var(--ui-dark-panel-title)',
        border: 'var(--ui-dark-panel-border)',
    },
    focus: 'var(--ui-dark-panel-title)',
    shadow: 'var(--ui-dark-panel-surface)',
} satisfies UiButtonColors

const activeButtonColors = {
    ...buttonColors,
    normal: {
        text: 'var(--ui-light-panel-title)',
        border: 'var(--ui-light-panel-parchment)',
        backgroundTop: 'var(--ui-light-panel-parchment)',
        backgroundBottom: 'var(--ui-dark-panel-border)',
    },
    highlighted: {
        text: 'var(--ui-light-panel-title)',
        border: 'var(--ui-light-border-white)',
    },
} satisfies UiButtonColors

let atBottom = true
const unread = ref(0)

function scroll(): void {
    const list = scroller.value
    atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 24
    if (atBottom) unread.value = 0
}

function latest(): void {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    atBottom = true
    unread.value = 0
}

watch(
    () => props.entries.at(-1)?.id,
    (id) => {
        if (!id || atBottom) latest()
        else unread.value += 1
    },
    { flush: 'post' }
)
watch(filter, latest, { flush: 'post' })
watch(
    collapsed,
    (hidden) => {
        if (!hidden && atBottom) latest()
    },
    { flush: 'post' }
)
onMounted(latest)
</script>

<template>
    <aside class="chat-history" aria-label="История чата" tabindex="-1">
        <HudFrame>
            <header class="chat-history__header">
                <nav class="chat-history__channels" aria-label="Каналы чата">
                    <UiButton
                        v-for="[channel, label] in channels"
                        :key="channel"
                        border="border-015"
                        class="chat-history__button"
                        :colors="filter === channel ? activeButtonColors : buttonColors"
                        :aria-pressed="filter === channel"
                        @click="filter = channel"
                    >
                        {{ label }}
                    </UiButton>
                </nav>
                <UiButton
                    border="border-015"
                    class="chat-history__button"
                    :colors="buttonColors"
                    :aria-controls="listId"
                    :aria-expanded="!collapsed"
                    :aria-label="collapsed ? 'Развернуть историю чата' : 'Свернуть историю чата'"
                    @click="collapsed = !collapsed"
                >
                    {{ collapsed ? '+' : '−' }}
                </UiButton>
            </header>
            <FantasyDivider
                v-if="!collapsed"
                divider="divider-002"
                ends="both"
                color="var(--ui-dark-panel-ornament)"
                aria-hidden="true"
            />
            <ol
                v-show="!collapsed"
                :id="listId"
                ref="scroller"
                class="chat-history__entries"
                role="list"
                tabindex="0"
                aria-label="Услышанные реплики"
                aria-live="off"
                @scroll="scroll"
            >
                <li
                    v-for="entry in visible"
                    :key="entry.id"
                    :class="`chat-history__${entry.channel}`"
                >
                    <small v-if="entry.channel === 'whisper'"
                        >Шёпот · {{ entry.partnerName }}</small
                    >
                    <small v-else-if="entry.channel === 'status'">Запрос</small>
                    <strong>{{ entry.name }}:</strong> {{ entry.text }}
                </li>
                <li v-if="!visible.length" class="chat-history__empty">
                    Здесь появятся услышанные реплики.
                </li>
            </ol>
            <UiButton
                v-if="unread && !collapsed"
                border="border-015"
                class="chat-history__button"
                :colors="buttonColors"
                @click="latest"
            >
                Новые сообщения · {{ unread }} ↓
            </UiButton>
        </HudFrame>
    </aside>
</template>

<style scoped>
.chat-history {
    min-width: 0;
    font:
        12px/1.4 system-ui,
        sans-serif;
}

.chat-history__header,
.chat-history__channels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.chat-history__header {
    justify-content: space-between;
    align-items: flex-start;
}

.chat-history__button {
    min-width: 36px;
    min-height: 36px;
    padding: 6px 9px;
    font-size: 14px;
}

.chat-history__entries {
    max-height: min(24vh, 210px);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: var(--ui-dark-panel-ornament) var(--ui-dark-panel-surface);
    list-style: none;
    margin: 0;
    padding: 5px 0;
}

.chat-history__entries:focus-visible {
    outline: 1px solid var(--ui-dark-panel-border);
    outline-offset: 2px;
}

.chat-history__entries li {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.chat-history__entries li + li {
    margin-top: 6px;
}

.chat-history__entries small {
    display: block;
    color: var(--ui-dark-panel-ornament);
    font-size: 10px;
}

.chat-history__whisper strong {
    color: var(--ui-dark-panel-positive);
}

.chat-history__status,
.chat-history__empty {
    color: var(--ui-dark-panel-border);
}

@media (max-width: 740px) {
    .chat-history {
        font-size: 11px;
    }

    .chat-history__entries {
        max-height: 17vh;
    }
}

@media (max-height: 520px) {
    .chat-history__entries {
        max-height: 16vh;
    }
}
</style>
