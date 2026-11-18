import {
    type AbilityId,
    type AbilityUsageSnapshot,
    isPrayerAction,
    type PrayerActionId,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveAbility } from './effectiveParameters'
import { prayerParameters } from './prayerParameters'

/** Only capabilities the actor has attained may describe their public action geometry and costs. */
export function snapshotAbilityUsage(
    actor: GameCharacter,
    known: readonly AbilityId[],
    tileWidth = 0
): Partial<Record<AbilityId, AbilityUsageSnapshot>> {
    const parameters: Partial<Record<AbilityId, AbilityUsageSnapshot>> = {}
    for (const id of known) {
        parameters[id] = isPrayerAction(id)
            ? prayerUsage(actor, id, tileWidth)
            : abilityUsage(actor, id, tileWidth)
    }
    return parameters
}

function abilityUsage(
    actor: GameCharacter,
    id: AbilityId,
    tileWidth: number
): AbilityUsageSnapshot {
    const { mana, energy, cooldownMs, range, windupMs, cycleMs, movementMs } =
        effectiveAbility(actor, id, tileWidth)
    return {
        mana,
        energy,
        cooldownMs,
        range,
        windupMs,
        cycleMs,
        movementMs,
    }
}

function prayerUsage(
    actor: GameCharacter,
    abilityId: PrayerActionId,
    tileWidth: number
): AbilityUsageSnapshot {
    const prayer = prayerParameters(actor, tileWidth, abilityId)
    return {
        mana: prayer.manaCost,
        energy: 0,
        cooldownMs: prayer.durationMs,
        range: prayer.radius,
        windupMs: prayer.durationMs,
    }
}
