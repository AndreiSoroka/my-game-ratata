import type { ExchangeClientMessage } from '@my-game-ratata/contracts'

import type { AgentDecisionResult } from './agentDecisions'
import type { GameCharacter } from './character'
import type { ExchangeService } from './exchange'

export function decideSocialExchange(
    exchanges: ExchangeService,
    actor: GameCharacter,
    decision: ExchangeClientMessage,
    now: number
): AgentDecisionResult {
    if (decision.type === 'exchange_cancel') {
        const exchange = exchanges.snapshot(actor.id)
        if (
            exchange?.id === decision.exchangeId &&
            exchange.status === 'active'
        ) {
            return {
                ...exchanges.handle(
                    actor,
                    {
                        type: 'exchange_decline',
                        exchangeId: exchange.id,
                        revision: exchange.revision,
                        reason: 'Пока не согласен с условиями. Можно предложить другие.',
                    },
                    now
                ),
                events: [],
            }
        }
    }
    return { ...exchanges.handle(actor, decision, now), events: [] }
}
