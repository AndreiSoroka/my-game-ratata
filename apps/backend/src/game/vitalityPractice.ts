import {
    type ConstellationId,
    type GameEventPayload,
    MASTERY_REWARDS,
} from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { discoverLifeBreath, finishConstellationAction } from './constellations'
import { awardMasteries, captureMasteryFactors } from './skillProgression'

const TRAINING_FRACTION = 0.2
const REST_WINDOW_MS = 20_000
const REST_DURATION_MS = 8_000

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

/** Eligible energy is counted only after a paid work or combat result is recovered. */
export function recordLifeEnergyRecovery(
    actor: GameCharacter,
    work: number,
    combat: number,
    now: number,
    factors?: Record<ConstellationId, number>
): GameEventPayload[] {
    const baseEnergy = actor.config.resources.maxEnergy
    if (
        work + combat <= 0 ||
        baseEnergy <= 0 ||
        !actor.alive ||
        actor.trainingTarget !== undefined ||
        actor.tags.has('offline') ||
        actor.tags.has('state.retired')
    ) {
        return []
    }
    const state = actor.progression.constellations
    const training = state.lifeEnergy
    training.recovered = Math.min(
        3 * baseEnergy,
        training.recovered + work + combat
    )
    if (work > 0) {
        state.opened.add('life.root')
        training.workRemainder += work
    }
    const threshold = baseEnergy * TRAINING_FRACTION
    const blocks = Math.floor((training.workRemainder + 1e-9) / threshold)
    if (blocks > 0) {
        training.workRemainder = Math.max(
            0,
            training.workRemainder - blocks * threshold
        )
        return awardMasteries(
            actor,
            [
                {
                    constellationId: 'life',
                    experience: blocks * MASTERY_REWARDS.vitalityWorkBlock,
                },
            ],
            { now, evidence: ['work_recovery'], factors }
        )
    }
    return discoverLifeBreath(actor)
        ? finishConstellationAction(actor, { now })
        : []
}

export function recordLifeEnergySpend(
    actor: GameCharacter,
    amount: number,
    now: number
): void {
    const state = actor.progression.constellations
    const training = state.lifeEnergy
    if (!state.opened.has('life.rest') || now < training.restUntil) {
        return
    }
    training.recentSpends = training.recentSpends.filter(
        (spend) => spend.at > now - REST_WINDOW_MS
    )
    training.recentSpends.push({ at: now, energy: amount })
    if (
        training.recentSpends.length >= 3 &&
        training.recentSpends.reduce((sum, spend) => sum + spend.energy, 0) +
            1e-9 >=
            actor.config.resources.maxEnergy * TRAINING_FRACTION
    ) {
        training.restUntil = now + REST_DURATION_MS
        training.recentSpends = []
    }
}

/** Ticks that overlap either edge earn the resting bonus only during the active period. */
export function restBonusTime(
    restUntil: number,
    now: number,
    deltaMs: number
): number {
    return restUntil === 0
        ? 0
        : Math.max(
              0,
              Math.min(now, restUntil) -
                  Math.max(now - deltaMs, restUntil - REST_DURATION_MS)
          )
}

function takePractice(
    actor: GameCharacter,
    key: 'woundPractice' | 'recoveryPractice'
): number {
    const state = actor.progression.constellations
    const threshold = actor.maxHp * TRAINING_FRACTION
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
