import type {
    AbilityId,
    HeroClass,
    MasteryLevels,
} from '@my-game-ratata/contracts'

import type { ConstellationStar } from './constellationDefinition'
import { fullConstellationCatalog } from './constellationNodes'

const byId = new Map(fullConstellationCatalog.map((node) => [node.id, node]))
export function minimumConstellationLevel(
    nodeId: string,
    heroClass?: HeroClass
): number {
    const node = byId.get(nodeId)
    if (node === undefined) {
        throw new Error(`Unknown constellation star: ${nodeId}`)
    }
    return nodeId.endsWith('.revive') && heroClass === 'cleric'
        ? 0
        : node.minimumLevel
}
export function starterConstellationStars(heroClass?: HeroClass): Set<string> {
    if (heroClass === undefined) {
        return new Set()
    }
    const root = {
        vanguard: 'blade.root',
        arcanist: 'magic.root',
        cleric: 'prayer.root',
        ranger: 'arrow.root',
    }[heroClass]
    return new Set(heroClass === 'cleric' ? [root, 'prayer.revive'] : [root])
}
export interface ConstellationRequirementContext {
    opened: ReadonlySet<string>
    levels: MasteryLevels
    knownAbilities: ReadonlySet<AbilityId>
    heroClass?: HeroClass
}
export function constellationRequirementsSatisfied(
    node: ConstellationStar,
    context: ConstellationRequirementContext
): boolean {
    return (
        context.levels[node.constellationId] >=
            minimumConstellationLevel(node.id, context.heroClass) &&
        node.parents.every((parent) => context.opened.has(parent)) &&
        (node.ability === undefined || context.knownAbilities.has(node.ability))
    )
}
export function canDiscoverConstellationStar(
    node: ConstellationStar,
    context: ConstellationRequirementContext
): boolean {
    return (
        node.acquisition === 'random' &&
        !context.opened.has(node.id) &&
        constellationRequirementsSatisfied(node, context)
    )
}
