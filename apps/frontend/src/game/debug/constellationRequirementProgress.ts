import { type ConstellationId, type HeroClass, MASTERY_NAMES } from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import { constellationBuildLevels, constellationStarPlan } from './constellationMasteryPlan'

export interface ConstellationLevelRequirement {
    id: ConstellationId
    name: string
    required: number
    current: number
    satisfied: boolean
}

/** Compare the inspected star's minimum plan with the actual selected build, not a hypothetical purchase. */
export function constellationRequirementProgress(
    nodeId: string,
    activeIds: ReadonlySet<string> = new Set(),
    heroClass?: HeroClass
): ConstellationLevelRequirement[] | undefined {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (!node) return undefined
    const minimum = constellationStarPlan(nodeId, heroClass).levels
    const current = constellationBuildLevels(activeIds, heroClass)
    return (Object.entries(minimum) as Array<[ConstellationId, number]>)
        .filter(([id, level]) => level > 0 || id === node.constellationId)
        .map(([id, required]) => ({
            id,
            name: MASTERY_NAMES[id],
            required,
            current: current[id],
            satisfied: current[id] >= required,
        }))
}
