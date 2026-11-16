import {
    type AbilityClientMessage,
    type GameEventPayload,
    prayerAbilityIds,
    type PrayerActionId,
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
    const actions: PrayerActionId[] = ['pray_woven', ...prayerAbilityIds]
    const previews = actions
        .filter((id) => actor.abilities.known.has(id))
        .map((id) => previewPrayer(actor, context, undefined, id))
    const useful = previews.filter(
        (preview) =>
            preview.unavailableReason === null &&
            preview.intent?.mode !== 'devotion' &&
            !preview.includesAllies &&
            !preview.includesSelf
    )
    const preview =
        useful.find((preview) => preview.intent?.mode === 'revive') ?? useful[0]
    if (preview === undefined) {
        return []
    }
    if (
        preview.unavailableReason !== null ||
        preview.intent === null ||
        preview.intent.mode === 'devotion'
    ) {
        return []
    }
    // Benevolent support never deliberately burns bystanders or the healer.
    if (preview.includesAllies || preview.includesSelf) {
        return []
    }
    return requestAbility === undefined
        ? pray(
              actor,
              context.now,
              context.random,
              context,
              preview.intent,
              preview.abilityId ?? 'pray'
          )
        : requestAbility(
              actor,
              {
                  type: 'use_ability',
                  abilityId: preview.abilityId ?? 'pray',
                  intent: preview.intent,
              },
              context.now
          )
}
