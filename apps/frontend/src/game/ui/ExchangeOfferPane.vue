<script setup lang="ts">
import { type ExchangeOfferSnapshot, ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import { itemName, tGame } from '@/shared/lib/i18n'

import ExchangeConsentIcon from './ExchangeConsentIcon.vue'
import ItemIcon from './ItemIcon.vue'
import GameFrame from './primitives/GameFrame.vue'

defineProps<{ title: string; offer: ExchangeOfferSnapshot; terminal?: boolean }>()
</script>
<template>
    <section class="exchange-offer game-frame-host" :aria-label="title">
        <GameFrame variant="panel" />
        <header class="exchange-offer__header">
            <h3>{{ title }}</h3>
            <span v-if="!terminal" class="exchange-offer__state">{{
                offer.accepted
                    ? tGame('game.trade.tradeReady')
                    : tGame('game.trade.tradeUnconfirmed')
            }}</span>
            <ExchangeConsentIcon :name="title" :accepted="offer.accepted" />
        </header>
        <p v-if="offer.refusal && !terminal" class="exchange-offer__refusal" role="status">
            {{ offer.refusal.reason }}
        </p>
        <slot>
            <ul
                class="exchange-offer__items"
                tabindex="0"
                :aria-label="tGame('game.trade.itemsOf', { name: title })"
            >
                <li
                    v-for="item in offer.items"
                    :key="item.instanceId"
                    class="exchange-offer__item game-frame-host"
                >
                    <GameFrame variant="inset" />
                    <ItemIcon :item="item" show-quantity />
                    <div>
                        <strong>{{ itemName(item.itemId) }}</strong>
                        <small>{{
                            (item.quantity ?? 1) > 1
                                ? `× ${item.quantity}`
                                : tGame('game.trade.oneUnit')
                        }}</small>
                        <small v-if="ITEM_DEFINITIONS[item.itemId].maxDurability"
                            >{{ tGame('game.trade.durability') }}
                            {{
                                Math.floor(
                                    item.durability ??
                                        ITEM_DEFINITIONS[item.itemId].maxDurability ??
                                        0
                                )
                            }}</small
                        >
                    </div>
                </li>
                <li v-if="!offer.items.length" class="exchange-offer__empty game-frame-host">
                    <GameFrame variant="inset" />{{ tGame('game.trade.empty') }}
                </li>
            </ul>
        </slot>
        <footer class="exchange-offer__gold">
            <slot name="gold"
                ><span>{{ tGame('game.trade.goldExchangeOffer') }}</span
                ><strong>◈ {{ offer.gold }}</strong></slot
            >
        </footer>
    </section>
</template>
<style scoped>
.exchange-offer {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border: 1px solid transparent;
    overflow: hidden;
}
.exchange-offer__header {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 5px;
    padding: 7px 10px;
    background: #263b2e;
    border-bottom: 1px solid #45583f;
}
h3 {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.exchange-offer__state {
    font-size: 10px;
    color: #b8c7a8;
}
.exchange-offer__refusal {
    flex: 0 0 auto;
    max-height: 54px;
    overflow: auto;
    margin: 0;
    padding: 6px 10px;
    color: #e1c778;
    font-size: 11px;
    overflow-wrap: anywhere;
}
.exchange-offer__items {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    list-style: none;
    margin: 0;
    padding: 9px;
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.exchange-offer__item {
    display: flex;
    gap: 9px;
    align-items: center;
    padding: 8px;
    position: relative;
    border: 1px solid transparent;
}
.exchange-offer__item strong,
.exchange-offer__item small {
    display: block;
}
.exchange-offer__item strong {
    font-size: 12px;
}
.exchange-offer__item small {
    color: #b7c4a9;
    font-size: 10px;
}
.exchange-offer__empty {
    display: grid;
    place-items: center;
    flex: 1;
    color: #82947b;
    min-height: 70px;
    font-size: 12px;
    position: relative;
    border: 1px solid transparent;
}
.exchange-offer__gold {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    flex: 0 0 auto;
    min-height: 49px;
    padding: 8px 11px;
    border-top: 1px solid #45583f;
    color: #e4d49b;
    font-size: 12px;
}
</style>
