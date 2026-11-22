import {
    constellationIds,
    type GameEventPayload,
    MASTERY_XP_SCALE,
    masteryTotalExperience,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { awardUndeadExperience } from './skeletonProgression'
import { recoverAfterUndeadKill } from './undeadSurvivalRecovery'

interface KillStreak {
    life: number
    victims: Set<string>
}

const killStreaks = new WeakMap<GameCharacter, KillStreak>()

export function rewardSkeletonKill(
    actor: GameCharacter,
    target: GameCharacter,
    now: number,
    random?: () => number
): GameEventPayload[] {
    if (
        actor.archetype !== 'skeleton' ||
        !actor.alive ||
        actor.trainingTarget !== undefined ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired') ||
        actor.locationId !== target.locationId
    ) {
        return []
    }
    const streak = killStreak(actor)
    if (streak.victims.has(target.id)) {
        return []
    }
    const survivalMinutes = Math.floor(
        Math.max(0, now - actor.lifeStartedAt) / 60_000
    )
    const bonus = Math.min(100, streak.victims.size * 10 + survivalMinutes * 5)
    streak.victims.add(target.id)

    let strongestLevel = 0
    let victimExperience = 0n
    for (const id of constellationIds) {
        const { level, experience } = target.progression.masteries[id]
        strongestLevel = Math.max(strongestLevel, level)
        victimExperience += masteryTotalExperience(level) + experience
    }
    const baseExperience =
        (100n + 50n * BigInt(strongestLevel)) * MASTERY_XP_SCALE
    const opened = actor.progression.constellations.opened
    const copiedExperience = opened.has('undead.consume_full')
        ? victimExperience
        : opened.has('undead.consume_half')
          ? victimExperience / 2n
          : 0n
    const rewards = recoverAfterUndeadKill(actor, strongestLevel, now)
    return [
        ...rewards,
        ...awardUndeadExperience(
            actor,
            (baseExperience * BigInt(100 + bonus)) / 100n + copiedExperience,
            {
                now,
                random,
                receiptId: `skeleton-kill:${String(streak.life)}:${target.id}`,
            }
        ),
    ]
}

function killStreak(actor: GameCharacter): KillStreak {
    const current = killStreaks.get(actor)
    if (current?.life === actor.deathSequence) {
        return current
    }
    const streak = {
        life: actor.deathSequence,
        victims: new Set<string>(),
    }
    killStreaks.set(actor, streak)
    return streak
}
