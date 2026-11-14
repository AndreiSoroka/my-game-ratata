<script setup lang="ts">
import type {
    AdventureSnapshot,
    AdventureTradeItemId,
    CharacterSnapshot,
    ClientMessage,
} from '@my-game-ratata/contracts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import CityDemandReport from './CityDemandReport.vue'
import CityMarket from './CityMarket.vue'
import { dialogueSpeechKeys } from './dialogueSpeechKeys'
import RepairWorkshop from './RepairWorkshop.vue'
import SoulBadge from './SoulBadge.vue'
import { speechBubbleId } from './speechReceipts'
import { activateFocusedButton } from './uiKeyboard'
import WorkshopOrders from './WorkshopOrders.vue'
const props = defineProps<{ adventure: AdventureSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const panel = ref<HTMLElement>()
const view = ref<'conversation' | 'shop' | 'repair' | 'demand' | 'orders'>('conversation')
const isSign = computed(() => props.adventure.dialogue?.kind === 'sign')
const viewTitle = computed(() =>
    view.value === 'conversation'
        ? props.adventure.dialogue?.title
        : { shop: 'Товары', repair: 'Ремонт', demand: 'Потребности города', orders: 'Заказы' }[
              view.value
          ]
)
function focusFirstAction(): void {
    void nextTick(() =>
        panel.value
            ?.querySelector<HTMLButtonElement>('[data-dialogue-action]:not(:disabled)')
            ?.focus()
    )
}
function choose(choiceId: string): void {
    if (choiceId === 'trade' && props.adventure.dialogue?.canTrade) view.value = 'shop'
    if (choiceId === 'repair') view.value = 'repair'
    if (choiceId === 'city_report') view.value = 'demand'
    if (choiceId === 'orders') view.value = 'orders'
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
    () => `${props.adventure.dialogue?.npcId}:${props.adventure.dialogue?.initialView}`,
    () => {
        view.value = props.adventure.dialogue?.initialView ?? 'conversation'
    },
    { immediate: true }
)
function escapeOutside(event: KeyboardEvent): void {
    if (
        event.code !== 'Escape' ||
        !props.adventure.dialogue ||
        (event.target instanceof Node && panel.value?.contains(event.target))
    )
        return
    const target = event.target instanceof HTMLElement ? event.target : document.activeElement
    if (target instanceof HTMLElement && target.closest('[role="dialog"], [role="menu"]')) return
    event.stopImmediatePropagation()
    handleKeys(event)
}
onMounted(() => window.addEventListener('keydown', escapeOutside, true))
onBeforeUnmount(() => window.removeEventListener('keydown', escapeOutside, true))
let previousFocus: HTMLElement | undefined
function handleKeys(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
        event.preventDefault()
        if (view.value !== 'conversation') backToConversation()
        else emit('command', { choiceId: 'close', type: 'dialogue_choice' })
        return
    }
    if (dialogueSpeechKeys(event, panel.value, props.adventure.dialogue)) return
    if (event.target instanceof HTMLInputElement) return
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
            ? `${props.adventure.dialogue.npcId}:${props.adventure.dialogue.speechId ?? props.adventure.dialogue.text}`
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
        :aria-describedby="
            !isSign
                ? speechBubbleId(adventure.dialogue.npcId, adventure.dialogue.speechId)
                : undefined
        "
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
        <h2 v-if="!isSign">{{ viewTitle }}</h2>
        <p v-if="view === 'conversation' && isSign" class="adventure-dialogue__text">
            {{ adventure.dialogue.text }}
        </p>
        <small v-if="!isSign" class="dialogue-speech-help"
            >PageUp / PageDown — читать реплику · Tab — ответы</small
        >
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
            <CityMarket
                v-if="adventure.market"
                :market="adventure.market"
                :npc-id="adventure.dialogue.npcId"
                :gold="adventure.gold"
                :blocked="Boolean(adventure.dialogue.tradeBlockedReason)"
                @command="emit('command', $event)"
            />
            <h3 v-if="!adventure.market">
                В дорогу <span>У вас {{ adventure.gold }} золотых</span>
            </h3>
            <button
                v-for="offer in adventure.market ? [] : adventure.shop"
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
        <RepairWorkshop
            v-if="view === 'repair' && adventure.repairs"
            :repairs="adventure.repairs"
            :gold="adventure.gold"
            :blocked="Boolean(adventure.dialogue.tradeBlockedReason)"
            @command="emit('command', $event)"
        />
        <CityDemandReport v-if="view === 'demand' && adventure.market" :market="adventure.market" />
        <p
            v-if="view === 'orders' && adventure.dialogue.tradeBlockedReason"
            class="trade-refusal"
            role="status"
        >
            {{ adventure.dialogue.tradeBlockedReason }}
        </p>
        <WorkshopOrders
            v-if="view === 'orders' && adventure.workshop"
            :workshop="adventure.workshop"
            :market="adventure.market"
            :gold="adventure.gold"
            :blocked="Boolean(adventure.dialogue.tradeBlockedReason)"
            @command="emit('command', $event)"
        />
        <button
            v-if="view === 'repair' || view === 'demand' || view === 'orders'"
            type="button"
            data-dialogue-action
            @click="backToConversation"
        >
            ← Вернуться к разговору
        </button>
    </section>
</template>
