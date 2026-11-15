import {
    type DeityId,
    type DeityMood,
    PRAYER_SCHOOL_DEFINITIONS,
    prayerAbilityIds,
} from '@my-game-ratata/contracts'
import { describe, expect, it, vi } from 'vitest'

import { GameCharacter } from '../src/game/character'
import { deityMood, miracleChance, resolveMiracle } from '../src/game/deities'
import { applyPrayerGraves } from '../src/game/prayerGraves'
import {
    prayerAnswerChance,
    prayerHarmChance,
    prayerMoodQuality,
    prayerPurificationChance,
} from '../src/game/prayerProbability'
import { applyPrayerWave } from '../src/game/prayerWave'
import { abilityContext, abilityHero } from './abilityTestHelpers'
import { gravePrayerFixture, prayerSource } from './gravePrayerTestHelpers'

const moods: DeityMood[] = ['benevolent', 'neutral', 'wrathful']
const base = { benevolent: 0.8, neutral: 0.55, wrathful: 0.25 }
const qualities = { benevolent: 1.3, neutral: 1, wrathful: 0.65 }
const cases = [0, 3, 100].flatMap((level) =>
    moods.map((mood) => ({ level, mood, expected: base[mood] }))
)

function timeFor(deity: DeityId, mood: DeityMood): number {
    const time = Array.from(
        { length: 6 },
        (_, phase) => (phase + 1) * 30_000
    ).find((now) => deityMood(deity, now) === mood)
    if (time === undefined) {
        throw new Error('Missing authored mood phase')
    }
    return time
}

describe('shared prayer probability math matches independent oracle and live school selection', () => {
    it.each(cases)(
        'matches mastery $level / $mood for every school',
        ({ level, mood, expected }) => {
            const actor = abilityHero('cleric')
            for (const ability of prayerAbilityIds) {
                const school = PRAYER_SCHOOL_DEFINITIONS[ability]
                for (const other of prayerAbilityIds) {
                    actor.progression.masteries[
                        PRAYER_SCHOOL_DEFINITIONS[other].constellationId
                    ].level = 1000
                }
                actor.progression.masteries[school.constellationId].level =
                    level
                actor.progression.patron =
                    school.deityId === 'hearth' ? 'road' : 'hearth'
                const now = timeFor(school.deityId, mood)
                expect(prayerAnswerChance(mood)).toBe(expected)
                expect(miracleChance(actor, now, school.deityId)).toBe(expected)
                expect(prayerPurificationChance(expected)).toBe(
                    Math.min(0.95, (0.2 * expected) / 0.55)
                )
                expect(prayerHarmChance(expected)).toBe(
                    Math.min(0.95, expected + 0.2)
                )
                expect(prayerMoodQuality[mood]).toBe(qualities[mood])
            }
        }
    )
    it.each(cases)(
        'keeps strict refusal boundaries and exactly one answer roll for mastery $level / $mood',
        ({ level, mood, expected }) => {
            const actor = abilityHero('cleric')
            actor.progression.masteries.prayer.level = level
            const now = timeFor('hearth', mood)
            for (const [roll, succeeds] of [
                [expected - Number.EPSILON, true],
                [expected, false],
                [1, false],
            ] as const) {
                const random = vi.fn(() => roll)
                expect(resolveMiracle(actor, now, random, 'hearth')).toEqual({
                    success: succeeds,
                    quality: qualities[mood],
                })
                expect(random).toHaveBeenCalledTimes(1)
            }
        }
    )
    it('retains defensive derived caps and the favorable harm cap', () => {
        expect(prayerHarmChance(prayerAnswerChance('benevolent'))).toBe(0.95)
        expect(prayerPurificationChance(10)).toBe(0.95)
        expect(prayerPurificationChance(0.55)).toBe(0.2)
        expect(prayerHarmChance(0.25)).toBe(0.45)
    })
})

describe('resolved grave and harm outcomes keep the same single supplied roll', () => {
    it.each(cases)(
        'uses the strict grave step threshold at mastery $level / $mood',
        ({ level, mood, expected }) => {
            const f = gravePrayerFixture()
            const now = timeFor('hearth', mood)
            f.actor.progression.masteries.prayer.level = level
            const threshold = Math.min(0.95, (0.2 * expected) / 0.55)
            const intent = {
                mode: 'purify_grave',
                target: { kind: 'grave', id: prayerSource.id },
            } as const
            const context = {
                ...f.context(now),
                random: vi.fn(() => {
                    throw new Error('Unexpected extra roll')
                }),
            }
            expect(
                applyPrayerGraves(
                    f.actor,
                    intent,
                    context,
                    threshold - Number.EPSILON,
                    'below'
                ).meaningful
            ).toBe(true)
            expect(
                applyPrayerGraves(f.actor, intent, context, threshold, 'equal')
                    .meaningful
            ).toBe(false)
            expect(
                f.service.get(prayerSource.id)?.purification?.completed
            ).toBe(1)
            expect(context.random).not.toHaveBeenCalled()
        }
    )
    it.each(cases)(
        'uses the strict harm threshold without a numeric power level at mastery $level / $mood',
        ({ level, mood, expected }) => {
            const threshold = Math.min(0.95, expected + 0.2)
            for (const [roll, succeeds] of [
                [threshold - Number.EPSILON, true],
                [threshold, false],
            ] as const) {
                const actor = abilityHero('cleric')
                const victim = new GameCharacter({
                    id: 'prayer-undead-target',
                    nickname: 'Undead',
                    archetype: 'skeleton',
                    controllerKind: 'mob1',
                    faction: 'monsters',
                    spawnPosition: { x: 100, y: 100 },
                })
                actor.progression.masteries.prayer.level = level
                actor.progression.constellations.opened.add('prayer.harm')
                const now = timeFor('hearth', mood)
                const context = {
                    ...abilityContext([actor, victim], now),
                    random: vi.fn(() => {
                        throw new Error('Unexpected extra roll')
                    }),
                }
                const before = victim.hp
                const result = applyPrayerWave(actor, context, roll, 1)
                expect(result.meaningful).toBe(succeeds)
                expect(victim.hp < before).toBe(succeeds)
                expect(context.random).not.toHaveBeenCalled()
            }
        }
    )
})
