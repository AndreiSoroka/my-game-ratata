import {
    type ConstellationId,
    createMasteryLevels,
    type HeroClass,
} from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'
import {
    costsConstellationOpening,
    minimumConstellationLevel,
} from '../../../../backend/src/game/constellationRequirements'

const nodes = new Map(fullConstellationCatalog.map((node) => [node.id, node]))

/** Spell knowledge is a real requirement, without adding presentation edges to the sky. */
export function constellationBuildParents(id: string): string[] {
    const node = nodes.get(id)
    if (!node) return []
    const action =
        node.ability === undefined
            ? undefined
            : fullConstellationCatalog.find(
                  (candidate) =>
                      candidate.id !== id && candidate.activationAbilityId === node.ability
              )
    return [...new Set([...node.parents, ...(action ? [action.id] : [])])]
}

export function constellationBuildLevels(activeIds: ReadonlySet<string>, heroClass?: HeroClass) {
    const levels = createMasteryLevels()
    for (const id of activeIds) {
        const node = nodes.get(id)
        if (node && costsConstellationOpening(node, heroClass)) levels[node.constellationId] += 1
    }
    for (const id of activeIds) {
        const node = nodes.get(id)
        if (node)
            levels[node.constellationId] = Math.max(
                levels[node.constellationId],
                minimumConstellationLevel(id, heroClass)
            )
    }
    return levels
}

export function constellationStarPlan(id: string, heroClass?: HeroClass) {
    const ancestors = new Set<string>()
    const visit = (current: string) => {
        if (ancestors.has(current) || !nodes.has(current)) return
        ancestors.add(current)
        for (const parent of constellationBuildParents(current)) visit(parent)
    }
    visit(id)
    return { ids: ancestors, levels: constellationBuildLevels(ancestors, heroClass) }
}

export function paidConstellationStars(
    activeIds: ReadonlySet<string>,
    path: ConstellationId,
    heroClass?: HeroClass
): number {
    return fullConstellationCatalog.filter(
        (node) =>
            activeIds.has(node.id) &&
            node.constellationId === path &&
            costsConstellationOpening(node, heroClass)
    ).length
}
