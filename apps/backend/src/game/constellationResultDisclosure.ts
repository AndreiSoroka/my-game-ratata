import type { ConstellationId } from '@my-game-ratata/contracts'

import { resolveConstellationCardEffectRows } from './constellationCardEffects'
import type { EffectRow } from './constellationEffectText'

/** These insight ranks reveal mechanical card rows, never health or energy capacities. */
export function constellationResultKnowledge(
    path: ConstellationId,
    learned: ReadonlySet<string>
): 0 | 1 | 2 | 3 {
    for (const rank of [3, 2, 1] as const) {
        if (learned.has(`${path}.insight${String(rank)}`)) {
            return rank
        }
    }
    return 0
}

/** Authored atlas callers keep the full resolver; owner snapshots receive only earned rows. */
export function observedConstellationCardEffects(
    nodeId: string,
    learned: ReadonlySet<string>
): string[] | undefined {
    return observedConstellationCardEffectRows(nodeId, learned)?.map(
        ([russian]) => russian
    )
}

export function observedConstellationCardEffectRows(
    nodeId: string,
    learned: ReadonlySet<string>
): EffectRow[] | undefined {
    if (!learned.has(nodeId)) {
        return undefined
    }
    const full = resolveConstellationCardEffectRows(nodeId, learned)
    const path = nodeId.split('.')[0]
    if (full === undefined || (path !== 'blade' && path !== 'prayer')) {
        return full
    }
    const rank = constellationResultKnowledge(path, learned)
    if (rank === 0) {
        return undefined
    }
    return rank === 3 ? full : full.slice(0, rank)
}
