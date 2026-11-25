import {
    type AdventureSnapshot,
    type MarketItemId,
    type MarketSide,
    type MarketSnapshot,
    quoteMarketTradeBreakdown,
} from '@my-game-ratata/contracts'
import { computed, ref } from 'vue'

import type { MarketTradeSelection } from './marketTradeSelection'

export function createMarketTradeStore(
    getMarket: () => MarketSnapshot,
    getGold: () => number,
    isBlocked: () => boolean | undefined,
    getInventory: () => AdventureSnapshot['marketInventory']
) {
    const side = ref<MarketSide>('buy')
    const quantity = ref(1)
    const quantityValid = ref(true)
    const quotedRows = computed(() =>
        getMarket().rows.map((row) => ({
            row,
            inventory: getInventory()?.[row.itemId] ?? { owned: 0, sellable: 0 },
            quote: quantityValid.value
                ? quoteMarketTradeBreakdown(row, side.value, quantity.value)
                : null,
        }))
    )

    function canTrade(itemId: MarketItemId, expectedTotal: number | null): expectedTotal is number {
        return (
            !isBlocked() &&
            quantityValid.value &&
            expectedTotal !== null &&
            (side.value === 'sell'
                ? (getInventory()?.[itemId]?.sellable ?? 0) >= quantity.value
                : getGold() >= expectedTotal)
        )
    }

    function selectTrade(
        itemId: MarketItemId,
        expectedTotal: number | null
    ): MarketTradeSelection | undefined {
        if (!canTrade(itemId, expectedTotal)) return undefined
        return { side: side.value, itemId, quantity: quantity.value, expectedTotal }
    }

    return { side, quantity, quantityValid, quotedRows, canTrade, selectTrade }
}
