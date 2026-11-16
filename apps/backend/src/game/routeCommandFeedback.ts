import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import type { RouteEnqueueResult } from './characterRoute'

export function routeRejectionText(
    reason: Extract<RouteEnqueueResult, { accepted: false }>['reason']
): string {
    switch (reason) {
        case 'unavailable':
            return 'Персонаж сейчас не может начать маршрут.'
        case 'full':
            return 'Маршрут уже содержит 32 точки.'
        case 'unreachable':
            return 'Не удалось поставить точку: рядом нет прохода.'
    }
}

export function routeCommandFeedback(
    actor: GameCharacter,
    result: RouteEnqueueResult
): GameEventPayload[] {
    const text = result.accepted
        ? result.adjusted
            ? `Точка ${String(result.point.number)} перенесена на ближайшее доступное место`
            : undefined
        : routeRejectionText(result.reason)
    return text === undefined
        ? []
        : [
              {
                  kind: 'notice',
                  actorId: actor.id,
                  audienceIds: [actor.id],
                  text,
              },
          ]
}
