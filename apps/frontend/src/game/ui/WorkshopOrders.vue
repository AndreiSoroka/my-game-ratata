<script setup lang="ts">
import {
    type ClientMessage,
    type MarketSnapshot,
    quoteMarketTrade,
    type WorkshopOffer,
    type WorkshopSnapshot,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { craftOrderPaymentText, craftOrderStatusLabels as statuses } from './craftOrderLabels'
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
    <section class="workshop-orders" aria-label="Заказы ремесленнику">
        <p>У вас {{ gold }} золотых</p>
        <p class="workshop-orders__terms">
            Предоплата 50%. Остальное — при получении. Аванс не возвращается.
        </p>
        <div v-if="selected" class="order-confirm" role="group" aria-label="Подтверждение заказа">
            <strong>{{ selected.label }}</strong>
            <p>
                Полная цена {{ selected.fullPrice }} ◈ · сейчас {{ selected.deposit }} ◈ · при
                получении {{ selected.remaining }} ◈
            </p>
            <p>
                Заказ ждёт настоящие материалы и получает приоритет изготовления. Аванс не
                возвращается.
            </p>
            <button
                type="button"
                data-dialogue-action
                :disabled="blocked || !selected.canOrder || gold < selected.deposit"
                @click="place"
            >
                Внести предоплату {{ selected.deposit }} ◈
            </button>
            <button type="button" data-dialogue-action @click="selectedId = undefined">
                Назад
            </button>
        </div>
        <template v-else>
            <article
                v-for="offer in workshop.offers"
                :key="offer.itemId"
                class="workshop-order-row"
            >
                <strong>{{ offer.label }}</strong>
                <small>В наличии: {{ offer.stock }} · полная цена {{ offer.fullPrice }} ◈</small>
                <button
                    v-if="offer.stock > 0"
                    type="button"
                    data-dialogue-action
                    :disabled="blocked || gold < offer.fullPrice"
                    @click="buy(offer)"
                >
                    Купить · {{ offer.fullPrice }} ◈
                </button>
                <button
                    v-else
                    type="button"
                    data-dialogue-action
                    :disabled="blocked || !offer.canOrder || gold < offer.deposit"
                    @click="selectedId = offer.itemId"
                >
                    Заказать · аванс {{ offer.deposit }} ◈
                </button>
            </article>
        </template>
        <h3>Ваши заказы</h3>
        <p v-if="!workshop.orders.length">Заказов пока нет.</p>
        <article v-for="order in workshop.orders" :key="order.id" class="workshop-order-row">
            <strong>{{ order.label }}</strong
            ><span>{{ statuses[order.status] }}</span>
            <small>{{ craftOrderPaymentText(order) }}</small>
            <button
                v-if="order.status === 'ready'"
                type="button"
                data-dialogue-action
                :disabled="blocked || gold < order.remaining"
                @click="claim(order.id, order.remaining)"
            >
                Получить · доплатить {{ order.remaining }} ◈
            </button>
            <button
                v-if="['waiting_materials', 'queued', 'ready'].includes(order.status)"
                type="button"
                data-dialogue-action
                :disabled="blocked"
                @click="cancelId = order.id"
            >
                Отменить заказ
            </button>
        </article>
        <div v-if="cancelling" class="order-confirm" role="group" aria-label="Отмена заказа">
            <p>
                Отменить «{{ cancelling.label }}»? Аванс {{ cancelling.deposit }} ◈ не возвращается.
            </p>
            <button type="button" data-dialogue-action :disabled="blocked" @click="cancel">
                Отменить без возврата аванса
            </button>
            <button type="button" data-dialogue-action @click="cancelId = undefined">
                Сохранить заказ
            </button>
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
    border: 1px solid #68735c;
    padding: 10px;
}
.order-confirm {
    border-color: #d4b767;
    background: #273125;
}
small {
    color: #c9d3bb;
}
</style>
