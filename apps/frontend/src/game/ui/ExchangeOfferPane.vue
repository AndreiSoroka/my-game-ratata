<script setup lang="ts">
import { type ExchangeOfferSnapshot, ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import ExchangeConsentIcon from './ExchangeConsentIcon.vue'
import ItemIcon from './ItemIcon.vue'

defineProps<{ title: string; offer: ExchangeOfferSnapshot; terminal?: boolean }>()
</script>
<template>
    <section class="exchange-offer" :aria-label="title">
        <header class="exchange-offer__header">
            <h3>{{ title }}</h3>
            <span v-if="!terminal" class="exchange-offer__state">{{
                offer.accepted ? 'Готово' : 'Не подтверждено'
            }}</span>
            <ExchangeConsentIcon :name="title" :accepted="offer.accepted" />
        </header>
        <p v-if="offer.refusal && !terminal" class="exchange-offer__refusal" role="status">
            {{ offer.refusal.reason }}
        </p>
        <slot>
            <ul class="exchange-offer__items" tabindex="0" :aria-label="`Предметы: ${title}`">
                <li v-for="item in offer.items" :key="item.instanceId" class="exchange-offer__item">
                    <ItemIcon :item="item" show-quantity />
                    <div>
                        <strong>{{ ITEM_DEFINITIONS[item.itemId].name }}</strong>
                        <small>{{
                            (item.quantity ?? 1) > 1 ? `× ${item.quantity}` : '1 шт.'
                        }}</small>
                        <small v-if="ITEM_DEFINITIONS[item.itemId].maxDurability"
                            >Прочность
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
                <li v-if="!offer.items.length" class="exchange-offer__empty">Пока пусто</li>
            </ul>
        </slot>
        <footer class="exchange-offer__gold">
            <slot name="gold"
                ><span>Золото</span><strong>◈ {{ offer.gold }}</strong></slot
            >
        </footer>
    </section>
</template>
<style scoped>
.exchange-offer {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: #12231c;
    border: 1px solid #506249;
    border-radius: 7px;
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
    background: #1c2e23;
    border: 1px solid #3e523a;
    border-radius: 5px;
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
    border: 1px dashed #40513b;
    border-radius: 4px;
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
