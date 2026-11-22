import {
    type ConstellationId,
    constellationIds,
    type GameEventPayload,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { effectiveMaxEnergy } from './effectiveResources'
import {
    awardMasteryExperience,
    type MasteryAwardOptions,
} from './skillProgression'

const MAX_UNDEAD_LEVEL = 40

export function captureSkeletonInheritance(victim: GameCharacter): number {
    return captureSkeletonInheritanceProfile(victim)?.level ?? 0
}

export function captureSkeletonInheritanceProfile(victim: GameCharacter) {
    let strongest: { mastery: ConstellationId; level: number } | undefined
    for (const mastery of constellationIds) {
        const level = victim.progression.masteries[mastery].level
        if (level > (strongest?.level ?? 0)) {
            strongest = { mastery, level }
        }
    }
    return strongest === undefined
        ? undefined
        : { ...strongest, level: Math.min(MAX_UNDEAD_LEVEL, strongest.level) }
}

export function inheritSkeletonProgress(
    skeleton: GameCharacter,
    masteryLevel: number,
    now: number
): GameEventPayload[] {
    const inheritedLevel = Math.min(masteryLevel, MAX_UNDEAD_LEVEL)
    const needed =
        masteryTotalExperience(inheritedLevel) - undeadExperience(skeleton)
    const events = awardUndeadExperience(skeleton, needed, {
        now,
        receiptId: 'undead:inheritance',
    })
    if (events.length > 0) {
        skeleton.hp = skeleton.maxHp
        skeleton.energy = effectiveMaxEnergy(skeleton)
    }
    return events
}

export function awardUndeadExperience(
    skeleton: GameCharacter,
    micros: bigint,
    options: MasteryAwardOptions
): GameEventPayload[] {
    if (!skeleton.progression.constellations.opened.has('undead.root')) {
        return []
    }
    const remaining =
        masteryTotalExperience(MAX_UNDEAD_LEVEL) - undeadExperience(skeleton)
    return awardMasteryExperience(
        skeleton,
        'undead',
        micros < remaining ? micros : remaining,
        options
    )
}

function undeadExperience(skeleton: GameCharacter): bigint {
    const mastery = skeleton.progression.masteries.undead
    return masteryTotalExperience(mastery.level) + mastery.experience
}
