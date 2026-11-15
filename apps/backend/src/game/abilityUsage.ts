import type { AbilityId, AbilityUsageSnapshot } from '@my-game-ratata/contracts'

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
        parameters[id] =
            id === 'pray'
                ? prayerUsage(actor, tileWidth)
                : abilityUsage(actor, id, tileWidth)
    }
    return parameters
}

function abilityUsage(
    actor: GameCharacter,
    id: AbilityId,
    tileWidth: number
): AbilityUsageSnapshot {
    const { mana, energy, cooldownMs, range, windupMs } = effectiveAbility(
        actor,
        id,
        tileWidth
    )
    return { mana, energy, cooldownMs, range, windupMs }
}

function prayerUsage(
    actor: GameCharacter,
    tileWidth: number
): AbilityUsageSnapshot {
    const prayer = prayerParameters(actor, tileWidth)
    return {
        mana: prayer.manaCost,
        energy: 0,
        cooldownMs: prayer.durationMs,
        range: prayer.radius,
        windupMs: prayer.durationMs,
    }
}
