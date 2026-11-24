import type { MarketItemId, MarketSide } from '@my-game-ratata/contracts'

export interface MarketTradeSelection {
    side: MarketSide
    itemId: MarketItemId
    quantity: number
    expectedTotal: number
}
