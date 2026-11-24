<script setup lang="ts">
import './exchangeWindow.css'

import { computed } from 'vue'

import { tGame } from '@/shared/lib/i18n'

import ExchangeOfferPane from './ExchangeOfferPane.vue'
import type { ExchangeWindowProps } from './exchangeWindowProps'

const props = defineProps<ExchangeWindowProps>()
const emit = defineEmits<{
    all: []
    clear: []
    edit: []
    propose: []
    confirm: []
    close: []
    restart: []
}>()
defineSlots<{ draftItems?: () => unknown; draftGold?: () => unknown }>()

const active = computed(() => props.exchange.status === 'active')
const terminal = computed(
    () => props.exchange.status === 'completed' || props.exchange.status === 'cancelled'
)
const terminalText = computed(() =>
    props.exchange.status === 'completed'
        ? tGame('game.trade.exchangeCompleted')
        : (props.exchange.notice ?? tGame('game.trade.exchangeCancelled'))
)
</script>

<template>
    <div class="exchange-content">
        <div
            v-if="terminal"
            class="exchange-terminal game-frame-host"
            :class="{ 'exchange-terminal--completed': exchange.status === 'completed' }"
            role="status"
        >
            <component :is="primitives.frame" variant="inset" />
            {{ terminalText }}
        </div>
        <div class="exchange-sides" tabindex="0" :aria-label="tGame('game.trade.exchangeTerms')">
            <ExchangeOfferPane
                :title="tGame('game.trade.you')"
                :offer="exchange.own"
                :terminal="terminal"
                :primitives="primitives"
            >
                <template v-if="draft.editing">
                    <div class="exchange-bag-tools">
                        <span>{{ tGame('game.trade.fromYourBag') }}</span>
                        <component :is="primitives.button" type="button" @click="emit('all')">
                            {{ tGame('game.trade.allItems') }}
                        </component>
                        <component :is="primitives.button" type="button" @click="emit('clear')">
                            {{ tGame('game.trade.removeItems') }}
                        </component>
                    </div>
                    <ul
                        class="exchange-own-items"
                        tabindex="0"
                        :aria-label="tGame('game.trade.yourAvailableTradeItems')"
                    >
                        <slot name="draftItems">
                            <li class="exchange-bag-empty">
                                {{ tGame('game.trade.yourBagIsEmpty') }}
                            </li>
                        </slot>
                    </ul>
                </template>
                <template v-if="draft.editing && $slots.draftGold" #gold>
                    <slot name="draftGold" />
                </template>
            </ExchangeOfferPane>
            <ExchangeOfferPane
                :title="exchange.partnerName"
                :offer="exchange.other"
                :terminal="terminal"
                :primitives="primitives"
            />
        </div>
        <div v-if="active" class="exchange-draft-status" role="status">
            <span v-if="draft.withdrawing">{{ tGame('game.trade.withdrawingConfirmation') }}</span>
            <span v-else-if="draft.confirming">{{ tGame('game.trade.confirmingTerms') }}</span>
            <span v-else-if="exchange.own.accepted">{{
                tGame('game.trade.youConfirmedTheseTermsWithdraw')
            }}</span>
            <span v-else-if="draft.error" class="exchange-error">{{ draft.error }}</span>
            <span v-else-if="!draft.valid" class="exchange-error">{{
                tGame('game.trade.someSelectedItemsAreUnavailable')
            }}</span>
            <span v-else-if="draft.pending">{{ tGame('game.trade.sendingOffer') }}</span>
            <span v-else-if="draft.dirty">{{
                tGame('game.trade.draftProposeChangesYourPartner')
            }}</span>
            <span v-else-if="draft.empty">{{ tGame('game.trade.addItemOrGold') }}</span>
            <span v-else>{{ tGame('game.trade.changingTermsClearsBothConfirmations') }}</span>
        </div>
        <footer class="exchange-actions">
            <template v-if="active">
                <component
                    v-if="!draft.editing"
                    :is="primitives.button"
                    type="button"
                    class="exchange-primary"
                    variant="primary"
                    :disabled="draft.withdrawing || draft.confirming"
                    @click="emit('edit')"
                >
                    {{ tGame('game.trade.editOffer') }}
                </component>
                <template v-else>
                    <component
                        :is="primitives.button"
                        type="button"
                        class="exchange-primary"
                        variant="primary"
                        :disabled="!draft.dirty || !draft.valid || draft.pending"
                        @click="emit('propose')"
                    >
                        {{ tGame('game.trade.makeOffer') }}
                    </component>
                    <component
                        :is="primitives.button"
                        type="button"
                        class="exchange-confirm"
                        variant="success"
                        :disabled="!draft.canConfirm"
                        @click="emit('confirm')"
                    >
                        {{
                            exchange.own.accepted && !draft.dirty
                                ? tGame('game.trade.confirmed')
                                : tGame('game.trade.confirm')
                        }}
                    </component>
                </template>
                <component
                    :is="primitives.button"
                    type="button"
                    class="exchange-cancel"
                    @click="emit('close')"
                >
                    {{ tGame('game.trade.cancel') }}
                </component>
            </template>
            <template v-else-if="terminal">
                <component
                    :is="primitives.button"
                    type="button"
                    class="exchange-primary"
                    variant="primary"
                    :disabled="partnerAvailable === false"
                    @click="emit('restart')"
                >
                    {{ tGame('game.trade.newExchange') }}
                </component>
                <component :is="primitives.button" type="button" @click="emit('close')">
                    {{ tGame('game.trade.close') }}
                </component>
            </template>
        </footer>
    </div>
</template>
