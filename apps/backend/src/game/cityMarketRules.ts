import {
    type MarketClientMessage,
    type MarketRow,
    quoteMarketTrade,
} from '@my-game-ratata/contracts'

import type { PlayerAdventure } from './adventureState'
import type { MarketResult } from './cityEconomy'
import { availableGold } from './rewardReservations'

export function rejected(error: string): MarketResult {
    return { accepted: false, error }
}

export function validateTrade(
    wallet: PlayerAdventure,
    message: Extract<MarketClientMessage, { type: 'market_trade' }>,
    row: MarketRow
): number | string {
    const total = quoteMarketTrade(row, message.side, message.quantity)
    if (total === null) {
        return message.side === 'buy'
            ? 'Товар закончился или количество недоступно.'
            : 'Город сейчас не покупает столько этого товара.'
    }
    if (total !== message.expectedTotal) {
        return 'Цена изменилась. Проверь новое предложение.'
    }
    if (message.side === 'buy' && availableGold(wallet) < total) {
        return 'Недостаточно золотых для покупки.'
    }
    if (message.side === 'sell' && !Number.isSafeInteger(wallet.gold + total)) {
        return 'Кошелёк не может принять платёж.'
    }
    return total
}

export function marketCapacity(side: 'buy' | 'sell'): number | undefined {
    return side === 'buy' ? undefined : Infinity
}
