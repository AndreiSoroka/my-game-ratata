<script setup lang="ts">
import { type ExchangeOfferSnapshot, ITEM_DEFINITIONS } from '@my-game-ratata/contracts'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot } from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'

import ExchangeConsentIcon from './ExchangeConsentIcon.vue'

withDefaults(
    defineProps<{
        title: string
        offer: ExchangeOfferSnapshot
        terminal?: boolean
        showConsent?: boolean
    }>(),
    { showConsent: true }
)
defineSlots<{ default?: () => unknown; gold?: () => unknown; actions?: () => unknown }>()
</script>
<template>
    <FantasyBorder
        border="border-004"
        color="var(--exchange-frame-accent, var(--ui-dark-panel-border))"
        class="exchange-offer"
        role="region"
        :aria-label="title"
    >
        <header class="exchange-offer__header">
            <h3 :title="title">{{ title }}</h3>
            <span v-if="showConsent && !terminal" class="exchange-offer__state">{{
                offer.accepted
                    ? tGame('game.trade.tradeReady')
                    : tGame('game.trade.tradeUnconfirmed')
            }}</span>
            <ExchangeConsentIcon v-if="showConsent" :name="title" :accepted="offer.accepted" />
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
                <li v-for="item in offer.items" :key="item.instanceId" class="exchange-offer__item">
                    <ItemSlot :src="itemAssetCatalog[item.itemId].src" :quantity="item.quantity" />
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
                <li v-if="!offer.items.length" class="exchange-offer__empty">
                    {{ tGame('game.trade.empty') }}
                </li>
            </ul>
        </slot>
        <footer class="exchange-offer__footer">
            <div class="exchange-offer__gold">
                <slot name="gold">
                    <span>{{ tGame('game.trade.goldExchangeOffer') }}</span>
                    <strong>◈ {{ offer.gold }}</strong>
                </slot>
            </div>
            <slot name="actions" />
        </footer>
    </FantasyBorder>
</template>
<style scoped>
.exchange-offer {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--exchange-frame-surface, var(--ui-dark-panel-surface));
    color: var(--ui-dark-panel-text);
}
.exchange-offer__header {
    display: flex;
    align-items: center;
    flex: 0 0 auto;
    gap: 8px;
    margin-inline: 4px;
    padding: 7px 4px 9px;
    border-bottom: 1px solid var(--ui-dark-panel-divider);
}
.exchange-offer__header h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--ui-dark-panel-title);
    font: 600 18px / 1.2 var(--ratata-font-family, system-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.exchange-offer__state {
    font-size: 10px;
    color: var(--exchange-frame-muted, var(--ui-dark-panel-text));
}
.exchange-offer__refusal {
    flex: 0 0 auto;
    max-height: 54px;
    overflow: auto;
    margin: 0;
    padding: 6px 10px;
    color: var(--ui-dark-panel-warning);
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
    padding: 8px 4px;
    display: flex;
    flex-direction: column;
    gap: 7px;
}
.exchange-offer__item {
    display: flex;
    gap: 9px;
    align-items: center;
    padding: 4px;
    background: color-mix(in srgb, var(--ui-dark-panel-ornament) 7%, transparent);
    border-radius: 4px;
}
.exchange-offer__item .ui-item-slot {
    flex: none;
}
.exchange-offer__item div {
    min-width: 0;
    overflow-wrap: anywhere;
}
.exchange-offer__item strong,
.exchange-offer__item small {
    display: block;
}
.exchange-offer__item strong {
    font-size: 14px;
}
.exchange-offer__item small {
    color: var(--exchange-frame-muted, var(--ui-dark-panel-text));
    font-size: 12px;
}
.exchange-offer__empty {
    display: grid;
    place-items: center;
    flex: 1;
    color: var(--exchange-frame-muted, var(--ui-dark-panel-text));
    min-height: 70px;
    font-size: 12px;
}
.exchange-offer__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    flex: 0 0 auto;
    min-height: 49px;
    margin-inline: 4px;
    padding: 4px;
    border-top: 1px solid var(--ui-dark-panel-divider);
}
.exchange-offer__gold {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;
    gap: 7px;
    color: var(--ui-dark-panel-title);
    font-size: 12px;
}
</style>
