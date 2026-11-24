<script setup lang="ts">
import type { MarketRow, MarketSnapshot } from '@my-game-ratata/contracts'

import { itemName, tGame } from '@/shared/lib/i18n'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import { ItemSlot } from '@/shared/ui/common'
import { FantasyBorder, FantasyDivider } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

defineProps<{ market: MarketSnapshot }>()
const theme = useDarkPanelTheme()

function stockStatus({ stock, target, capacity }: MarketRow) {
    if (stock === 0) return 'game.trade.outOfStock'
    if (stock < target / 2) return 'game.trade.shortage'
    if (stock >= capacity) return 'game.trade.buyingClosed'
    return stock >= target ? 'game.trade.stockAvailable' : 'game.trade.demandPresent'
}
</script>
<template>
    <FantasyBorder
        class="city-demand"
        role="region"
        :aria-label="tGame('game.trade.cityDemand')"
        :border="theme?.border ?? 'border-026'"
        color="var(--city-demand-accent)"
        :style="darkPanelThemeStyle(theme)"
    >
        <header class="city-demand__header">
            <h3>{{ tGame('game.trade.cityDemand') }}</h3>
            <span>{{ market.cityName }}</span>
        </header>
        <FantasyDivider
            divider="divider-002"
            ends="both"
            color="var(--ui-dark-panel-divider)"
            aria-hidden="true"
        />
        <div class="city-demand__scroll" tabindex="0">
            <table>
                <thead>
                    <tr>
                        <th scope="col">{{ tGame('game.trade.goods') }}</th>
                        <th scope="col">{{ tGame('game.trade.stockTargetReserve') }}</th>
                        <th scope="col">{{ tGame('game.trade.usedInMin') }}</th>
                        <th scope="col">{{ tGame('game.trade.cityBuysSells') }}</th>
                        <th scope="col">{{ tGame('game.trade.deliveredSpentInMin') }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in market.rows" :key="row.itemId">
                        <th scope="row">
                            <div class="city-demand__item">
                                <ItemSlot size="compact" :src="itemAssetCatalog[row.itemId].src" />
                                <div>
                                    {{ itemName(row.itemId) }}
                                    <small
                                        :class="{
                                            'city-demand__shortage':
                                                row.stock < row.target / 2 || row.stock === 0,
                                        }"
                                    >
                                        {{ tGame(stockStatus(row)) }}
                                    </small>
                                </div>
                            </div>
                        </th>
                        <td>{{ row.stock }} / {{ row.target }} / {{ row.capacity }}</td>
                        <td>{{ row.consumptionPer10Minutes }}</td>
                        <td class="city-demand__price">
                            {{ row.sellPrice ?? '—' }} / {{ row.buyPrice ?? '—' }} ◈
                        </td>
                        <td>{{ row.deliveredLast10Minutes }} / {{ row.consumedLast10Minutes }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="city-demand__scroll-hint">
            <span aria-hidden="true">↔</span>
            {{ tGame('game.trade.scrollDemandTable') }}
        </p>
    </FantasyBorder>
</template>
<style scoped>
.city-demand {
    --city-demand-accent: var(--ui-themed-panel-accent, var(--ui-dark-panel-border));
    --city-demand-surface: var(--ui-themed-panel-surface, var(--ui-dark-panel-surface));
    container-type: inline-size;
    min-inline-size: 0;
    padding: 4px 2px;
    background: var(--city-demand-surface);
    color: var(--ui-dark-panel-text);
    font:
        13px/1.4 system-ui,
        sans-serif;
}
.city-demand__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-block-end: 4px;
}
.city-demand__header h3 {
    margin: 0;
    color: var(--ui-dark-panel-title);
    font: 600 clamp(15px, 3vw, 19px)/1.25 var(--ratata-font-family, system-ui);
}
.city-demand__header span {
    color: var(--ui-light-button-selected-edge);
    font-size: 12px;
}
.city-demand__scroll {
    max-block-size: 55vh;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--city-demand-accent) transparent;
}
.city-demand__scroll:focus-visible {
    outline: 1px solid var(--city-demand-accent);
}
.city-demand__scroll-hint {
    display: none;
    justify-content: end;
    gap: 6px;
    margin: 8px 0 0;
    color: var(--ui-dark-panel-ornament);
    font-size: 11px;
}
/* Match the minimum inline size of the table. */
@container (inline-size < 34rem) {
    .city-demand__scroll-hint {
        display: flex;
    }
}
table {
    border-collapse: collapse;
    inline-size: 100%;
    min-inline-size: 34rem;
    font-variant-numeric: tabular-nums;
}
th,
td {
    padding: 8px;
    text-align: start;
    border-block-end: 1px solid var(--ui-dark-panel-divider);
}
thead th {
    background: color-mix(in srgb, var(--city-demand-surface) 90%, var(--city-demand-accent));
    color: var(--ui-dark-panel-title);
    font-size: 12px;
    vertical-align: bottom;
}
tbody tr:last-child > * {
    border-block-end: 0;
}
td {
    white-space: nowrap;
}
.city-demand__item {
    display: flex;
    align-items: center;
    gap: 8px;
}
.city-demand__item .ui-item-slot {
    flex: none;
}
small {
    display: block;
    color: var(--ui-dark-panel-text);
    font-size: 11px;
    font-weight: 400;
}
.city-demand__shortage {
    color: var(--ui-dark-panel-warning);
}
.city-demand__price {
    color: var(--ui-light-button-selected-edge);
}
</style>
