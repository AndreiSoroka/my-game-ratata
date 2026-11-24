<script setup lang="ts">
import './exchangeWindow.css'

import { computed, nextTick, useTemplateRef, watch } from 'vue'

import { tGame } from '@/shared/lib/i18n'
import { darkPanelButtonColors, UiButton } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

import ExchangeConsentIcon from './ExchangeConsentIcon.vue'
import ExchangeDraftPane from './ExchangeDraftPane.vue'
import ExchangeOfferPane from './ExchangeOfferPane.vue'
import ExchangeWindowFrame from './ExchangeWindowFrame.vue'
import type { ExchangeWindowProps } from './exchangeWindowProps'

const props = defineProps<ExchangeWindowProps>()
const emit = defineEmits<{
    changeItem: [instanceId: string, quantity: number]
    changeGold: [quantity: number]
    all: []
    clear: []
    edit: []
    propose: []
    confirm: []
    close: []
    restart: []
}>()
const active = computed(() => props.exchange.status === 'active')
const editing = computed(() => active.value && props.draft.editing)
const editPending = computed(() => props.draft.withdrawing || props.draft.confirming)
const terminal = computed(
    () => props.exchange.status === 'completed' || props.exchange.status === 'cancelled'
)
const terminalText = computed(() =>
    props.exchange.status === 'completed'
        ? tGame('game.trade.exchangeCompleted')
        : (props.exchange.notice ?? tGame('game.trade.exchangeCancelled'))
)
const participants = computed(() => [
    { side: 'own', name: tGame('game.trade.you'), accepted: props.exchange.own.accepted },
    { side: 'other', name: props.exchange.partnerName, accepted: props.exchange.other.accepted },
])
const actionButton = { appearance: 'panel', panel: 'panel-001' } as const
const sides = useTemplateRef<HTMLDivElement>('sides')

watch(editing, async (showEditor) => {
    const previousPane = sides.value?.firstElementChild
    const focused = document.activeElement
    if (!previousPane?.contains(focused)) return

    await nextTick()
    if (document.activeElement !== document.body && document.activeElement !== focused) return

    const ownPane = sides.value?.firstElementChild
    const action = showEditor ? 'input:not(:disabled)' : '[data-exchange-edit]'
    const target =
        ownPane?.querySelector<HTMLElement>(action) ??
        ownPane?.querySelector<HTMLElement>('[tabindex="0"]')
    target?.focus()
})
</script>

<template>
    <ExchangeWindowFrame
        :title="tGame('game.trade.exchangeHeading', { name: exchange.partnerName })"
        @close="emit('close')"
    >
        <template #summary>
            <section
                class="exchange-participants"
                :aria-label="tGame('game.trade.exchangeConsent')"
            >
                <div
                    v-for="person in participants"
                    :key="person.side"
                    class="exchange-participants__person"
                    :class="{ 'exchange-participants__person--accepted': person.accepted }"
                >
                    <ExchangeConsentIcon :name="person.name" :accepted="person.accepted" />
                    <div class="exchange-participants__label" aria-hidden="true">
                        <strong :title="person.name">{{ person.name }}</strong>
                        <span>{{
                            person.accepted
                                ? tGame('game.trade.confirmed')
                                : tGame('game.trade.tradeUnconfirmed')
                        }}</span>
                    </div>
                </div>
            </section>
        </template>
        <FantasyBorder
            v-if="terminal"
            class="exchange-terminal"
            border="border-008"
            color="var(--exchange-frame-accent)"
            :class="{ 'exchange-terminal--completed': exchange.status === 'completed' }"
            role="status"
        >
            {{ terminalText }}
        </FantasyBorder>
        <div
            ref="sides"
            class="exchange-sides"
            tabindex="0"
            :aria-label="tGame('game.trade.exchangeTerms')"
        >
            <ExchangeDraftPane
                v-if="editing"
                :draft="draft"
                @change-item="(instanceId, quantity) => emit('changeItem', instanceId, quantity)"
                @change-gold="emit('changeGold', $event)"
                @all="emit('all')"
                @clear="emit('clear')"
                @propose="emit('propose')"
            />
            <ExchangeOfferPane
                v-else
                :title="tGame('game.trade.yourOffer')"
                :offer="exchange.own"
                :terminal="terminal"
                :show-consent="false"
            >
                <template v-if="active" #actions>
                    <UiButton
                        class="exchange-offer-edit"
                        data-exchange-edit
                        appearance="panel"
                        panel="panel-015"
                        :colors="darkPanelButtonColors"
                        :aria-disabled="editPending || undefined"
                        @click="!editPending && emit('edit')"
                    >
                        {{ tGame('game.trade.editOffer') }}
                    </UiButton>
                </template>
            </ExchangeOfferPane>
            <ExchangeOfferPane
                :title="exchange.partnerName"
                :offer="exchange.other"
                :terminal="terminal"
                :show-consent="false"
            />
        </div>
        <template v-if="active || terminal" #actions>
            <div class="exchange-actions">
                <div class="exchange-actions__main">
                    <UiButton
                        v-if="terminal"
                        v-bind="actionButton"
                        variant="primary"
                        :disabled="partnerAvailable === false"
                        @click="emit('restart')"
                    >
                        {{ tGame('game.trade.newExchange') }}
                    </UiButton>
                    <UiButton
                        v-else
                        v-bind="actionButton"
                        variant="success"
                        :disabled="!draft.canConfirm"
                        @click="emit('confirm')"
                    >
                        {{
                            tGame(
                                exchange.own.accepted
                                    ? 'game.trade.confirmed'
                                    : 'game.trade.confirm'
                            )
                        }}
                    </UiButton>
                </div>
                <div v-if="active" class="exchange-draft-status" role="status">
                    <span v-if="draft.withdrawing">{{
                        tGame('game.trade.withdrawingConfirmation')
                    }}</span>
                    <span v-else-if="draft.confirming">{{
                        tGame('game.trade.confirmingTerms')
                    }}</span>
                    <span v-else-if="exchange.own.accepted">{{
                        tGame('game.trade.youConfirmedTheseTermsWithdraw')
                    }}</span>
                    <span v-else-if="draft.dirty">{{
                        tGame('game.trade.sendOfferBeforeConfirm')
                    }}</span>
                    <span v-else-if="draft.empty">{{ tGame('game.trade.addItemOrGold') }}</span>
                    <span v-else>{{
                        tGame('game.trade.changingTermsClearsBothConfirmations')
                    }}</span>
                </div>
                <UiButton
                    v-bind="actionButton"
                    class="exchange-actions__close"
                    :colors="darkPanelButtonColors"
                    @click="emit('close')"
                >
                    {{ tGame(active ? 'game.trade.cancel' : 'game.trade.close') }}
                </UiButton>
            </div>
        </template>
    </ExchangeWindowFrame>
</template>
