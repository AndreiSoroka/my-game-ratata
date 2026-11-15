import type { GameEventPayload } from '@my-game-ratata/contracts'

import type { GameCharacter } from './character'
import { finishConstellationAction } from './constellations'
import { trainSkill } from './skillProgression'

export function recordVitalityDamage(
    actor: GameCharacter,
    amount: number,
    now: number,
    deferDiscovery = false
): GameEventPayload[] {
    const state = actor.progression.constellations
    state.opened.add('life.root')
    state.hostileWound = Math.min(
        actor.maxHp - actor.hp,
        state.hostileWound + amount
    )
    state.woundPractice += amount
    let practice = takePractice(actor, 'woundPractice')
    if (
        actor.hp < actor.maxHp * 0.2 &&
        actor.hp + amount >= actor.maxHp * 0.2
    ) {
        state.lowHpFromHostile = true
        if (!state.lowHpAwarded) {
            state.lowHpAwarded = true
            practice += 1
        }
    }
    return awardVitality(actor, practice, now, 'wound', deferDiscovery)
}

/** Only recovery backed by real hostile HP loss can train knowledge of the body. */
export function recordVitalityRecovery(
    actor: GameCharacter,
    healed: number,
    now: number,
    deferDiscovery = false
): GameEventPayload[] {
    const state = actor.progression.constellations
    const amount = Math.min(Math.max(0, healed), state.hostileWound)
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
        deferDiscovery
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
    deferDiscovery = false
): GameEventPayload[] {
    if (amount <= 0) {
        return []
    }
    return [
        ...trainSkill(actor, 'vitality', amount),
        ...(deferDiscovery
            ? []
            : finishConstellationAction(actor, {
                  skillIds: ['vitality'],
                  now,
                  evidence: [evidence],
              })),
    ]
}
