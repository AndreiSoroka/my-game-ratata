import {
    type ConstellationId,
    createMasteryLevels,
    type HeroClass,
    MASTERY_NAMES,
} from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../../backend/src/game/constellationNodes'
import { minimumConstellationLevel } from '../../../../../backend/src/game/constellationRequirements'
import { constellationBuildLevels, constellationStarPlan } from './constellationMasteryPlan'

export interface ConstellationLevelRequirement {
    id: ConstellationId
    name: string
    required: number
    current: number
    satisfied: boolean
}

/** Explicit level gates are separate from how many random openings the desired build costs. */
export function constellationRequirementProgress(
    nodeId: string,
    activeIds: ReadonlySet<string> = new Set(),
    heroClass?: HeroClass
): ConstellationLevelRequirement[] | undefined {
    const node = fullConstellationCatalog.find((entry) => entry.id === nodeId)
    if (!node) return undefined
    const minimum = createMasteryLevels()
    for (const id of constellationStarPlan(nodeId, heroClass).ids) {
        const ancestor = fullConstellationCatalog.find((entry) => entry.id === id)!
        minimum[ancestor.constellationId] = Math.max(
            minimum[ancestor.constellationId],
            minimumConstellationLevel(id, heroClass)
        )
    }
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
