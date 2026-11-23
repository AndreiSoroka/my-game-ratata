import {
    type ConstellationId,
    GRAVE_MAX_HP,
    GRAVE_PURIFY_STEPS,
    GRAVE_SPAWN_INTERVAL_MS,
    type GraveSourceDefinition,
} from '@my-game-ratata/contracts'

import { resolveBuriedName } from './graveNames'
import type { GraveCombatTarget } from './graveRules'

export interface GraveSource {
    definition: GraveSourceDefinition & { buriedName: string }
    children: Set<string>
    nextSpawnAt: number
    nextBirth: number
    firstMasteryLevel: number
    reserveRevival: boolean
    retryAt: number
    phase: GraveCombatTarget['phase']
    hpUnits: number
    restoresAt: number | null
    purificationReceipts: Set<string>
    firstMasteryPath?: ConstellationId
}

export function createGraveSource(
    definition: GraveSourceDefinition,
    initialChildren: readonly string[],
    now: number,
    firstDelay: number,
    firstMasteryLevel: number,
    reserveRevival: boolean
): GraveSource {
    return {
        definition: {
            ...structuredClone(definition),
            buriedName: resolveBuriedName(definition.id, definition.buriedName),
        },
        children: new Set(initialChildren),
        nextSpawnAt: now + firstDelay,
        nextBirth: 1,
        firstMasteryLevel,
        reserveRevival,
        retryAt: 0,
        hpUnits: GRAVE_MAX_HP * 100,
        phase: 'active',
        restoresAt: null,
        purificationReceipts: new Set(),
    }
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
