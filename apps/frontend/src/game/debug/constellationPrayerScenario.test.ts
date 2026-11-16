import { type DeityMood } from '@my-game-ratata/contracts'
import { describe, expect, it } from 'vitest'

import { calculatePrayerScenario, prayerCalculatorSchool } from './constellationPrayerScenario'

const cases = [
    ['prayer', 'Шанс лечения'],
    ['prayer_road', 'Шанс восстановления энергии'],
    ['prayer_lantern', 'Шанс восстановления маны'],
    ['prayer_grave', 'Шанс лечения нежити'],
] as const
const moods = [
    { mood: 'benevolent', chance: '80%' },
    { mood: 'neutral', chance: '55%' },
    { mood: 'wrathful', chance: '25%' },
] as const

describe('prayer outcome scenarios', () => {
    it.each(cases.flatMap(([path, label]) => moods.map((entry) => ({ path, label, ...entry }))))(
        'uses only own mood for $path / $mood',
        ({ path, label, mood, chance }) => {
            const result = calculatePrayerScenario(
                `${path}.root`,
                { mood },
                new Set([`${path}.root`])
            )!
            expect(result.metrics.find((row) => row.label === label)?.value).toBe(chance)
            expect(result.metrics.some((row) => /ответ|отказ/i.test(row.label))).toBe(false)
        }
    )
    it('reports only enabled outcomes and uses a per-step grave chance', () => {
        const active = new Set(['prayer.root'])
        const initial = calculatePrayerScenario('prayer.root', { mood: 'neutral' }, active)!
        expect(initial.metrics).toEqual([
            { label: 'Шанс лечения', value: '55%' },
            { label: 'Шанс очищения могилы', value: '20% за шаг' },
        ])
        active.add('prayer.harm')
        active.add('prayer.revive')
        const full = calculatePrayerScenario('prayer.root', { mood: 'neutral' }, active)!
        expect(full.metrics).toContainEqual({ label: 'Шанс кары', value: '75%' })
        expect(full.metrics).toContainEqual({ label: 'Шанс воскрешения', value: '55%' })
        expect(
            calculatePrayerScenario('prayer.revive', { mood: 'neutral' }, active)!.metrics
        ).toEqual([{ label: 'Шанс воскрешения', value: '55%' }])
    })
    it('keeps unavailable spells empty without inventing zero chance', () => {
        const result = calculatePrayerScenario('prayer.root', { mood: 'neutral' }, new Set())!
        expect(result.metrics).toEqual([])
        expect(result.build).toEqual({ available: false, effects: [], metrics: [] })
    })
    it('does not mutate settings or ownership and rejects invalid inputs', () => {
        const settings = { mood: 'wrathful' as const, tileWidth: 24, lowHealthEligible: true }
        const active = new Set(['prayer.root'])
        const before = JSON.stringify(settings)
        calculatePrayerScenario('prayer.root', settings, active)
        expect(JSON.stringify(settings)).toBe(before)
        expect([...active]).toEqual(['prayer.root'])
        expect(calculatePrayerScenario('blade.root', settings)).toBeUndefined()
        expect(prayerCalculatorSchool('missing')).toBeUndefined()
        expect(() =>
            calculatePrayerScenario('prayer.root', { mood: 'missing' as DeityMood })
        ).toThrow(RangeError)
        expect(() =>
            calculatePrayerScenario('prayer.root', { mood: 'neutral', tileWidth: 0 })
        ).toThrow(RangeError)
        expect(() =>
            calculatePrayerScenario('prayer.root', {
                mood: 'neutral',
                lowHealthEligible: 0 as unknown as boolean,
            })
        ).toThrow(RangeError)
    })
})
