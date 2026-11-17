import type { AgentDecision } from '@my-game-ratata/contracts'

import type { GameRoom } from '../game/room'

/** A private context never authorizes changing or addressing another conversation. */
export function npcDecisionAudienceError(
    room: GameRoom,
    decision: AgentDecision,
    actorId: string,
    partnerId: string
): string | undefined {
    if (
        decision.type === 'quest_propose' ||
        decision.type === 'worker_quest_propose' ||
        decision.type === 'quest_offer_revise' ||
        decision.type === 'quest_turn_in_request'
    ) {
        return decision.targetId === partnerId
            ? undefined
            : 'Предложение относится только к текущему собеседнику.'
    }
    if (decision.type === 'exchange_invite') {
        return decision.targetId === partnerId
            ? undefined
            : 'Обмен относится только к текущему собеседнику.'
    }
    if ('exchangeId' in decision) {
        const exchange = room.social.exchanges.snapshot(actorId)
        return exchange?.id === decision.exchangeId &&
            exchange.partnerId === partnerId
            ? undefined
            : 'Обмен относится только к текущему собеседнику.'
    }
    return undefined
}
