import type { ItemId } from './inventory'

export const marketItemIds = [
    'wood',
    'brushwood',
    'stone',
    'herbs',
    'fiber',
    'scrap',
    'grain',
    'wheat_seed',
    'food',
    'sapling',
    'simple_sword',
    'boots',
    'axe',
    'stone_axe',
    'pickaxe',
] as const
export type MarketItemId = (typeof marketItemIds)[number]
export type MarketSide = 'buy' | 'sell'

export type MarketClientMessage =
    | {
          type: 'market_trade'
          npcId: string
          side: MarketSide
          itemId: MarketItemId
          quantity: number
          expectedTotal: number
          requestId: string
      }
    | {
          type: 'repair_items'
          npcId: string
          instanceIds: string[]
          expectedTotal: number
          requestId: string
      }

export interface MarketRow {
    itemId: MarketItemId
    label: string
    stock: number
    target: number
    capacity: number
    basePrice: number
    fixedPrice?: boolean
    consumptionPer10Minutes: number
    buyPrice: number | null
    sellPrice: number | null
    deliveredLast10Minutes: number
    consumedLast10Minutes: number
}

export interface MarketSnapshot {
    cityId: string
    cityName: string
    revision: number
    rows: MarketRow[]
}

export interface RepairSnapshot {
    npcId: string
    items: Array<{
        instanceId: string
        itemId: ItemId
        label: string
        durability: number
        maxDurability: number
        price: number
        equipped: boolean
    }>
    total: number
}

/** The same stock boundary is priced in both directions; spread prevents round trips. */
export function marketUnitBid(
    row: Pick<MarketRow, 'basePrice' | 'target'>,
    unit: number
): number {
    const fraction = unit / row.target
    const value =
        fraction <= 0.5
            ? row.basePrice * (2 - 2 * fraction)
            : row.basePrice + (1 - row.basePrice) * (fraction - 0.5) * 2
    return Math.max(1, Math.round(value))
}

export function quoteMarketTrade(
    row: Pick<
        MarketRow,
        'stock' | 'capacity' | 'basePrice' | 'target' | 'fixedPrice'
    >,
    side: MarketSide,
    quantity: number
): number | null {
    if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        quantity > 100 ||
        (side === 'buy'
            ? quantity > row.stock
            : row.stock + quantity > row.capacity)
    ) {
        return null
    }
    if (row.fixedPrice === true) {
        return side === 'buy' ? row.basePrice * quantity : null
    }
    let total = 0
    for (let index = 0; index < quantity; index += 1) {
        const unit = side === 'buy' ? row.stock - index : row.stock + index + 1
        const bid = marketUnitBid(row, unit)
        total += side === 'buy' ? Math.max(bid + 1, Math.ceil(bid * 1.25)) : bid
    }
    return total
}
