import { expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { CharacterEmotions } from '../src/game/characterEmotions'
import {
    normalizeReactionWeights,
    pickWeightedReaction,
    type ReactionRequest,
} from '../src/game/characterReactions'
import { CharacterTemperament } from '../src/game/characterTemperament'
import {
    generateCharacterTraits,
    temperamentRoll,
} from '../src/game/characterTraits'

const theft: ReactionRequest = {
    incidentId: 'theft-1',
    trigger: 'theft',
    sourceId: 'visitor',
    available: ['warn', 'attack', 'flee', 'report'],
}

it('generates stable identity traits within authored ranges independent of display name', () => {
    const actor = (id: string, nickname: string) =>
        new GameCharacter({
            id,
            nickname,
            archetype: 'human',
            controllerKind: 'scripted',
            spawnPosition: { x: 0, y: 0 },
        })
    const merchant = actor('npc_merchant_1', 'Trader')
    expect(merchant.temperament.traits).toEqual(
        actor(merchant.id, 'A different name').temperament.traits
    )
    const smith = actor('npc_smith_1', merchant.nickname)
    expect(smith.temperament.traits).not.toEqual(merchant.temperament.traits)
    expect(smith.temperament.traits.temper).toBeGreaterThan(
        merchant.temperament.traits.temper
    )
    expect(Object.values(merchant.temperament.traits)).toHaveLength(9)
    for (const value of Object.values(merchant.temperament.traits)) {
        expect(Number.isInteger(value)).toBe(true)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(100)
    }
})

it('normalizes feasible actions and realizes a 30/70 probability over independent events', () => {
    const weights = normalizeReactionWeights(
        { warn: 500, flee: 3, report: 7 },
        ['report', 'flee']
    )
    expect(weights).toEqual({ flee: 30, report: 70 })
    expect(pickWeightedReaction(weights, 0)).toBe('flee')
    expect(pickWeightedReaction(weights, 0.3)).toBe('report')
    expect(pickWeightedReaction(weights, 0.999)).toBe('report')
    const count = 10_000
    const escapes = Array.from({ length: count }, (_, index) =>
        pickWeightedReaction(weights, temperamentRoll(['test-event', index]))
    ).filter((action) => action === 'flee').length
    expect(escapes / count).toBeCloseTo(0.3, 2)
    expect(normalizeReactionWeights({ attack: 3 }, [])).toEqual({ wait: 100 })
})

it('chooses once per significant revision and applies only one emotional impulse per event', () => {
    const actor = new CharacterTemperament('npc_smith_1', 'human')
    const random = vi.fn().mockReturnValue(0.4)
    const first = actor.react(theft, 1_000, random)
    const emotion = actor.emotions.snapshot(1_000)
    const retry = actor.react(
        { ...theft, available: ['report'] },
        1_000,
        random
    )
    expect(retry).toBe(first)
    expect(actor.emotions.snapshot(1_000)).toEqual(emotion)

    const changed = actor.react(
        { ...theft, revision: 'exit blocked', available: ['report'] },
        1_000,
        random
    )
    expect(changed.action).toBe('report')
    expect(changed.weights).toEqual({ report: 100 })
    expect(changed.reason).toMatchObject({
        incidentId: theft.incidentId,
        sourceId: 'visitor',
    })
    expect(actor.emotions.snapshot(1_000)).toEqual(emotion)
    expect(random).toHaveBeenCalledTimes(2)
})

it('weighs the same theft differently by temperament, danger, and feasible action', () => {
    const merchant = new CharacterTemperament('npc_merchant_1', 'human')
    const smith = new CharacterTemperament('npc_smith_1', 'human')
    const tailor = new CharacterTemperament('npc_tailor_1', 'human')
    const cautious = merchant.react(theft, 0).weights
    const spirited = smith.react(theft, 0).weights
    const calm = tailor.react(theft, 0).weights
    expect(spirited.attack ?? 0).toBeGreaterThan(cautious.attack ?? 0)
    expect(calm.attack ?? 0).toBeLessThan(spirited.attack ?? 0)
    expect(cautious.flee ?? 0).toBeGreaterThan(spirited.flee ?? 0)
    const threatened = smith.react(
        {
            ...theft,
            revision: 'danger',
            context: { healthFraction: 0.15, threat: 100, danger: 80 },
        },
        0
    ).weights
    expect(threatened.flee ?? 0).toBeGreaterThan(spirited.flee ?? 0)
    expect(threatened.attack ?? 0).toBeLessThan(spirited.attack ?? 0)
    const blocked = smith.react(
        { ...theft, revision: 'no actions', available: [] },
        0
    )
    expect(blocked.action).toBe('wait')
})

it('retains simultaneous fear and anger with provenance and decays them without ticking', () => {
    const actor = new CharacterTemperament('npc_merchant_1', 'human')
    const threat = { ...theft, trigger: 'attack' as const, severity: 80 }
    actor.react(threat, 1_000)
    const initial = actor.emotions.snapshot(1_000)
    expect(initial.anger.value).toBeGreaterThan(0)
    expect(initial.fear.value).toBeGreaterThan(0)
    expect(initial.stress.value).toBeGreaterThan(0)
    expect(initial.anger.reason).toMatchObject({
        trigger: 'attack',
        sourceId: 'visitor',
    })
    expect(initial.fear.changedAt).toBe(1_000)
    expect(actor.emotions.snapshot(5_000).fear.value).toBeLessThan(
        initial.fear.value
    )
    expect(actor.emotions.snapshot(200_000)).toEqual({
        anger: { value: 0 },
        fear: { value: 0 },
        stress: { value: 0 },
    })
})

it('reduces repeated minor provocations from the same source and keeps separate trust directions', () => {
    const emotions = new CharacterEmotions(
        generateCharacterTraits('resident', 'human')
    )
    const insult = {
        incidentId: 'first',
        trigger: 'insult' as const,
        sourceId: 'speaker',
    }
    emotions.observe(insult, 20, 0)
    const first = emotions.snapshot(0).anger.value
    emotions.observe({ ...insult, incidentId: 'second' }, 20, 0)
    const second = emotions.snapshot(0).anger.value - first
    expect(second).toBeCloseTo(first / 2)
    emotions.observe(
        { ...insult, incidentId: 'third', sourceId: 'other' },
        20,
        0
    )
    expect(emotions.snapshot(0).anger.value - first - second).toBeCloseTo(first)

    const actor = new CharacterTemperament('listener', 'human')
    const report: ReactionRequest = {
        incidentId: 'rumor',
        trigger: 'hear_news',
        available: ['believe', 'doubt'],
    }
    const trusted = actor.react(
        { ...report, revision: 'trusted', context: { trust: 70 } },
        0
    )
    const unknown = actor.react(
        { ...report, revision: 'unknown', context: { trust: -70 } },
        0
    )
    expect(trusted.weights.believe ?? 0).toBeGreaterThan(
        unknown.weights.believe ?? 0
    )
})
