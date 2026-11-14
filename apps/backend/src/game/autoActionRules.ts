import {
    ABILITY_DEFINITIONS,
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
import { canTargetByFaction } from './factions'
import { distance } from './math'
import { prayerHarmTargets } from './prayerContext'

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
    if (actor.isActionLocked(context.now)) {
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
        canTargetByFaction(actor, target, context.now) &&
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
            ABILITY_DEFINITIONS.pray.range
        )
    }
    const id = action.abilityId
    return id === 'shot' || id === 'spark' || id === 'skeleton_strike'
        ? isInZones(target, buildAbilityAttackZones(actor, id))
        : distance(actor.position, target.position) <=
              ABILITY_DEFINITIONS[id].range
}
function cooldownAt(actor: GameCharacter, action: CombatAction): number {
    if (action.kind === 'attack') {
        return actor.lastAttackAt + actor.config.combat.attackCooldownMs
    }
    if (action.kind === 'prayer') {
        return Math.max(
            actor.progression.prayerAvailableAt,
            actor.abilities.availableAt.pray ?? 0
        )
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
            : actor.lastAttackAt + actor.config.combat.attackCooldownMs
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
        return ABILITY_DEFINITIONS[action.abilityId]
    }
    if (actor.config.basicAttackKind === 'arrow') {
        return ABILITY_DEFINITIONS.shot
    }
    if (actor.config.basicAttackKind === 'spark') {
        return ABILITY_DEFINITIONS.spark
    }
    return {
        mana: actor.config.resources.attackManaCost,
        energy: actor.config.resources.attackEnergyCost,
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
            action.intent.mode !== 'purify_grave' &&
            prayerHarmTargets(actor, context).length > 0
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
            action.kind === 'prayer' ? 'pray' : action.abilityId
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
