import {
    type CharacterAutoAction,
    isMotherPrayer,
    prayerManaCost,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { constellationModifiers } from './constellationModifiers'
import {
    effectiveAbility,
    effectiveAttackEnergyCost,
} from './effectiveParameters'
import { hasMotherPrayerAura, planMotherPrayer } from './motherPrayerPlan'
type CombatAction = Exclude<
    CharacterAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

export function resolvedActionCosts(
    actor: GameCharacter,
    action: CombatAction,
    context: AbilityContext
): { mana: number; energy: number } {
    if (
        action.kind !== 'prayer' ||
        !isMotherPrayer(action.abilityId ?? 'pray')
    ) {
        return actionCosts(actor, action)
    }
    const decorative =
        action.intent.mode === 'devotion' &&
        !hasMotherPrayerAura(actor) &&
        !constellationModifiers(actor).prayerLastLight
    const cost = decorative
        ? 0
        : (planMotherPrayer(
              actor,
              action.intent,
              context,
              action.abilityId ?? 'pray'
          )?.manaCost ?? Number.POSITIVE_INFINITY)
    return { mana: cost, energy: 0 }
}

function actionCosts(
    actor: GameCharacter,
    action: CombatAction
): { mana: number; energy: number } {
    if (action.kind === 'prayer') {
        return {
            mana: prayerManaCost(
                action.intent.mode,
                action.abilityId ?? 'pray'
            ),
            energy: 0,
        }
    }
    if (action.kind === 'ability') {
        return effectiveAbility(actor, action.abilityId)
    }
    if (actor.config.basicAttackKind === 'arrow') {
        return effectiveAbility(actor, 'shot')
    }
    if (actor.config.basicAttackKind === 'spark') {
        return effectiveAbility(actor, 'spark')
    }
    return {
        mana: actor.config.resources.attackManaCost,
        energy: effectiveAttackEnergyCost(actor),
    }
}
