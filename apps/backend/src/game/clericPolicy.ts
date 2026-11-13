import type {
    AbilityClientMessage,
    GameEventPayload,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { pray } from './prayer'
import { previewPrayer } from './prayerContext'
/** Controller policy: execute exactly the same context and cost a player sees. */
export function supportPrayerDecision(
    actor: GameCharacter,
    context: AbilityContext,
    requestAbility?: (
        actor: GameCharacter,
        message: AbilityClientMessage,
        now: number
    ) => GameEventPayload[]
): GameEventPayload[] {
    const preview = previewPrayer(actor, context)
    if (preview.unavailableReason !== null || preview.intent === null) {
        return []
    }
    // Benevolent support never deliberately burns bystanders or the healer.
    if (preview.includesAllies || preview.includesSelf) {
        return []
    }
    return requestAbility === undefined
        ? pray(actor, context.now, context.random, context, preview.intent)
        : requestAbility(
              actor,
              {
                  type: 'use_ability',
                  abilityId: 'pray',
                  intent: preview.intent,
              },
              context.now
          )
}
