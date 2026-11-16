import {
    type CharacterAutoAction as AnyAutoAction,
    isItemBroken,
    isMotherPrayer,
    type WorldCombatTarget,
} from '@my-game-ratata/contracts'

type CharacterAutoAction = Exclude<
    AnyAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

import type { AbilityContext } from './abilityContext'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { buildAbilityAttackZones, isInZones } from './combatGeometry'
import { effectiveAbility } from './effectiveParameters'
import { legalGraveTarget } from './graveCombat'
import { canApproachGravePurification } from './gravePrayer'
import { distance } from './math'
import { prayerParameters } from './prayerParameters'

export function autoWorldTarget(
    action: CharacterAutoAction
): WorldCombatTarget | undefined {
    return action.kind === 'prayer'
        ? action.intent.mode === 'purify_grave'
            ? action.intent.target
            : undefined
        : action.target
}
export function legalAutoWorldTarget(
    actor: GameCharacter,
    action: CharacterAutoAction,
    context: AbilityContext
): boolean {
    const reference = autoWorldTarget(action)
    const grave =
        reference === undefined ? undefined : context.graves?.get(reference.id)
    if (action.kind === 'prayer') {
        return legalAutoPurification(actor, action, context)
    }
    if (
        action.targetId !== undefined ||
        !legalGraveTarget(actor, grave, context.navigation) ||
        distance(actor.position, grave.position) > 240
    ) {
        return false
    }
    if (action.kind === 'ability' && action.abilityId === 'barrier') {
        return false
    }
    const weaponAction =
        action.kind === 'attack'
            ? actor.config.basicAttackKind === 'melee'
            : action.abilityId === 'skeleton_strike'
    return !(
        weaponAction &&
        actor.equipment.weapon !== undefined &&
        isItemBroken(actor.equipment.weapon)
    )
}

function legalAutoPurification(
    actor: GameCharacter,
    action: Extract<CharacterAutoAction, { kind: 'prayer' }>,
    context: AbilityContext
): boolean {
    return (
        isMotherPrayer(action.abilityId ?? 'pray') &&
        action.intent.mode === 'purify_grave' &&
        canApproachGravePurification(actor, action.intent.target.id, context)
    )
}
export function reachedAutoWorldTarget(
    actor: GameCharacter,
    action: CharacterAutoAction,
    context: AbilityContext
): boolean {
    const reference = autoWorldTarget(action)
    const grave =
        reference === undefined ? undefined : context.graves?.get(reference.id)
    if (grave === undefined) {
        return false
    }
    actor.updateFacing({
        x: grave.position.x - actor.position.x,
        y: grave.position.y - actor.position.y,
    })
    if (action.kind === 'attack') {
        return isTargetInAttackRange(
            actor,
            grave,
            context.navigation.grid.tileWidth
        )
    }
    if (action.kind === 'prayer') {
        return (
            distance(actor.position, grave.position) <=
            prayerParameters(
                actor,
                context.navigation.grid.tileWidth,
                action.abilityId ?? 'pray'
            ).radius
        )
    }
    const id = action.abilityId
    return id === 'shot' || id === 'spark' || id === 'skeleton_strike'
        ? isInZones(
              grave,
              buildAbilityAttackZones(
                  actor,
                  id,
                  context.navigation.grid.tileWidth
              )
          )
        : distance(actor.position, grave.position) <=
              effectiveAbility(actor, id, context.navigation.grid.tileWidth)
                  .range
}
