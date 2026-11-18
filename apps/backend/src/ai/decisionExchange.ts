import type { AgentDecision } from '@my-game-ratata/contracts'

import type { GameCharacter } from '../game/character'
import type { GameRoom } from '../game/room'

/** The same exchange pause applies before a promise and before its command. */
export function npcDecisionExchangeError(
    room: Pick<GameRoom, 'social'>,
    actor: Pick<GameCharacter, 'id'>,
    decision: AgentDecision
): string | undefined {
    if (decision.type === 'speak' || room.social.isDecision(decision)) {
        return undefined
    }
    return room.social.exchanges.isPaused(actor.id)
        ? 'Сначала нужно завершить текущий обмен.'
        : undefined
}
