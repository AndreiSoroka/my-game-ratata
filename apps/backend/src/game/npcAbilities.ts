import {
    ABILITY_DEFINITIONS,
    type GameEventPayload,
    isItemBroken,
} from '@my-game-ratata/contracts'

import { knowsAbility } from './abilityState'
import { actorRefusesCombat } from './agentCapabilities'
import type { CompanionWorld } from './agentDecisions'
import type { GameCharacter } from './character'
import { canPerformSkillAction } from './skillProgression'
interface NpcAbilityWorld extends CompanionWorld {
    publishEvents(events: GameEventPayload[]): void
}
/** A policy chooses an intention; the ordinary ability service owns all combat mutation. */
export function trySkeletonStrike(
    actor: GameCharacter,
    target: GameCharacter,
    world: NpcAbilityWorld,
    now: number
): boolean {
    if (
        world.requestAbility === undefined ||
        actorRefusesCombat(actor) ||
        !knowsAbility(actor, 'skeleton_strike') ||
        !canPerformSkillAction(actor, now)
    ) {
        return false
    }
    if (
        now < (actor.abilities.availableAt.skeleton_strike ?? 0) ||
        actor.energy < ABILITY_DEFINITIONS.skeleton_strike.energy
    ) {
        return false
    }
    const events = world.requestAbility(
        actor,
        {
            type: 'use_ability',
            abilityId: 'skeleton_strike',
            targetId: target.id,
        },
        now
    )
    if (
        !events.some(
            (event) => event.kind === 'attack' && event.actorId === actor.id
        )
    ) {
        return false
    }
    world.publishEvents(events)
    return true
}

export function requestNpcAttack(
    actor: GameCharacter,
    target: GameCharacter,
    world: NpcAbilityWorld,
    now: number
): void {
    if (actorRefusesCombat(actor)) {
        return
    }
    const weapon = actor.equipment.weapon
    if (
        actor.archetype === 'skeleton' &&
        weapon !== undefined &&
        isItemBroken(weapon)
    ) {
        const stowed = world.requestInventoryAction?.(
            actor,
            { type: 'equipment_action', action: 'unequip', slot: 'weapon' },
            now
        )
        if (stowed?.accepted !== true) {
            return
        }
        world.publishEvents(stowed.events)
    }
    if (!trySkeletonStrike(actor, target, world, now)) {
        world.requestAttack(actor, now)
    }
}
