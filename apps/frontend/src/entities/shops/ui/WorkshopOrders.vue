<script setup lang="ts">
import type { WorkshopOffer, WorkshopSnapshot } from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { darkPanelButtonColors, ItemSlot, UiButton } from '@/shared/ui/common'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import { craftOrderPaymentText, craftOrderStatusLabels as statuses } from '../lib/craftOrderLabels'
import type { WorkshopOrderAction } from '../model/workshopOrderAction'

const props = defineProps<{ workshop: WorkshopSnapshot; gold: number; blocked?: boolean }>()
const emit = defineEmits<{ action: [action: WorkshopOrderAction] }>()
const selectedId = ref<WorkshopOffer['itemId']>()
const cancelId = ref<string>()
const theme = useDarkPanelTheme()
const selected = computed(() =>
    props.workshop.offers.find((offer) => offer.itemId === selectedId.value)
)
const cancelling = computed(() =>
    props.workshop.orders.find((order) => order.id === cancelId.value)
)

function place(offer: WorkshopOffer): void {
    if (!offer.canOrder || props.blocked || props.gold < offer.deposit) return
    emit('action', { kind: 'place', itemId: offer.itemId, expectedTotal: offer.fullPrice })
    selectedId.value = undefined
}

function cancel(orderId: string): void {
    if (props.blocked) return
    emit('action', { kind: 'cancel', orderId })
    cancelId.value = undefined
}
</script>

<template>
    <FantasyBorder
        class="workshop-orders"
        :border="theme?.border ?? 'border-026'"
        :style="darkPanelThemeStyle(theme)"
        color="var(--workshop-accent)"
        role="region"
        :aria-label="tGame('game.trade.workshopOrders')"
    >
        <header class="workshop-orders__header">
            <h3>{{ tGame('game.trade.workshopOrders') }}</h3>
            <strong>
                {{ tGame('game.conversation.youHave') }} {{ gold }}
                {{ tGame('game.conversation.gold') }}
            </strong>
        </header>
        <FantasyDivider divider="divider-002" ends="both" color="var(--workshop-accent)" />
        <div class="workshop-orders__body">
            <FantasyBorder
                v-if="selected"
                class="order-confirm"
                role="group"
                :aria-label="tGame('game.trade.confirmOrder')"
                color="var(--workshop-accent)"
            >
                <div class="workshop-order-row__item">
                    <ItemSlot size="compact" :src="itemAssetCatalog[selected.itemId].src" />
                    <div>
                        <strong>{{ itemName(selected.itemId) }}</strong>
                        <p class="workshop-orders__gold">
                            {{ tGame('game.trade.fullPrice') }} {{ selected.fullPrice }}
                            {{ tGame('game.trade.now') }} {{ selected.deposit }}
                            {{ tGame('game.trade.onCollection') }} {{ selected.remaining }} ◈
                        </p>
                    </div>
                </div>
                <p>{{ tGame('game.trade.orderNeedsActualMaterialsAnd') }}</p>
                <div class="workshop-order-row__actions">
                    <UiButton
                        appearance="panel"
                        panel="panel-001"
                        variant="primary"
                        data-dialogue-action
                        :disabled="blocked || !selected.canOrder || gold < selected.deposit"
                        @click="place(selected)"
                    >
                        {{ tGame('game.trade.payDeposit') }} {{ selected.deposit }} ◈
                    </UiButton>
                    <UiButton
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        data-dialogue-action
                        @click="selectedId = undefined"
                    >
                        {{ tGame('game.trade.back') }}
                    </UiButton>
                </div>
            </FantasyBorder>
            <template v-else-if="workshop.offers.length">
                <p class="workshop-orders__terms">
                    {{ tGame('game.trade.payUpFrontAndRemainder') }}
                </p>
                <article
                    v-for="offer in workshop.offers"
                    :key="offer.itemId"
                    class="workshop-order-row"
                >
                    <div class="workshop-order-row__item">
                        <ItemSlot size="compact" :src="itemAssetCatalog[offer.itemId].src" />
                        <div>
                            <strong>{{ itemName(offer.itemId) }}</strong>
                            <p class="workshop-orders__terms">
                                {{ tGame('game.trade.inStockWorkshopOrders') }} {{ offer.stock }}
                                {{ tGame('game.trade.fullPriceWorkshopOrders') }}
                                <span class="workshop-orders__gold">{{ offer.fullPrice }} ◈</span>
                            </p>
                        </div>
                    </div>
                    <UiButton
                        v-if="offer.stock > 0"
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        data-dialogue-action
                        :disabled="blocked || gold < offer.fullPrice"
                        @click="emit('action', { kind: 'buy', itemId: offer.itemId })"
                    >
                        {{ tGame('game.trade.buyWorkshopOrders') }} {{ offer.fullPrice }} ◈
                    </UiButton>
                    <UiButton
                        v-else
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        data-dialogue-action
                        :disabled="blocked || !offer.canOrder || gold < offer.deposit"
                        @click="selectedId = offer.itemId"
                    >
                        {{ tGame('game.trade.orderDeposit') }} {{ offer.deposit }} ◈
                    </UiButton>
                </article>
            </template>
            <h4>{{ tGame('game.trade.yourOrders') }}</h4>
            <p v-if="!workshop.orders.length" class="workshop-orders__terms">
                {{ tGame('game.trade.noOrdersYet') }}
            </p>
            <article v-for="order in workshop.orders" :key="order.id" class="workshop-order-row">
                <div class="workshop-order-row__item">
                    <ItemSlot size="compact" :src="itemAssetCatalog[order.itemId].src" />
                    <div>
                        <strong>{{ itemName(order.itemId) }}</strong>
                        <p
                            class="workshop-order-row__status"
                            :class="{
                                'workshop-order-row__status--ready': order.status === 'ready',
                            }"
                        >
                            {{ statuses[order.status] }}
                        </p>
                        <p class="workshop-orders__terms">{{ craftOrderPaymentText(order) }}</p>
                    </div>
                </div>
                <div
                    v-if="['waiting_materials', 'queued', 'ready'].includes(order.status)"
                    class="workshop-order-row__actions"
                >
                    <UiButton
                        v-if="order.status === 'ready'"
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        data-dialogue-action
                        :disabled="blocked || gold < order.remaining"
                        @click="
                            emit('action', {
                                kind: 'claim',
                                orderId: order.id,
                                expectedRemaining: order.remaining,
                            })
                        "
                    >
                        {{ tGame('game.trade.collectPayRemaining') }} {{ order.remaining }} ◈
                    </UiButton>
                    <UiButton
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        data-dialogue-action
                        :disabled="blocked"
                        @click="cancelId = order.id"
                    >
                        {{ tGame('game.trade.cancelOrder') }}
                    </UiButton>
                </div>
            </article>
            <FantasyBorder
                v-if="cancelling"
                class="order-confirm"
                role="group"
                :aria-label="tGame('game.trade.cancelOrderWorkshopOrders')"
                color="var(--workshop-accent)"
            >
                <p>
                    {{ tGame('game.trade.cancelWorkshopOrders') }}{{ itemName(cancelling.itemId)
                    }}{{ tGame('game.trade.deposit') }} {{ cancelling.deposit }}
                    {{ tGame('game.trade.isNonrefundable') }}
                </p>
                <div class="workshop-order-row__actions">
                    <UiButton
                        appearance="panel"
                        panel="panel-001"
                        variant="danger"
                        data-dialogue-action
                        :disabled="blocked"
                        @click="cancel(cancelling.id)"
                    >
                        {{ tGame('game.trade.cancelAndForfeitDeposit') }}
                    </UiButton>
                    <UiButton
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        data-dialogue-action
                        @click="cancelId = undefined"
                    >
                        {{ tGame('game.trade.keepOrder') }}
                    </UiButton>
                </div>
            </FantasyBorder>
        </div>
    </FantasyBorder>
</template>

<style scoped src="./workshopOrders.css"></style>
