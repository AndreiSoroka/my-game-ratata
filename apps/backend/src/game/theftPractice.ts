import { MASTERY_REWARDS, THEFT_RULES } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { awardMasteries, type MasteryAwardOptions } from './skillProgression'

interface QuietAttempt {
    targetId: string
    at: number
}

const quietAttempts = new WeakMap<GameCharacter, QuietAttempt[]>()

/** Called after a real transfer or an eligible, paid attempt with an empty-handed roll. */
export function practiceTheft(
    actor: GameCharacter,
    target: GameCharacter,
    outcome: 'stolen' | 'failed',
    options: MasteryAwardOptions
) {
    if (
        outcome === 'failed' &&
        !takeQuietPractice(actor, target, options.now)
    ) {
        return []
    }
    const experience =
        outcome === 'stolen'
            ? MASTERY_REWARDS.theftSuccess
            : MASTERY_REWARDS.theftQuietPractice
    return awardMasteries(actor, [{ constellationId: 'theft', experience }], {
        ...options,
        evidence: ['theft'],
    }).map((event) => ({ ...event, audienceIds: [actor.id] }))
}

function takeQuietPractice(
    actor: GameCharacter,
    target: GameCharacter,
    now: number
): boolean {
    if (
        target.controllerKind === 'network_player' ||
        target.soul.controlSource === 'human'
    ) {
        return false
    }
    const recent = (quietAttempts.get(actor) ?? []).filter(
        ({ at }) => now - at < THEFT_RULES.quietPracticeWindowMs
    )
    if (
        recent.length >= THEFT_RULES.quietPracticeWindowLimit ||
        recent.some(({ targetId }) => targetId === target.id)
    ) {
        return false
    }
    recent.push({ targetId: target.id, at: now })
    quietAttempts.set(actor, recent)
    return true
}
