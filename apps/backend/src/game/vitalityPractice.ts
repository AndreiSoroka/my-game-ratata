import {
    type ConstellationId,
    type GameEventPayload,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

export function recordVitalityDamage(
    actor: GameCharacter,
    amount: number,
    now: number,
    _deferDiscovery?: boolean,
    factors: Record<ConstellationId, number> = captureMasteryFactors(actor)
): GameEventPayload[] {
    const state = actor.progression.constellations
    state.opened.add('life.root')
    state.hostileWound = Math.min(
        Math.max(0, actor.maxHp - actor.hp),
        state.hostileWound + amount
    )
    state.woundPractice += amount
    const practice = takePractice(actor, 'woundPractice')
    if (
        actor.hp < actor.maxHp * 0.2 &&
        actor.hp + amount >= actor.maxHp * 0.2
    ) {
        state.lowHpFromHostile = true
        state.lowHpAwarded = true
    }
    return awardVitality(actor, practice, now, 'wound', factors)
}

/** Only recovery backed by real hostile HP loss can train knowledge of the body. */
export function recordVitalityRecovery(
    actor: GameCharacter,
    healed: number,
    now: number,
    _deferDiscovery?: boolean,
    factors: Record<ConstellationId, number> = captureMasteryFactors(actor)
): GameEventPayload[] {
    const state = actor.progression.constellations
    const amount = Math.min(
        Math.max(0, healed),
        Math.max(0, state.hostileWound)
    )
    state.hostileWound = Math.max(0, state.hostileWound - amount)
    state.recoveryPractice += amount
    if (actor.hp >= actor.maxHp * 0.2) {
        state.lowHpFromHostile = false
    }
    if (actor.hp >= actor.maxHp * 0.5) {
        state.lowHpAwarded = false
    }
    return awardVitality(
        actor,
        takePractice(actor, 'recoveryPractice'),
        now,
        'recovery',
        factors
    )
}

function takePractice(
    actor: GameCharacter,
    key: 'woundPractice' | 'recoveryPractice'
): number {
    const state = actor.progression.constellations
    const threshold = actor.maxHp * 0.2
    if (threshold <= 0) {
        return 0
    }
    const amount = Math.floor((state[key] + 1e-9) / threshold)
    state[key] = Math.max(0, state[key] - amount * threshold)
    return amount
}

function awardVitality(
    actor: GameCharacter,
    amount: number,
    now: number,
    evidence: string,
    factors: Record<ConstellationId, number>
): GameEventPayload[] {
    return amount <= 0
        ? []
        : awardMasteries(
              actor,
              [
                  {
                      constellationId: 'life',
                      experience: amount * MASTERY_REWARDS.vitalityBlock,
                  },
              ],
              { now, evidence: [evidence], factors }
          )
}
