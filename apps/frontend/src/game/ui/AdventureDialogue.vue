<script setup lang="ts">
import type { AdventureSnapshot, CharacterSnapshot, ClientMessage } from '@my-game-ratata/contracts'
import { computed, nextTick, ref, watch } from 'vue'

import { type DialogueNeighbors, DialoguePanel, DialogueTargetSwitcher } from '@/entities/dialogues'
import { SoulBadge } from '@/entities/player-effects'
import { CityDemandReport, RepairWorkshop, WorkshopOrders } from '@/entities/shops'
import { characterName, tGame, tLocalized } from '@/shared/lib/i18n'
import { darkPanelButtonColors, UiButton } from '@/shared/ui/common'
import { AdventureShopWidget } from '@/widgets/shops'

import { createAdventureServiceCommands } from './adventureServiceCommands'
import { dialogueSpeechKeys } from './dialogueSpeechKeys'
import SocialWindow from './SocialWindow.vue'
import { speechBubbleId } from './speechReceipts'
import { useEscapeOwner } from './uiEscapeOwners'
import { navigateDialogueActions } from './uiKeyboard'
const props = defineProps<{
    adventure: AdventureSnapshot
    characters: CharacterSnapshot[]
    neighbors?: DialogueNeighbors
    switchPending?: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage]; switchTarget: [key: string] }>()
function sendActiveCommand(message: ClientMessage): void {
    if (!props.switchPending) emit('command', message)
}
const { trade, repair, workshopOrder } = createAdventureServiceCommands(
    () => props.adventure,
    sendActiveCommand
)
const panel = ref<HTMLElement>()
const shopWindow = ref<InstanceType<typeof SocialWindow>>()
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
    view.value === 'conversation'
        ? props.adventure.dialogue?.choices
              .filter(
                  ({ id }) =>
                      !['accept_quest', 'quest_progress', 'turn_in_trophies'].includes(id) &&
                      !id.startsWith('worker-contract:')
              )
              .map(({ id, label, labelMessage }) => ({
                  id,
                  label: tLocalized(labelMessage, label),
              }))
        : undefined
)
const hasNeighbors = computed(
    () => !isSign.value && Boolean(props.neighbors?.left || props.neighbors?.right)
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
const heading = computed(() => {
    if (isSign.value) return undefined
    if (
        viewTitle.value === dialogueName.value ||
        viewTitle.value === tGame('game.conversation.conversation') ||
        (view.value === 'repair' && props.adventure.repairs) ||
        (view.value === 'demand' && props.adventure.market) ||
        (view.value === 'orders' && props.adventure.workshop)
    )
        return undefined
    return viewTitle.value
})
function focusFirstAction(id?: 'trade'): void {
    void nextTick(() => {
        const actions = panel.value?.querySelectorAll<HTMLButtonElement>(
            '[data-dialogue-action]:not(:disabled)'
        )
        const target =
            Array.from(actions ?? []).find((item) => item.dataset['dialogueAction'] === id) ??
            actions?.[0] ??
            panel.value?.querySelector<HTMLButtonElement>('header button')
        target?.focus()
    })
}
function choose(choiceId: string): void {
    if (props.switchPending) return
    if (choiceId === 'trade' && props.adventure.dialogue?.canTrade) view.value = 'shop'
    if (choiceId === 'repair') view.value = 'repair'
    if (choiceId === 'city_report') view.value = 'demand'
    if (choiceId === 'orders') view.value = 'orders'
    sendActiveCommand({ choiceId, type: 'dialogue_choice' })
    focusFirstAction()
}
function backToConversation(): void {
    if (props.switchPending) return
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
watch(
    () => props.switchPending,
    (pending) => {
        if (pending || !props.adventure.dialogue) return
        if (shopVisible.value) void shopWindow.value?.focusInitialAction()
        else focusFirstAction()
    }
)
function escapeDialogue(): void {
    if (props.switchPending) return
    if (view.value !== 'conversation') backToConversation()
    else sendActiveCommand({ choiceId: 'close', type: 'dialogue_choice' })
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
        class="adventure-dialogue"
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
        <DialoguePanel
            :title="dialogueName"
            :close-label="
                isSign
                    ? tGame('game.conversation.closeSign')
                    : tGame('game.conversation.endConversation')
            "
            :heading="heading"
            :choices="choices"
            :inline-text="
                isSign
                    ? tLocalized(adventure.dialogue.textMessage, adventure.dialogue.text)
                    : undefined
            "
            :hint="
                !isSign && adventure.dialogue.text
                    ? tGame('game.conversation.pageupPagedownReadTabSelect')
                    : undefined
            "
            :inert="switchPending"
            @close="sendActiveCommand({ choiceId: 'close', type: 'dialogue_choice' })"
            @choose="choose"
        >
            <template v-if="!isSign" #identity>
                <SoulBadge
                    :soul="
                        characters.find((character) => character.id === adventure.dialogue?.npcId)
                            ?.soul
                    "
                />
            </template>
            <template v-if="neighbors && hasNeighbors" #navigation>
                <DialogueTargetSwitcher
                    :neighbors="neighbors"
                    @switch-target="emit('switchTarget', $event)"
                />
            </template>
            <RepairWorkshop
                v-if="view === 'repair' && adventure.repairs"
                :repairs="adventure.repairs"
                :gold="adventure.gold"
                :blocked="Boolean(adventure.dialogue.tradeBlockedReason)"
                @repair="repair"
            />
            <CityDemandReport
                v-if="view === 'demand' && adventure.market"
                :market="adventure.market"
            />
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
            <UiButton
                v-if="view === 'repair' || view === 'demand' || view === 'orders'"
                appearance="panel"
                panel="panel-001"
                :colors="darkPanelButtonColors"
                data-dialogue-action
                @click="backToConversation"
            >
                {{ tGame('game.conversation.backConversation') }}
            </UiButton>
        </DialoguePanel>
        <p v-if="switchPending" class="dialogue-switch-status" role="status">
            {{ tGame('game.conversation.switchingTarget') }}
        </p>
    </section>
    <SocialWindow
        v-if="shopVisible"
        ref="shopWindow"
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
            :inert="switchPending"
            @buy="trade"
            @trade="trade"
            @close="backToConversation"
        >
            <template v-if="neighbors && hasNeighbors" #navigation>
                <DialogueTargetSwitcher
                    :neighbors="neighbors"
                    @switch-target="emit('switchTarget', $event)"
                />
            </template>
        </AdventureShopWidget>
        <p v-if="switchPending" class="dialogue-switch-status" role="status">
            {{ tGame('game.conversation.switchingTarget') }}
        </p>
    </SocialWindow>
</template>
