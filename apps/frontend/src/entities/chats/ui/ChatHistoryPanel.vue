<script setup lang="ts">
import './chatButton.css'

import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'

import { characterName, gameLocale, tGame } from '@/shared/lib/i18n'
import { hudPanelButtonColors, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import {
    type ChatHistoryEntry,
    type ChatHistoryFilter,
    filterChatHistory,
    speechDisplayText,
} from '../model/chatHistory'
import { createChatHistoryReadState } from '../model/chatHistoryReadState'

const props = withDefaults(
    defineProps<{
        entries: readonly ChatHistoryEntry[]
        filter?: ChatHistoryFilter
        collapsed?: boolean
        listId?: string
        buttonAttrs?: Record<string, unknown>
        privateConversation?: { partnerName: string; available: boolean }
    }>(),
    { filter: 'all', collapsed: false }
)
const scroller = useTemplateRef<HTMLOListElement>('scroller')
const defaultBorder = 'border-006'
const theme = useDarkPanelTheme()
const historyStyle = computed(() => darkPanelThemeStyle(theme.value))
const visible = computed(() =>
    props.privateConversation
        ? props.entries.filter((entry) => entry.channel === 'whisper')
        : filterChatHistory(props.entries, props.filter)
)
const preview = computed(() => visible.value.at(-1))
const speakerName = (entry: ChatHistoryEntry): string =>
    entry.self ? tGame('game.chat.you') : characterName(entry.actorId ?? '', entry.name)

let resizeObserver: ResizeObserver | undefined
const { unread, isAtBottom, updateScroll, receive } = createChatHistoryReadState()

function scroll(): void {
    const list = scroller.value
    updateScroll(!list || list.scrollHeight - list.scrollTop - list.clientHeight < 24)
}

function latest(): void {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    updateScroll(true)
}

watch(
    () => (props.privateConversation ? visible.value : props.entries).at(-1)?.id,
    (id) => {
        if (receive(id)) latest()
    },
    { flush: 'post' }
)
watch(() => props.filter, latest, { flush: 'post' })
watch(
    () => props.collapsed,
    (hidden) => {
        if (!hidden && isAtBottom()) latest()
    },
    { flush: 'post' }
)
onMounted(() => {
    latest()
    if (!scroller.value || typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => {
        if (!props.collapsed && isAtBottom()) latest()
    })
    resizeObserver.observe(scroller.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
    <aside
        class="chat-history"
        :class="{ 'chat-history--private': privateConversation }"
        :style="historyStyle"
        :aria-label="tGame(privateConversation ? 'game.chat.privateHistory' : 'game.chat.history')"
        tabindex="-1"
    >
        <p v-if="collapsed" class="chat-history__preview">
            <template v-if="preview">
                <strong>{{ speakerName(preview) }}: </strong>
                <span
                    :lang="
                        preview.translation?.locale ??
                        (preview.textMessage ? gameLocale : preview.language)
                    "
                    >{{ speechDisplayText(preview) }}</span
                >
            </template>
            <span v-else class="chat-history__empty">{{
                tGame(privateConversation ? 'game.chat.privateEmpty' : 'game.chat.empty')
            }}</span>
        </p>
        <FantasyBorder
            v-show="!collapsed"
            class="chat-history__surface"
            :border="theme?.border ?? defaultBorder"
            color="var(--chat-history-accent)"
        >
            <header v-if="privateConversation" class="chat-history__heading">
                <span role="heading" aria-level="3" :title="tGame('game.chat.privateAudience')">{{
                    tGame('game.chat.privateTitle', { name: privateConversation.partnerName })
                }}</span>
                <small v-if="!privateConversation.available" role="status">{{
                    tGame('game.chat.privateUnavailable')
                }}</small>
            </header>
            <ol
                :id="listId"
                ref="scroller"
                class="chat-history__entries"
                :class="{ 'private-conversation__history': privateConversation }"
                role="list"
                tabindex="0"
                :aria-label="
                    tGame(privateConversation ? 'game.chat.privateHistory' : 'game.chat.heard')
                "
                :aria-live="privateConversation ? 'polite' : 'off'"
                :aria-relevant="privateConversation ? 'additions' : undefined"
                @scroll="scroll"
            >
                <li
                    v-for="entry in visible"
                    :key="entry.id"
                    :class="`chat-history__${entry.channel}`"
                >
                    <small v-if="entry.channel === 'whisper' && !privateConversation"
                        >{{ tGame('game.chat.whisper') }} ·
                        {{ characterName(entry.partnerId ?? '', entry.partnerName ?? '') }}</small
                    >
                    <small v-else-if="entry.channel === 'status'">{{
                        tGame('game.chat.request')
                    }}</small>
                    <strong>{{ speakerName(entry) }}: </strong>
                    <span
                        :lang="
                            entry.translation?.locale ??
                            (entry.textMessage ? gameLocale : entry.language)
                        "
                        >{{ speechDisplayText(entry) }}</span
                    >
                    <details v-if="entry.translation" class="chat-history__original">
                        <summary>{{ tGame('game.chat.original') }}</summary>
                        <span :lang="entry.language">{{ entry.text }}</span>
                    </details>
                </li>
                <li v-if="!visible.length" class="chat-history__empty">
                    {{ tGame(privateConversation ? 'game.chat.privateEmpty' : 'game.chat.empty') }}
                </li>
            </ol>
            <UiButton
                v-if="unread"
                v-bind="buttonAttrs"
                appearance="panel"
                panel="panel-001"
                class="chat-button"
                :class="{ 'private-conversation__unread': privateConversation }"
                :colors="hudPanelButtonColors"
                @click="latest"
            >
                {{
                    privateConversation
                        ? tGame('game.chat.privateUnread')
                        : tGame('game.chat.unread', { count: unread })
                }}
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

.chat-history--private .chat-history__surface {
    grid-template: auto minmax(0, 1fr) / minmax(0, 1fr) auto;
}

.chat-history__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 6px;
    grid-area: 1 / 1;
    min-inline-size: 0;
    padding-inline: 4px;
    color: var(--ui-dark-panel-title);
}

.chat-history__heading span,
.chat-history__heading small {
    display: block;
    min-inline-size: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.chat-history__heading small {
    color: var(--ui-dark-panel-warning);
}

.chat-history--private .chat-history__entries {
    grid-area: 2 / 1 / 3 / -1;
    margin-block: 0;
    padding-inline: 4px;
}

.chat-history .private-conversation__unread {
    grid-area: 1 / 2;
    align-self: start;
    min-block-size: 20px;
    font: inherit;
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

.chat-history__original summary {
    cursor: pointer;
    width: fit-content;
    color: var(--ui-dark-panel-ornament);
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
