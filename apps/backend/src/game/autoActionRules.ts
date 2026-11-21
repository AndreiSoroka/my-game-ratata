import {
    type AutoActionWaiting,
    type CharacterAutoAction,
    isItemBroken,
    isMotherPrayer,
} from '@my-game-ratata/contracts'

type CombatAction = Exclude<
    CharacterAutoAction,
    { kind: 'gather' | 'plant_tree' }
>

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import { resolvedActionCosts } from './autoActionCosts'
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
import { availableToAttack, isTargetInAttackRange } from './combat'
import { buildAbilityAttackZones, isInZones } from './combatGeometry'
import { canAttackCharacter } from './combatTargets'
import { effectiveAbility } from './effectiveParameters'
import { distance } from './math'
import { planMotherPrayer } from './motherPrayerPlan'
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
    if (pendingAction(actor, action, context.now)) {
        return 'action'
    }
    if (!reached(actor, action, target, context)) {
        return 'range'
    }
    if (cooldownAt(actor, action) > context.now) {
        return 'cooldown'
    }
    if (!hasResources(actor, action, context)) {
        return 'resources'
    }
    if (activeBarrier(actor, action, context.now)) {
        return 'cooldown'
    }
    return 'ready'
}
function pendingAction(
    actor: GameCharacter,
    action: CombatAction,
    now: number
): boolean {
    return (
        actor.abilities.casting !== null ||
        actor.isActionLocked(now) ||
        (action.kind === 'attack' &&
            action.once === true &&
            actor.pendingAttack !== undefined)
    )
}
function hasResources(
    actor: GameCharacter,
    action: CombatAction,
    context: AbilityContext
): boolean {
    if (action.kind === 'attack' && action.once === true) {
        return true
    }
    const costs = resolvedActionCosts(actor, action, context)
    return actor.mana >= costs.mana && actor.energy >= costs.energy
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
        return actor.combat.readyAt
    }
    if (action.kind === 'prayer') {
        return Math.max(
            actor.combat.readyAt,
            prayerAvailableAt(actor, action.abilityId ?? 'pray')
        )
    }

    if (
        action.abilityId === 'fireball' ||
        action.abilityId === 'greater_fireball'
    ) {
        return Math.max(
            actor.combat.readyAt,
            actor.progression.spellAvailableAt
        )
    }
    return Math.max(
        actor.combat.readyAt,
        actor.abilities.availableAt[action.abilityId] ?? 0
    )
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
        if (isMotherPrayer(action.abilityId ?? 'pray')) {
            return (
                planMotherPrayer(
                    actor,
                    action.intent,
                    context,
                    action.abilityId ?? 'pray'
                )?.targets.some((target) => target.kind === 'harm') ?? false
            )
        }
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
    if (action.kind === 'attack') {
        return (
            action.once !== true ||
            (actor.config.basicAttackKind === 'melee' &&
                !actor.combat.defensiveStance &&
                availableToAttack(actor, now))
        )
    }
    return knowsAbility(
        actor,
        action.kind === 'prayer'
            ? (action.abilityId ?? 'pray')
            : action.abilityId
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
