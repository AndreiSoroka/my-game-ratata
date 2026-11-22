import {
    type ConstellationId,
    GRAVE_MAX_HP,
    GRAVE_PURIFY_STEPS,
    GRAVE_SPAWN_INTERVAL_MS,
    type GraveSourceDefinition,
} from '@my-game-ratata/contracts'

import type { GraveCombatTarget } from './graveRules'

export interface GraveSource {
    definition: GraveSourceDefinition
    children: Set<string>
    nextSpawnAt: number
    nextBirth: number
    firstMasteryLevel: number
    retryAt: number
    phase: GraveCombatTarget['phase']
    hpUnits: number
    restoresAt: number | null
    purificationReceipts: Set<string>
    firstMasteryPath?: ConstellationId
}

export function restoreSource(source: GraveSource, now: number): void {
    if (
        source.phase !== 'ruined' ||
        source.restoresAt === null ||
        now < source.restoresAt
    ) {
        return
    }
    source.phase = 'active'
    source.hpUnits = GRAVE_MAX_HP * 100
    source.nextSpawnAt = source.restoresAt + GRAVE_SPAWN_INTERVAL_MS
    source.restoresAt = null
    source.retryAt = 0
}

export function snapshotSource(source: GraveSource): GraveCombatTarget {
    return {
        ...structuredClone(source.definition),
        phase: source.phase,
        hp: source.hpUnits / 100,
        maxHp: GRAVE_MAX_HP,
        material: 'stone',
        purification: {
            completed:
                source.phase === 'purified'
                    ? GRAVE_PURIFY_STEPS
                    : source.purificationReceipts.size,
            required: GRAVE_PURIFY_STEPS,
        },
        ...(source.restoresAt === null
            ? {}
            : { restoresAt: source.restoresAt }),
    }
}
