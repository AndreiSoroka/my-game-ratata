import { ashSkeletonBond, ashSummoner } from './ashSkeletonState'
import type { GameCharacter } from './character'
import { canAwardDefeatTrophy } from './damageEvents'

const boundSkeletonDeaths = new WeakMap<GameCharacter, number>()

export function rememberCorpseAllegiance(target: GameCharacter): void {
    if (
        target.archetype === 'skeleton' &&
        ashSkeletonBond(target) !== undefined
    ) {
        boundSkeletonDeaths.set(target, target.deathSequence + 1)
    }
}

export function corpseReturnTrophy(
    target: GameCharacter
): 'bone' | 'zombie_heart' | undefined {
    if (
        target.controllerKind !== 'mob1' ||
        target.faction !== 'monsters' ||
        target.soul.controlSource === 'human' ||
        target.trainingTarget !== undefined ||
        ashSummoner(target) !== undefined ||
        boundSkeletonDeaths.get(target) === target.deathSequence ||
        !canAwardDefeatTrophy(target)
    ) {
        return undefined
    }
    if (target.archetype === 'skeleton') {
        return 'bone'
    }
    return target.archetype === 'fat_zombie' ? 'zombie_heart' : undefined
}

export function defersDefeatCredit(target: GameCharacter): boolean {
    return (
        (target.mortal && target.archetype === 'skeleton') ||
        corpseReturnTrophy(target) !== undefined
    )
}
