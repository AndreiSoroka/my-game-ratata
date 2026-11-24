import { type MarketRow, type MarketSnapshot, quoteMarketTrade } from '@my-game-ratata/contracts'

export const cityMarketExample: MarketSnapshot = {
    cityId: 'novogorod',
    cityName: 'Новогород',
    revision: 1,
    rows: [
        {
            itemId: 'wood',
            label: 'Древесина',
            stock: 2,
            target: 12,
            capacity: 24,
            basePrice: 4,
            consumptionPer10Minutes: 2,
            buyPrice: 9,
            sellPrice: 6,
            deliveredLast10Minutes: 1,
            consumedLast10Minutes: 2,
        },
        {
            itemId: 'food',
            label: 'Еда',
            stock: 24,
            target: 24,
            capacity: 48,
            basePrice: 4,
            consumptionPer10Minutes: 4,
            buyPrice: 3,
            sellPrice: 1,
            deliveredLast10Minutes: 6,
            consumedLast10Minutes: 4,
        },
    ],
}

export function heatingMarketExample(stock: number): MarketSnapshot {
    const row: MarketRow = {
        itemId: 'brushwood',
        label: 'Хворост',
        stock,
        target: 12,
        capacity: 24,
        basePrice: 1,
        consumptionPer10Minutes: 2,
        deliveredLast10Minutes: 3,
        consumedLast10Minutes: 1,
        buyPrice: null,
        sellPrice: null,
    }
    row.buyPrice = quoteMarketTrade(row, 'buy', 1)
    row.sellPrice = quoteMarketTrade(row, 'sell', 1)
    return { ...cityMarketExample, rows: [row] }
}
