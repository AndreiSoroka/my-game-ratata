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
    'torch',
    'lantern',
] as const
export type MarketItemId = (typeof marketItemIds)[number]
export type MarketSide = 'buy' | 'sell'
export const MARKET_TAX_RATE_PERCENT = 20

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
    /** One-unit price paid by the buyer, including city tax. */
    buyPrice: number | null
    /** One-unit proceeds received by the seller, after city tax. */
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

export interface MarketTradeQuote {
    subtotal: number
    tax: number
    /** Gold paid or received by the actor placing the order. */
    total: number
}

export function marketTradeTax(subtotal: number): number {
    return Math.ceil((subtotal * MARKET_TAX_RATE_PERCENT) / 100)
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
    // Keep a coin each for the seller and treasury even on the cheapest sale.
    return Math.max(2, Math.round(value))
}

type MarketQuoteRow = Pick<
    MarketRow,
    'stock' | 'capacity' | 'basePrice' | 'target' | 'fixedPrice'
>

export function quoteMarketTrade(
    row: MarketQuoteRow,
    side: MarketSide,
    quantity: number
): number | null {
    return quoteMarketTradeBreakdown(row, side, quantity)?.total ?? null
}

export function quoteMarketTradeBreakdown(
    row: MarketQuoteRow,
    side: MarketSide,
    quantity: number
): MarketTradeQuote | null {
    const subtotal = marketTradeSubtotal(row, side, quantity)
    if (subtotal === null) {
        return null
    }
    const tax = marketTradeTax(subtotal)
    return { subtotal, tax, total: side === 'buy' ? subtotal : subtotal - tax }
}

function marketTradeSubtotal(
    row: MarketQuoteRow,
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
