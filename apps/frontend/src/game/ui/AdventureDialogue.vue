<script setup lang="ts">
import type { AdventureSnapshot, CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { SoulBadge } from '@/entities/player-effects'
import { CityDemandReport, RepairWorkshop, WorkshopOrders } from '@/entities/shops'
import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'
import { AdventureShopWidget } from '@/widgets/shops'

import { createAdventureServiceCommands } from './adventureServiceCommands'
import { dialogueSpeechKeys } from './dialogueSpeechKeys'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import SocialWindow from './SocialWindow.vue'
import { speechBubbleId } from './speechReceipts'
import { useEscapeOwner } from './uiEscapeOwners'
import { navigateDialogueActions } from './uiKeyboard'
const props = defineProps<{ adventure: AdventureSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const { trade, repair, workshopOrder } = createAdventureServiceCommands(
    () => props.adventure,
    (message) => emit('command', message)
)
const panel = ref<HTMLElement>()
const view = ref<'conversation' | 'shop' | 'repair' | 'demand' | 'orders'>('conversation')
const isSign = computed(() => props.adventure.dialogue?.kind === 'sign')
const dialogueName = computed(() => {
    const dialogue = props.adventure.dialogue
    return dialogue === null
        ? ''
        : tLocalized(dialogue.npcNameMessage, characterName(dialogue.npcId, dialogue.npcName))
})
const tradeBlockedReason = computed(() => {
    const dialogue = props.adventure.dialogue
    return dialogue?.tradeBlockedReason
        ? tLocalized(dialogue.tradeBlockedReasonMessage, dialogue.tradeBlockedReason)
        : undefined
})
const choices = computed(() =>
    props.adventure.dialogue?.choices.filter(
        ({ id }) =>
            !['accept_quest', 'quest_progress', 'turn_in_trophies'].includes(id) &&
            !id.startsWith('worker-contract:')
    )
)
const shopVisible = computed(() => view.value === 'shop' && props.adventure.dialogue?.canTrade)
const viewTitle = computed(() =>
    view.value === 'conversation'
        ? tLocalized(props.adventure.dialogue?.titleMessage, props.adventure.dialogue?.title ?? '')
        : {
              shop: tGame('game.conversation.goodsWith', { name: dialogueName.value }),
              repair: tGame('game.conversation.repairs'),
              demand: tGame('game.conversation.cityDemand'),
              orders: tGame('game.conversation.orders'),
          }[view.value]
)
function focusFirstAction(id?: 'trade'): void {
    void nextTick(() => {
        const actions = panel.value?.querySelectorAll<HTMLButtonElement>(
            '[data-dialogue-action]:not(:disabled)'
        )
        const target =
            Array.from(actions ?? []).find((item) => item.dataset['dialogueAction'] === id) ??
            actions?.[0]
        target?.focus()
    })
}
function choose(choiceId: string): void {
    if (choiceId === 'trade' && props.adventure.dialogue?.canTrade) view.value = 'shop'
    if (choiceId === 'repair') view.value = 'repair'
    if (choiceId === 'city_report') view.value = 'demand'
    if (choiceId === 'orders') view.value = 'orders'
    emit('command', { choiceId, type: 'dialogue_choice' })
    focusFirstAction()
}
function backToConversation(): void {
    const fromShop = view.value === 'shop'
    view.value = 'conversation'
    focusFirstAction(fromShop ? 'trade' : undefined)
}
watch(
    () => {
        const { npcId, initialView, speechId } = props.adventure.dialogue ?? {}
        return `${npcId}:${initialView}:${initialView ? speechId : ''}`
    },
    () => {
        const { initialView, canTrade } = props.adventure.dialogue ?? {}
        view.value =
            (initialView === 'shop' && !canTrade ? undefined : initialView) ?? 'conversation'
    },
    { immediate: true }
)
watch(shopVisible, (visible) => {
    if (!visible && view.value === 'shop') backToConversation()
})
function escapeDialogue(): void {
    if (view.value !== 'conversation') backToConversation()
    else emit('command', { choiceId: 'close', type: 'dialogue_choice' })
}
useEscapeOwner({
    active: () => Boolean(props.adventure.dialogue && !shopVisible.value),
    escape: escapeDialogue,
    element: panel,
})
let previousFocus: HTMLElement | undefined
function handleKeys(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
        event.preventDefault()
        escapeDialogue()
        return
    }
    if (dialogueSpeechKeys(event, panel.value, props.adventure.dialogue)) return
    navigateDialogueActions(event, panel.value)
}
watch(
    () => props.adventure.dialogue?.npcId,
    (key, oldKey) => {
        if (!key) {
            const canvas = document.querySelector<HTMLCanvasElement>('[data-game-canvas]')
            ;(canvas ?? (previousFocus?.isConnected ? previousFocus : undefined))?.focus()
            previousFocus = undefined
            return
        }
        if (!oldKey && document.activeElement instanceof HTMLElement)
            previousFocus = document.activeElement
        focusFirstAction()
    },
    { immediate: true }
)
</script>
<template>
    <section
        v-if="adventure.dialogue && !shopVisible"
        ref="panel"
        @keydown.stop="handleKeys"
        @keyup.stop
        class="adventure-dialogue adventure-window game-frame-host"
        :class="{ 'adventure-dialogue--sign': isSign }"
        role="dialog"
        aria-modal="false"
        :aria-describedby="
            !isSign && adventure.dialogue.text
                ? speechBubbleId(adventure.dialogue.npcId, adventure.dialogue.speechId)
                : undefined
        "
        :aria-label="`${isSign ? tGame('game.conversation.sign') : tGame('game.conversation.conversation')}: ${dialogueName}`"
    >
        <GameFrame variant="window" />
        <header class="adventure-window__header">
            <h2 v-if="isSign">{{ dialogueName }}</h2>
            <span v-else>{{ dialogueName }}</span>
            <GameButton
                icon
                :aria-label="
                    isSign
                        ? tGame('game.conversation.closeSign')
                        : tGame('game.conversation.endConversation')
                "
                @click="emit('command', { choiceId: 'close', type: 'dialogue_choice' })"
            >
                ×
            </GameButton>
        </header>
        <SoulBadge
            v-if="!isSign"
            :soul="characters.find((character) => character.id === adventure.dialogue?.npcId)?.soul"
        />
        <h2 v-if="!isSign">{{ viewTitle }}</h2>
        <p v-if="view === 'conversation' && isSign" class="adventure-dialogue__text">
            {{ tLocalized(adventure.dialogue.textMessage, adventure.dialogue.text) }}
        </p>
        <small v-if="!isSign && adventure.dialogue.text" class="dialogue-speech-help">
            {{ tGame('game.conversation.pageupPagedownReadTabSelect') }}
        </small>
        <div v-if="view === 'conversation'" class="adventure-choices">
            <GameButton
                v-for="choice in choices"
                :key="choice.id"
                :data-dialogue-action="choice.id"
                @click="choose(choice.id)"
            >
                {{ tLocalized(choice.labelMessage, choice.label) }}
            </GameButton>
        </div>
        <RepairWorkshop
            v-if="view === 'repair' && adventure.repairs"
            :repairs="adventure.repairs"
            :gold="adventure.gold"
            :blocked="Boolean(adventure.dialogue.tradeBlockedReason)"
            @repair="repair"
        />
        <CityDemandReport v-if="view === 'demand' && adventure.market" :market="adventure.market" />
        <p v-if="view === 'orders' && tradeBlockedReason" class="trade-refusal" role="status">
            {{ tradeBlockedReason }}
        </p>
        <WorkshopOrders
            v-if="view === 'orders' && adventure.workshop"
            :workshop="adventure.workshop"
            :gold="adventure.gold"
            :blocked="Boolean(adventure.dialogue.tradeBlockedReason)"
            @action="workshopOrder"
        />
        <GameButton
            v-if="view === 'repair' || view === 'demand' || view === 'orders'"
            data-dialogue-action
            @click="backToConversation"
        >
            {{ tGame('game.conversation.backConversation') }}
        </GameButton>
    </section>
    <SocialWindow
        v-if="shopVisible"
        :key="adventure.dialogue?.npcId"
        :title="viewTitle"
        layout="shop"
        @close="backToConversation"
    >
        <AdventureShopWidget
            :title="viewTitle"
            :offers="adventure.shop"
            :gold="adventure.gold"
            :blocked-reason="tradeBlockedReason"
            :market="adventure.market"
            @buy="trade"
            @trade="trade"
            @close="backToConversation"
        />
    </SocialWindow>
</template>
