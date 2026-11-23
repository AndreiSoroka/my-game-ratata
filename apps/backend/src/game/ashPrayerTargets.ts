import {
    ASH_RULES,
    type PrayerActionId,
    type PrayerIntent,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { ashParameters } from './constellationModifiers'
import { distance } from './math'
import { validPrayerIntent } from './prayerContext'

export function secondaryAshPrayerTarget(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    pinnedId?: string
): GameCharacter | undefined {
    if (intent.mode !== 'restore' || !ashParameters(actor).healSecond) {
        return undefined
    }
    return [...new Set(context.characters)]
        .filter(
            (target) =>
                target.id !== intent.targetId &&
                (pinnedId === undefined || target.id === pinnedId) &&
                validPrayerIntent(
                    actor,
                    { mode: 'restore', targetId: target.id },
                    context,
                    'pray_grave'
                )
        )
        .sort((a, b) => {
            const difference =
                distance(actor.position, a.position) -
                distance(actor.position, b.position)
            return difference === 0 ? a.id.localeCompare(b.id) : difference
        })[0]
}

export function planAshSecondaryHeal(
    actor: GameCharacter,
    intent: PrayerIntent,
    context: AbilityContext,
    action: PrayerActionId,
    baseCost: number
): string | undefined {
    return action === 'pray_grave' &&
        actor.mana >= baseCost + ASH_RULES.extraHealMana
        ? secondaryAshPrayerTarget(actor, intent, context)?.id
        : undefined
}
