import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import type { ConstellationEffectChance } from './constellationChanceTypes'
import { describeOtherEffectChance } from './constellationOtherChance'
import { describePrayerEffectChance } from './constellationPrayerChance'

/** Catalog examples only: never reads a live identity, hidden mood or practice counters. */
export function describeConstellationEffectChance(
    nodeId: string,
    activeIds?: ReadonlySet<string>
): ConstellationEffectChance {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (node === undefined) {
        return { summary: 'Звезда не найдена в каталоге.', formulas: [], examples: [], notes: [] }
    }
    return describePrayerEffectChance(node, activeIds) ?? describeOtherEffectChance(node)
}
