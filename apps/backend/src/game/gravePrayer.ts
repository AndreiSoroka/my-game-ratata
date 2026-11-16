import {
    type GameEventPayload,
    graveBounds,
    interactionApproachPoints,
} from '@my-game-ratata/contracts'

import type { AbilityContext } from './abilityContext'
import { knowsAbility } from './abilityState'
import type { GameCharacter } from './character'
import { distance } from './math'
import { advancePrayerCast, beginPrayerCast } from './prayer'
import { prayerParameters } from './prayerParameters'

export function canPurifyGrave(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext
): boolean {
    return validPurificationTarget(
        actor,
        graveId,
        context,
        prayerParameters(actor, context.navigation.grid.tileWidth).radius
    )
}

/** Automatic intentions approach the pinned visible grave through ordinary navigation. */
export function canApproachGravePurification(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext
): boolean {
    return validPurificationTarget(actor, graveId, context, 240)
}

function validPurificationTarget(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext,
    range: number
): boolean {
    const grave = context.graves?.get(graveId)
    if (
        !knowsAbility(actor, 'pray') ||
        grave === undefined ||
        grave.phase === 'purified' ||
        grave.locationId !== actor.locationId ||
        distance(actor.position, grave.position) > range
    ) {
        return false
    }
    return interactionApproachPoints(actor.position, [
        graveBounds(grave.position),
    ]).some(
        (point) =>
            !context.navigation.isSolidTile(
                context.navigation.worldToTile(point)
            ) && context.navigation.hasLineOfSight(actor.position, point)
    )
}

export function beginGravePurification(
    actor: GameCharacter,
    graveId: string,
    context: AbilityContext
): GameEventPayload[] {
    return beginPrayerCast(
        actor,
        { mode: 'purify_grave', target: { kind: 'grave', id: graveId } },
        context
    )
}

export function advanceGravePurification(
    actor: GameCharacter,
    now: number,
    context?: AbilityContext
): GameEventPayload[] {
    return advancePrayerCast(actor, now, context)
}
