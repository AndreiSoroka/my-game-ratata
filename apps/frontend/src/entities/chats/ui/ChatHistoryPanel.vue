<script setup lang="ts">
import './chatButton.css'

import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

import { UiButton } from '@/shared/ui/common'
import { FantasyBorder, getFantasyBorderMetrics } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import {
    type ChatHistoryEntry,
    type ChatHistoryFilter,
    filterChatHistory,
} from '../model/chatHistory'
import { chatButtonColors } from './chatButtonColors'

const props = withDefaults(
    defineProps<{
        entries: readonly ChatHistoryEntry[]
        filter?: ChatHistoryFilter
        collapsed?: boolean
        listId?: string
        buttonAttrs?: Record<string, unknown>
    }>(),
    { filter: 'all', collapsed: false }
)
const scroller = useTemplateRef<HTMLOListElement>('scroller')
const defaultBorder = 'border-006'
const borderWidth = getFantasyBorderMetrics(defaultBorder).cornerSize
const theme = useDarkPanelTheme()
const historyStyle = computed(() => darkPanelThemeStyle(theme.value))
const visible = computed(() => filterChatHistory(props.entries, props.filter))
const preview = computed(() => visible.value.at(-1))

let atBottom = true
let resizeObserver: ResizeObserver | undefined
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
watch(() => props.filter, latest, { flush: 'post' })
watch(
    () => props.collapsed,
    (hidden) => {
        if (!hidden && atBottom) latest()
    },
    { flush: 'post' }
)
onMounted(() => {
    latest()
    if (!scroller.value || typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => {
        if (!props.collapsed && atBottom) latest()
    })
    resizeObserver.observe(scroller.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
    <aside class="chat-history" :style="historyStyle" aria-label="История чата" tabindex="-1">
        <p v-if="collapsed" class="chat-history__preview">
            <template v-if="preview">
                <strong>{{ preview.name }}:</strong> {{ preview.text }}
            </template>
            <span v-else class="chat-history__empty">Здесь появятся услышанные реплики.</span>
        </p>
        <FantasyBorder
            v-show="!collapsed"
            class="chat-history__surface"
            :border="theme?.border ?? defaultBorder"
            :border-width="borderWidth"
            color="var(--chat-history-accent)"
        >
            <ol
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
                v-if="unread"
                v-bind="buttonAttrs"
                appearance="panel"
                panel="panel-001"
                class="chat-button"
                :colors="chatButtonColors"
                @click="latest"
            >
                Новые сообщения · {{ unread }} ↓
            </UiButton>
        </FantasyBorder>
    </aside>
</template>

<style scoped>
.chat-history {
    --chat-history-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    --chat-history-accent: var(--ui-themed-panel-accent, var(--ui-dark-panel-border));
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-inline-size: 0;
    min-block-size: 0;
    color: var(--ui-dark-panel-text);
    font:
        12px/1.4 system-ui,
        sans-serif;
}

.chat-history__surface {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    min-block-size: 0;
    background: var(--chat-history-surface);
}

.chat-history__preview {
    align-self: center;
    overflow: hidden;
    margin: 0;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.chat-history:focus {
    outline: none;
}

.chat-history__entries {
    min-block-size: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: var(--ui-themed-panel-accent, var(--ui-dark-panel-ornament))
        var(--chat-history-surface);
    list-style: none;
    margin: 0;
    padding: 2px;
}

.chat-history__entries:focus-visible {
    outline: 1px solid var(--chat-history-accent);
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
    color: var(--chat-history-accent);
}

@media (max-width: 740px) {
    .chat-history {
        font-size: 11px;
    }
}
</style>
