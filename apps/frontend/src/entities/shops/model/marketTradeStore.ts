import {
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
    isBlocked: () => boolean | undefined
) {
    const side = ref<MarketSide>('buy')
    const quantity = ref<number | ''>(1)
    const quotedRows = computed(() =>
        getMarket().rows.map((row) => ({
            row,
            quote:
                typeof quantity.value === 'number'
                    ? quoteMarketTradeBreakdown(row, side.value, quantity.value)
                    : null,
        }))
    )

    function canTrade(expectedTotal: number | null): expectedTotal is number {
        return (
            !isBlocked() &&
            expectedTotal !== null &&
            (side.value === 'sell' || getGold() >= expectedTotal)
        )
    }

    function selectTrade(
        itemId: MarketItemId,
        expectedTotal: number | null
    ): MarketTradeSelection | undefined {
        if (typeof quantity.value !== 'number' || !canTrade(expectedTotal)) return undefined
        return { side: side.value, itemId, quantity: quantity.value, expectedTotal }
    }

    return { side, quantity, quotedRows, canTrade, selectTrade }
}
