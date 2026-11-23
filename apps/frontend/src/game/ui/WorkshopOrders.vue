<script setup lang="ts">
import {
    type ClientMessage,
    type MarketSnapshot,
    quoteMarketTrade,
    type WorkshopOffer,
    type WorkshopSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'

import { craftOrderPaymentText, craftOrderStatusLabels as statuses } from './craftOrderLabels'
import GameButton from './primitives/GameButton.vue'
import GameFrame from './primitives/GameFrame.vue'
const props = defineProps<{
    workshop: WorkshopSnapshot
    market?: MarketSnapshot
    gold: number
    blocked?: boolean
}>()
const emit = defineEmits<{ command: [message: ClientMessage] }>()
const selectedId = ref<WorkshopOffer['itemId']>()
const cancelId = ref<string>()
const selected = computed(() =>
    props.workshop.offers.find((offer) => offer.itemId === selectedId.value)
)
const cancelling = computed(() =>
    props.workshop.orders.find((order) => order.id === cancelId.value)
)
function place(): void {
    const offer = selected.value
    if (!offer?.canOrder || props.blocked || props.gold < offer.deposit) return
    emit('command', {
        type: 'craft_order_place',
        npcId: props.workshop.npcId,
        itemId: offer.itemId,
        expectedTotal: offer.fullPrice,
        requestId: crypto.randomUUID(),
    })
    selectedId.value = undefined
}
function buy(offer: WorkshopOffer): void {
    const row = props.market?.rows.find((row) => row.itemId === offer.itemId)
    if (!row || props.blocked) return
    const expectedTotal = quoteMarketTrade(row, 'buy', 1)
    if (expectedTotal === null || props.gold < expectedTotal) return
    emit('command', {
        type: 'market_trade',
        npcId: props.workshop.npcId,
        side: 'buy',
        itemId: row.itemId,
        quantity: 1,
        expectedTotal,
        requestId: crypto.randomUUID(),
    })
}
function cancel(): void {
    if (!cancelling.value || props.blocked) return
    emit('command', {
        type: 'craft_order_cancel',
        npcId: props.workshop.npcId,
        orderId: cancelling.value.id,
        requestId: crypto.randomUUID(),
    })
    cancelId.value = undefined
}
function claim(orderId: string, expectedRemaining: number): void {
    if (props.blocked || props.gold < expectedRemaining) return
    emit('command', {
        type: 'craft_order_claim',
        npcId: props.workshop.npcId,
        orderId,
        expectedRemaining,
        requestId: crypto.randomUUID(),
    })
}
</script>
<template>
    <section class="workshop-orders" :aria-label="tGame('game.trade.workshopOrders')">
        <p>
            {{ tGame('game.conversation.youHave') }} {{ gold }}
            {{ tGame('game.conversation.gold') }}
        </p>
        <p class="workshop-orders__terms">
            {{ tGame('game.trade.payUpFrontAndRemainder') }}
        </p>
        <div
            v-if="selected"
            class="order-confirm game-frame-host"
            role="group"
            :aria-label="tGame('game.trade.confirmOrder')"
        >
            <GameFrame variant="panel" />
            <strong>{{ itemName(selected.itemId) }}</strong>
            <p>
                {{ tGame('game.trade.fullPrice') }} {{ selected.fullPrice }}
                {{ tGame('game.trade.now') }} {{ selected.deposit }}
                {{ tGame('game.trade.onCollection') }} {{ selected.remaining }} ◈
            </p>
            <p>
                {{ tGame('game.trade.orderNeedsActualMaterialsAnd') }}
            </p>
            <GameButton
                variant="primary"
                data-dialogue-action
                :disabled="blocked || !selected.canOrder || gold < selected.deposit"
                @click="place"
            >
                {{ tGame('game.trade.payDeposit') }} {{ selected.deposit }} ◈
            </GameButton>
            <GameButton data-dialogue-action @click="selectedId = undefined">
                {{ tGame('game.trade.back') }}
            </GameButton>
        </div>
        <template v-else>
            <article
                v-for="offer in workshop.offers"
                :key="offer.itemId"
                class="workshop-order-row game-frame-host"
            >
                <GameFrame variant="inset" />
                <strong>{{ itemName(offer.itemId) }}</strong>
                <small
                    >{{ tGame('game.trade.inStockWorkshopOrders') }} {{ offer.stock }}
                    {{ tGame('game.trade.fullPriceWorkshopOrders') }} {{ offer.fullPrice }} ◈</small
                >
                <GameButton
                    v-if="offer.stock > 0"
                    data-dialogue-action
                    :disabled="blocked || gold < offer.fullPrice"
                    @click="buy(offer)"
                >
                    {{ tGame('game.trade.buyWorkshopOrders') }} {{ offer.fullPrice }} ◈
                </GameButton>
                <GameButton
                    v-else
                    data-dialogue-action
                    :disabled="blocked || !offer.canOrder || gold < offer.deposit"
                    @click="selectedId = offer.itemId"
                >
                    {{ tGame('game.trade.orderDeposit') }} {{ offer.deposit }} ◈
                </GameButton>
            </article>
        </template>
        <h3>{{ tGame('game.trade.yourOrders') }}</h3>
        <p v-if="!workshop.orders.length">{{ tGame('game.trade.noOrdersYet') }}</p>
        <article
            v-for="order in workshop.orders"
            :key="order.id"
            class="workshop-order-row game-frame-host"
        >
            <GameFrame variant="inset" />
            <strong>{{ itemName(order.itemId) }}</strong
            ><span>{{ statuses[order.status] }}</span>
            <small>{{ craftOrderPaymentText(order) }}</small>
            <GameButton
                variant="success"
                v-if="order.status === 'ready'"
                data-dialogue-action
                :disabled="blocked || gold < order.remaining"
                @click="claim(order.id, order.remaining)"
            >
                {{ tGame('game.trade.collectPayRemaining') }} {{ order.remaining }} ◈
            </GameButton>
            <GameButton
                v-if="['waiting_materials', 'queued', 'ready'].includes(order.status)"
                data-dialogue-action
                :disabled="blocked"
                @click="cancelId = order.id"
            >
                {{ tGame('game.trade.cancelOrder') }}
            </GameButton>
        </article>
        <div
            v-if="cancelling"
            class="order-confirm game-frame-host"
            role="group"
            :aria-label="tGame('game.trade.cancelOrderWorkshopOrders')"
        >
            <GameFrame variant="panel" />
            <p>
                {{ tGame('game.trade.cancelWorkshopOrders') }}{{ itemName(cancelling.itemId)
                }}{{ tGame('game.trade.deposit') }} {{ cancelling.deposit }}
                {{ tGame('game.trade.isNonrefundable') }}
            </p>
            <GameButton variant="danger" data-dialogue-action :disabled="blocked" @click="cancel">
                {{ tGame('game.trade.cancelAndForfeitDeposit') }}
            </GameButton>
            <GameButton data-dialogue-action @click="cancelId = undefined">
                {{ tGame('game.trade.keepOrder') }}
            </GameButton>
        </div>
    </section>
</template>
<style scoped>
.workshop-orders {
    display: grid;
    gap: 10px;
    max-height: 55dvh;
    overflow: auto;
    font:
        13px/1.45 system-ui,
        sans-serif;
}
.workshop-orders__terms {
    color: #eed59b;
}
.workshop-order-row,
.order-confirm {
    display: grid;
    gap: 6px;
    border: 1px solid transparent;
    padding: 10px;
}
small {
    color: #c9d3bb;
}
</style>
