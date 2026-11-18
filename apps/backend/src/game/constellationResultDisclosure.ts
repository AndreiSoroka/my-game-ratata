import type { ConstellationId } from '@my-game-ratata/contracts'

import { resolveConstellationCardEffects } from './constellationCardEffects'

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
    if (!learned.has(nodeId)) {
        return undefined
    }
    const full = resolveConstellationCardEffects(nodeId, learned)
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
