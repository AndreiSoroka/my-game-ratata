<script setup lang="ts">
import type {
    AdventureSnapshot,
    AdventureTradeItemId,
    CharacterSnapshot,
    ClientMessage,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import SoulBadge from './SoulBadge.vue'
import { activateFocusedButton } from './uiKeyboard'
const props = defineProps<{ adventure: AdventureSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const panel = ref<HTMLElement>()
const view = ref<'conversation' | 'shop'>('conversation')
const isSign = computed(() => props.adventure.dialogue?.kind === 'sign')
function focusFirstAction(): void {
    void nextTick(() =>
        panel.value
            ?.querySelector<HTMLButtonElement>('[data-dialogue-action]:not(:disabled)')
            ?.focus()
    )
}
function choose(choiceId: string): void {
    if (choiceId === 'trade' && props.adventure.dialogue?.canTrade) view.value = 'shop'
    emit('command', { choiceId, type: 'dialogue_choice' })
    focusFirstAction()
}
function buy(itemId: AdventureTradeItemId): void {
    if (!props.adventure.dialogue?.tradeBlockedReason) emit('command', { itemId, type: 'trade' })
}
function backToConversation(): void {
    view.value = 'conversation'
    focusFirstAction()
}
watch(
    () => props.adventure.dialogue?.npcId,
    () => {
        view.value = 'conversation'
    }
)
let previousFocus: HTMLElement | undefined
function handleKeys(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
        event.preventDefault()
        if (view.value === 'shop') backToConversation()
        else emit('command', { choiceId: 'close', type: 'dialogue_choice' })
        return
    }
    if (activateFocusedButton(event, panel.value)) return
    const direction = ['ArrowDown', 'KeyS'].includes(event.code)
        ? 1
        : ['ArrowUp', 'KeyW'].includes(event.code)
          ? -1
          : 0
    if (!direction) return
    event.preventDefault()
    const buttons = Array.from(
        panel.value?.querySelectorAll<HTMLButtonElement>('[data-dialogue-action]:not(:disabled)') ??
            []
    )
    const current = buttons.findIndex((button) => button === document.activeElement)
    buttons[(current + direction + buttons.length) % buttons.length]?.focus()
}
watch(
    () =>
        props.adventure.dialogue
            ? `${props.adventure.dialogue.npcId}:${props.adventure.dialogue.text}`
            : '',
    async (key, oldKey) => {
        if (!key) {
            const canvas = document.querySelector<HTMLCanvasElement>('[data-game-canvas]')
            ;(canvas ?? (previousFocus?.isConnected ? previousFocus : undefined))?.focus()
            previousFocus = undefined
            return
        }
        if (!oldKey && document.activeElement instanceof HTMLElement)
            previousFocus = document.activeElement
        await nextTick()
        panel.value
            ?.querySelector<HTMLButtonElement>('[data-dialogue-action]:not(:disabled)')
            ?.focus()
    },
    { immediate: true }
)
</script>
<template>
    <section
        v-if="adventure.dialogue"
        ref="panel"
        @keydown.stop="handleKeys"
        @keyup.stop
        class="adventure-dialogue adventure-window"
        :class="{ 'adventure-dialogue--sign': isSign }"
        role="dialog"
        aria-modal="false"
        :aria-label="`${isSign ? 'Табличка' : 'Разговор'}: ${adventure.dialogue.npcName}`"
    >
        <header class="adventure-window__header">
            <h2 v-if="isSign">{{ adventure.dialogue.npcName }}</h2>
            <span v-else>{{ adventure.dialogue.npcName }}</span>
            <button
                type="button"
                :aria-label="isSign ? 'Закрыть табличку' : 'Закончить разговор'"
                @click="emit('command', { choiceId: 'close', type: 'dialogue_choice' })"
            >
                ×
            </button>
        </header>
        <SoulBadge
            v-if="!isSign"
            :soul="characters.find((character) => character.id === adventure.dialogue?.npcId)?.soul"
        />
        <h2 v-if="!isSign">{{ view === 'shop' ? 'Товары' : adventure.dialogue.title }}</h2>
        <p v-if="view === 'conversation'" class="adventure-dialogue__text">
            {{ adventure.dialogue.text }}
        </p>
        <div v-if="view === 'conversation'" class="adventure-choices">
            <button
                v-for="choice in adventure.dialogue.choices"
                :key="choice.id"
                type="button"
                data-dialogue-action
                @click="choose(choice.id)"
            >
                {{ choice.label }}
            </button>
        </div>
        <div
            v-if="view === 'shop' && adventure.dialogue.canTrade"
            class="adventure-shop"
            aria-label="Торговля"
        >
            <p v-if="adventure.dialogue.tradeBlockedReason" class="trade-refusal" role="status">
                {{ adventure.dialogue.tradeBlockedReason }}
            </p>
            <h3>
                В дорогу <span>У вас {{ adventure.gold }} золотых</span>
            </h3>
            <button
                v-for="offer in adventure.shop"
                :key="offer.itemId"
                data-dialogue-action
                type="button"
                :disabled="
                    Boolean(adventure.dialogue.tradeBlockedReason) || adventure.gold < offer.price
                "
                @click="buy(offer.itemId)"
            >
                <span>{{ offer.label }}</span
                ><strong>{{ offer.price }} ◈</strong>
            </button>
            <button type="button" data-dialogue-action @click="backToConversation">
                ← Вернуться к разговору
            </button>
        </div>
    </section>
</template>
