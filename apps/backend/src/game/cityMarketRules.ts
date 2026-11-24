import {
    type MarketClientMessage,
    type MarketRow,
    quoteMarketTradeBreakdown,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { MarketResult } from './cityEconomy'
import type { QuestFunding } from './questFunding'
import { availableGold } from './rewardReservations'

export function rejected(error: string): MarketResult {
    return { accepted: false, error }
}

export function prepareTrade(
    wallet: PlayerAdventure,
    message: Extract<MarketClientMessage, { type: 'market_trade' }>,
    row: MarketRow,
    funding: QuestFunding,
    cityId: string
): { total: number; creditTax: () => void } | string {
    const quote = quoteMarketTradeBreakdown(row, message.side, message.quantity)
    if (quote === null) {
        return message.side === 'buy'
            ? 'Товар закончился или количество недоступно.'
            : 'Город сейчас не покупает столько этого товара.'
    }
    const { total } = quote
    if (total !== message.expectedTotal) {
        return 'Цена изменилась. Проверь новое предложение.'
    }
    if (message.side === 'buy' && availableGold(wallet) < total) {
        return 'Недостаточно золотых для покупки.'
    }
    if (message.side === 'sell' && !Number.isSafeInteger(wallet.gold + total)) {
        return 'Кошелёк не может принять платёж.'
    }
    const creditTax = funding.tradeTaxCredit(cityId, quote.tax)
    return creditTax === undefined
        ? 'Городская казна не может принять налог.'
        : { total, creditTax }
}

export function marketCapacity(side: 'buy' | 'sell'): number | undefined {
    return side === 'buy' ? undefined : Infinity
}
