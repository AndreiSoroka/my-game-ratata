<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import type { ChatHistoryEntry } from './chatHistory'
import { isTextEntry, permitsWorldMovement } from './keyboardOwnership'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import { useEscapeOwner } from './uiEscapeOwners'

const props = defineProps<{ entries: ChatHistoryEntry[]; typing: boolean }>()
const filter = ref<'all' | 'say' | 'whisper'>('all')
const collapsed = ref(false)
const scroller = ref<HTMLElement>()
const atBottom = ref(true)
const unread = ref(0)
useEscapeOwner({
    priority: 10,
    active: () =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest('.chat-history') !== null,
    escape: () => document.querySelector<HTMLCanvasElement>('[data-game-canvas]')?.focus(),
})
const visible = computed(() =>
    props.entries.filter(
        (entry) =>
            filter.value === 'all' ||
            entry.channel === filter.value ||
            (filter.value === 'whisper' && entry.channel === 'status')
    )
)
function scroll(): void {
    const el = scroller.value
    atBottom.value = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 24
    if (atBottom.value) unread.value = 0
}
function latest(): void {
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    atBottom.value = true
    unread.value = 0
}
function key(event: KeyboardEvent): void {
    const target = event.target
    const draftKey =
        props.typing &&
        target instanceof HTMLElement &&
        target.closest('button') === null &&
        !isTextEntry(target)
    if (!draftKey && !permitsWorldMovement(event)) event.stopPropagation()
}
watch(
    () => props.entries.at(-1)?.id,
    async () => {
        const follow = atBottom.value
        await nextTick()
        if (follow) latest()
        else unread.value += 1
    }
)
watch(filter, async () => {
    await nextTick()
    latest()
})
</script>
<template>
    <aside
        class="chat-history rpg-panel game-frame-host"
        :class="{ 'chat-history--typing': typing, 'chat-history--collapsed': collapsed }"
        aria-label="История чата"
        data-game-input-owner
        data-world-movement="wasd"
        data-public-chat-reader
        tabindex="-1"
        @keydown="key"
        @keyup="key"
        @pointerdown.stop
    >
        <GameFrame variant="panel" />
        <header>
            <nav aria-label="Каналы чата">
                <GameButton
                    v-for="tab in [
                        ['all', 'Все'],
                        ['say', 'Рядом'],
                        ['whisper', 'Личные'],
                    ] as const"
                    :key="tab[0]"
                    :aria-pressed="filter === tab[0]"
                    @click="filter = tab[0]"
                >
                    {{ tab[1] }}
                </GameButton>
            </nav>
            <GameButton
                :aria-expanded="!collapsed"
                :aria-label="collapsed ? 'Развернуть историю чата' : 'Свернуть историю чата'"
                @click="collapsed = !collapsed"
            >
                {{ collapsed ? '+' : '−' }}
            </GameButton>
        </header>
        <ol
            v-show="!collapsed"
            ref="scroller"
            tabindex="0"
            aria-label="Услышанные реплики"
            aria-live="off"
            @scroll="scroll"
        >
            <li v-for="entry in visible" :key="entry.id" :class="`chat-history__${entry.channel}`">
                <small v-if="entry.channel === 'whisper'">Шёпот · {{ entry.partnerName }}</small>
                <small v-else-if="entry.channel === 'status'">Запрос</small>
                <strong>{{ entry.name }}:</strong> {{ entry.text }}
            </li>
            <li v-if="!visible.length" class="chat-history__empty">
                Здесь появятся услышанные реплики.
            </li>
        </ol>
        <GameButton v-if="unread && !collapsed" class="chat-history__new" @click="latest">
            Новые сообщения · {{ unread }} ↓
        </GameButton>
    </aside>
</template>
<style scoped>
.chat-history {
    position: absolute;
    bottom: 104px;
    left: 12px;
    z-index: 5;
    width: min(370px, calc(100vw - 24px));
    color: var(--rpg-text);
    font: 12px/1.4 system-ui;
    box-sizing: border-box;
}
.chat-history--typing {
    bottom: 64px;
}
header,
nav {
    display: flex;
    gap: 4px;
    align-items: center;
}
header {
    justify-content: space-between;
    padding: 5px;
    border-bottom: 1px solid #687251;
}
button {
    border: 1px solid transparent;
    padding: 3px 8px;
    cursor: pointer;
}
ol {
    max-height: min(24vh, 210px);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: #9e9e69 #1b2b20;
    list-style: none;
    margin: 0;
    padding: 8px;
}
li {
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    margin-bottom: 7px;
}
small {
    display: block;
    font-size: 10px;
    color: #b6c29c;
}
.chat-history__whisper {
    color: #d5cfed;
}
.chat-history__status,
.chat-history__empty {
    color: #b7c5ad;
    font-size: 11px;
}
.chat-history__new {
    width: 100%;
}
@media (max-width: 740px) {
    .chat-history {
        width: min(300px, calc(100vw - 24px));
        bottom: max(170px, var(--game-hotbar-top, 0px));
        font-size: 11px;
    }
    ol {
        max-height: 17vh;
    }
    .chat-history--typing {
        bottom: 64px;
    }
}
@media (max-height: 520px) {
    ol {
        max-height: 16vh;
    }
}
</style>
