import type { HeroClass } from '@my-game-ratata/contracts'

import { fullConstellationCatalog } from '../../../../backend/src/game/constellationNodes'

export interface ConstellationBuildChange {
    enabledIds: Set<string>
    missingParents: string[]
    disabledIds: string[]
    changed: boolean
    error?: string
}

const startingRoots: Record<HeroClass, string> = {
    vanguard: 'blade.root',
    arcanist: 'magic.root',
    cleric: 'prayer.root',
    ranger: 'arrow.root',
}
const stars = new Map(fullConstellationCatalog.map((star) => [star.id, star]))

/** A debug ownership model: discovery conditions and practice remain explanatory metadata. */
export function initialConstellationBuild(heroClass: HeroClass): ReadonlySet<string> {
    return new Set([startingRoots[heroClass]])
}

export function enableConstellationStar(
    current: ReadonlySet<string>,
    id: string
): ConstellationBuildChange {
    const result = unchanged(current)
    const star = stars.get(id)
    if (star === undefined) return { ...result, error: 'Звезда не найдена.' }
    if (current.has(id)) return result
    const missingParents = star.parents.filter((parent) => !current.has(parent))
    if (missingParents.length > 0) return { ...result, missingParents }
    result.enabledIds.add(id)
    return { ...result, changed: true }
}

export function disableConstellationStar(
    current: ReadonlySet<string>,
    id: string
): ConstellationBuildChange {
    const result = unchanged(current)
    if (!stars.has(id)) return { ...result, error: 'Звезда не найдена.' }
    if (!current.has(id)) return result
    const disabled = new Set([id])
    for (const removed of disabled) {
        for (const star of fullConstellationCatalog) {
            if (current.has(star.id) && star.parents.includes(removed)) disabled.add(star.id)
        }
    }
    for (const removed of disabled) result.enabledIds.delete(removed)
    return { ...result, changed: true, disabledIds: [...disabled] }
}

/** Build in dependency order, without consulting gameplay RNG, teachers or skill levels. */
export function enableAllConstellationStars(): ReadonlySet<string> {
    const enabled = new Set<string>()
    while (enabled.size < fullConstellationCatalog.length) {
        const previousSize = enabled.size
        for (const star of fullConstellationCatalog) {
            if (star.parents.every((parent) => enabled.has(parent))) enabled.add(star.id)
        }
        if (enabled.size === previousSize)
            throw new Error('В графе созвездий есть недоступная зависимость.')
    }
    return enabled
}

function unchanged(current: ReadonlySet<string>): ConstellationBuildChange {
    return { enabledIds: new Set(current), missingParents: [], disabledIds: [], changed: false }
}
