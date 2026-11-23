import {
    type ConstellationId,
    type GameEventPayload,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { reconcileConstellationLevels } from './constellations'
import { effectiveMaxEnergy, effectiveMaxMana } from './effectiveResources'
import {
    awardMasteryExperience,
    canReceiveMastery,
    type MasteryPractice,
} from './skillProgression'

function masteryExperienceTotal(mastery: MasteryPractice): bigint {
    return masteryTotalExperience(mastery.level) + mastery.experience
}

export function debitMasteryExperience(
    actor: GameCharacter,
    id: ConstellationId,
    amount: bigint,
    deep: boolean
): boolean {
    const mastery = actor.progression.masteries[id]
    const balance = deep ? masteryExperienceTotal(mastery) : mastery.experience
    if (amount <= 0n || amount > balance) {
        return false
    }
    if (amount <= mastery.experience) {
        mastery.experience -= amount
    } else {
        lowerMasteryTotal(mastery, balance - amount)
        reconcileMasteryLoss(actor)
    }
    return true
}

/** A transfer conserves exact micro-XP, independent of practice multipliers. */
export function transferMasteryExperience(
    donor: GameCharacter,
    recipient: GameCharacter,
    from: ConstellationId,
    to: ConstellationId,
    amount: bigint,
    deep: boolean,
    now: number
): GameEventPayload[] | undefined {
    if (
        donor === recipient ||
        !canReceiveMastery(donor, undefined) ||
        !canReceiveMastery(recipient, undefined) ||
        !debitMasteryExperience(donor, from, amount, deep)
    ) {
        return undefined
    }
    return awardMasteryExperience(recipient, to, amount, { now })
}

export function retainMasteryExperience(
    actor: GameCharacter,
    numerator: bigint,
    denominator: bigint
): void {
    if (denominator <= 0n || numerator < 0n || numerator > denominator) {
        throw new RangeError(
            'Expected a mastery retention fraction between zero and one'
        )
    }
    for (const mastery of Object.values(actor.progression.masteries)) {
        lowerMasteryTotal(
            mastery,
            (masteryExperienceTotal(mastery) * numerator) / denominator
        )
    }
    reconcileMasteryLoss(actor)
}

function lowerMasteryTotal(mastery: MasteryPractice, total: bigint): void {
    const previousLevel = mastery.level
    while (masteryTotalExperience(mastery.level) > total) {
        mastery.level -= 1
    }
    if (mastery.level < previousLevel) {
        mastery.highestLevel = Math.max(
            mastery.highestLevel ?? 0,
            previousLevel
        )
    }
    mastery.experience = total - masteryTotalExperience(mastery.level)
}

function reconcileMasteryLoss(actor: GameCharacter): void {
    reconcileConstellationLevels(actor)
    actor.hp = Math.min(actor.hp, actor.maxHp)
    actor.mana = Math.min(actor.mana, effectiveMaxMana(actor))
    actor.energy = Math.min(actor.energy, effectiveMaxEnergy(actor))
}
