<script setup lang="ts">
import type {
    AdventureSnapshot,
    AdventureTradeItemId,
    CharacterSnapshot,
    ClientMessage,
    QuestRewardMode,
} from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { SoulBadge } from '@/entities/player-effects'

import AdventureQuestDecision from './AdventureQuestDecision.vue'
import CityDemandReport from './CityDemandReport.vue'
import CityMarket from './CityMarket.vue'
import { dialogueSpeechKeys } from './dialogueSpeechKeys'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
import QuestRewardSummary from './QuestRewardSummary.vue'
import RepairWorkshop from './RepairWorkshop.vue'
import { speechBubbleId } from './speechReceipts'
import { useEscapeOwner } from './uiEscapeOwners'
import { activateFocusedButton } from './uiKeyboard'
import WorkshopOrders from './WorkshopOrders.vue'
const props = defineProps<{ adventure: AdventureSnapshot; characters: CharacterSnapshot[] }>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const panel = ref<HTMLElement>()
const view = ref<'conversation' | 'shop' | 'repair' | 'demand' | 'orders'>('conversation')
const isSign = computed(() => props.adventure.dialogue?.kind === 'sign')
const rewardMode = ref<QuestRewardMode>('party_equal')
const dialogueKey = computed(() =>
    props.adventure.dialogue
        ? `${props.adventure.dialogue.npcId}:${props.adventure.dialogue.speechId ?? props.adventure.dialogue.text}`
        : ''
)
type QuestChoice = 'accept_quest' | 'turn_in_trophies'
const pendingQuest = ref<{ choiceId: QuestChoice; dialogueKey: string; questId: string }>()
const questDecision = computed(() => {
    const pending = pendingQuest.value
    const { dialogue, quest } = props.adventure
    if (!pending || pending.dialogueKey !== dialogueKey.value || pending.questId !== quest.id)
        return undefined
    const expectedStatus = pending.choiceId === 'accept_quest' ? 'available' : 'ready'
    return quest.status === expectedStatus &&
        dialogue?.choices.some((choice) => choice.id === pending.choiceId)
        ? pending.choiceId
        : undefined
})
const viewTitle = computed(() =>
    view.value === 'conversation'
        ? props.adventure.dialogue?.title
        : { shop: 'Товары', repair: 'Ремонт', demand: 'Потребности города', orders: 'Заказы' }[
              view.value
          ]
)
function focusFirstAction(choiceId?: QuestChoice): void {
    void nextTick(() => {
        if (questDecision.value) return
        const actions = Array.from(
            panel.value?.querySelectorAll<HTMLButtonElement>(
                '[data-dialogue-action]:not(:disabled)'
            ) ?? []
        )
        const action = actions.find((item) => item.dataset['dialogueAction'] === choiceId)
        const nextFocus = action ?? actions[0]
        nextFocus?.focus()
    })
}
function closeQuestDecision(): void {
    const choiceId = pendingQuest.value?.choiceId
    pendingQuest.value = undefined
    if (props.adventure.dialogue) focusFirstAction(choiceId)
}
function confirmQuestDecision(): void {
    const choiceId = questDecision.value
    if (!choiceId) return
    closeQuestDecision()
    emit('command', {
        choiceId,
        type: 'dialogue_choice',
        ...(choiceId === 'accept_quest' ? { rewardMode: rewardMode.value } : {}),
    })
}
watch(questDecision, (choiceId) => {
    if (!choiceId && pendingQuest.value) closeQuestDecision()
})
function choose(choiceId: string): void {
    if (questDecision.value) return
    if (choiceId === 'accept_quest' || choiceId === 'turn_in_trophies') {
        pendingQuest.value = {
            choiceId,
            dialogueKey: dialogueKey.value,
            questId: props.adventure.quest.id,
        }
        return
    }
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
function escapeDialogue(): void {
    if (view.value !== 'conversation') backToConversation()
    else emit('command', { choiceId: 'close', type: 'dialogue_choice' })
}
useEscapeOwner({
    active: () => Boolean(props.adventure.dialogue && !questDecision.value),
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
    dialogueKey,
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
        v-if="adventure.dialogue"
        ref="panel"
        @keydown.stop="handleKeys"
        @keyup.stop
        class="adventure-dialogue adventure-window game-frame-host"
        :class="{ 'adventure-dialogue--sign': isSign }"
        role="dialog"
        aria-modal="false"
        :inert="questDecision ? true : undefined"
        :aria-describedby="
            !isSign
                ? speechBubbleId(adventure.dialogue.npcId, adventure.dialogue.speechId)
                : undefined
        "
        :aria-label="`${isSign ? 'Табличка' : 'Разговор'}: ${adventure.dialogue.npcName}`"
    >
        <GameFrame variant="window" />
        <header class="adventure-window__header">
            <h2 v-if="isSign">{{ adventure.dialogue.npcName }}</h2>
            <span v-else>{{ adventure.dialogue.npcName }}</span>
            <GameButton
                icon
                :aria-label="isSign ? 'Закрыть табличку' : 'Закончить разговор'"
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
            {{ adventure.dialogue.text }}
        </p>
        <small v-if="!isSign" class="dialogue-speech-help"
            >PageUp / PageDown — читать реплику · Tab — ответы</small
        >
        <div v-if="view === 'conversation'" class="adventure-choices">
            <QuestRewardSummary
                v-if="adventure.dialogue.choices.some((choice) => choice.id === 'quest_progress')"
                :total="adventure.quest.rewardGold"
                :mode="adventure.quest.rewardMode"
            />
            <GameButton
                v-for="choice in adventure.dialogue.choices"
                :key="choice.id"
                :data-dialogue-action="choice.id"
                @click="choose(choice.id)"
            >
                {{ choice.label }}
            </GameButton>
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
            <GameButton
                v-for="offer in adventure.market ? [] : adventure.shop"
                :key="offer.itemId"
                data-dialogue-action
                :disabled="
                    Boolean(adventure.dialogue.tradeBlockedReason) || adventure.gold < offer.price
                "
                @click="buy(offer.itemId)"
            >
                <span>{{ offer.label }}</span
                ><strong>{{ offer.price }} ◈</strong>
            </GameButton>
            <GameButton data-dialogue-action @click="backToConversation">
                ← Вернуться к разговору
            </GameButton>
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
        <GameButton
            v-if="view === 'repair' || view === 'demand' || view === 'orders'"
            data-dialogue-action
            @click="backToConversation"
        >
            ← Вернуться к разговору
        </GameButton>
    </section>
    <AdventureQuestDecision
        v-if="questDecision && adventure.dialogue"
        v-model="rewardMode"
        :quest="adventure.quest"
        :issuer="adventure.dialogue.npcName"
        :offer="questDecision === 'accept_quest'"
        @confirm="confirmQuestDecision"
        @cancel="closeQuestDecision"
    />
</template>
