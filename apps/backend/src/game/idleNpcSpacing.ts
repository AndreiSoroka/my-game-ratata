import type { Vector2 } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import {
    characterClearance,
    insideTravelEdges,
    liveSpacingPeer,
    sideStepDestination,
    standingOccupancy,
} from './characterSpacing'
import { stationaryNpc } from './companionProfiles'
import { available, humanControlled } from './crimeRules'
import { canTargetByFaction } from './factions'
import { distance } from './math'
import type { NavigationService } from './navigation'

export function canYieldWhileIdle(actor: GameCharacter, now: number): boolean {
    const order = actor.soul.companion?.order
    return (
        actor.faction === 'peaceful' &&
        available(actor) &&
        !humanControlled(actor) &&
        actor.trainingTarget === undefined &&
        !stationaryNpc(actor.id) &&
        (order === undefined || order === 'idle') &&
        isIdle(actor, now)
    )
}

function isIdle(actor: GameCharacter, now: number): boolean {
    const input = actor.getMoveInput()
    return (
        !actor.hasPath() &&
        input.x === 0 &&
        input.y === 0 &&
        actor.stunUntil <= now &&
        !actor.isActionLocked(now) &&
        actor.abilities.casting === null &&
        actor.movement.dashUntil <= now &&
        !actor.combat.defensiveStance &&
        actor.combat.lunge === undefined &&
        actor.pendingAttack === undefined &&
        actor.interruptWork === undefined
    )
}

export function idleSideStep(
    actor: GameCharacter,
    characters: readonly GameCharacter[],
    yielding: ReadonlySet<string>,
    navigation: NavigationService,
    now: number
): Vector2 | undefined {
    const overlapping = characters.filter(
        (other) =>
            liveSpacingPeer(actor, other) &&
            distance(actor.position, other.position) < characterClearance
    )
    if (
        !overlapping.some(
            (other) => !yielding.has(other.id) || actor.id > other.id
        ) ||
        overlapping.some(
            (other) =>
                canTargetByFaction(actor, other, now) ||
                canTargetByFaction(other, actor, now)
        )
    ) {
        return undefined
    }
    return sideStepDestination(
        actor,
        standingOccupancy(actor, characters),
        navigation,
        (point) => insideTravelEdges(point, navigation)
    )
}
