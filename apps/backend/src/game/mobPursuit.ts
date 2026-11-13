import {
    type GameEventPayload,
    MOVEMENT_RULES,
    WILDERNESS_AGGRO_POLICY,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { canTargetByFaction } from './factions'
import { distance, normalize } from './math'
import { handleMovementCommand, movementActionAllowed } from './movementActions'
import type { NavigationService } from './navigation'
import { visibilityRadius } from './queries'

/** Controller policy only: the common command owns cost, timing, direction and movement. */
export function tryPursuitDash(
    actor: GameCharacter,
    target: GameCharacter,
    navigation: NavigationService,
    now: number
): GameEventPayload[] {
    if (
        !readyToPursue(actor, now) ||
        !visibleTarget(actor, target, navigation, now)
    ) {
        return []
    }
    const travel =
        (actor.config.moveSpeed *
            MOVEMENT_RULES.dashSpeedMultiplier *
            MOVEMENT_RULES.dashDurationMs) /
        1_000
    // Leave a tile of braking distance; dashing point-blank would pass a stationary target.
    if (
        distance(actor.position, target.position) <
        travel + navigation.grid.tileWidth
    ) {
        return []
    }
    const direction = normalize({
        x: target.position.x - actor.position.x,
        y: target.position.y - actor.position.y,
    })
    const delta = { x: direction.x * travel, y: direction.y * travel }
    const expected = {
        x: actor.position.x + delta.x,
        y: actor.position.y + delta.y,
    }
    if (
        distance(
            navigation.moveWithCollision(actor.position, delta),
            expected
        ) > 0.01
    ) {
        return []
    }
    // Replace stale wandering input with the real visible target before the shared direction resolver.
    actor.setPath([{ ...target.position }])
    return handleMovementCommand(actor, { type: 'dash' }, now)
}

function readyToPursue(actor: GameCharacter, now: number): boolean {
    return (
        actor.faction === 'monsters' &&
        !actor.tags.has('state.retired') &&
        actor.controllerKind !== 'network_player' &&
        actor.soul.controlSource !== 'human' &&
        actor.energy >=
            MOVEMENT_RULES.dashEnergy +
                actor.config.resources.attackEnergyCost &&
        actor.canSpendAttackResources() &&
        movementActionAllowed(actor, { type: 'dash' }, now)
    )
}

function visibleTarget(
    actor: GameCharacter,
    target: GameCharacter,
    navigation: NavigationService,
    now: number
): boolean {
    return (
        target.alive &&
        !target.tags.has('offline') &&
        !target.tags.has('state.retired') &&
        target.locationId === actor.locationId &&
        canTargetByFaction(actor, target, now) &&
        distance(actor.position, target.position) <=
            visibilityRadius(
                actor,
                target,
                WILDERNESS_AGGRO_POLICY.sightRadius,
                now
            ) &&
        navigation.hasLineOfSight(actor.position, target.position)
    )
}
