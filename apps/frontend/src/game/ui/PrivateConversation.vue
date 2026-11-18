<script setup lang="ts">
import type { ClientMessage, WhisperSnapshot } from '@my-game-ratata/contracts'
import { nextTick, onMounted, ref, watch } from 'vue'

import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import GameInput from './primitives/GameInput.vue'
import { usePrivateTyping } from './usePrivateTyping'

const props = defineProps<{ conversation: WhisperSnapshot; playerId: string }>()
const emit = defineEmits<{ send: [text: string]; command: [message: ClientMessage] }>()
const text = ref('')
const history = ref<HTMLElement>()
const nearBottom = ref(true)
const unread = ref(0)
const typing = usePrivateTyping({
    partnerId: () => props.conversation.partnerId,
    available: () => props.conversation.available,
    command: (command) => emit('command', command),
})
function send(): void {
    const message = text.value.trim()
    if (!message || !props.conversation.available) {
        return
    }
    typing.stop()
    emit('send', message)
    text.value = ''
}
function observeScroll(): void {
    const element = history.value
    if (!element) {
        return
    }
    nearBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight <= 24
    if (nearBottom.value) {
        unread.value = 0
    }
}
function bottom(): void {
    if (history.value) {
        history.value.scrollTop = history.value.scrollHeight
    }
    nearBottom.value = true
    unread.value = 0
}
watch(
    () => props.conversation.partnerId,
    () => {
        text.value = ''
        nearBottom.value = true
        unread.value = 0
    }
)
watch(
    () => props.conversation.messages.at(-1)?.id,
    async () => {
        const follow = nearBottom.value
        if (!follow) {
            unread.value += 1
            return
        }
        await nextTick()
        bottom()
    }
)
onMounted(bottom)
</script>
<template>
    <section class="private-conversation game-frame-host" aria-label="Приватный разговор">
        <GameFrame variant="panel" />
        <header class="private-conversation__header">
            <span title="Реплики слышите только вы и собеседник">Шёпот</span>
            <GameButton
                v-if="unread"
                type="button"
                class="private-conversation__unread"
                @click="bottom"
            >
                Новые сообщения ↓
            </GameButton>
            <small v-if="!conversation.available">Собеседник недоступен</small>
        </header>
        <ol
            ref="history"
            class="private-conversation__history"
            aria-live="polite"
            aria-label="История шёпота"
            tabindex="0"
            @scroll="observeScroll"
        >
            <li
                v-for="message in conversation.messages"
                :key="message.id"
                :class="{ 'private-conversation__own': message.senderId === playerId }"
            >
                <strong>{{
                    message.senderId === playerId ? 'Вы' : conversation.partnerName
                }}</strong>
                <span>{{ message.text }}</span>
            </li>
            <li v-if="!conversation.messages.length" class="private-conversation__empty">
                Пока нет сообщений.
            </li>
        </ol>
        <form
            class="private-conversation__form"
            @submit.prevent="send"
            @keydown.enter.stop
            @keyup.enter.stop
        >
            <label class="private-conversation__label">
                <span class="sr-only">Сказать шёпотом</span>
                <GameInput
                    v-model="text"
                    maxlength="400"
                    autocomplete="off"
                    :disabled="!conversation.available"
                    placeholder="Сообщение собеседнику"
                    @input="typing.input(text)"
                    @blur="typing.stop"
                />
            </label>
            <GameButton
                type="submit"
                :disabled="!conversation.available || !text.trim()"
                aria-label="Отправить"
                title="Отправить · Enter"
            >
                ↗
            </GameButton>
        </form>
    </section>
</template>
<style scoped>
.private-conversation {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border: 1px solid transparent;
    overflow: hidden;
}
.private-conversation__header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 28px;
    padding: 4px 10px;
    color: #b9c9ae;
    font-size: 11px;
    border-bottom: 1px solid #30472f;
}
.private-conversation__header small {
    color: #ddbd86;
}
.private-conversation__history {
    flex: 1;
    min-height: 50px;
    max-height: 190px;
    overflow: auto;
    overscroll-behavior: contain;
    list-style: none;
    padding: 7px 11px;
    margin: 0;
    overflow-wrap: anywhere;
}
.private-conversation__history li {
    margin-bottom: 8px;
    font-size: 12px;
    line-height: 1.4;
}
.private-conversation__history strong {
    display: inline;
    margin-right: 7px;
    color: #dfcf95;
    font-size: 10px;
}
.private-conversation__history span {
    color: #e0e6d6;
    white-space: pre-wrap;
}
.private-conversation__history .private-conversation__own strong {
    color: #96ba91;
}
.private-conversation__empty {
    color: #7f9479;
    font-style: italic;
}
.private-conversation__form {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    padding: 7px;
    border-top: 1px solid #30472f;
    background: #1b3023;
}
.private-conversation__label {
    flex: 1;
    min-width: 0;
}
.private-conversation__label input {
    box-sizing: border-box;
    width: 100%;
    min-height: 34px;
}
.private-conversation__form button {
    flex: 0 0 36px;
    min-height: 34px;
    padding: 0;
    font-size: 20px;
}
.private-conversation__unread {
    min-height: 20px !important;
    font-size: 10px !important;
    padding: 1px 6px !important;
}
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
}
</style>
