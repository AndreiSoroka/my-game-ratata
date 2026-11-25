import {
    CITY_HERB_COLLECTOR_IDS,
    type ExchangeSnapshot,
    HERBALIST_MERCHANT_ID,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { ExchangeService } from './exchange'
import { speechAvailable } from './socialSpeech'

export function isCityHerbCollector(actor: GameCharacter): boolean {
    return (
        CITY_HERB_COLLECTOR_IDS.includes(actor.id) &&
        actor.controllerKind !== 'network_player' &&
        actor.soul.controlSource !== 'human' &&
        speechAvailable(actor)
    )
}

export function usesHerbExchangePolicy(
    actor: GameCharacter,
    model: boolean
): boolean {
    return (
        isCityHerbCollector(actor) &&
        (!model || actor.id === HERBALIST_MERCHANT_ID)
    )
}

/** Consent from the collector applies to the exact ordinary exchange revision. */
export function advanceHerbExchange(
    collector: GameCharacter,
    exchanges: ExchangeService,
    getCharacter: (id: string) => GameCharacter | undefined,
    now: number
): void {
    const exchange = exchanges.snapshot(collector.id)
    if (
        exchange === null ||
        getCharacter(exchange.partnerId)?.controllerKind !== 'network_player'
    ) {
        return
    }
    const { id: exchangeId, revision, other, own } = exchange
    if (exchange.status === 'invited' && exchange.incoming) {
        exchanges.handle(
            collector,
            { type: 'exchange_answer', exchangeId, accept: true },
            now
        )
    } else if (
        exchange.status === 'active' &&
        !own.accepted &&
        own.refusal === undefined &&
        (other.items.length > 0 || other.gold > 0)
    ) {
        exchanges.handle(
            collector,
            offersHerbs(exchange)
                ? { type: 'exchange_accept', exchangeId, revision }
                : {
                      type: 'exchange_decline',
                      exchangeId,
                      revision,
                      reason: 'Для городского запаса я приму лечебные травы.',
                  },
            now
        )
    }
}

function offersHerbs({ own, other }: ExchangeSnapshot): boolean {
    return (
        other.gold === 0 &&
        own.gold === 0 &&
        own.items.length === 0 &&
        other.items.every(({ itemId }) => itemId === 'herbs')
    )
}
