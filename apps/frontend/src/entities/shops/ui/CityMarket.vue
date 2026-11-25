<script setup lang="ts">
import {
    type AdventureSnapshot,
    MARKET_TAX_RATE_PERCENT,
    type MarketRow,
    type MarketSide,
    type MarketSnapshot,
} from '@my-game-ratata/contracts'
import { computed, useId, useTemplateRef, watch } from 'vue'

import { itemName, tGame } from '@/shared/lib/i18n'
import { navigationDirection } from '@/shared/lib/input'
import { itemAssetCatalog } from '@/shared/lib/item-assets'
import {
    darkPanelButtonColors,
    ItemSlot,
    selectedDarkPanelButtonColors,
    UiButton,
    UiNumberInput,
} from '@/shared/ui/common'
import { FantasyBorder } from '@/shared/ui/external'
import { darkPanelThemeStyle, useDarkPanelTheme } from '@/shared/ui/theme'

import type { MarketTradeSelection } from '../model/marketTradeSelection'
import { createMarketTradeStore } from '../model/marketTradeStore'

const props = defineProps<{
    market: MarketSnapshot
    gold: number
    blocked?: boolean
    initialSide?: MarketSide | undefined
    sides?: readonly MarketSide[] | undefined
    inventory?: AdventureSnapshot['marketInventory']
}>()
const emit = defineEmits<{ trade: [selection: MarketTradeSelection] }>()
const theme = useDarkPanelTheme()
const defaultSides = ['buy', 'sell'] as const
const availableSides = computed<readonly MarketSide[]>(() =>
    props.sides?.length ? props.sides : defaultSides
)
const { side, quantity, quantityValid, quotedRows, canTrade, selectTrade } = createMarketTradeStore(
    () => props.market,
    () => props.gold,
    () => props.blocked,
    () => props.inventory
)
watch(
    [() => props.initialSide, availableSides],
    ([initialSide, sides], [previousInitial]) => {
        if (initialSide && initialSide !== previousInitial && sides.includes(initialSide)) {
            side.value = initialSide
        } else if (!sides.includes(side.value)) {
            side.value = sides[0] ?? 'buy'
        }
    },
    { immediate: true }
)
const tabs = useTemplateRef<HTMLDivElement>('tabs')
const instanceId = useId()
const panelId = `${instanceId}-market-panel`

function tabId(direction: MarketSide): string {
    return `${instanceId}-market-${direction}`
}

function tabKey(event: KeyboardEvent): void {
    const key = event.code || event.key
    const direction = navigationDirection(event)
    const sides = availableSides.value
    let index = sides.indexOf(side.value)
    if (key === 'Home') index = 0
    else if (key === 'End') index = sides.length - 1
    else if (direction === 'left' || direction === 'right') {
        index = (index + (direction === 'right' ? 1 : -1) + sides.length) % sides.length
    } else return
    side.value = sides[index] ?? side.value
    event.preventDefault()
    event.stopPropagation()
    tabs.value?.querySelector<HTMLElement>(`[id="${tabId(side.value)}"]`)?.focus()
}

function trade(row: MarketRow, expectedTotal: number | null): void {
    const selection = selectTrade(row.itemId, expectedTotal)
    if (selection) emit('trade', selection)
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
                v-for="direction in availableSides"
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
                :selected="side === direction"
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
            <p class="city-market__tax-policy">
                {{
                    tGame(side === 'buy' ? 'game.trade.cityTaxBuy' : 'game.trade.cityTaxSell', {
                        rate: MARKET_TAX_RATE_PERCENT,
                    })
                }}
            </p>
            <UiNumberInput
                v-model="quantity"
                :label="tGame('game.trade.quantity')"
                :min="1"
                :max="100"
                border="border-015"
                class="market-quantity"
                @draft-validity="quantityValid = $event"
            />
            <FantasyBorder
                v-if="market.rows.length"
                class="city-market__stock"
                border="border-004"
                color="var(--city-market-accent)"
            >
                <div
                    v-for="{ row, inventory: counts, quote } in quotedRows"
                    :key="row.itemId"
                    class="market-row"
                >
                    <div class="market-row__item">
                        <ItemSlot size="compact" :src="itemAssetCatalog[row.itemId].src" />
                        <span>
                            <strong>{{ itemName(row.itemId) }}</strong>
                            <small :class="{ 'market-row__empty-stock': row.stock === 0 }"
                                >{{ tGame('game.trade.inStock') }} {{ row.stock }}&nbsp;/&nbsp;{{
                                    row.capacity
                                }}</small
                            >
                            <template v-if="side === 'sell'">
                                <small>{{ tGame('game.trade.inBag') }} {{ counts.owned }}</small>
                                <small
                                    :id="`${instanceId}-${row.itemId}-sellable`"
                                    :class="{
                                        'market-row__empty-stock':
                                            quantityValid && counts.sellable < quantity,
                                    }"
                                >
                                    {{
                                        tGame('game.trade.availableForSale', {
                                            count: counts.sellable,
                                        })
                                    }}
                                </small>
                            </template>
                        </span>
                    </div>
                    <div class="market-row__action">
                        <UiButton
                            data-dialogue-action
                            appearance="panel"
                            panel="panel-001"
                            :colors="darkPanelButtonColors"
                            :disabled="!canTrade(row.itemId, quote?.total ?? null)"
                            :aria-describedby="
                                side === 'sell'
                                    ? `${instanceId}-${row.itemId}-sellable`
                                    : quote
                                      ? `${instanceId}-${row.itemId}-tax`
                                      : undefined
                            "
                            @click="trade(row, quote?.total ?? null)"
                        >
                            <template v-if="quote !== null">
                                <span>
                                    {{
                                        side === 'buy'
                                            ? tGame('game.trade.buy')
                                            : `${tGame('game.trade.sell')} ${quantity}`
                                    }}
                                    · {{ quote.total }} ◈
                                </span>
                                <small v-if="side === 'sell'" class="market-row__tax">
                                    {{ tGame('game.trade.cityTaxAmount', { tax: quote.tax }) }}
                                </small>
                            </template>
                            <template v-else-if="quantityValid">
                                {{
                                    tGame(
                                        side === 'buy' ? 'game.trade.noGoods' : 'game.trade.noBuyer'
                                    )
                                }}
                            </template>
                            <template v-else>{{ tGame('game.trade.quantityRequired') }}</template>
                        </UiButton>
                        <small
                            v-if="side === 'buy' && quote"
                            :id="`${instanceId}-${row.itemId}-tax`"
                            class="market-row__tax market-row__tax--included"
                        >
                            {{ tGame('game.trade.cityTaxIncluded', { tax: quote.tax }) }}
                        </small>
                    </div>
                </div>
            </FantasyBorder>
        </div>
    </section>
</template>

<style scoped src="./cityMarket.css"></style>
