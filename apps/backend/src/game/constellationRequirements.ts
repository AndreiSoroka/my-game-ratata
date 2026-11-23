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
    return (nodeId === 'prayer.revive' && heroClass === 'cleric') ||
        startsWithSniperShot(nodeId, heroClass)
        ? 0
        : node.minimumLevel
}

function startsWithSniperShot(nodeId: string, heroClass?: HeroClass): boolean {
    return heroClass === 'ranger' && nodeId === 'arrow.sniper_shot'
}

export function costsConstellationOpening(
    node: ConstellationStar,
    heroClass?: HeroClass
): boolean {
    return (
        node.acquisition === 'random' &&
        !startsWithSniperShot(node.id, heroClass)
    )
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
    const stars = new Set([root])
    if (heroClass === 'cleric') {
        stars.add('prayer.revive')
    }
    if (heroClass === 'ranger') {
        stars.add('arrow.sniper_shot')
    }
    return stars
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
        costsConstellationOpening(node, context.heroClass) &&
        !context.opened.has(node.id) &&
        constellationRequirementsSatisfied(node, context)
    )
}
