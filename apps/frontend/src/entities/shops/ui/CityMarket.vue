<script setup lang="ts">
import {
    type MarketRow,
    type MarketSide,
    type MarketSnapshot,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'
import { ref, useId, useTemplateRef } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import {
    darkPanelButtonColors,
    ItemSlot,
    selectedDarkPanelButtonColors,
    UiButton,
} from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import type { MarketTradeSelection } from '../model/marketTradeSelection'

const props = defineProps<{ market: MarketSnapshot; gold: number; blocked?: boolean }>()
const emit = defineEmits<{ trade: [selection: MarketTradeSelection] }>()
const theme = useDarkPanelTheme()
const sides = ['buy', 'sell'] as const
const side = ref<MarketSide>('buy')
const quantity = ref(1)
const tabs = useTemplateRef<HTMLDivElement>('tabs')
const instanceId = useId()
const panelId = `${instanceId}-market-panel`

function tabId(direction: MarketSide): string {
    return `${instanceId}-market-${direction}`
}

function tabKey(event: KeyboardEvent): void {
    switch (event.key) {
        case 'Home':
            side.value = 'buy'
            break
        case 'End':
            side.value = 'sell'
            break
        case 'ArrowLeft':
        case 'ArrowRight':
            side.value = side.value === 'buy' ? 'sell' : 'buy'
            break
        default:
            return
    }
    event.preventDefault()
    event.stopPropagation()
    tabs.value?.querySelector<HTMLElement>(`[id="${tabId(side.value)}"]`)?.focus()
}

function total(row: MarketRow): number | null {
    return quoteMarketTrade(row, side.value, quantity.value)
}

function canTrade(expectedTotal: number | null): expectedTotal is number {
    return (
        !props.blocked &&
        expectedTotal !== null &&
        (side.value === 'sell' || props.gold >= expectedTotal)
    )
}

function trade(row: MarketRow): void {
    const expectedTotal = total(row)
    if (!canTrade(expectedTotal)) return
    emit('trade', { side: side.value, itemId: row.itemId, quantity: quantity.value, expectedTotal })
}
</script>

<template>
    <section
        class="city-market"
        :aria-label="tGame('game.trade.cityMarket')"
        :style="darkPanelThemeStyle(theme)"
    >
        <header class="city-market__summary">
            <h3>{{ market.cityName }}</h3>
            <p>
                {{ tGame('game.conversation.youHave') }} {{ gold }}
                {{ tGame('game.conversation.gold') }}
            </p>
        </header>
        <div
            ref="tabs"
            class="market-tabs"
            role="tablist"
            :aria-label="tGame('game.conversation.trade')"
            @keydown="tabKey"
        >
            <UiButton
                v-for="direction in sides"
                :key="direction"
                :id="tabId(direction)"
                role="tab"
                data-dialogue-action
                appearance="panel"
                panel="panel-001"
                :colors="side === direction ? selectedDarkPanelButtonColors : darkPanelButtonColors"
                :aria-controls="panelId"
                :aria-selected="side === direction"
                :tabindex="side === direction ? 0 : -1"
                :highlighted="side === direction || undefined"
                @click="side = direction"
            >
                {{ tGame(direction === 'buy' ? 'game.trade.buy' : 'game.trade.sell') }}
            </UiButton>
        </div>
        <div
            :id="panelId"
            class="city-market__panel"
            role="tabpanel"
            :aria-labelledby="tabId(side)"
        >
            <label class="market-quantity">
                {{ tGame('game.trade.quantity') }}
                <FantasyBorder
                    as="span"
                    border="border-015"
                    class="market-quantity__field"
                    color="var(--city-market-accent)"
                >
                    <input v-model.number="quantity" type="number" min="1" max="100" step="1" />
                </FantasyBorder>
            </label>
            <FantasyBorder
                v-if="market.rows.length"
                class="city-market__stock"
                border="border-004"
                color="var(--city-market-accent)"
            >
                <div v-for="row in market.rows" :key="row.itemId" class="market-row">
                    <div class="market-row__item">
                        <ItemSlot size="compact" :src="itemAssetCatalog[row.itemId].src" />
                        <span>
                            <strong>{{ itemName(row.itemId) }}</strong>
                            <small :class="{ 'market-row__empty-stock': row.stock === 0 }"
                                >{{ tGame('game.trade.inStock') }} {{ row.stock }}&nbsp;/&nbsp;{{
                                    row.capacity
                                }}</small
                            >
                        </span>
                    </div>
                    <UiButton
                        data-dialogue-action
                        appearance="panel"
                        panel="panel-001"
                        :colors="darkPanelButtonColors"
                        :disabled="!canTrade(total(row))"
                        @click="trade(row)"
                    >
                        {{
                            total(row) === null
                                ? tGame(
                                      side === 'buy' ? 'game.trade.noGoods' : 'game.trade.noBuyer'
                                  )
                                : `${tGame(side === 'buy' ? 'game.trade.buy' : 'game.trade.sell')} ${quantity} · ${total(row)} ◈`
                        }}
                    </UiButton>
                </div>
            </FantasyBorder>
        </div>
    </section>
</template>

<style scoped>
.city-market,
.city-market__panel {
    display: grid;
    gap: 6px;
    min-inline-size: 0;
}

.city-market {
    --city-market-accent: var(--ui-themed-panel-accent, var(--ui-dark-panel-border));
    --city-market-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    padding: 4px 2px;
    background: var(--city-market-surface);
    color: var(--ui-dark-panel-text);
    font:
        14px/1.35 system-ui,
        sans-serif;
}

.city-market__summary {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
}

.city-market__summary h3 {
    margin: 0;
    color: var(--ui-dark-panel-title);
    font: 600 clamp(15px, 3vw, 19px)/1.25 var(--ratata-font-family, system-ui);
}

.city-market__summary p {
    margin: 0;
    color: var(--ui-light-button-selected-edge);
    font-size: 12px;
}

.market-tabs {
    display: flex;
    gap: 4px;
    border-block-end: 1px solid var(--ui-dark-panel-divider);
}

.market-tabs .ui-button {
    margin-block-end: -1px;
    border-block-end: 2px solid transparent;
}

.market-tabs .ui-button[aria-selected='true'] {
    border-block-end-color: var(--ui-light-button-selected-edge);
}

.market-quantity {
    display: flex;
    align-items: center;
    gap: 6px;
}

.market-quantity__field {
    display: inline-flex;
    background: color-mix(in srgb, var(--city-market-surface) 90%, var(--city-market-accent));
    color-scheme: dark;
}

.market-quantity__field:focus-within {
    outline: 1px solid var(--ui-dark-panel-title);
    outline-offset: 2px;
}

.market-quantity input {
    box-sizing: border-box;
    inline-size: 62px;
    padding: 3px 4px;
    border: 0;
    background: transparent;
    color: inherit;
    font:
        16px/1.25 system-ui,
        sans-serif;
}

.market-quantity input:focus {
    outline: none;
}

.city-market__stock {
    padding-inline: 2px;
    background: color-mix(in srgb, var(--city-market-surface) 94%, var(--city-market-accent));
}

.market-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    align-items: center;
    gap: 6px;
    padding-block: 4px;
}

.market-row + .market-row {
    border-block-start: 1px solid var(--ui-dark-panel-divider);
}

.market-row__item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
    overflow-wrap: anywhere;
}

.market-row__item small {
    display: block;
    font-size: 11px;
}

.market-row__item strong {
    color: var(--ui-dark-panel-title);
}

.market-row__empty-stock {
    color: var(--ui-dark-panel-warning);
}

.market-tabs .ui-button,
.market-row .ui-button {
    --ui-button-panel-padding: 0 5px;
    min-block-size: 36px;
    font-size: 13px;
}
</style>
