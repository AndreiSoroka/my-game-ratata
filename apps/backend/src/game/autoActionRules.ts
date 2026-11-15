import {
    type AutoActionWaiting,
    type CharacterAutoAction,
    isItemBroken,
    prayerManaCost,
} from '@my-game-ratata/contracts'

type CombatAction = Exclude<
    CharacterAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import {
    availableActor,
    canFight,
    legalPrayerTarget,
    untargetedAction,
    visibleTarget,
} from './autoActionTargets'
import {
    autoWorldTarget,
    legalAutoWorldTarget,
    reachedAutoWorldTarget,
} from './autoActionWorldTargets'
import type { GameCharacter } from './character'
import { isTargetInAttackRange } from './combat'
import { buildAbilityAttackZones, isInZones } from './combatGeometry'
import { canAttackCharacter } from './combatTargets'
import {
    effectiveAbility,
    effectiveAttackCooldown,
    effectiveAttackEnergyCost,
} from './effectiveParameters'
import { distance } from './math'
import { prayerHarmTargets } from './prayerContext'
import { prayerAvailableAt, prayerParameters } from './prayerParameters'

export type AutoActionStatus = 'stop' | 'ready' | NonNullable<AutoActionWaiting>
export function autoTargetId(action: CharacterAutoAction): string | undefined {
    if (action.kind === 'gather') {
        return action.nodeId
    }
    if (action.kind === 'plant_tree') {
        return undefined
    }
    return action.kind === 'prayer'
        ? 'targetId' in action.intent
            ? action.intent.targetId
            : undefined
        : action.targetId
}
export function autoActionStatus(
    actor: GameCharacter,
    action: CombatAction,
    context: AbilityContext
): AutoActionStatus {
    if (!available(actor, action, context.now)) {
        return 'stop'
    }
    const targetId = autoTargetId(action)
    const target =
        targetId === undefined
            ? undefined
            : targetId === actor.id
              ? actor
              : context.characters.find(
                    (candidate) => candidate.id === targetId
                )
    if (
        !legalAutoTarget(actor, action, target, context) ||
        refusesAutoCombat(actor, action, context)
    ) {
        return 'stop'
    }
    if (pendingAction(actor, context.now)) {
        return 'action'
    }
    if (!reached(actor, action, target, context)) {
        return 'range'
    }
    if (cooldownAt(actor, action) > context.now) {
        return 'cooldown'
    }
    const costs = actionCosts(actor, action)
    if (actor.mana < costs.mana || actor.energy < costs.energy) {
        return 'resources'
    }
    if (activeBarrier(actor, action, context.now)) {
        return 'cooldown'
    }
    return 'ready'
}
function pendingAction(actor: GameCharacter, now: number): boolean {
    return actor.abilities.casting !== null || actor.isActionLocked(now)
}
function legalAutoTarget(
    actor: GameCharacter,
    action: CombatAction,
    target: GameCharacter | undefined,
    context: AbilityContext
): boolean {
    if (autoWorldTarget(action) !== undefined) {
        return legalAutoWorldTarget(actor, action, context)
    }
    const untargeted = untargetedAction(actor, action, context)
    if (untargeted !== undefined) {
        return untargeted
    }
    if (!visibleTarget(actor, target, context)) {
        return false
    }
    if (action.kind === 'prayer') {
        return legalPrayerTarget(actor, action, target, context)
    }
    const weapon = actor.equipment.weapon
    const weaponAction =
        action.kind === 'attack'
            ? actor.config.basicAttackKind === 'melee'
            : action.abilityId === 'skeleton_strike'
    return (
        target.alive &&
        canAttackCharacter(actor, target, context.now) &&
        !(weaponAction && weapon !== undefined && isItemBroken(weapon))
    )
}
function reached(
    actor: GameCharacter,
    action: CombatAction,
    target: GameCharacter | undefined,
    context: AbilityContext
): boolean {
    if (autoWorldTarget(action) !== undefined) {
        return reachedAutoWorldTarget(actor, action, context)
    }
    if (target === undefined) {
        return true
    }
    actor.updateFacing({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    if (action.kind === 'attack') {
        return isTargetInAttackRange(
            actor,
            target,
            context.navigation.grid.tileWidth
        )
    }
    if (action.kind === 'prayer') {
        return (
            distance(actor.position, target.position) <=
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
              target,
              buildAbilityAttackZones(
                  actor,
                  id,
                  context.navigation.grid.tileWidth
              )
          )
        : distance(actor.position, target.position) <=
              effectiveAbility(actor, id, context.navigation.grid.tileWidth)
                  .range
}
function cooldownAt(actor: GameCharacter, action: CombatAction): number {
    if (action.kind === 'attack') {
        return actor.lastAttackAt + effectiveAttackCooldown(actor)
    }
    if (action.kind === 'prayer') {
        return prayerAvailableAt(actor, action.abilityId ?? 'pray')
    }

    if (
        action.abilityId === 'fireball' ||
        action.abilityId === 'greater_fireball'
    ) {
        return actor.progression.spellAvailableAt
    }
    return Math.max(
        actor.abilities.availableAt[action.abilityId] ?? 0,
        action.abilityId === 'barrier'
            ? 0
            : actor.lastAttackAt +
                  Math.min(
                      effectiveAttackCooldown(actor),
                      effectiveAbility(actor, action.abilityId).cooldownMs
                  )
    )
}
function actionCosts(
    actor: GameCharacter,
    action: CombatAction
): { mana: number; energy: number } {
    if (action.kind === 'prayer') {
        return { mana: prayerManaCost(action.intent.mode), energy: 0 }
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
function refusesAutoCombat(
    actor: GameCharacter,
    action: CombatAction,
    context: AbilityContext
): boolean {
    if (canFight(actor)) {
        return false
    }
    if (action.kind === 'prayer') {
        return (
            action.intent.mode !== 'devotion' &&
            prayerHarmTargets(actor, context, action.abilityId ?? 'pray')
                .length > 0
        )
    }
    return action.kind === 'attack' || action.abilityId !== 'barrier'
}
function available(
    actor: GameCharacter,
    action: CombatAction,
    now: number
): boolean {
    if (!availableActor(actor, now)) {
        return false
    }
    return (
        action.kind === 'attack' ||
        knowsAbility(
            actor,
            action.kind === 'prayer'
                ? (action.abilityId ?? 'pray')
                : action.abilityId
        )
    )
}
function activeBarrier(
    actor: GameCharacter,
    action: CombatAction,
    now: number
): boolean {
    const barrier = actor.abilities.barrier
    return (
        action.kind === 'ability' &&
        action.abilityId === 'barrier' &&
        barrier !== null &&
        barrier.expiresAt > now &&
        barrier.remaining > 0
    )
}
