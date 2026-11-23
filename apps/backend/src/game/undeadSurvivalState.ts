import type { ConstellationId } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'

interface UndeadSurvivalLife {
    deathSequence: number
    repairRestSince?: number
    loanReadyAt: number
    loanUntil: number
    interceptionReadyAt: number
    heldPain?: { attackerId: string; expiresAt: number }
    collapses: number
    collapseLockUntil: number
    secondCollapseReady: boolean
    oathFulfilled: boolean
}

const survival = new WeakMap<GameCharacter, UndeadSurvivalLife>()
const inheritedPath = new WeakMap<GameCharacter, ConstellationId>()

type ImprintAspect = 'hp' | 'energy' | 'recovery'

const imprintAspect: Partial<Record<ConstellationId, ImprintAspect>> = {
    blade: 'hp',
    life: 'hp',
    arrow: 'energy',
    shadow: 'energy',
    theft: 'energy',
}
const imprintAmount: Record<ImprintAspect, number> = {
    hp: 10,
    energy: 20,
    recovery: 0.15,
}

export function readUndeadSurvivalLife(actor: GameCharacter) {
    const state = survival.get(actor)
    return state?.deathSequence === actor.deathSequence ? state : undefined
}

export function undeadSurvivalLife(actor: GameCharacter): UndeadSurvivalLife {
    const state = readUndeadSurvivalLife(actor)
    if (state !== undefined) {
        return state
    }
    const fresh = {
        deathSequence: actor.deathSequence,
        loanReadyAt: 0,
        loanUntil: 0,
        interceptionReadyAt: 0,
        collapses: 0,
        collapseLockUntil: 0,
        secondCollapseReady: false,
        oathFulfilled: false,
    }
    survival.set(actor, fresh)
    return fresh
}

export function rememberInheritedPath(
    actor: GameCharacter,
    mastery: ConstellationId
): void {
    if (!inheritedPath.has(actor)) {
        inheritedPath.set(actor, mastery)
    }
}

export function hasUndeadImprint(actor: GameCharacter): boolean {
    return (
        actor.progression.constellations.opened.has('undead.imprint') &&
        inheritedPath.has(actor)
    )
}

export function undeadImprintBonus(
    actor: GameCharacter,
    aspect: ImprintAspect,
    activeStars: ReadonlySet<string> = actor.progression.constellations.opened
): number {
    if (!activeStars.has('undead.imprint')) {
        return 0
    }
    const mastery = inheritedPath.get(actor)
    if (
        mastery === undefined ||
        aspect !== (imprintAspect[mastery] ?? 'recovery')
    ) {
        return 0
    }
    const strength =
        readUndeadSurvivalLife(actor)?.oathFulfilled === true ? 2 : 1
    return imprintAmount[aspect] * strength
}
